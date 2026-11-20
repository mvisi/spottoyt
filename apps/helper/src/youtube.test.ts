import { describe, expect, test } from "bun:test";
import { toYoutubeTrack } from "./youtube";

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
