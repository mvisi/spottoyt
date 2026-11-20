// YouTube Music returns names in the search language: with English, 米津玄師
// comes back as "Kenshi Yonezu" and can't match. So search in the language
// of the script the Spotify track is written in.
import type { SpotifyTrack } from "@spottoyt/shared";

const SCRIPTS: Array<[RegExp, string]> = [
  // Japanese also covers Han-only text: it keeps both Japanese and Chinese
  // names native, while the Chinese settings romanize Japanese artists
  // (米津玄師 → "Kenshi Yonezu").
  [/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u, "ja"],
  [/\p{Script=Hangul}/u, "ko"],
  [/\p{Script=Cyrillic}/u, "ru"],
  [/\p{Script=Greek}/u, "el"],
  [/\p{Script=Arabic}/u, "ar"],
  [/\p{Script=Hebrew}/u, "iw"],
  [/\p{Script=Thai}/u, "th"],
  [/\p{Script=Devanagari}/u, "hi"],
];

export const DEFAULT_LANGUAGE = "en";

export function searchLanguage(track: SpotifyTrack): string {
  const text = `${track.title} ${track.artists.join(" ")}`;
  return (
    SCRIPTS.find(([pattern]) => pattern.test(text))?.[1] ?? DEFAULT_LANGUAGE
  );
}
