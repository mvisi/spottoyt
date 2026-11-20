import { expect, test } from "bun:test";
import { searchLanguage } from "./language";

const track = (title: string, artists: string[]) => ({
  uri: "spotify:track:x",
  title,
  artists,
  durationMs: 1,
});

test.each([
  [track("Nightcall", ["Kavinsky"]), "en"],
  [track("Lemon", ["米津玄師"]), "ja"],
  [track("夜に駆ける", ["YOASOBI"]), "ja"],
  [track("紅蓮華", ["LiSA"]), "ja"],
  [track("晴天", ["周杰倫"]), "ja"],
  [track("Dynamite", ["방탄소년단"]), "ko"],
  [track("Группа крови", ["Кино"]), "ru"],
])("%o → %s", (input, expected) => {
  expect(searchLanguage(input)).toBe(expected);
});
