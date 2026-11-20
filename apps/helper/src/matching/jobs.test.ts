import { describe, expect, test } from "bun:test";
import type { SpotifyTrack, TrackMatch } from "@spottoyt/shared";
import { createMatchJobs } from "./jobs";

const tracks: SpotifyTrack[] = Array.from({ length: 10 }, (_, i) => ({
  uri: `spotify:track:${i}`,
  title: `Song ${i}`,
  artists: ["Artist"],
  durationMs: 1000,
}));

const ok = (track: SpotifyTrack): TrackMatch => ({
  spotifyUri: track.uri,
  status: "matched",
  candidates: [],
});

async function settle(get: () => { status: string } | null) {
  for (let i = 0; i < 100 && get()?.status === "running"; i++)
    await Bun.sleep(5);
}

describe("match jobs", () => {
  test("matches every track, at most 4 at a time", async () => {
    let running = 0;
    let peak = 0;
    const jobs = createMatchJobs(async (track) => {
      peak = Math.max(peak, ++running);
      await Bun.sleep(2);
      running--;
      return ok(track);
    });

    const { id } = jobs.start(tracks);
    await settle(() => jobs.get(id));

    const job = jobs.get(id);
    expect(job?.status).toBe("done");
    expect(job?.results).toHaveLength(10);
    expect(peak).toBe(4);
  });

  test("records a failed track and keeps going", async () => {
    const jobs = createMatchJobs(async (track) => {
      if (track.uri.endsWith(":3")) throw new Error("boom");
      return ok(track);
    });

    const { id } = jobs.start(tracks);
    await settle(() => jobs.get(id));

    const job = jobs.get(id);
    expect(job?.status).toBe("done");
    expect(job?.results.find((r) => r.status === "error")).toMatchObject({
      spotifyUri: "spotify:track:3",
      error: "boom",
    });
  });

  test("gives up after 5 failures in a row", async () => {
    const jobs = createMatchJobs(async () => {
      throw new Error("rate limited");
    });

    const { id } = jobs.start(tracks);
    await settle(() => jobs.get(id));

    const job = jobs.get(id);
    expect(job?.status).toBe("failed");
    expect(job?.error).toContain("rate limited");
    expect(job?.results.length).toBeLessThan(10);
  });

  test("cancelling stops new work", async () => {
    const jobs = createMatchJobs(async (track) => {
      await Bun.sleep(5);
      return ok(track);
    });

    const { id } = jobs.start(tracks);
    jobs.cancel(id);
    await Bun.sleep(30);

    expect(jobs.get(id)?.status).toBe("cancelled");
    expect(jobs.get(id)?.results).toEqual([]);
  });
});
