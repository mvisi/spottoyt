#!/usr/bin/env -S bun --no-env-file
// The `spottoyt` command. Install it once with `bun run install-cli`,
// which puts it in ~/.bun/bin. It always runs this checkout, so `update` is
// just a git pull and rebuild.
//
// Bun would load a .env from whatever folder you run the command in, so
// that's turned off in the shebang and the repo's .env is loaded instead.
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { HealthResponse, YoutubeStatus } from "../packages/shared/src";

const root = resolve(import.meta.dir, "..");
loadEnv(join(root, ".env"));
const { config, logPath } = await import("../apps/helper/src/config");

const bun = process.execPath;
const helperUrl = `http://127.0.0.1:${config.port}`;

const usage = `Usage: spottoyt <command>

  start [--background]   Start the VPN tunnel and the helper. With --background
                         it keeps running after you close the terminal.
  stop                   Stop the running helper, wherever it was started.
  status                 Show whether the helper is running.
  logs                   Follow the helper log.
  update                 git pull, install, rebuild and reinstall into Spotify.
  backup [path] [--no-secrets]
                         Back up the database and config to a zip. The path
                         can be a file or a folder (default: this folder).
  restore <path>         Restore a backup zip. The helper must be stopped.
  setup-youtube          Save or refresh the YouTube Music cookie.`;

const [command, ...args] = Bun.argv.slice(2);
switch (command) {
  case "start":
    await start(args.includes("--background") || args.includes("-b"));
    break;
  case "stop":
    await stop();
    break;
  case "status":
    await status();
    break;
  case "logs":
    await run(["tail", "-n", "50", "-F", logPath]);
    break;
  case "update":
    await update();
    break;
  case "backup":
  case "restore":
    // Run from your current folder so relative paths mean what you'd expect.
    await run(
      [bun, "--no-env-file", join(root, "scripts", `${command}.ts`), ...args],
      process.cwd(),
    );
    break;
  case "setup-youtube":
    await run([bun, "apps/helper/scripts/setup-youtube.ts", ...args]);
    break;
  case undefined:
  case "help":
  case "--help":
  case "-h":
    console.log(usage);
    break;
  default:
    console.error(`Unknown command: ${command}\n\n${usage}`);
    process.exit(1);
}

async function start(background: boolean) {
  const running = await health();
  if (running) {
    fail(
      `SpottoYT is already running (pid ${running.pid}). Stop it first with \`spottoyt stop\`.`,
    );
  }
  if (await listening(config.port)) {
    fail(`Something other than SpottoYT is using port ${config.port}.`);
  }

  const helper = [bun, "scripts/with-vpn.ts", bun, "apps/helper/src/main.ts"];

  if (!background) {
    const child = Bun.spawn(helper, {
      cwd: root,
      stdio: ["inherit", "inherit", "inherit"],
    });
    // Ctrl+C reaches the child directly. Pass on signals sent only to us.
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
      process.on(signal, () => child.kill(signal));
    }
    process.exit(await child.exited);
  }

  // Output from startup (wireproxy errors, crashes) goes here. The helper's
  // own log is still helper.log.
  mkdirSync(config.stateDir, { recursive: true });
  const outPath = join(config.stateDir, "background.log");
  const out = openSync(outPath, "w");
  const child = Bun.spawn(helper, {
    cwd: root,
    detached: true,
    stdio: ["ignore", out, out],
  });
  closeSync(out);
  child.unref();

  let exited = false;
  child.exited.then(() => {
    exited = true;
  });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && !exited) {
    const up = await health();
    if (up) {
      console.log(`SpottoYT is running in the background (pid ${up.pid}).`);
      console.log(`Stop it with \`spottoyt stop\`. Log: ${logPath}`);
      return;
    }
    await Bun.sleep(250);
  }
  if (!exited) child.kill();
  console.error("The helper didn't start. Output:\n");
  console.error(readFileSync(outPath, "utf8").trim() || "(nothing)");
  process.exit(1);
}

async function stop() {
  const running = await health();
  if (!running) {
    console.log("SpottoYT isn't running.");
    return;
  }
  // When started with `spottoyt start` or `bun run dev`, the VPN tunnel
  // closes on its own once the helper exits.
  process.kill(running.pid, "SIGTERM");
  const deadline = Date.now() + 10_000;
  while (await health()) {
    if (Date.now() > deadline) {
      process.kill(running.pid, "SIGKILL");
      console.log(`The helper didn't stop in time, killed pid ${running.pid}.`);
      return;
    }
    await Bun.sleep(200);
  }
  console.log(`Stopped SpottoYT (pid ${running.pid}).`);
}

async function status() {
  const running = await health();
  if (!running) {
    console.log("SpottoYT isn't running.");
    if (await listening(config.port)) {
      console.log(`Something else is using port ${config.port}.`);
    }
    process.exit(1);
  }

  const proxy = process.env.HTTPS_PROXY;
  const proxyUrl = proxy ? new URL(proxy) : null;
  const vpn = !proxyUrl
    ? "not used (HTTPS_PROXY isn't set)"
    : (await listening(Number(proxyUrl.port), proxyUrl.hostname))
      ? `up on ${proxyUrl.host}`
      : `down (nothing on ${proxyUrl.host})`;

  const youtube = await fetch(`${helperUrl}/youtube/status`, {
    signal: AbortSignal.timeout(15_000),
  })
    .then((res) => res.json() as Promise<YoutubeStatus>)
    .then(
      (s) =>
        s.signedIn
          ? "signed in"
          : s.configured
            ? "cookie doesn't work, run `spottoyt setup-youtube`"
            : "no cookie, run `spottoyt setup-youtube`",
      () => "couldn't check",
    );

  const rows = [
    [
      "pid",
      `${running.pid} (${inTerminal(running.pid) ? "in a terminal" : "in the background"})`,
    ],
    ["version", running.version],
    ["uptime", formatDuration(running.uptime)],
    ["url", helperUrl],
    ["vpn", vpn],
    ["youtube", youtube],
    ["log", logPath],
  ];
  console.log("SpottoYT is running");
  for (const [label, value] of rows)
    console.log(`  ${label?.padEnd(8)} ${value}`);
}

async function update() {
  await run(["git", "pull", "--ff-only"]);
  await run([bun, "install"]);
  await run([bun, "run", "link-spotify"]);
  if (await health()) {
    console.log(
      "\nThe helper is still running the old code. Restart it: spottoyt stop && spottoyt start --background",
    );
  }
}

async function health(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${helperUrl}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok ? ((await res.json()) as HealthResponse) : null;
  } catch {
    return null;
  }
}

async function listening(port: number, hostname = "127.0.0.1") {
  try {
    const socket = await Bun.connect({ hostname, port, socket: { data() {} } });
    socket.end();
    return true;
  } catch {
    return false;
  }
}

// A process started from a terminal has it as its controlling tty. One
// started with --background has none (field 7 of /proc/<pid>/stat is 0).
function inTerminal(pid: number) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return fields[4] !== "0";
  } catch {
    return false;
  }
}

async function run(cmd: string[], cwd = root) {
  const child = Bun.spawn(cmd, {
    cwd,
    stdio: ["inherit", "inherit", "inherit"],
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => child.kill(signal));
  }
  const code = await child.exited;
  if (code !== 0) process.exit(code);
}

function formatDuration(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return m ? `${m}m` : `${seconds}s`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// KEY=value lines, with optional quotes and `export`. Values already in the
// environment win, like Bun's own .env loading.
function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*(?:export\s+)?([\w.]+)\s*=\s*(.*?)\s*$/);
    if (!match?.[1]) continue;
    const raw = match[2] ?? "";
    const quoted = raw.match(/^(["'])(.*)\1$/);
    const value = quoted ? (quoted[2] ?? "") : raw.replace(/\s+#.*$/, "");
    process.env[match[1]] ??= value;
  }
}
