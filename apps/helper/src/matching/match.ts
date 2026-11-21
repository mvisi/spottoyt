// Matches one Spotify track: runs searches step by step until a candidate is
// confident enough, reusing cached results, and decides the outcome.
import type {
  MatchCandidate,
  Settings,
  SpotifyTrack,
  TrackMatch,
  YoutubeTrack,
  YoutubeTrackKind,
} from "@spottoyt/shared";
import type { YoutubeClient } from "../youtube";
import { DEFAULT_LANGUAGE, searchLanguage } from "./language";
import { isConfidentMatch, rankCandidates, scoreCandidate } from "./score";
import type { MatchStore } from "./store";

/** How many ranked candidates to send back for review. */
const MAX_CANDIDATES = 6;

export type SearchStep = {
  kind: YoutubeTrackKind;
  query: string;
  lang: string;
};

export const searchKey = (step: SearchStep) =>
  `${step.kind}|${step.lang}|${step.query}`;

/**
 * Searches to try, in order. Later steps only run while nothing is
 * confident yet, so most tracks need one search.
 */
export function planSearches(
  track: SpotifyTrack,
  settings: Settings,
): SearchStep[] {
  const title = searchTitle(track.title);
  const lang = searchLanguage(track);
  const [primary = ""] = track.artists;
  const all = track.artists.join(" ");
  const steps: SearchStep[] = [
    { kind: "song", query: `${title} ${all}`, lang },
    { kind: "song", query: `${title} ${primary}`, lang },
  ];
  // Spotify sometimes shows romanized names for non-Latin artists, which only
  // match YouTube's English-localized results.
  if (lang !== DEFAULT_LANGUAGE) {
    steps.push({
      kind: "song",
      query: `${title} ${all}`,
      lang: DEFAULT_LANGUAGE,
    });
  }
  if (settings.includeVideos) {
    steps.push({ kind: "video", query: `${title} ${primary}`, lang });
  }

  const seen = new Set<string>();
  return steps
    .map((step) => ({ ...step, query: step.query.replace(/\s+/g, " ").trim() }))
    .filter((step) => !seen.has(searchKey(step)) && seen.add(searchKey(step)));
}

/**
 * Drops parts of a Spotify title that hurt search ("feat. X", "Remastered
 * 2011") but keeps ones that pick a recording ("Live", "Acoustic").
 */
export function searchTitle(title: string) {
  const noise =
    /remaster|feat\.?|ft\.|\bwith\b|\bmono\b|\bstereo\b|bonus track|deluxe/i;
  const keeps =
    /live|remix|acoustic|unplugged|instrumental|demo|extended|version|edit/i;
  const drop = (segment: string) => noise.test(segment) && !keeps.test(segment);

  return title
    .replace(/\s*[([]([^)\]]*)[)\]]/g, (whole, inner: string) =>
      drop(inner) ? "" : whole,
    )
    .replace(/\s+[-–—]\s+(.*)$/, (whole, rest: string) =>
      drop(rest) ? "" : whole,
    )
    .trim();
}

export type MatchDeps = {
  youtube: YoutubeClient;
  store: MatchStore;
  settings: () => Settings;
  /** Retries a failing search. Injected so tests don't wait. */
  retry?: <T>(fn: () => Promise<T>) => Promise<T>;
};

export async function matchTrack(
  track: SpotifyTrack,
  deps: MatchDeps,
  options: { fresh?: boolean } = {},
): Promise<TrackMatch> {
  const settings = deps.settings();
  const retry = deps.retry ?? withRetry;
  const manual = deps.store.getManual(track.uri);
  const cached = options.fresh ? null : deps.store.getCandidates(track.uri);

  const candidates: YoutubeTrack[] = [...(cached?.candidates ?? [])];
  const searches = new Set(cached?.searches ?? []);
  let ranked = rankCandidates(track, candidates);
  let searched = false;

  // A manual pick is final, so only search if there's nothing to show beside it.
  const steps =
    manual && candidates.length ? [] : planSearches(track, settings);
  for (const step of steps) {
    if (isConfidentMatch(ranked, settings.autoAcceptScore)) break;
    if (searches.has(searchKey(step))) continue;

    const results = await retry(() => deps.youtube.search(step));
    candidates.push(...results);
    searches.add(searchKey(step));
    searched = true;
    ranked = rankCandidates(track, candidates);
  }

  if (searched) {
    deps.store.saveCandidates(track, {
      candidates: dedupe(candidates),
      searches: [...searches],
    });
  }

  return decide(track, ranked, manual, settings.autoAcceptScore);
}

function decide(
  track: SpotifyTrack,
  ranked: MatchCandidate[],
  manual: YoutubeTrack | null,
  autoAcceptScore: number,
): TrackMatch {
  const base = { spotifyUri: track.uri };

  if (manual) {
    const others = ranked.filter((c) => c.videoId !== manual.videoId);
    return {
      ...base,
      status: "matched",
      source: "manual",
      selectedVideoId: manual.videoId,
      candidates: [scoreCandidate(track, manual), ...others].slice(
        0,
        MAX_CANDIDATES,
      ),
    };
  }

  const candidates = ranked.slice(0, MAX_CANDIDATES);
  const [best] = candidates;
  if (!best) return { ...base, status: "not_found", candidates };

  return isConfidentMatch(ranked, autoAcceptScore)
    ? {
        ...base,
        status: "matched",
        source: "auto",
        selectedVideoId: best.videoId,
        candidates,
      }
    : {
        ...base,
        status: "review",
        source: "suggested",
        selectedVideoId: best.videoId,
        candidates,
      };
}

function dedupe(tracks: YoutubeTrack[]) {
  const seen = new Set<string>();
  return tracks.filter((t) => !seen.has(t.videoId) && seen.add(t.videoId));
}

/** Three tries with 1s and 2s pauses, for rate limits and network blips. */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [1000, 2000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined) throw error;
      await Bun.sleep(delay);
    }
  }
}
