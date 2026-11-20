// Saves your YouTube Music cookie for the helper and checks that it signs in.
//
//   bun run setup:youtube                 paste the cookie when asked (input is hidden)
//   bun run setup:youtube < cookie.txt    or pipe it in
//
// To get the cookie: open music.youtube.com signed in, DevTools → Network,
// click any request to music.youtube.com/youtubei/..., and copy the full
// value of the "cookie" request header.
//
// YouTube Music hides songs from unsupported regions, so run this (and the
// helper) with HTTPS_PROXY pointing at a VPN proxy if you need one.
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Innertube, UniversalCache } from "youtubei.js";
import { youtubeCookiePath } from "../src/config";

const cookie = normalize(await readCookie());

if (!/(^|;\s*)SAPISID=/.test(cookie)) {
  console.error(
    "That doesn't look like a signed-in YouTube cookie (no SAPISID). Nothing was saved.",
  );
  process.exit(1);
}

console.log(
  `Checking sign-in${process.env.HTTPS_PROXY ? " through HTTPS_PROXY" : ""}…`,
);
try {
  const yt = await Innertube.create({
    cookie,
    location: "US",
    cache: new UniversalCache(false),
  });
  const feed = await yt.getPlaylists();
  const count = (feed as { playlists?: unknown[] }).playlists?.length ?? 0;
  console.log(`Signed in. Found ${count} playlists on the account.`);
} catch (error) {
  console.error(`Sign-in check failed: ${(error as Error).message}`);
  console.error("Nothing was saved. Copy a fresh cookie and try again.");
  process.exit(1);
}

mkdirSync(dirname(youtubeCookiePath), { recursive: true, mode: 0o700 });
await Bun.write(youtubeCookiePath, `${cookie}\n`);
chmodSync(youtubeCookiePath, 0o600);
console.log(`Saved to ${youtubeCookiePath}`);

function normalize(raw: string) {
  // Accept the bare value or a pasted "cookie: ..." header line.
  return raw.trim().replace(/^cookie:\s*/i, "");
}

async function readCookie(): Promise<string> {
  if (!process.stdin.isTTY) return await Bun.stdin.text();

  // Raw mode skips the terminal's ~4 KB line limit (cookies can be longer)
  // and keeps the cookie off the screen.
  process.stdout.write("Paste your YouTube Music cookie, then press Enter: ");
  process.stdin.setRawMode(true);
  let input = "";
  for await (const chunk of process.stdin) {
    const text = chunk.toString();
    if (text.includes("\u0003")) {
      process.stdout.write("\n");
      process.exit(130);
    }
    const enter = text.search(/[\r\n]/);
    if (enter === -1) {
      input += text;
      continue;
    }
    input += text.slice(0, enter);
    break;
  }
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write(`\nRead ${input.length} characters.\n`);
  return input;
}
