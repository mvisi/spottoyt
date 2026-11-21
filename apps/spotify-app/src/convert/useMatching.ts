import type {
  MatchJobStatus,
  SpotifyTrack,
  TrackMatch,
} from "@spottoyt/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { helper } from "../helper";

export type MatchingProgress = {
  status: "starting" | MatchJobStatus;
  done: number;
  total: number;
  error?: string;
};

const POLL_MS = 400;

/**
 * Matches `tracks` in the helper as soon as it mounts and streams results
 * in. `run` matches a subset again, e.g. tracks that failed.
 */
export function useMatching(tracks: SpotifyTrack[]) {
  const [matches, setMatches] = useState<ReadonlyMap<string, TrackMatch>>(
    new Map(),
  );
  const [progress, setProgress] = useState<MatchingProgress>({
    status: "starting",
    done: 0,
    total: tracks.length,
  });
  // Identifies the current run, so a superseded or unmounted run stops polling.
  const runRef = useRef<object | null>(null);
  const jobRef = useRef<string | null>(null);

  const stopJob = useCallback(() => {
    runRef.current = null;
    if (jobRef.current)
      void helper.cancelMatchJob(jobRef.current).catch(() => {});
    jobRef.current = null;
  }, []);

  const run = useCallback(
    async (subset: SpotifyTrack[], fresh = false) => {
      stopJob();
      if (!subset.length) {
        setProgress({ status: "done", done: 0, total: 0 });
        return;
      }
      const token = {};
      runRef.current = token;
      setProgress({ status: "starting", done: 0, total: subset.length });

      try {
        const job = await helper.startMatchJob(subset, fresh);
        if (runRef.current !== token)
          return void helper.cancelMatchJob(job.id).catch(() => {});
        jobRef.current = job.id;

        let since = 0;
        while (runRef.current === token) {
          const update = await helper.matchJob(job.id, since);
          if (runRef.current !== token) return;
          since += update.results.length;
          if (update.results.length) {
            setMatches((prev) => {
              const next = new Map(prev);
              for (const result of update.results)
                next.set(result.spotifyUri, result);
              return next;
            });
          }
          setProgress({
            status: update.status,
            done: since,
            total: update.total,
            error: update.error,
          });
          if (update.status !== "running") {
            jobRef.current = null;
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
      } catch (error) {
        if (runRef.current !== token) return;
        jobRef.current = null;
        setProgress((p) => ({
          ...p,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    },
    [stopJob],
  );

  useEffect(() => {
    void run(tracks);
    return stopJob;
  }, [tracks, run, stopJob]);

  const cancel = useCallback(() => {
    stopJob();
    setProgress((p) => ({ ...p, status: "cancelled" }));
  }, [stopJob]);

  return { matches, progress, run, cancel };
}
