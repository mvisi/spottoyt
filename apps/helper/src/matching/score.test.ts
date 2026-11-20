import { describe, expect, test } from "bun:test";
import type { SpotifyTrack, YoutubeTrack } from "@spottoyt/shared";
import {
  baseTitle,
  isConfidentMatch,
  normalize,
  rankCandidates,
  scoreCandidate,
} from "./score";

const nightcall: SpotifyTrack = {
  uri: "spotify:track:nightcall",
  title: "Nightcall",
  artists: ["Kavinsky"],
  album: "OutRun",
  durationMs: 258_000,
};

const song = (over: Partial<YoutubeTrack>): YoutubeTrack => ({
  videoId: "song",
  title: "Nightcall",
  artists: ["Kavinsky"],
  album: "OutRun",
  durationMs: 258_000,
  kind: "song",
  ...over,
});

describe("baseTitle", () => {
  test.each([
    ["Here Comes the Sun - Remastered 2019", "Here Comes the Sun"],
    ["Odd Look (feat. The Weeknd)", "Odd Look"],
    ["Nightcall [Official Video]", "Nightcall"],
    ["(I Can't Get No) Satisfaction", "Satisfaction"],
    ["(Untitled)", "(Untitled)"],
    ["夜に駆ける（YOASOBI）", "夜に駆ける"],
  ])("%s → %s", (input, expected) => {
    expect(baseTitle(input)).toBe(expected);
  });
});

describe("normalize", () => {
  test.each([
    ["Björk", "bjork"],
    ["Mötley Crüe", "motley crue"],
    ["Straße", "strasse"],
    ["Sigur Rós", "sigur ros"],
    ["Mø", "mo"],
    ["Łona", "lona"],
    ["Ёлка", "елка"],
    ["Don’t Stop", "don t stop"],
    ["ＬｉＳＡ", "lisa"],
  ])("%s → %s", (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe("scoreCandidate", () => {
  test("an exact song match scores near 100 with only positive notes", () => {
    const result = scoreCandidate(nightcall, song({}));

    expect(result.score).toBeGreaterThanOrEqual(98);
    expect(result.reasons).toEqual(["Same album"]);
  });

  test("ignores remaster suffixes and features on the Spotify side", () => {
    const remaster = scoreCandidate(
      { ...nightcall, title: "Nightcall - 2021 Remaster" },
      song({}),
    );
    const feat = scoreCandidate(
      {
        ...nightcall,
        title: "Nightcall (feat. Lovefoxxx)",
        artists: ["Kavinsky", "Lovefoxxx"],
      },
      song({ artists: ["Kavinsky", "Lovefoxxx"] }),
    );

    expect(remaster.score).toBeGreaterThanOrEqual(94);
    expect(feat.score).toBeGreaterThanOrEqual(94);
  });

  test("matches non-Latin titles and artists", () => {
    const track: SpotifyTrack = {
      uri: "spotify:track:x",
      title: "夜に駆ける",
      artists: ["YOASOBI"],
      durationMs: 261_000,
    };
    const result = scoreCandidate(
      track,
      song({
        title: "夜に駆ける",
        artists: ["YOASOBI"],
        album: undefined,
        durationMs: 261_000,
      }),
    );

    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  test("compares Japanese character by character", () => {
    const gurenge: SpotifyTrack = {
      uri: "spotify:track:gurenge",
      title: "紅蓮華",
      artists: ["LiSA"],
      album: "LEO-NiNE",
      durationMs: 239_000,
    };

    const exact = scoreCandidate(
      gurenge,
      song({
        title: "紅蓮華",
        artists: ["LiSA"],
        album: "LEO-NiNE",
        durationMs: 239_000,
      }),
    );
    const cover = scoreCandidate(
      gurenge,
      song({
        title: "紅蓮華 (Cover)",
        artists: ["タカオカミズキ"],
        album: "紅蓮華 (Cover)",
        durationMs: 241_000,
      }),
    );

    expect(exact.score).toBeGreaterThanOrEqual(98);
    expect(cover.score).toBeLessThan(70);
    expect(cover.reasons).toContain("Cover");
  });

  test("a same-titled upload by someone else stays out of auto-accept", () => {
    const track: SpotifyTrack = {
      uri: "spotify:track:x",
      title: "夜に駆ける",
      artists: ["YOASOBI"],
      durationMs: 261_000,
    };
    const result = scoreCandidate(
      track,
      song({
        title: "夜に駆ける（YOASOBI）",
        artists: ["Alpha Wave Music Box"],
        album: undefined,
        durationMs: 300_000,
      }),
    );

    expect(result.score).toBeLessThan(90);
  });

  test("matches Cyrillic regardless of ё and е", () => {
    const track: SpotifyTrack = {
      uri: "spotify:track:x",
      title: "Ёлки",
      artists: ["Кино"],
      durationMs: 200_000,
    };
    const result = scoreCandidate(
      track,
      song({
        title: "Елки",
        artists: ["Кино"],
        album: undefined,
        durationMs: 200_000,
      }),
    );

    expect(result.score).toBeGreaterThanOrEqual(94);
  });

  test("filler words alone don't count as an artist match", () => {
    const result = scoreCandidate(
      { ...nightcall, title: "Here Comes the Sun", artists: ["The Beatles"] },
      song({
        title: "Here Comes the Sun",
        artists: ["Yuna"],
        album: undefined,
      }),
    );

    expect(result.reasons).toContain("Different artist");
  });

  test("penalizes a live version and says so", () => {
    const result = scoreCandidate(
      nightcall,
      song({ title: "Nightcall (Live)" }),
    );

    expect(result.score).toBeLessThan(85);
    expect(result.reasons).toContain("Live version");
  });

  test("penalizes a studio take when Spotify has the live one", () => {
    const result = scoreCandidate(
      { ...nightcall, title: "Nightcall - Live" },
      song({}),
    );

    expect(result.score).toBeLessThan(90);
    expect(result.reasons).toContain("Not the live version");
  });

  test("reports length differences", () => {
    const result = scoreCandidate(nightcall, song({ durationMs: 271_000 }));

    expect(result.reasons).toContain("+13s");
  });

  test("caps a different song by the same artist", () => {
    const result = scoreCandidate(nightcall, song({ title: "Odd Look" }));

    expect(result.score).toBeLessThanOrEqual(55);
    expect(result.reasons).toContain("Different title");
  });

  test("an official video with the artist in the title scores well", () => {
    const result = scoreCandidate(
      nightcall,
      song({
        kind: "video",
        title: "Kavinsky - Nightcall (Official Video)",
        artists: ["Kavinsky"],
        album: undefined,
        durationMs: 257_000,
      }),
    );

    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.reasons).toContain("Official video");
  });

  test("a stranger's lyric upload is capped below auto-accept", () => {
    const result = scoreCandidate(
      nightcall,
      song({
        kind: "video",
        title: "Night Call (Lyrics)",
        artists: ["Lost Panda"],
        album: undefined,
      }),
    );

    expect(result.score).toBeLessThan(80);
    expect(result.reasons).toContain("Lyric video");
  });
});

describe("rankCandidates", () => {
  test("puts the song above a lyric video and drops duplicates", () => {
    const ranked = rankCandidates(nightcall, [
      song({
        videoId: "lyric",
        kind: "video",
        title: "Kavinsky - Nightcall (Lyrics)",
        album: undefined,
      }),
      song({ videoId: "song" }),
      song({ videoId: "song" }),
    ]);

    expect(ranked.map((c) => c.videoId)).toEqual(["song", "lyric"]);
  });
});

describe("isConfidentMatch", () => {
  const c = (score: number) => ({ ...song({}), score, reasons: [] });

  test("accepts a clear winner above the threshold", () => {
    expect(isConfidentMatch([c(92), c(80)], 90)).toBe(true);
  });

  test("rejects anything under the threshold", () => {
    expect(isConfidentMatch([c(89)], 90)).toBe(false);
    expect(isConfidentMatch([], 90)).toBe(false);
  });

  test("sends near-ties to review unless the best is very strong", () => {
    expect(isConfidentMatch([c(91), c(89)], 90)).toBe(false);
    expect(isConfidentMatch([c(98), c(98)], 90)).toBe(true);
  });
});
