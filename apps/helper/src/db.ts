import { Database } from "bun:sqlite";

// Each entry runs once, in order. Append new ones, never edit old ones.
// The applied count is tracked in SQLite's built-in user_version.
const migrations: string[] = [
  `CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
  // Raw search results per Spotify track, and which searches produced them.
  // Kept unscored, so scoring changes apply without searching again.
  `CREATE TABLE track_candidates (
     spotify_uri TEXT PRIMARY KEY,
     candidates TEXT NOT NULL,
     searches TEXT NOT NULL,
     searched_at TEXT NOT NULL
   );
   -- Matches you picked by hand. These always win over search results.
   CREATE TABLE manual_matches (
     spotify_uri TEXT PRIMARY KEY,
     track TEXT NOT NULL,
     picked_at TEXT NOT NULL
   );`,
];

export type Db = Database;

export function openDatabase(path: string): Db {
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

export function migrate(db: Db) {
  const { user_version: applied } = db
    .query<{ user_version: number }, []>("PRAGMA user_version")
    .get() ?? { user_version: 0 };

  for (let i = applied; i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i] as string);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    })();
  }
}
