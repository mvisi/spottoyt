import { mkdirSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json";
import { config, youtubeCookiePath } from "./config";
import { openDatabase } from "./db";
import { createMatchJobs } from "./matching/jobs";
import { matchTrack } from "./matching/match";
import { createMatchStore } from "./matching/store";
import { createHandler } from "./server";
import { createSettingsStore } from "./settings";
import { createYoutubeClient } from "./youtube";

mkdirSync(config.dataDir, { recursive: true });
const db = openDatabase(join(config.dataDir, "spottoyt.db"));

const settings = createSettingsStore(db);
const youtube = createYoutubeClient(youtubeCookiePath);
const matches = createMatchStore(db);
const jobs = createMatchJobs((track, options) =>
  matchTrack(
    track,
    { youtube, store: matches, settings: settings.get },
    options,
  ),
);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: config.port,
  fetch: createHandler({
    version: pkg.version,
    settings,
    youtube,
    jobs,
    matches,
  }),
});

console.log(`SpottoYT helper listening on ${server.url}`);
console.log(`Data: ${config.dataDir}`);
console.log(
  process.env.HTTPS_PROXY
    ? `YouTube traffic goes through ${process.env.HTTPS_PROXY}`
    : "YouTube traffic goes direct (set HTTPS_PROXY to use a VPN proxy)",
);
