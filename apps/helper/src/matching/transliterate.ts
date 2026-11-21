// Spotify often shows Japanese and Russian names in Latin letters (natori,
// Mark Bernes) while YouTube Music uses the original script (なとり, Марк
// Бернес). Converting both sides to Latin letters lets them compare.
// Kanji can't be converted without a dictionary and are left as they are.

const HIRAGANA: Record<string, string> = {
  あ: "a",
  い: "i",
  う: "u",
  え: "e",
  お: "o",
  か: "ka",
  き: "ki",
  く: "ku",
  け: "ke",
  こ: "ko",
  が: "ga",
  ぎ: "gi",
  ぐ: "gu",
  げ: "ge",
  ご: "go",
  さ: "sa",
  し: "shi",
  す: "su",
  せ: "se",
  そ: "so",
  ざ: "za",
  じ: "ji",
  ず: "zu",
  ぜ: "ze",
  ぞ: "zo",
  た: "ta",
  ち: "chi",
  つ: "tsu",
  て: "te",
  と: "to",
  だ: "da",
  ぢ: "ji",
  づ: "zu",
  で: "de",
  ど: "do",
  な: "na",
  に: "ni",
  ぬ: "nu",
  ね: "ne",
  の: "no",
  は: "ha",
  ひ: "hi",
  ふ: "fu",
  へ: "he",
  ほ: "ho",
  ば: "ba",
  び: "bi",
  ぶ: "bu",
  べ: "be",
  ぼ: "bo",
  ぱ: "pa",
  ぴ: "pi",
  ぷ: "pu",
  ぺ: "pe",
  ぽ: "po",
  ま: "ma",
  み: "mi",
  む: "mu",
  め: "me",
  も: "mo",
  や: "ya",
  ゆ: "yu",
  よ: "yo",
  ら: "ra",
  り: "ri",
  る: "ru",
  れ: "re",
  ろ: "ro",
  わ: "wa",
  ゐ: "i",
  ゑ: "e",
  を: "wo",
  ん: "n",
  ゔ: "vu",
  ぁ: "a",
  ぃ: "i",
  ぅ: "u",
  ぇ: "e",
  ぉ: "o",
  ゎ: "wa",
};
const SMALL_Y: Record<string, string> = { ゃ: "a", ゅ: "u", ょ: "o" };

const CYRILLIC: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  і: "i",
  ї: "yi",
  є: "ye",
  ґ: "g",
  ў: "u",
};

const KATAKANA = /[ァ-ヶ]/g;
const HAS_KANA_OR_CYRILLIC = /[ぁ-ゖァ-ー\p{Script=Cyrillic}]/u;

/** Expects lowercase input. Leaves everything else untouched. */
export function transliterate(text: string): string {
  if (!HAS_KANA_OR_CYRILLIC.test(text)) return text;
  const hiragana = text.replace(KATAKANA, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );

  let out = "";
  let doubleNext = false;
  for (const char of hiragana) {
    if (char === "っ") {
      doubleNext = true;
      continue;
    }
    // The long-vowel mark: Spotify's romanizations usually just drop it.
    if (char === "ー") continue;

    const smallY = SMALL_Y[char];
    if (smallY !== undefined) {
      // きゃ → kya, しゃ → sha, じゃ → ja
      out = /(sh|ch|j)i$/.test(out)
        ? out.slice(0, -1) + smallY
        : out.endsWith("i")
          ? `${out.slice(0, -1)}y${smallY}`
          : `${out}y${smallY}`;
      continue;
    }

    let latin = HIRAGANA[char] ?? CYRILLIC[char] ?? char;
    if (doubleNext) {
      latin = latin.startsWith("ch") ? `t${latin}` : (latin[0] ?? "") + latin;
      doubleNext = false;
    }
    out += latin;
  }
  return out;
}
