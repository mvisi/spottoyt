import type { YoutubeStatus } from "@spottoyt/shared";
import { useCallback, useEffect, useState } from "react";
import { helper } from "./helper";

export type ConnectionState = {
  /** null while the first health check is running. */
  helperOnline: boolean | null;
  youtube: YoutubeStatus | null;
  checking: boolean;
  refresh: () => void;
};

/**
 * Polls the helper every few seconds. YouTube status is fetched when the
 * helper comes online and on refresh; the helper caches it for 5 minutes.
 */
export function useConnection(): ConnectionState {
  const [helperOnline, setHelperOnline] = useState<boolean | null>(null);
  const [youtube, setYoutube] = useState<YoutubeStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const loadYoutube = useCallback(async (refresh: boolean) => {
    setChecking(true);
    try {
      setYoutube(await helper.youtubeStatus(refresh));
    } catch {
      setYoutube(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const check = () =>
      helper.health().then(
        () => alive && setHelperOnline(true),
        () => alive && setHelperOnline(false),
      );
    check();
    const timer = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (helperOnline) loadYoutube(false);
    else setYoutube(null);
  }, [helperOnline, loadYoutube]);

  return {
    helperOnline,
    youtube,
    checking,
    refresh: () => loadYoutube(true),
  };
}

export type StatusSummary = {
  tone: "ok" | "warn" | "bad" | "idle";
  label: string;
};

export function summarize({
  helperOnline,
  youtube,
}: ConnectionState): StatusSummary {
  if (helperOnline === null) return { tone: "idle", label: "Checking helper…" };
  if (!helperOnline) return { tone: "bad", label: "Helper not running" };
  if (!youtube) return { tone: "idle", label: "Checking YouTube Music…" };
  if (!youtube.configured)
    return { tone: "warn", label: "YouTube Music not signed in" };
  if (!youtube.signedIn)
    return { tone: "bad", label: "YouTube Music sign-in expired" };
  if (!youtube.searchAvailable)
    return { tone: "warn", label: "YouTube Music blocked in this region" };
  return { tone: "ok", label: "YouTube Music connected" };
}
