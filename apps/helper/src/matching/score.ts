// Scores YouTube Music candidates against a Spotify track. Pure functions only.
//
// Ranking is on match quality alone. Never factor in whether a video plays in
// the user's region: they handle playback themselves and want the best match.
import type {
  MatchCandidate,
  SpotifyTrack,
  YoutubeTrack,
} from "@spottoyt/shared";
import { transliterate } from "./transliterate";

// Words that mark a different recording of the same song. A candidate with
// one the Spotify title lacks (or the other way round) is a worse match.
const EDITION_PENALTIES: Record<string, { extra: number; missing: number }> = {
  live: { extra: 20, missing: 12 },
  remix: { extra: 20, missing: 12 },
  acoustic: { extra: 18, missing: 10 },
  unplugged: { extra: 18, missing: 10 },
  instrumental: { extra: 22, missing: 12 },
  demo: { extra: 15, missing: 8 },
  extended: { extra: 12, missing: 6 },
  mashup: { extra: 25, missing: 12 },
  cover: { extra: 30, missing: 12 },
  karaoke: { extra: 35, missing: 12 },
  nightcore: { extra: 35, missing: 12 },
  slowed: { extra: 30, missing: 12 },
  sped: { extra: 30, missing: 12 },
  reverb: { extra: 20, missing: 8 },
};
const EDITION_LABELS: Record<string, string> = {
  live: "Live version",
  remix: "Remix",
  acoustic: "Acoustic version",
  unplugged: "Unplugged version",
  instrumental: "Instrumental",
  demo: "Demo",
  extended: "Extended version",
  mashup: "Mashup",
  cover: "Cover",
  karaoke: "Karaoke",
  nightcore: "Nightcore",
  slowed: "Slowed",
  sped: "Sped up",
  reverb: "Reverb edit",
};

// Phrases that mark karaoke and tribute releases without saying so in one
// word, e.g. "Where Have You Been (Made Popular By Rihanna)". Matched on
// normalized text and counted as the edition word they stand for.
const EDITION_PHRASES: Array<[RegExp, string]> = [
  [
    /\b(made (popular|famous)|in the style|originally (performed|by)|as performed by)\b/,
    "karaoke",
  ],
  [/\b(backing (track|version)|sing along|singalong)\b/, "karaoke"],
  [/\btribute\b/, "cover"],
];

// Words in video titles that don't change which song it is.
const VIDEO_NOISE = new Set([
  "official",
  "audio",
  "video",
  "music",
  "lyrics",
  "lyric",
  "visualizer",
  "visualiser",
  "hq",
  "hd",
  "4k",
  "explicit",
  "clean",
  "mv",
  "remaster",
  "remastered",
]);

export function rankCandidates(
  spotify: SpotifyTrack,
  candidates: YoutubeTrack[],
): MatchCandidate[] {
  const seen = new Set<string>();
  return (
    candidates
      .filter((c) => !seen.has(c.videoId) && seen.add(c.videoId))
      .map((candidate, index) => ({
        ...scoreCandidate(spotify, candidate),
        index,
      }))
      // On a tie, a proper song upload beats a video.
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(b.kind === "song") - Number(a.kind === "song") ||
          a.index - b.index,
      )
      .map(({ index: _index, ...candidate }) => candidate)
  );
}

/**
 * Auto-accept only a confident, clear winner. Near-ties go to review unless
 * the best is very strong (the same song often appears on several releases).
 */
export function isConfidentMatch(
  ranked: MatchCandidate[],
  autoAcceptScore: number,
): boolean {
  const [best, second] = ranked;
  if (!best || best.score < autoAcceptScore) return false;
  return best.score >= 94 || best.score - (second?.score ?? 0) >= 4;
}

export function scoreCandidate(
  spotify: SpotifyTrack,
  candidate: YoutubeTrack,
): MatchCandidate {
  const reasons: string[] = [];

  const artist = artistSimilarity(spotify.artists, candidate);
  const deltaSeconds =
    candidate.durationMs === undefined
      ? Number.POSITIVE_INFINITY
      : Math.abs(candidate.durationMs - spotify.durationMs) / 1000;
  // Same artist and the same length to the second is strong evidence on its
  // own, e.g. "yumetourou" on Spotify is "Dream lantern" on YouTube Music.
  const sameArtistAndLength = artist >= 0.95 && deltaSeconds <= 2;

  const rawTitle = titleSimilarity(spotify.title, candidate.title);
  let title = rawTitle;
  // 紅蓮の弓矢 and "Guren no Yumiya" can't be compared without a dictionary,
  // so don't count that against the candidate.
  const otherScript =
    title < 0.9 && scriptsDiffer(spotify.title, candidate.title);
  if (otherScript) {
    title = Math.max(title, 0.7);
    reasons.push("Title in another script");
  } else if (title < 0.9) {
    reasons.push("Different title");
    if (sameArtistAndLength) title = Math.max(title, 0.55);
  }

  // Songs credit their artists properly. One credited to someone else is a
  // different recording, even when the title names the right artist, e.g.
  // "Danza Kuduro (Don Omar & Lucenzo)" by "Archuleta Maroon".
  const titleOnlyArtist =
    candidate.kind === "song" &&
    artist >= 0.35 &&
    artistSimilarity(spotify.artists, { ...candidate, title: "" }) < 0.35;

  if (artist < 0.35) reasons.push("Different artist");
  else if (titleOnlyArtist) reasons.push("Artist only named in the title");
  else if (artist < 0.95) reasons.push("Artists partly match");

  const duration = durationSimilarity(spotify.durationMs, candidate.durationMs);
  if (candidate.durationMs === undefined) reasons.push("Length unknown");
  else {
    const delta = Math.round(
      (candidate.durationMs - spotify.durationMs) / 1000,
    );
    if (Math.abs(delta) > 2)
      reasons.push(`${delta > 0 ? "+" : "−"}${Math.abs(delta)}s`);
  }

  const album =
    spotify.album &&
    candidate.album &&
    normalize(baseTitle(spotify.album)) ===
      normalize(baseTitle(candidate.album))
      ? 1
      : 0;

  // A video uploaded by the artist's own channel is the official one. Often
  // it's the only upload of a song, or the only one at the right length.
  const byArtist =
    candidate.kind === "video" && uploadedByArtist(spotify.artists, candidate);
  const kind =
    candidate.kind === "song"
      ? 1
      : byArtist
        ? 0.95
        : videoKindScore(candidate.title);
  if (candidate.kind === "video") {
    reasons.push(
      byArtist ? "Video by the artist" : videoLabel(candidate.title),
    );
  }

  let score =
    100 *
    (title * 0.47 +
      artist * 0.25 +
      duration * 0.18 +
      kind * 0.06 +
      album * 0.04);

  for (const edition of editionDifferences(spotify, candidate)) {
    score -= edition.penalty;
    reasons.push(edition.label);
  }
  if (candidate.kind === "video" && !byArtist) {
    score *= videoOriginality(candidate.title);
  }

  // A weak title or a stranger's video can't make up for it elsewhere.
  if (rawTitle < 0.55 && !otherScript) {
    score = Math.min(score, sameArtistAndLength ? 75 : 55);
  }
  // Never auto-accept on a title we couldn't actually compare.
  if (otherScript) score = Math.min(score, 85);
  if (candidate.kind === "video" && artist < 0.35) score = Math.min(score, 84);
  if (titleOnlyArtist) score = Math.min(score, 84);

  if (album && reasons.length === 0) reasons.push("Same album");

  return {
    ...candidate,
    score: Math.round(clamp(score, 0, 100)),
    reasons,
  };
}

// ---------- Parts ----------

export function normalize(value: string) {
  return (
    value
      // Full-width letters and brackets (common in Japanese titles) to normal ones.
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\s]+/g, transliterate)
      // Strip accents and other combining marks (é → e, が → か) so both
      // sides compare the same way.
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[ßæœøłđðþı]/g, (char) => LETTER_FOLDS[char] ?? char)
      .replace(/&/g, " and ")
      .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
      .trim()
  );
}

// Letters that don't decompose into a base letter plus accent.
const LETTER_FOLDS: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ı: "i",
};

// Chinese and Japanese don't put spaces between words, so compare those
// characters one by one instead of as a single long "word".
const UNSPACED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * The song's name without "(feat. X)", "[Official Video]", "- Remastered
 * 2011" and similar. Falls back to the full title when nothing is left.
 */
export function baseTitle(title: string) {
  const stripped = title
    .normalize("NFKC")
    .replace(/\([^)]*\)|\[[^\]]*]/g, " ")
    .replace(/\s+[-–—]\s+.*$/, " ")
    .trim();
  return stripped || title;
}

export function tokens(value: string) {
  return normalize(value)
    .split(" ")
    .flatMap((word) =>
      UNSPACED_SCRIPT.test(word) ? splitUnspaced(word) : [word],
    )
    .filter(Boolean);
}

/** "夜に駆けるremix" → ["夜", "に", "駆", "け", "る", "remix"] */
function splitUnspaced(word: string) {
  const out: string[] = [];
  let latin = "";
  for (const char of word) {
    if (UNSPACED_SCRIPT.test(char)) {
      if (latin) out.push(latin);
      latin = "";
      out.push(char);
    } else {
      latin += char;
    }
  }
  if (latin) out.push(latin);
  return out;
}

function titleSimilarity(spotifyTitle: string, candidateTitle: string) {
  const a = tokens(baseTitle(spotifyTitle));
  // Video titles often read "Artist - Song (Official Video)", so also try
  // the part after the dash.
  const options = [
    baseTitle(candidateTitle),
    baseTitle(candidateTitle.replace(/^.*?\s[-–—]\s/, "")),
  ];

  let best = 0;
  for (const option of options) {
    const b = tokens(option).filter((t) => !VIDEO_NOISE.has(t));
    best = Math.max(best, tokenSimilarity(a, b));
  }
  return best;
}

function tokenSimilarity(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  if (a.join(" ") === b.join(" ")) return 1;
  if (b.join(" ").includes(a.join(" "))) return 0.98;

  const shared = intersection(a, b);
  const containment = shared / a.length;
  const dice = (shared * 2) / (a.length + b.length);
  if (containment >= 0.95) return 0.96;
  if (containment >= 0.75) return Math.max(0.86, dice);
  return Math.max(dice, containment * 0.82);
}

function artistSimilarity(artists: string[], candidate: YoutubeTrack) {
  // Videos often credit the artist only in the title, so search both.
  const haystack = tokens(`${candidate.artists.join(" ")} ${candidate.title}`);
  const [primary = "", ...featured] = artists;
  const primaryScore = nameScore(primary, haystack);
  if (!featured.length) return primaryScore;

  const featuredScore =
    featured.reduce((sum, name) => sum + nameScore(name, haystack), 0) /
    featured.length;
  return clamp(primaryScore * 0.78 + featuredScore * 0.22, 0, 1);
}

// Filler words that would make "The Beatles" partly match any title with "the".
const NAME_FILLER = new Set(["the", "a", "an", "and"]);

function nameScore(name: string, haystack: string[]) {
  const all = tokens(name);
  const meaningful = all.filter((token) => !NAME_FILLER.has(token));
  const nameTokens = meaningful.length ? meaningful : all;
  if (!nameTokens.length || !haystack.length) return 0;
  // キタニタツヤ becomes one word, "kitanitatsuya", which contains both
  // "tatsuya" and "kitani". Same for channel names like "georgemichaelvevo".
  const set = new Set(haystack);
  const joined = haystack.join("");
  const found = nameTokens.filter(
    (t) => set.has(t) || (t.length >= 3 && joined.includes(t)),
  ).length;
  return found / nameTokens.length;
}

/** True when the uploader, not just the title, is the Spotify artist. */
function uploadedByArtist(artists: string[], candidate: YoutubeTrack) {
  const uploader = tokens(candidate.artists.join(" "));
  return artists.some((name) => nameScore(name, uploader) >= 0.95);
}

const UNCOMPARABLE_SCRIPT = /[\p{Script=Han}\p{Script=Hangul}]/u;

/**
 * One title uses kanji or Hangul and the other has none, so there's no
 * reliable way to compare them.
 */
function scriptsDiffer(a: string, b: string) {
  return (
    UNCOMPARABLE_SCRIPT.test(baseTitle(a)) !==
    UNCOMPARABLE_SCRIPT.test(baseTitle(b))
  );
}

function durationSimilarity(spotifyMs: number, candidateMs?: number) {
  if (candidateMs === undefined) return 0.5;
  const delta = Math.abs(spotifyMs - candidateMs) / 1000;
  if (delta <= 2) return 1;
  if (delta <= 10) return 0.95;
  if (delta <= 20) return 0.82;
  if (delta <= 45) return 0.55;
  if (delta <= 90) return 0.18;
  return 0;
}

/** Edition words in `text`, including ones implied by EDITION_PHRASES. */
function editionWords(text: string) {
  const words = new Set(tokens(text));
  const normalized = normalize(text);
  for (const [pattern, word] of EDITION_PHRASES) {
    if (pattern.test(normalized)) words.add(word);
  }
  return words;
}

/**
 * Different recordings of the song. Edition words count anywhere in the
 * candidate, including its artist and album ("Party Tyme Karaoke"). For
 * "not the live version", only the Spotify title counts: an album name
 * alone isn't reliable enough to penalize a candidate for lacking it.
 */
function editionDifferences(spotify: SpotifyTrack, candidate: YoutubeTrack) {
  const mine = editionWords(spotify.title);
  const mineAnywhere = editionWords(
    [spotify.title, spotify.album, ...spotify.artists].join(" "),
  );
  const theirs = editionWords(
    [candidate.title, candidate.album, ...candidate.artists].join(" "),
  );
  const out: Array<{ penalty: number; label: string }> = [];

  for (const [word, penalty] of Object.entries(EDITION_PENALTIES)) {
    const label = EDITION_LABELS[word] ?? word;
    if (theirs.has(word) && !mineAnywhere.has(word)) {
      out.push({ penalty: penalty.extra, label });
    } else if (mine.has(word) && !theirs.has(word)) {
      out.push({
        penalty: penalty.missing,
        label: `Not the ${label.toLowerCase()}`,
      });
    }
  }
  return out;
}

function videoKindScore(title: string) {
  const t = new Set(tokens(title));
  return ["official", "audio", "video", "visualizer", "visualiser"].some((w) =>
    t.has(w),
  )
    ? 0.9
    : 0.74;
}

/** Lyric uploads and random re-uploads are usually worse than official ones. */
function videoOriginality(title: string) {
  const t = new Set(tokens(title));
  const lyric = t.has("lyric") || t.has("lyrics");
  const official = t.has("official");
  const format = ["audio", "video", "visualizer", "visualiser"].some((w) =>
    t.has(w),
  );
  if (lyric) return official ? 0.86 : 0.72;
  if (official) return format ? 0.97 : 0.94;
  if (format) return 0.9;
  return 0.82;
}

function videoLabel(title: string) {
  const t = new Set(tokens(title));
  if (t.has("lyric") || t.has("lyrics")) return "Lyric video";
  if (t.has("official") && t.has("audio")) return "Official audio upload";
  if (t.has("official")) return "Official video";
  return "Video upload";
}

function intersection(a: string[], b: string[]) {
  const set = new Set(b);
  return a.filter((token) => set.has(token)).length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
