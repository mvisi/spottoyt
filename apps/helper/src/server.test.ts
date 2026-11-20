import { describe, expect, test } from "bun:test";
import { handle } from "./server";

describe("helper server", () => {
  test("reports health with CORS headers", async () => {
    const res = await handle(new Request("http://127.0.0.1/health"));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("answers preflight requests", async () => {
    const res = await handle(
      new Request("http://127.0.0.1/health", { method: "OPTIONS" }),
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Private-Network")).toBe(
      "true",
    );
  });

  test("returns 404 for unknown routes", async () => {
    const res = await handle(new Request("http://127.0.0.1/nope"));

    expect(res.status).toBe(404);
  });
});
