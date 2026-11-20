import { expect, test } from "bun:test";
import { parseVideoId } from "./helper";

test.each([
  ["https://music.youtube.com/watch?v=kIO2OHa9HDQ&si=abc", "kIO2OHa9HDQ"],
  ["https://www.youtube.com/watch?v=MV_3Dpw-BRY", "MV_3Dpw-BRY"],
  ["https://youtu.be/MV_3Dpw-BRY?t=10", "MV_3Dpw-BRY"],
  ["https://www.youtube.com/shorts/MV_3Dpw-BRY", "MV_3Dpw-BRY"],
  ["kIO2OHa9HDQ", "kIO2OHa9HDQ"],
  ["Nightcall Kavinsky", null],
  ["https://example.com/watch/kIO2OHa9HDQ", null],
])("%s → %s", (input, expected) => {
  expect(parseVideoId(input)).toBe(expected);
});
