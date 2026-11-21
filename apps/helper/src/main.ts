import { mkdirSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json";
import { config, logPath, youtubeCookiePath } from "./config";
import { openDatabase } from "./db";
import { describeError, log, logToFile } from "./log";
import { createMatchJobs } from "./matching/jobs";
import { matchTrack } from "./matching/match";
import { createMatchStore } from "./matching/store";
import { createPlaylistStore } from "./playlists/store";
import { createHandler } from "./server";
import { createSettingsStore } from "./settings";
import { createYoutubeClient } from "./youtube";

logToFile(logPath);
process.on("unhandledRejection", (error) =>
  log.error("Unhandled rejection", describeError(error)),
);

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
  // Seconds. Searches through the VPN can take a while, and YouTube calls
  // have their own shorter timeout with retries.
  idleTimeout: 60,
  fetch: createHandler({
    version: pkg.version,
    settings,
    youtube,
    jobs,
    matches,
    playlists: createPlaylistStore(db),
  }),
});

log.info(`SpottoYT helper ${pkg.version} listening on ${server.url}`, {
  data: config.dataDir,
  log: logPath,
  proxy: process.env.HTTPS_PROXY ?? "none (set HTTPS_PROXY to use a VPN proxy)",
});
