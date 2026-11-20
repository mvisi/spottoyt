// HTTP contract between the Spotify app and the local helper.

export const DEFAULT_HELPER_PORT = 4317;
export const DEFAULT_HELPER_URL = `http://127.0.0.1:${DEFAULT_HELPER_PORT}`;

export type HealthResponse = {
  ok: true;
  version: string;
};
