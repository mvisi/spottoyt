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
  /** How many results to fetch per search. */
  searchLimit: number;
};
