import { Database } from "bun:sqlite";

// Each entry runs once, in order. Append new ones, never edit old ones.
// The applied count is tracked in SQLite's built-in user_version.
const migrations: string[] = [
  `CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
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
