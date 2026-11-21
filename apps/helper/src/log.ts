// Logs to the terminal and, once `logToFile` is called, to a file you can
// share when something goes wrong. Lines look like:
//   2026-11-21 20:10:03.120 WARN  YouTube request failed {"path":"/youtubei/v1/search","ms":10002,...}
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
} from "node:fs";
import { dirname } from "node:path";

type Level = "info" | "warn" | "error";
type Data = Record<string, unknown>;

/** The previous file moves to `<path>.1` past this size, on startup. */
const MAX_LOG_BYTES = 5 * 1024 * 1024;

let file: string | null = null;

export function logToFile(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && statSync(path).size > MAX_LOG_BYTES) {
    renameSync(path, `${path}.1`);
  }
  file = path;
}

function write(level: Level, message: string, data?: Data) {
  const line = `${timestamp()} ${level.toUpperCase().padEnd(5)} ${message}${
    data ? ` ${JSON.stringify(data, replacer)}` : ""
  }`;
  (level === "info" ? console.log : console.error)(line);
  if (file) {
    try {
      appendFileSync(file, `${line}\n`);
    } catch {
      // Logging must never break a request.
    }
  }
}

export const log = {
  info: (message: string, data?: Data) => write("info", message, data),
  warn: (message: string, data?: Data) => write("warn", message, data),
  error: (message: string, data?: Data) => write("error", message, data),
};

/** Error details worth logging: name, message, code, cause and stack. */
export function describeError(error: unknown): Data {
  if (!(error instanceof Error)) return { error: String(error) };
  const { code } = error as { code?: unknown };
  const stack = error.stack?.split("\n").slice(1, 6).join("\n");
  return {
    error: `${error.name}: ${error.message}`,
    ...(code ? { code } : {}),
    ...(error.cause ? { cause: describeError(error.cause) } : {}),
    ...(stack ? { stack } : {}),
  };
}

function replacer(_key: string, value: unknown) {
  return value instanceof Error ? describeError(value) : value;
}

function timestamp() {
  const d = new Date();
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
