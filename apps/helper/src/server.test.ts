import { beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import type { YoutubeStatus, YoutubeTrack } from "@spottoyt/shared";
import { openDatabase } from "./db";
import { createMatchJobs } from "./matching/jobs";
import { createMatchStore, type MatchStore } from "./matching/store";
import { createPlaylistStore } from "./playlists/store";
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
/** The fake YouTube account's playlists, by ID. */
let ytPlaylists: Map<string, YoutubeTrack[]>;

beforeEach(() => {
  searches = [];
  statusCalls = [];
  ytPlaylists = new Map();
  const youtube: YoutubeClient = {
    async search(options) {
      searches.push(options);
      return [track];
    },
    async status(options) {
      statusCalls.push(options);
      return status;
    },
    async video(id) {
      return id === track.videoId ? track : null;
    },
    async createPlaylist() {
      const id = `PL${ytPlaylists.size + 1}`;
      ytPlaylists.set(id, []);
      return id;
    },
    async addToPlaylist(id, videoIds) {
      const items = ytPlaylists.get(id);
      if (!items) throw new Error("Playlist not found");
      for (const videoId of videoIds) {
        if (!items.some((i) => i.videoId === videoId)) {
          items.push({ ...track, videoId });
        }
      }
    },
    async replaceInPlaylist(id, oldId, newId, { keepOld }) {
      const items = ytPlaylists.get(id);
      if (!items) throw new Error("Playlist not found");
      const at = items.findIndex((i) => i.videoId === oldId);
      const replacement = { ...track, videoId: newId };
      if (at === -1) items.push(replacement);
      else items.splice(at, keepOld ? 0 : 1, replacement);
    },
    async playlistTracks(id) {
      return ytPlaylists.get(id) ?? null;
    },
  };
  const db = openDatabase(":memory:");
  matches = createMatchStore(db);
  handle = createHandler({
    version: "1.2.3",
    settings: createSettingsStore(db),
    youtube,
    matches,
    playlists: createPlaylistStore(db),
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
    expect(res.headers.get("Cache-Control")).toBe("no-store");
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
        lang: "en",
      },
    ]);
  });

  test("passes kind and limit through", async () => {
    await get("/youtube/search?q=x&kind=video&limit=3&lang=ja");

    expect(searches).toEqual([
      { query: "x", kind: "video", limit: 3, lang: "ja" },
    ]);
  });

  test("picks the search language from the query text", async () => {
    await get(`/youtube/search?q=${encodeURIComponent("夜に駆ける")}`);

    expect(searches[0]?.lang).toBe("ja");
  });

  test("looks up a single video", async () => {
    expect(
      await (await get(`/youtube/videos/${track.videoId}`)).json(),
    ).toEqual(track);
    expect((await get("/youtube/videos/abcdefghijk")).status).toBe(404);
    expect((await get("/youtube/videos/bad")).status).toBe(400);
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

describe("linked playlists", () => {
  const playlist = encodeURIComponent("spotify:playlist:abc");
  const add = (...items: Array<[string, string]>) =>
    send(
      "POST",
      `/playlists/${playlist}/tracks`,
      JSON.stringify({
        tracks: items.map(([spotifyUri, videoId]) => ({
          spotifyUri,
          track: { ...track, videoId },
        })),
      }),
    );
  const link = () =>
    send(
      "POST",
      `/playlists/${playlist}/link`,
      JSON.stringify({ spotifyName: "Drive", title: "Drive (from Spotify)" }),
    );

  test("creates a link, adds tracks once, and lists it", async () => {
    expect((await add(["spotify:track:1", "v1"])).status).toBe(404);

    const created = await link();
    expect(created.status).toBe(201);
    expect((await link()).status).toBe(409);

    await add(["spotify:track:1", "v1"], ["spotify:track:2", "v2"]);
    const again = await add(["spotify:track:1", "v1"]);
    expect(Object.keys((await again.json()).tracks)).toEqual([]);
    expect(ytPlaylists.get("PL1")?.map((t) => t.videoId)).toEqual(["v1", "v2"]);

    const links = await (await get("/playlists")).json();
    expect(links).toMatchObject([
      { spotifyName: "Drive", youtubePlaylistId: "PL1", added: 2, skipped: 0 },
    ]);
  });

  test("keeps skips per playlist, without overriding added tracks", async () => {
    await send("PUT", `/playlists/${playlist}/skips/spotify%3Atrack%3A9`);
    let state = await (await get(`/playlists/${playlist}`)).json();
    expect(state.link).toBe(null);
    expect(state.tracks["spotify:track:9"].state).toBe("skipped");

    await link();
    await add(["spotify:track:1", "v1"]);
    await send("PUT", `/playlists/${playlist}/skips/spotify%3Atrack%3A1`);
    await send("DELETE", `/playlists/${playlist}/skips/spotify%3Atrack%3A9`);
    state = await (await get(`/playlists/${playlist}`)).json();
    expect(state.tracks["spotify:track:1"].state).toBe("added");
    expect(state.tracks["spotify:track:9"]).toBeUndefined();
  });

  test("reports what differs on YouTube, without changing anything", async () => {
    await link();
    await add(["spotify:track:1", "v1"], ["spotify:track:2", "v2"]);
    const items = ytPlaylists.get("PL1") ?? [];
    // You removed v2 and added your own song on YouTube.
    ytPlaylists.set("PL1", [
      ...items.filter((t) => t.videoId !== "v2"),
      { ...track, videoId: "mine" },
    ]);

    // Fresh adds may not show on YouTube yet, so they're never "removed".
    let diff = await (await get(`/playlists/${playlist}/youtube`)).json();
    expect(diff.removedOnYoutube).toEqual([]);

    setSystemTime(new Date(Date.now() + 5 * 60 * 1000));
    diff = await (await get(`/playlists/${playlist}/youtube`)).json();
    setSystemTime();
    expect(diff.onlyOnYoutube.map((t: YoutubeTrack) => t.videoId)).toEqual([
      "mine",
    ]);
    expect(diff.removedOnYoutube).toEqual(["spotify:track:2"]);

    // Removed tracks count as added, so syncing doesn't bring them back.
    await add(["spotify:track:2", "v2"]);
    expect(ytPlaylists.get("PL1")?.map((t) => t.videoId)).toEqual([
      "v1",
      "mine",
    ]);
  });

  test("unlinking forgets added tracks and says when the playlist is gone", async () => {
    await link();
    await add(["spotify:track:1", "v1"]);
    ytPlaylists.delete("PL1");
    expect((await get(`/playlists/${playlist}/youtube`)).status).toBe(410);

    expect((await send("DELETE", `/playlists/${playlist}/link`)).status).toBe(
      204,
    );
    const state = await (await get(`/playlists/${playlist}`)).json();
    expect(state).toEqual({ link: null, tracks: {} });
  });

  test("replaces an added track in place, and only when asked", async () => {
    const replace = (trackUri: string, videoId: string) =>
      send(
        "POST",
        `/playlists/${playlist}/tracks/${encodeURIComponent(trackUri)}/replace`,
        JSON.stringify({ track: { ...track, videoId } }),
      );
    await link();
    await add(
      ["spotify:track:1", "v1"],
      ["spotify:track:2", "karaoke"],
      ["spotify:track:3", "v3"],
      // The same video for two Spotify tracks (a duplicate in the playlist).
      ["spotify:track:4", "v1"],
    );

    expect((await replace("spotify:track:9", "x")).status).toBe(409);

    expect((await replace("spotify:track:2", "real")).status).toBe(200);
    expect(ytPlaylists.get("PL1")?.map((t) => t.videoId)).toEqual([
      "v1",
      "real",
      "v3",
    ]);
    const state = await (await get(`/playlists/${playlist}`)).json();
    expect(state.tracks["spotify:track:2"].track.videoId).toBe("real");
    expect(matches.getManual("spotify:track:2")?.videoId).toBe("real");

    // v1 is still used by track 4, so it stays.
    await replace("spotify:track:1", "better");
    expect(ytPlaylists.get("PL1")?.map((t) => t.videoId)).toEqual([
      "better",
      "v1",
      "real",
      "v3",
    ]);
  });

  test("flags added tracks that look wrong, except your own picks", async () => {
    const spotify = (n: number) => ({
      uri: `spotify:track:${n}`,
      title: "Nightcall",
      artists: ["Kavinsky"],
      durationMs: 258_000,
    });
    await link();
    await send(
      "POST",
      `/playlists/${playlist}/tracks`,
      JSON.stringify({
        tracks: [1, 2, 3].map((n) => ({
          spotifyUri: `spotify:track:${n}`,
          track: {
            ...track,
            videoId: `v${n}`,
            title: n === 1 ? "Nightcall" : "Nightcall (Karaoke Version)",
          },
        })),
      }),
    );
    // You picked the karaoke version for track 3 yourself.
    matches.setManual("spotify:track:3", {
      ...track,
      videoId: "v3",
      title: "Nightcall (Karaoke Version)",
    });

    const res = await send(
      "POST",
      `/playlists/${playlist}/check`,
      JSON.stringify({ tracks: [1, 2, 3].map(spotify) }),
    );
    const { suspect } = await res.json();
    expect(Object.keys(suspect)).toEqual(["spotify:track:2"]);
    expect(suspect["spotify:track:2"].reasons).toContain("Karaoke");
  });
});
