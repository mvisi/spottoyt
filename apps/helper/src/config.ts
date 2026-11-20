import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_HELPER_PORT } from "@spottoyt/shared";

export const config = {
  port: Number(process.env.SPOTTOYT_PORT) || DEFAULT_HELPER_PORT,
  dataDir:
    process.env.SPOTTOYT_DATA_DIR ||
    join(
      process.env.XDG_DATA_HOME || join(homedir(), ".local/share"),
      "spottoyt",
    ),
};
