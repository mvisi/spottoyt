// HTTP contract between the Spotify app and the local helper.

export const DEFAULT_HELPER_PORT = 4317;
export const DEFAULT_HELPER_URL = `http://127.0.0.1:${DEFAULT_HELPER_PORT}`;

export type HealthResponse = {
  ok: true;
  version: string;
};

export type ErrorResponse = {
  error: string;
};

export type YoutubeStatus = {
  /** A cookie has been saved with `bun run setup:youtube`. */
  configured: boolean;
  /** The saved cookie works for signed-in requests. */
  signedIn: boolean;
  /**
   * YouTube Music returns songs to this connection. False usually means the
   * helper's traffic comes from a region where YouTube Music isn't available.
   */
  searchAvailable: boolean;
  /** Set when one of the checks failed for a reason other than the above. */
  error?: string;
  checkedAt: string;
};

export type YoutubeTrackKind = "song" | "video";

export type YoutubeTrack = {
  videoId: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  kind: YoutubeTrackKind;
  thumbnailUrl?: string;
};

export type SearchResponse = {
  results: YoutubeTrack[];
};

export type Settings = {
  /** Matches scoring at or above this (0–100) are accepted without review. */
  autoAcceptScore: number;
  /** Consider video uploads as candidates, not just songs. */
  includeVideos: boolean;
};

// ---------- Matching ----------

/** A Spotify track as the app sends it for matching. */
export type SpotifyTrack = {
  uri: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs: number;
};

export type MatchCandidate = YoutubeTrack & {
  /** 0–100. How well this candidate matches the Spotify track. */
  score: number;
  /** Short notes on what differs, e.g. "Live version" or "+13s". */
  reasons: string[];
};

export type TrackMatchStatus =
  /** Auto-accepted, or you picked it before. */
  | "matched"
  /** Has candidates, but none is certain enough to accept on its own. */
  | "review"
  | "not_found"
  /** Searching failed, even after retries. */
  | "error";

export type TrackMatch = {
  spotifyUri: string;
  status: TrackMatchStatus;
  /**
   * The video to use. For "review" it's the best guess, which still needs
   * confirming.
   */
  selectedVideoId?: string;
  /** Where the selection came from. */
  source?: "auto" | "manual" | "suggested";
  /** Best first. */
  candidates: MatchCandidate[];
  error?: string;
};

export type MatchJobStatus = "running" | "done" | "cancelled" | "failed";

export type MatchJob = {
  id: string;
  status: MatchJobStatus;
  total: number;
  /** In the order tracks finished, not playlist order. */
  results: TrackMatch[];
  error?: string;
};

export type StartMatchJobRequest = {
  tracks: SpotifyTrack[];
  /** Search again even when cached results exist. */
  fresh?: boolean;
};

export type SetTrackMatchRequest = {
  spotifyUri: string;
  track: YoutubeTrack;
};
