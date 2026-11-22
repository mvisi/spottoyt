// Backs up everything SpottoYT keeps outside the repo into one zip, for
// moving to another machine. Restore it there with `spottoyt restore`.
//
//   spottoyt backup [out.zip or folder] [--no-secrets]
//
// The zip holds the database (matches, manual picks, linked playlists) and,
// unless --no-secrets, ~/.config/spottoyt: the YouTube cookie and the
// wireproxy/WireGuard configs.
import { Database } from "bun:sqlite";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { config } from "../apps/helper/src/config";

const args = Bun.argv.slice(2);
const withSecrets = !args.includes("--no-secrets");
const date = new Date().toISOString().slice(0, 10);
const defaultName = `spottoyt-backup-${date}.zip`;
// The path can be a zip file or a folder to put it in.
const target = resolve(args.find((a) => !a.startsWith("--")) ?? defaultName);
const out =
  existsSync(target) && statSync(target).isDirectory()
    ? join(target, defaultName)
    : target;

const dbPath = join(config.dataDir, "spottoyt.db");
if (!existsSync(dbPath)) {
  console.error(`No database at ${dbPath}, nothing to back up.`);
  process.exit(1);
}

const staging = mkdtempSync(join(tmpdir(), "spottoyt-backup-"));
try {
  // VACUUM INTO makes a consistent copy even while the helper is running,
  // with recent writes from the WAL file included.
  mkdirSync(join(staging, "data"));
  const db = new Database(dbPath, { readonly: true });
  db.exec(
    `VACUUM INTO '${join(staging, "data", "spottoyt.db").replaceAll("'", "''")}'`,
  );
  db.close();

  const configFiles: string[] = [];
  if (withSecrets && existsSync(config.configDir)) {
    mkdirSync(join(staging, "config"));
    for (const name of readdirSync(config.configDir)) {
      const from = join(config.configDir, name);
      if (!statSync(from).isFile()) continue;
      copyFileSync(from, join(staging, "config", name));
      configFiles.push(name);
    }
  }

  await Bun.write(
    join(staging, "manifest.json"),
    JSON.stringify(
      {
        app: "spottoyt",
        format: 1,
        createdAt: new Date().toISOString(),
        // Lets restore fix absolute paths that point into the old config dir.
        configDir: config.configDir,
        configFiles,
      },
      null,
      2,
    ),
  );

  rmSync(out, { force: true });
  const zip = Bun.spawnSync(["zip", "-r", "-q", out, "."], {
    cwd: staging,
    stderr: "inherit",
  });
  if (zip.exitCode !== 0) throw new Error("zip failed");
  chmodSync(out, 0o600);

  console.log(`Backed up to ${out}`);
  console.log(
    `  database (${statSync(join(staging, "data", "spottoyt.db")).size} bytes)`,
  );
  if (configFiles.length) {
    console.log(`  config: ${configFiles.join(", ")}`);
    console.log(
      "This zip contains your YouTube cookie and VPN key. Keep it private.",
    );
  } else {
    console.log("  no config files (cookie and VPN setup not included)");
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}
