// Restores a zip made by `bun run backup`, e.g. on a new machine.
//
//   spottoyt restore <backup.zip>
//
// Files it replaces are kept next to the originals with a
// `.before-restore-<time>` suffix, so nothing is lost.
import { Database } from "bun:sqlite";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { config } from "../apps/helper/src/config";

type Manifest = {
  app: string;
  format: number;
  createdAt: string;
  configDir: string;
  configFiles: string[];
};

const zipArg = Bun.argv[2];
if (!zipArg || !existsSync(zipArg)) {
  console.error("Usage: spottoyt restore <backup.zip>");
  process.exit(1);
}

// Replacing the database under a running helper would corrupt it.
const running = await fetch(`http://127.0.0.1:${config.port}/health`, {
  signal: AbortSignal.timeout(1000),
}).then(
  (res) => res.ok,
  () => false,
);
if (running) {
  console.error(
    "The helper is running. Stop it (spottoyt stop) and try again.",
  );
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const keepOld = (path: string) => {
  if (existsSync(path)) renameSync(path, `${path}.before-restore-${stamp}`);
};

const staging = mkdtempSync(join(tmpdir(), "spottoyt-restore-"));
try {
  const unzip = Bun.spawnSync(["unzip", "-q", resolve(zipArg), "-d", staging], {
    stderr: "inherit",
  });
  if (unzip.exitCode !== 0) throw new Error("unzip failed");

  const manifestPath = join(staging, "manifest.json");
  const manifest: Manifest | null = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : null;
  if (manifest?.app !== "spottoyt" || manifest.format !== 1) {
    throw new Error("That zip isn't a SpottoYT backup.");
  }

  // Database. Check it before touching anything.
  const newDb = join(staging, "data", "spottoyt.db");
  const check = new Database(newDb, { readonly: true });
  const ok = check
    .query<{ integrity_check: string }, []>("PRAGMA integrity_check")
    .get();
  check.close();
  if (ok?.integrity_check !== "ok") {
    throw new Error("The database in the backup is damaged.");
  }

  mkdirSync(config.dataDir, { recursive: true });
  const dbPath = join(config.dataDir, "spottoyt.db");
  for (const suffix of ["", "-wal", "-shm"]) keepOld(`${dbPath}${suffix}`);
  copyFileSync(newDb, dbPath);
  console.log(`Restored the database to ${dbPath}`);

  // Config: cookie and VPN files. Readable only by you, like the originals.
  if (manifest.configFiles.length) {
    mkdirSync(config.configDir, { recursive: true });
    chmodSync(config.configDir, 0o700);
    for (const name of manifest.configFiles) {
      const to = join(config.configDir, name);
      keepOld(to);
      let text = readFileSync(join(staging, "config", name), "utf8");
      // e.g. wireproxy.conf's WGConfig points at the old home directory.
      if (manifest.configDir !== config.configDir) {
        text = text.replaceAll(manifest.configDir, config.configDir);
      }
      writeFileSync(to, text, { mode: 0o600 });
    }
    console.log(
      `Restored ${manifest.configFiles.join(", ")} to ${config.configDir}`,
    );
  } else {
    console.log(
      "The backup has no config files. Run `bun run setup:youtube` and set up wireproxy again.",
    );
  }

  console.log(`\nBackup from ${manifest.createdAt}. On a new machine, also:`);
  console.log("  - install Bun, Spicetify and wireproxy");
  console.log("  - bun install && bun run link-spotify");
  console.log("  - put HTTPS_PROXY=http://127.0.0.1:25345 in .env");
  console.log("  - spottoyt start");
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  rmSync(staging, { recursive: true, force: true });
}
