// What's decided for each track: the match result from the helper, plus
// whatever you changed while reviewing. Pure functions, no React.
import type {
  MatchCandidate,
  PlaylistTrackState,
  TrackMatch,
  YoutubeTrack,
} from "@spottoyt/shared";
import type { PlaylistTrack } from "../spotify";

export type Decision =
  /** Already on the YouTube playlist. Settled for good. */
  | { kind: "added"; track: YoutubeTrack }
  /** Goes into the YouTube playlist. */
  | { kind: "accepted"; track: YoutubeTrack; by: "auto" | "you" }
  /** Needs your call. `pick` is the current best guess, if any. */
  | { kind: "pending"; pick?: YoutubeTrack }
  | { kind: "skipped" };

/**
 * A pick you made while reviewing. Absent means "go with the helper's
 * result". Skips aren't overrides: they're saved per playlist in the helper.
 */
export type Override =
  | { kind: "accepted"; track: YoutubeTrack }
  | { kind: "pending"; pick?: YoutubeTrack };

/** Saved states for a playlist, by Spotify track URI. */
export type SavedStates = Readonly<Record<string, PlaylistTrackState>>;

export type Row = {
  track: PlaylistTrack;
  /** Undefined while the track is still being matched. */
  match?: TrackMatch;
  /** Undefined while the track is still being matched. */
  decision?: Decision;
};

export function selectedCandidate(
  match: TrackMatch,
): MatchCandidate | undefined {
  return match.candidates.find((c) => c.videoId === match.selectedVideoId);
}

export function decide(
  match?: TrackMatch,
  override?: Override,
  saved?: PlaylistTrackState,
): Decision | undefined {
  if (saved?.state === "added") return { kind: "added", track: saved.track };
  if (saved?.state === "skipped") return { kind: "skipped" };
  if (override?.kind === "accepted") return { ...override, by: "you" };
  if (override) return override;
  if (!match) return undefined;

  const selected = selectedCandidate(match);
  if (match.status === "matched" && selected) {
    return {
      kind: "accepted",
      track: selected,
      by: match.source === "manual" ? "you" : "auto",
    };
  }
  return { kind: "pending", pick: selected };
}

export function buildRows(
  tracks: PlaylistTrack[],
  matches: ReadonlyMap<string, TrackMatch>,
  overrides: ReadonlyMap<string, Override>,
  saved: SavedStates = {},
): Row[] {
  return tracks.map((track) => {
    const match = matches.get(track.uri);
    return {
      track,
      match,
      decision: decide(match, overrides.get(track.uri), saved[track.uri]),
    };
  });
}

/** Accepted tracks that aren't on YouTube yet, in playlist order. */
export function tracksToAdd(rows: Row[]) {
  return rows.flatMap((r) =>
    r.decision?.kind === "accepted"
      ? [{ spotifyUri: r.track.uri, track: r.decision.track }]
      : [],
  );
}

/** Tracks the helper couldn't settle on its own. Stable while you review. */
export const needsReview = (row: Row) =>
  row.match !== undefined &&
  row.match.status !== "matched" &&
  row.decision?.kind !== "added";

export type Filter = "all" | "new" | "review" | "auto" | "skipped" | "added";

export function filterRows(rows: Row[], filter: Filter): Row[] {
  switch (filter) {
    case "all":
      return rows;
    case "new":
      return rows.filter((r) => r.decision?.kind !== "added");
    case "added":
      return rows.filter((r) => r.decision?.kind === "added");
    case "review":
      return rows.filter(needsReview);
    case "auto":
      return rows.filter((r) => r.match?.status === "matched");
    case "skipped":
      return rows.filter((r) => r.decision?.kind === "skipped");
  }
}

export type Counts = {
  total: number;
  /** Already on the YouTube playlist. */
  added: number;
  accepted: number;
  skipped: number;
  /** Matched, but still waiting for your call. */
  open: number;
  /** Not matched yet. */
  matching: number;
};

export function countRows(rows: Row[]): Counts {
  const counts: Counts = {
    total: rows.length,
    added: 0,
    accepted: 0,
    skipped: 0,
    open: 0,
    matching: 0,
  };
  for (const { decision } of rows) {
    if (!decision) counts.matching++;
    else if (decision.kind === "added") counts.added++;
    else if (decision.kind === "accepted") counts.accepted++;
    else if (decision.kind === "skipped") counts.skipped++;
    else counts.open++;
  }
  return counts;
}

/** Index of the next row after `from` that still needs a decision, or -1. */
export function nextOpen(rows: Row[], from: number): number {
  for (let i = from + 1; i < rows.length; i++) {
    if (rows[i]?.decision?.kind === "pending") return i;
  }
  return -1;
}
