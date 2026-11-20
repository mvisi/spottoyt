import { beforeEach, describe, expect, test } from "bun:test";
import type { YoutubeStatus, YoutubeTrack } from "@spottoyt/shared";
import { openDatabase } from "./db";
import { createMatchJobs } from "./matching/jobs";
import { createMatchStore, type MatchStore } from "./matching/store";
import { createHandler } from "./server";
import { createSettingsStore, defaultSettings } from "./settings";
import type { SearchOptions, YoutubeClient } from "./youtube";

const track: YoutubeTrack = {
  videoId: "kIO2OHa9HDQ",
  title: "Nightcall",
  artists: ["Kavinsky"],
  album: "OutRun",
  durationMs: 258_000,
  kind: "song",
};

const status: YoutubeStatus = {
  configured: true,
  signedIn: true,
  searchAvailable: true,
  checkedAt: "2026-11-21T00:00:00.000Z",
};

let searches: SearchOptions[];
let statusCalls: Array<{ refresh?: boolean } | undefined>;
let handle: (req: Request) => Promise<Response>;
let matches: MatchStore;

beforeEach(() => {
  searches = [];
  statusCalls = [];
  const youtube: YoutubeClient = {
    async search(options) {
      searches.push(options);
      return [track];
    },
    async status(options) {
      statusCalls.push(options);
      return status;
    },
  };
  const db = openDatabase(":memory:");
  matches = createMatchStore(db);
  handle = createHandler({
    version: "1.2.3",
    settings: createSettingsStore(db),
    youtube,
    matches,
    // Matching itself is tested in matching/; here a match is instant.
    jobs: createMatchJobs(async (spotify) => ({
      spotifyUri: spotify.uri,
      status: "matched",
      source: "auto",
      selectedVideoId: track.videoId,
      candidates: [],
    })),
  });
});

const get = (path: string) => handle(new Request(`http://127.0.0.1${path}`));
const send = (method: string, path: string, body?: string) =>
  handle(
    new Request(`http://127.0.0.1${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
const patch = (path: string, body: string) => send("PATCH", path, body);

describe("basics", () => {
  test("reports health with CORS headers", async () => {
    const res = await get("/health");

    expect(await res.json()).toEqual({ ok: true, version: "1.2.3" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("answers preflight requests", async () => {
    const res = await handle(
      new Request("http://127.0.0.1/settings", { method: "OPTIONS" }),
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Private-Network")).toBe(
      "true",
    );
  });

  test("returns 404 for unknown routes", async () => {
    expect((await get("/nope")).status).toBe(404);
  });
});

describe("youtube", () => {
  test("returns status and forwards refresh", async () => {
    expect(await (await get("/youtube/status")).json()).toEqual(status);
    await get("/youtube/status?refresh=1");

    expect(statusCalls).toEqual([{ refresh: false }, { refresh: true }]);
  });

  test("searches songs with no limit by default", async () => {
    const res = await get("/youtube/search?q=Nightcall%20Kavinsky");

    expect(await res.json()).toEqual({ results: [track] });
    expect(searches).toEqual([
      {
        query: "Nightcall Kavinsky",
        kind: "song",
        limit: undefined,
        lang: undefined,
      },
    ]);
  });

  test("passes kind and limit through", async () => {
    await get("/youtube/search?q=x&kind=video&limit=3&lang=ja");

    expect(searches).toEqual([
      { query: "x", kind: "video", limit: 3, lang: "ja" },
    ]);
  });

  test("rejects a missing query or bad kind", async () => {
    expect((await get("/youtube/search")).status).toBe(400);
    expect((await get("/youtube/search?q=x&kind=album")).status).toBe(400);
    expect(searches).toEqual([]);
  });
});

describe("settings", () => {
  test("starts with defaults", async () => {
    expect(await (await get("/settings")).json()).toEqual(defaultSettings);
  });

  test("updates and persists a partial patch", async () => {
    const res = await patch("/settings", '{"autoAcceptScore":75}');

    expect(await res.json()).toEqual({
      ...defaultSettings,
      autoAcceptScore: 75,
    });
    expect((await (await get("/settings")).json()).autoAcceptScore).toBe(75);
  });

  test("rejects invalid values, unknown keys and bad JSON", async () => {
    expect((await patch("/settings", '{"autoAcceptScore":101}')).status).toBe(
      400,
    );
    expect((await patch("/settings", '{"nope":true}')).status).toBe(400);
    expect((await patch("/settings", "{")).status).toBe(400);
    expect(await (await get("/settings")).json()).toEqual(defaultSettings);
  });
});

describe("match jobs", () => {
  const spotify = {
    uri: "spotify:track:1",
    title: "Nightcall",
    artists: ["Kavinsky"],
    durationMs: 258_000,
  };

  test("starts a job and returns results since an offset", async () => {
    const start = await send(
      "POST",
      "/match-jobs",
      JSON.stringify({
        tracks: [spotify, { ...spotify, uri: "spotify:track:2" }],
      }),
    );
    const { id, total } = await start.json();
    expect(start.status).toBe(201);
    expect(total).toBe(2);

    await Bun.sleep(10);
    const all = await (await get(`/match-jobs/${id}`)).json();
    const later = await (await get(`/match-jobs/${id}?since=1`)).json();

    expect(all.status).toBe("done");
    expect(
      all.results.map((r: { spotifyUri: string }) => r.spotifyUri),
    ).toEqual(["spotify:track:1", "spotify:track:2"]);
    expect(later.results).toHaveLength(1);
  });

  test("rejects bad tracks and unknown jobs", async () => {
    expect((await send("POST", "/match-jobs", '{"tracks":[]}')).status).toBe(
      400,
    );
    expect((await get("/match-jobs/nope")).status).toBe(404);
    expect((await send("DELETE", "/match-jobs/nope")).status).toBe(404);
  });
});

describe("manual matches", () => {
  test("saves and clears a pick", async () => {
    const res = await send(
      "PUT",
      "/manual-matches",
      JSON.stringify({ spotifyUri: "spotify:track:1", track }),
    );
    expect(res.status).toBe(204);
    expect(matches.getManual("spotify:track:1")).toEqual(track);

    await send("DELETE", "/manual-matches?spotifyUri=spotify%3Atrack%3A1");
    expect(matches.getManual("spotify:track:1")).toBe(null);
  });

  test("rejects an incomplete track", async () => {
    const res = await send(
      "PUT",
      "/manual-matches",
      JSON.stringify({ spotifyUri: "x", track: { videoId: "y" } }),
    );
    expect(res.status).toBe(400);
  });
});
