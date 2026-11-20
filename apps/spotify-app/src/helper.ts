import {
  DEFAULT_HELPER_URL,
  type ErrorResponse,
  type HealthResponse,
  type Settings,
  type YoutubeStatus,
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
  return res.json() as Promise<T>;
}

export const helper = {
  health: () => request<HealthResponse>("/health"),
  youtubeStatus: (refresh = false) =>
    request<YoutubeStatus>(`/youtube/status${refresh ? "?refresh=1" : ""}`),
  settings: () => request<Settings>("/settings"),
  updateSettings: (patch: Partial<Settings>) =>
    request<Settings>("/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
};
