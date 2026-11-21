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

  // The helper caches the status and rechecks right after a request hits a
  // problem (VPN down, sign-in expired), so polling it is cheap.
  useEffect(() => {
    if (!helperOnline) {
      setYoutube(null);
      return;
    }
    loadYoutube(false);
    const timer = setInterval(() => loadYoutube(false), 30_000);
    return () => clearInterval(timer);
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
  if (youtube.vpn === "down")
    return { tone: "bad", label: "VPN tunnel not running" };
  if (!youtube.configured)
    return { tone: "warn", label: "YouTube Music not signed in" };
  if (!youtube.signedIn)
    return { tone: "bad", label: "YouTube Music sign-in expired" };
  if (!youtube.searchAvailable)
    return { tone: "warn", label: "YouTube Music blocked in this region" };
  return { tone: "ok", label: "YouTube Music connected" };
}

export type Fix = {
  title: string;
  /** What's wrong and what the command does. */
  detail: string;
  /** Run in the SpottoYT repo. */
  command?: string;
};

/** What to do about the current connection problem, or null if none. */
export function fixFor({ helperOnline, youtube }: ConnectionState): Fix | null {
  if (helperOnline === false) {
    return {
      title: "SpottoYT isn't running",
      detail:
        "Start it in the SpottoYT folder. It starts the VPN tunnel too, and Ctrl+C stops both when you're done.",
      command: "bun run dev",
    };
  }
  if (!youtube) return null;
  if (youtube.vpn === "down") {
    return {
      title: "The VPN tunnel isn't running",
      detail:
        "YouTube Music can't be reached without it. Start it on its own, or restart `bun run dev`, which starts it for you.",
      command: "bun run vpn",
    };
  }
  if (!youtube.configured) {
    return {
      title: "Sign in to YouTube Music",
      detail:
        "SpottoYT needs your YouTube Music cookie to create playlists. The command explains where to copy it from.",
      command: "bun run setup:youtube",
    };
  }
  if (!youtube.signedIn) {
    return {
      title: "Your YouTube Music sign-in expired",
      detail:
        "The saved cookie no longer works. Copy a fresh one from music.youtube.com; the command explains how. No restart needed.",
      command: "bun run setup:youtube",
    };
  }
  if (!youtube.searchAvailable) {
    return youtube.vpn
      ? {
          title: "YouTube Music returns no songs through the VPN",
          detail:
            "The VPN server is probably in a country without YouTube Music. Download a WireGuard config for another server (the US works) and point wireproxy.conf at it.",
        }
      : {
          title: "YouTube Music isn't available from here",
          detail:
            "Route the helper through a VPN: see “Unsupported regions” in the README, then set HTTPS_PROXY in .env and restart `bun run dev`.",
        };
  }
  return null;
}
