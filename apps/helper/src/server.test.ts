import { beforeEach, describe, expect, test } from "bun:test";
import type { YoutubeStatus, YoutubeTrack } from "@spottoyt/shared";
import { openDatabase } from "./db";
import { createHandler } from "./server";
import { createSettingsStore, defaultSettings } from "./settings";
import type { YoutubeClient } from "./youtube";

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

let searches: Array<{ query: string; kind: string; limit: number }>;
let statusCalls: Array<{ refresh?: boolean } | undefined>;
let handle: (req: Request) => Promise<Response>;

beforeEach(() => {
  searches = [];
  statusCalls = [];
  const youtube: YoutubeClient = {
    async search(query, kind, limit) {
      searches.push({ query, kind, limit });
      return [track];
    },
    async status(options) {
      statusCalls.push(options);
      return status;
    },
  };
  handle = createHandler({
    version: "1.2.3",
    settings: createSettingsStore(openDatabase(":memory:")),
    youtube,
  });
});

const get = (path: string) => handle(new Request(`http://127.0.0.1${path}`));
const patch = (path: string, body: string) =>
  handle(
    new Request(`http://127.0.0.1${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );

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

  test("searches with the default limit from settings", async () => {
    const res = await get("/youtube/search?q=Nightcall%20Kavinsky");

    expect(await res.json()).toEqual({ results: [track] });
    expect(searches).toEqual([
      {
        query: "Nightcall Kavinsky",
        kind: "song",
        limit: defaultSettings.searchLimit,
      },
    ]);
  });

  test("passes kind and limit through", async () => {
    await get("/youtube/search?q=x&kind=video&limit=3");

    expect(searches).toEqual([{ query: "x", kind: "video", limit: 3 }]);
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
