import { beforeEach, describe, expect, test } from "bun:test";
import type { SpotifyTrack, YoutubeTrack } from "@spottoyt/shared";
import { openDatabase } from "../db";
import { defaultSettings } from "../settings";
import type { SearchOptions, YoutubeClient } from "../youtube";
import { matchTrack, planSearches, searchKey, searchTitle } from "./match";
import { createMatchStore, type MatchStore } from "./store";

const nightcall: SpotifyTrack = {
  uri: "spotify:track:nightcall",
  title: "Nightcall",
  artists: ["Kavinsky"],
  album: "OutRun",
  durationMs: 258_000,
};

const exact: YoutubeTrack = {
  videoId: "exact",
  title: "Nightcall",
  artists: ["Kavinsky"],
  album: "OutRun",
  durationMs: 258_000,
  kind: "song",
};
const live: YoutubeTrack = {
  ...exact,
  videoId: "live",
  title: "Nightcall (Live)",
};

describe("searchTitle", () => {
  test.each([
    ["Here Comes the Sun - Remastered 2019", "Here Comes the Sun"],
    ["Odd Look (feat. The Weeknd)", "Odd Look"],
    ["Nightcall - Live", "Nightcall - Live"],
    ["Song (Acoustic Version)", "Song (Acoustic Version)"],
    ["Song - Radio Edit", "Song - Radio Edit"],
  ])("%s → %s", (input, expected) => {
    expect(searchTitle(input)).toBe(expected);
  });
});

describe("planSearches", () => {
  test("Latin tracks: several song phrasings, then videos", () => {
    const steps = planSearches(
      { ...nightcall, artists: ["Kavinsky", "Lovefoxxx"] },
      defaultSettings,
    );

    expect(steps.map(searchKey)).toEqual([
      "song|en|Nightcall Kavinsky Lovefoxxx",
      "song|en|Kavinsky Nightcall",
      "song|en|Nightcall Kavinsky",
      "song|en|Nightcall Kavinsky OutRun",
      "video|en|Nightcall Kavinsky",
    ]);
  });

  test("leaves out the album when it's the title, and edition noise", () => {
    const steps = planSearches(
      { ...nightcall, album: "Nightcall (Deluxe Edition)" },
      { ...defaultSettings, includeVideos: false },
    );
    expect(steps.map(searchKey)).toEqual([
      "song|en|Nightcall Kavinsky",
      "song|en|Kavinsky Nightcall",
    ]);
  });

  test("Japanese tracks search in Japanese first, then English", () => {
    const steps = planSearches(
      { ...nightcall, title: "Lemon", artists: ["米津玄師"] },
      { ...defaultSettings, includeVideos: false },
    );

    expect(steps.map(searchKey)).toEqual([
      "song|ja|Lemon 米津玄師",
      "song|ja|米津玄師 Lemon",
      "song|ja|Lemon 米津玄師 OutRun",
      "song|en|Lemon 米津玄師",
    ]);
  });
});

const unused = async (): Promise<never> => {
  throw new Error("unused");
};

describe("matchTrack", () => {
  let store: MatchStore;
  let searches: SearchOptions[];
  let results: Record<string, YoutubeTrack[]>;

  const youtube: YoutubeClient = {
    async search(options) {
      searches.push(options);
      return results[`${options.kind}|${options.query}`] ?? [];
    },
    async status() {
      throw new Error("unused");
    },
    async video() {
      throw new Error("unused");
    },
    createPlaylist: unused,
    addToPlaylist: unused,
    replaceInPlaylist: unused,
    playlistTracks: unused,
  };
  const deps = () => ({
    youtube,
    store,
    settings: () => defaultSettings,
    retry: <T>(fn: () => Promise<T>) => fn(),
  });

  beforeEach(() => {
    store = createMatchStore(openDatabase(":memory:"));
    searches = [];
    results = {};
  });

  test("stops after the first search when it finds a confident match", async () => {
    results["song|Nightcall Kavinsky"] = [live, exact];

    const match = await matchTrack(nightcall, deps());

    expect(match).toMatchObject({
      status: "matched",
      source: "auto",
      selectedVideoId: "exact",
    });
    expect(match.candidates.map((c) => c.videoId)).toEqual(["exact", "live"]);
    expect(searches).toHaveLength(1);
  });

  test("keeps searching while unsure, then suggests the best for review", async () => {
    results["song|Nightcall Kavinsky"] = [live];

    const match = await matchTrack(nightcall, deps());

    expect(match).toMatchObject({
      status: "review",
      source: "suggested",
      selectedVideoId: "live",
    });
    expect(searches.map((s) => `${s.kind}|${s.query}`)).toEqual([
      "song|Nightcall Kavinsky",
      "song|Kavinsky Nightcall",
      "song|Nightcall Kavinsky OutRun",
      "video|Nightcall Kavinsky",
    ]);
  });

  test("reports not found when every search is empty", async () => {
    const match = await matchTrack(nightcall, deps());

    expect(match).toMatchObject({ status: "not_found", candidates: [] });
  });

  test("reuses cached results instead of searching again", async () => {
    results["song|Nightcall Kavinsky"] = [exact];
    await matchTrack(nightcall, deps());
    searches = [];

    const again = await matchTrack(nightcall, deps());

    expect(again.selectedVideoId).toBe("exact");
    expect(searches).toEqual([]);
  });

  test("fresh runs every search again and keeps earlier results", async () => {
    results["song|Nightcall Kavinsky"] = [live];
    await matchTrack(nightcall, deps());
    searches = [];
    // YouTube now returns something else for the same search.
    results["song|Nightcall Kavinsky"] = [exact];

    const again = await matchTrack(nightcall, deps(), { fresh: true });

    expect(searches.map((s) => s.kind)).toEqual([
      "song",
      "song",
      "song",
      "video",
    ]);
    expect(again.selectedVideoId).toBe("exact");
    expect(again.candidates.map((c) => c.videoId)).toContain("live");
  });

  test("fresh still respects a manual pick", async () => {
    store.setManual(nightcall.uri, live);
    results["song|Nightcall Kavinsky"] = [exact];

    const match = await matchTrack(nightcall, deps(), { fresh: true });

    expect(match).toMatchObject({ source: "manual", selectedVideoId: "live" });
    expect(match.candidates.map((c) => c.videoId)).toContain("exact");
  });

  test("continues only the searches a weaker cache didn't run", async () => {
    store.saveCandidates(nightcall, {
      candidates: [live],
      searches: ["song|en|Nightcall Kavinsky"],
    });
    results["video|Nightcall Kavinsky"] = [
      {
        ...exact,
        videoId: "video",
        kind: "video",
        title: "Kavinsky - Nightcall (Official Video)",
      },
    ];

    await matchTrack(nightcall, deps());

    expect(searches.map((s) => `${s.kind}|${s.query}`)).toEqual([
      "song|Kavinsky Nightcall",
      "song|Nightcall Kavinsky OutRun",
      "video|Nightcall Kavinsky",
    ]);
  });

  test("a manual pick wins, even over a confident search result", async () => {
    results["song|Nightcall Kavinsky"] = [exact];
    store.setManual(nightcall.uri, live);

    const match = await matchTrack(nightcall, deps());

    expect(match).toMatchObject({
      status: "matched",
      source: "manual",
      selectedVideoId: "live",
    });
    expect(match.candidates.map((c) => c.videoId)).toEqual(["live", "exact"]);
  });

  test("keeps every result from a search, since YouTube's order is noisy", async () => {
    await matchTrack(nightcall, deps());

    expect(searches.every((s) => s.limit === undefined)).toBe(true);
  });
});
