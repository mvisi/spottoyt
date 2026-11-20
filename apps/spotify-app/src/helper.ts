import {
  DEFAULT_HELPER_URL,
  type ErrorResponse,
  type HealthResponse,
  type MatchJob,
  type SearchResponse,
  type Settings,
  type SpotifyTrack,
  type YoutubeStatus,
  type YoutubeTrack,
  type YoutubeTrackKind,
} from "@spottoyt/shared";

const HELPER_URL_KEY = "spottoyt:helper-url";

export function helperUrl() {
  return Spicetify.LocalStorage.get(HELPER_URL_KEY) || DEFAULT_HELPER_URL;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${helperUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ErrorResponse | null;
    throw new Error(body?.error ?? `Helper returned ${res.status} for ${path}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const body = (value: unknown, method = "POST"): RequestInit => ({
  method,
  body: JSON.stringify(value),
});

export const helper = {
  health: () => request<HealthResponse>("/health"),
  youtubeStatus: (refresh = false) =>
    request<YoutubeStatus>(`/youtube/status${refresh ? "?refresh=1" : ""}`),

  settings: () => request<Settings>("/settings"),
  updateSettings: (patch: Partial<Settings>) =>
    request<Settings>("/settings", body(patch, "PATCH")),

  search: (q: string, kind: YoutubeTrackKind) =>
    request<SearchResponse>(
      `/youtube/search?${new URLSearchParams({ q, kind })}`,
    ),
  video: (videoId: string) =>
    request<YoutubeTrack>(`/youtube/videos/${encodeURIComponent(videoId)}`),

  startMatchJob: (tracks: SpotifyTrack[], fresh = false) =>
    request<MatchJob>("/match-jobs", body({ tracks, fresh })),
  matchJob: (id: string, since: number) =>
    request<MatchJob>(`/match-jobs/${id}?since=${since}`),
  cancelMatchJob: (id: string) =>
    request<MatchJob>(`/match-jobs/${id}`, { method: "DELETE" }),

  setManualMatch: (spotifyUri: string, track: YoutubeTrack) =>
    request<void>("/manual-matches", body({ spotifyUri, track }, "PUT")),
  clearManualMatch: (spotifyUri: string) =>
    request<void>(`/manual-matches?${new URLSearchParams({ spotifyUri })}`, {
      method: "DELETE",
    }),
};

/** Video ID from a YouTube or YouTube Music link, or a bare ID. */
export function parseVideoId(input: string): string | null {
  const text = input.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  try {
    const url = new URL(text);
    const fromQuery = url.searchParams.get("v");
    if (fromQuery && /^[\w-]{11}$/.test(fromQuery)) return fromQuery;
    const last = url.pathname.split("/").filter(Boolean).at(-1);
    if (
      last &&
      /^[\w-]{11}$/.test(last) &&
      /(^|\.)(youtu\.be|youtube\.com)$/.test(url.hostname)
    ) {
      return last;
    }
  } catch {}
  return null;
}

export const youtubeMusicUrl = (videoId: string) =>
  `https://music.youtube.com/watch?v=${videoId}`;
