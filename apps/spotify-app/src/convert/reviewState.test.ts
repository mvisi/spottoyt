import { describe, expect, test } from "bun:test";
import type { MatchCandidate, TrackMatch } from "@spottoyt/shared";
import type { PlaylistTrack } from "../spotify";
import {
  buildRows,
  countRows,
  decide,
  filterRows,
  nextOpen,
  type Override,
  tracksToAdd,
} from "./reviewState";

const candidate = (videoId: string, score = 95): MatchCandidate => ({
  videoId,
  title: "Song",
  artists: ["Artist"],
  kind: "song",
  score,
  reasons: [],
});

const track = (n: number): PlaylistTrack => ({
  uri: `spotify:track:${n}`,
  title: `Song ${n}`,
  artists: ["Artist"],
  durationMs: 1000,
  position: n,
});

const matched: TrackMatch = {
  spotifyUri: "spotify:track:1",
  status: "matched",
  source: "auto",
  selectedVideoId: "a",
  candidates: [candidate("a"), candidate("b", 70)],
};
const review: TrackMatch = {
  spotifyUri: "spotify:track:2",
  status: "review",
  source: "suggested",
  selectedVideoId: "c",
  candidates: [candidate("c", 80)],
};
const notFound: TrackMatch = {
  spotifyUri: "spotify:track:3",
  status: "not_found",
  candidates: [],
};

describe("decide", () => {
  test("auto matches are accepted, manual ones count as yours", () => {
    expect(decide(matched)).toMatchObject({
      kind: "accepted",
      by: "auto",
      track: { videoId: "a" },
    });
    expect(decide({ ...matched, source: "manual" })).toMatchObject({
      by: "you",
    });
  });

  test("review and not-found wait for you, with the best guess picked", () => {
    expect(decide(review)).toMatchObject({
      kind: "pending",
      pick: { videoId: "c" },
    });
    expect(decide(notFound)).toEqual({ kind: "pending", pick: undefined });
  });

  test("your change wins over the match", () => {
    expect(
      decide(matched, undefined, { state: "skipped", at: "2026-11-21" }),
    ).toEqual({ kind: "skipped" });
    expect(
      decide(
        matched,
        { kind: "accepted", track: candidate("x") },
        { state: "added", track: candidate("y"), at: "2026-11-21" },
      ),
    ).toEqual({ kind: "added", track: candidate("y") });
    expect(
      decide(review, { kind: "accepted", track: candidate("x") }),
    ).toMatchObject({
      kind: "accepted",
      by: "you",
      track: { videoId: "x" },
    });
  });

  test("nothing yet while matching", () => {
    expect(decide(undefined)).toBe(undefined);
  });
});

describe("rows", () => {
  const tracks = [track(1), track(2), track(3), track(4)];
  const matches = new Map(
    [matched, review, notFound].map((m) => [m.spotifyUri, m]),
  );

  test("counts decisions, including tracks still matching", () => {
    const rows = buildRows(tracks, matches, new Map());

    expect(countRows(rows)).toEqual({
      total: 4,
      accepted: 1,
      added: 0,
      skipped: 0,
      open: 2,
      matching: 1,
    });
  });

  test("the review filter stays stable after you decide", () => {
    const overrides = new Map<string, Override>([
      ["spotify:track:2", { kind: "accepted", track: candidate("c") }],
    ]);
    const rows = buildRows(tracks, matches, overrides);

    expect(filterRows(rows, "review").map((r) => r.track.uri)).toEqual([
      "spotify:track:2",
      "spotify:track:3",
    ]);
    expect(filterRows(rows, "auto").map((r) => r.track.uri)).toEqual([
      "spotify:track:1",
    ]);
  });

  test("nextOpen skips decided rows", () => {
    const rows = buildRows(tracks, matches, new Map());

    expect(nextOpen(rows, -1)).toBe(1);
    expect(nextOpen(rows, 1)).toBe(2);
    expect(nextOpen(rows, 2)).toBe(-1);
  });

  test("tracks already on YouTube are settled and not added again", () => {
    const overrides = new Map<string, Override>([
      ["spotify:track:2", { kind: "accepted", track: candidate("c") }],
    ]);
    const rows = buildRows(tracks, matches, overrides, {
      "spotify:track:1": { state: "added", track: candidate("a"), at: "x" },
      "spotify:track:3": { state: "skipped", at: "x" },
    });

    expect(tracksToAdd(rows).map((t) => t.spotifyUri)).toEqual([
      "spotify:track:2",
    ]);
    expect(filterRows(rows, "new").map((r) => r.track.uri)).toEqual([
      "spotify:track:2",
      "spotify:track:3",
      "spotify:track:4",
    ]);
    expect(countRows(rows)).toMatchObject({
      added: 1,
      accepted: 1,
      skipped: 1,
    });
  });
});
