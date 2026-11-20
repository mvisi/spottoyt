import { mkdirSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json";
import { config, youtubeCookiePath } from "./config";
import { openDatabase } from "./db";
import { createHandler } from "./server";
import { createSettingsStore } from "./settings";
import { createYoutubeClient } from "./youtube";

mkdirSync(config.dataDir, { recursive: true });
const db = openDatabase(join(config.dataDir, "spottoyt.db"));

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: config.port,
  fetch: createHandler({
    version: pkg.version,
    settings: createSettingsStore(db),
    youtube: createYoutubeClient(youtubeCookiePath),
  }),
});

console.log(`SpottoYT helper listening on ${server.url}`);
console.log(`Data: ${config.dataDir}`);
console.log(
  process.env.HTTPS_PROXY
    ? `YouTube traffic goes through ${process.env.HTTPS_PROXY}`
    : "YouTube traffic goes direct (set HTTPS_PROXY to use a VPN proxy)",
);
