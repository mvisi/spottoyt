// Runs matching for many tracks at once and keeps the results in memory
// while the app polls for them.
import type { MatchJob, SpotifyTrack, TrackMatch } from "@spottoyt/shared";
import { describeError, log } from "../log";
import { YoutubeProblem } from "../youtube";

export type MatchJobs = {
  start(tracks: SpotifyTrack[], options?: { fresh?: boolean }): MatchJob;
  get(id: string): MatchJob | null;
  cancel(id: string): MatchJob | null;
};

type MatchFn = (
  track: SpotifyTrack,
  options: { fresh?: boolean },
) => Promise<TrackMatch>;

/** Parallel searches. Higher risks YouTube rate limiting. */
const CONCURRENCY = 4;
/** Give up when this many tracks fail in a row: YouTube is likely down or blocking us. */
const MAX_CONSECUTIVE_ERRORS = 5;
/** Finished jobs kept for polling. */
const KEEP_JOBS = 10;

export function createMatchJobs(match: MatchFn): MatchJobs {
  const jobs = new Map<string, MatchJob>();

  const prune = () => {
    const finished = [...jobs.values()].filter((j) => j.status !== "running");
    for (const job of finished.slice(
      0,
      Math.max(0, finished.length - KEEP_JOBS),
    )) {
      jobs.delete(job.id);
    }
  };

  const run = async (job: MatchJob, tracks: SpotifyTrack[], fresh: boolean) => {
    let next = 0;
    let consecutiveErrors = 0;

    const worker = async () => {
      while (job.status === "running") {
        const track = tracks[next++];
        if (!track) return;

        let result: TrackMatch;
        let lastError: unknown;
        try {
          result = await match(track, { fresh });
          consecutiveErrors = 0;
        } catch (error) {
          consecutiveErrors++;
          lastError = error;
          log.warn("Matching a track failed", {
            job: job.id,
            track: `${track.artists.join(", ")} - ${track.title}`,
            uri: track.uri,
            ...describeError(error),
          });
          result = {
            spotifyUri: track.uri,
            status: "error",
            candidates: [],
            error: error instanceof Error ? error.message : String(error),
          };
        }

        if (job.status !== "running") return;
        job.results.push(result);
        // A stopped VPN or expired sign-in fails every track the same way.
        if (lastError instanceof YoutubeProblem) {
          job.status = "failed";
          job.error = lastError.message;
        } else if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          job.status = "failed";
          job.error = `Stopped after ${consecutiveErrors} failed searches in a row. Last error: ${result.error}`;
        }
      }
    };

    const started = performance.now();
    log.info("Match job started", {
      job: job.id,
      tracks: tracks.length,
      fresh,
    });
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (job.status === "running") job.status = "done";
    const counts: Record<string, number> = {};
    for (const r of job.results) counts[r.status] = (counts[r.status] ?? 0) + 1;
    (job.status === "failed" ? log.warn : log.info)(`Match job ${job.status}`, {
      job: job.id,
      seconds: Math.round((performance.now() - started) / 1000),
      ...counts,
      ...(job.error ? { error: job.error } : {}),
    });
    prune();
  };

  return {
    start(tracks, { fresh = false } = {}) {
      const job: MatchJob = {
        id: crypto.randomUUID(),
        status: "running",
        total: tracks.length,
        results: [],
      };
      jobs.set(job.id, job);
      void run(job, tracks, fresh);
      return job;
    },
    get: (id) => jobs.get(id) ?? null,
    cancel(id) {
      const job = jobs.get(id);
      if (job?.status === "running") job.status = "cancelled";
      return job ?? null;
    },
  };
}
