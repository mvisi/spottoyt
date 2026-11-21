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
    ["Ёлка", "elka"],
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
    const result = scoreCandidate(
      nightcall,
      song({ title: "Odd Look", durationMs: 252_000 }),
    );

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
    expect(result.reasons).toContain("Video by the artist");
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

test("a different title at the same length by the same artist stays in review", () => {
  // Plausibly a translated title, but it could just as well be another song.
  const result = scoreCandidate(nightcall, song({ title: "Odd Look" }));

  expect(result.score).toBeLessThanOrEqual(75);
  expect(result.score).toBeGreaterThan(55);
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

// Cases from real manual picks, where the old scoring sent the right
// candidate to review or ranked it below a worse one.
describe("real-world cases", () => {
  const spotify = (
    title: string,
    artists: string[],
    seconds: number,
  ): SpotifyTrack => ({
    uri: "spotify:track:x",
    title,
    artists,
    durationMs: seconds * 1000,
  });
  let nextId = 0;
  const yt = (
    title: string,
    artists: string[],
    seconds: number,
    over: Partial<YoutubeTrack> = {},
  ): YoutubeTrack => ({
    videoId: `video-${nextId++}`,
    title,
    artists,
    durationMs: seconds * 1000,
    kind: "song",
    ...over,
  });

  test("kana artist matches its romanized name (なとり / natori)", () => {
    const result = scoreCandidate(
      spotify("Overdose", ["natori"], 198),
      yt("Overdose", ["なとり"], 198),
    );

    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  test("reversed, unspaced kana name matches (キタニタツヤ / Tatsuya Kitani)", () => {
    const result = scoreCandidate(
      spotify("青のすみか", ["Tatsuya Kitani"], 197),
      yt("青のすみか", ["キタニタツヤ"], 197),
    );

    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  test("Cyrillic artist matches its Latin spelling (Марк Бернес / Mark Bernes)", () => {
    const result = scoreCandidate(
      spotify("Темная ночь", ["Mark Bernes"], 176),
      yt("Темная ночь", ["Марк Бернес"], 176),
    );

    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  test("kanji title against romaji goes to review, with the right one on top", () => {
    const track = spotify("Guren No Yumiya", ["Linked Horizon"], 317);
    const ranked = rankCandidates(track, [
      yt("Guren No Yumiya", ["Kato"], 81),
      yt("紅蓮の弓矢(カラオケ)[原曲歌手:Linked Horizon]", ["歌っちゃ王"], 319),
      yt("紅蓮の弓矢", ["Linked Horizon"], 317),
    ]);

    expect(ranked[0]?.title).toBe("紅蓮の弓矢");
    expect(ranked[0]?.reasons).toContain("Title in another script");
    expect(isConfidentMatch(ranked, 90)).toBe(false);
  });

  test("a translated title by the same artist at the same length ranks first", () => {
    const ranked = rankCandidates(spotify("Yumetourou", ["RADWIMPS"], 132), [
      yt("Yumetourou (Piano)", ["Piano Covers"], 150),
      yt("Dream lantern", ["RADWIMPS"], 132),
    ]);

    expect(ranked[0]?.title).toBe("Dream lantern");
    expect(ranked[0]?.score).toBeLessThan(90);
  });

  test("an artist-channel video at the right length beats a song at the wrong one", () => {
    const ranked = rankCandidates(
      spotify("Careless Whisper", ["George Michael"], 300),
      [
        yt("Careless Whisper", ["George Michael"], 393, {
          album: "Make It Big",
        }),
        yt("Careless Whisper", ["George Michael"], 301, { kind: "video" }),
      ],
    );

    expect(ranked[0]?.kind).toBe("video");
    expect(isConfidentMatch(ranked, 90)).toBe(true);
  });

  test("the official song still beats the artist's video at the same length", () => {
    const ranked = rankCandidates(spotify("After Dark", ["Mr.Kitty"], 260), [
      yt("After Dark", ["Mr.Kitty"], 260, { kind: "video" }),
      yt("After Dark", ["Mr.Kitty"], 260, { album: "Time" }),
    ]);

    expect(ranked[0]?.kind).toBe("song");
  });

  test("a stranger's upload with the artist only in the title stays below auto-accept", () => {
    const result = scoreCandidate(
      spotify("Stereo Love", ["Edward Maya", "Vika Jigulina"], 248),
      yt(
        "Edward Maya & Vika Jigulina - Stereo Love (Official Music Video) [4k]",
        ["Rafael Renovato"],
        248,
        { kind: "video" },
      ),
    );

    expect(result.reasons).not.toContain("Video by the artist");
    expect(result.score).toBeLessThan(95);
  });

  test("VEVO channels count as the artist", () => {
    const result = scoreCandidate(
      spotify("Careless Whisper", ["George Michael"], 300),
      yt(
        "George Michael - Careless Whisper (Official Video)",
        ["GeorgeMichaelVEVO"],
        301,
        { kind: "video" },
      ),
    );

    expect(result.reasons).toContain("Video by the artist");
  });
});
