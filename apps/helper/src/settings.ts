import type { Settings } from "@spottoyt/shared";
import { z } from "zod";
import type { Db } from "./db";

export const defaultSettings: Settings = {
  autoAcceptScore: 90,
  includeVideos: true,
};

export const settingsSchema = z.object({
  autoAcceptScore: z.number().int().min(0).max(100),
  includeVideos: z.boolean(),
}) satisfies z.ZodType<Settings>;

export const settingsPatchSchema = settingsSchema.partial().strict();

export type SettingsStore = {
  get(): Settings;
  update(patch: Partial<Settings>): Settings;
};

export function createSettingsStore(db: Db): SettingsStore {
  const read = db.query<{ key: string; value: string }, []>(
    "SELECT key, value FROM settings",
  );
  const write = db.query(
    "INSERT INTO settings (key, value) VALUES ($key, $value) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  );

  const get = (): Settings => {
    const stored = Object.fromEntries(
      read.all().map(({ key, value }) => [key, JSON.parse(value)]),
    );
    // Ignore stored values that no longer validate, e.g. after a schema change.
    const merged = { ...defaultSettings, ...stored };
    const parsed = settingsSchema.safeParse(merged);
    return parsed.success ? parsed.data : defaultSettings;
  };

  return {
    get,
    update(patch) {
      const next = settingsSchema.parse({ ...get(), ...patch });
      db.transaction(() => {
        for (const [key, value] of Object.entries(next)) {
          write.run({ key, value: JSON.stringify(value) });
        }
      })();
      return next;
    },
  };
}
