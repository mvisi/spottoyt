import { expect, test } from "bun:test";
import { transliterate } from "./transliterate";

test.each([
  ["なとり", "natori"],
  ["キタニタツヤ", "kitanitatsuya"],
  ["ゆめとうろう", "yumetourou"],
  ["しんぞうをささげよ", "shinzouwosasageyo"],
  ["きゃりーぱみゅぱみゅ", "kyaripamyupamyu"],
  ["ちょっと", "chotto"],
  ["まっちゃ", "matcha"],
  ["марк бернес", "mark bernes"],
  ["тёмная ночь", "temnaya noch"],
  ["кино", "kino"],
  ["紅蓮の弓矢", "紅蓮no弓矢"],
  ["nightcall", "nightcall"],
])("%s → %s", (input, expected) => {
  expect(transliterate(input)).toBe(expected);
});
