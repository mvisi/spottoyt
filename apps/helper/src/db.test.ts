import { expect, test } from "bun:test";
import { migrate, openDatabase } from "./db";

test("migrations run once and record their version", () => {
  const db = openDatabase(":memory:");
  const version = () =>
    db.query<{ user_version: number }, []>("PRAGMA user_version").get()
      ?.user_version;
  const applied = version();

  expect(applied).toBeGreaterThan(0);
  migrate(db);
  expect(version()).toBe(applied);
});
