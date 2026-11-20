import { DEFAULT_HELPER_URL, type HealthResponse } from "@spottoyt/shared";

const HELPER_URL_KEY = "spottoyt:helper-url";

export function helperUrl() {
  return Spicetify.LocalStorage.get(HELPER_URL_KEY) || DEFAULT_HELPER_URL;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${helperUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Helper returned ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

export const helper = {
  health: () => request<HealthResponse>("/health"),
};
