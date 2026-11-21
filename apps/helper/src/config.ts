import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_HELPER_PORT } from "@spottoyt/shared";

const xdg = (name: string, fallback: string) =>
  join(process.env[name] || join(homedir(), fallback), "spottoyt");

export const config = {
  port: Number(process.env.SPOTTOYT_PORT) || DEFAULT_HELPER_PORT,
  // Database and other app state.
  dataDir:
    process.env.SPOTTOYT_DATA_DIR || xdg("XDG_DATA_HOME", ".local/share"),
  // Credentials. Kept out of the repo and readable only by the user.
  configDir:
    process.env.SPOTTOYT_CONFIG_DIR || xdg("XDG_CONFIG_HOME", ".config"),
  // Logs. Attach helper.log when reporting a problem.
  stateDir:
    process.env.SPOTTOYT_STATE_DIR || xdg("XDG_STATE_HOME", ".local/state"),
};

export const youtubeCookiePath = join(config.configDir, "youtube-cookie");
export const logPath = join(config.stateDir, "helper.log");
