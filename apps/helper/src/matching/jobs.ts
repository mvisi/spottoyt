// Runs matching for many tracks at once and keeps the results in memory
// while the app polls for them.
import type { MatchJob, SpotifyTrack, TrackMatch } from "@spottoyt/shared";

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
        try {
          result = await match(track, { fresh });
          consecutiveErrors = 0;
        } catch (error) {
          consecutiveErrors++;
          result = {
            spotifyUri: track.uri,
            status: "error",
            candidates: [],
            error: error instanceof Error ? error.message : String(error),
          };
        }

        if (job.status !== "running") return;
        job.results.push(result);
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          job.status = "failed";
          job.error = `Stopped after ${consecutiveErrors} failed searches in a row. Last error: ${result.error}`;
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (job.status === "running") job.status = "done";
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
