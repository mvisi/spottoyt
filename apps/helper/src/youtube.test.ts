import { describe, expect, test } from "bun:test";
import {
  retryNetwork,
  toYoutubeTrack,
  toYoutubeTrackFromInfo,
} from "./youtube";

describe("toYoutubeTrack", () => {
  test("normalizes a song result", () => {
    expect(
      toYoutubeTrack({
        id: "kIO2OHa9HDQ",
        title: "Nightcall",
        item_type: "song",
        artists: [{ name: "Kavinsky" }],
        album: { name: "OutRun" },
        duration: { seconds: 258 },
        thumbnails: [
          { url: "small", width: 60 },
          { url: "large", width: 544 },
        ],
      }),
    ).toEqual({
      videoId: "kIO2OHa9HDQ",
      title: "Nightcall",
      artists: ["Kavinsky"],
      album: "OutRun",
      durationMs: 258_000,
      kind: "song",
      thumbnailUrl: "large",
    });
  });

  test("falls back to authors for videos", () => {
    expect(
      toYoutubeTrack({
        id: "MV_3Dpw-BRY",
        title: "Nightcall",
        item_type: "video",
        authors: [{ name: "Kavinsky" }],
      }),
    ).toMatchObject({ kind: "video", artists: ["Kavinsky"], album: undefined });
  });

  test("skips artists, albums and incomplete items", () => {
    expect(toYoutubeTrack({ id: "x", title: "y", item_type: "artist" })).toBe(
      null,
    );
    expect(toYoutubeTrack({ title: "y", item_type: "song" })).toBe(null);
  });
});

describe("toYoutubeTrackFromInfo", () => {
  test("recognizes an auto-generated song upload and reads its album", () => {
    expect(
      toYoutubeTrackFromInfo("kIO2OHa9HDQ", {
        title: "Nightcall",
        author: "Kavinsky - Topic",
        duration: 257,
        short_description:
          "Provided to YouTube by Record Makers\n\nNightcall · Kavinsky\n\nOutRun\n\n℗ 2013 Record Makers",
      }),
    ).toMatchObject({
      kind: "song",
      artists: ["Kavinsky"],
      album: "OutRun",
      durationMs: 257_000,
    });
  });

  test("treats anything else as a video", () => {
    expect(
      toYoutubeTrackFromInfo("MV_3Dpw-BRY", {
        title: "Kavinsky - Nightcall (Official Video)",
        author: "Kavinsky",
        short_description: "Official video",
      }),
    ).toMatchObject({ kind: "video", album: undefined });
  });
});

describe("retryNetwork", () => {
  test("retries connection errors, then succeeds", async () => {
    let calls = 0;
    const result = await retryNetwork(async () => {
      calls++;
      if (calls < 3)
        throw Object.assign(new Error("socket closed"), { code: "ECONNRESET" });
      return "ok";
    }, [0, 0]);

    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  test("doesn't retry other errors", async () => {
    let calls = 0;
    const failing = retryNetwork(async () => {
      calls++;
      throw new Error("This video is unavailable");
    }, [0, 0]);

    await expect(failing).rejects.toThrow("unavailable");
    expect(calls).toBe(1);
  });
});
