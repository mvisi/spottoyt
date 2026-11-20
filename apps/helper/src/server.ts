import type { HealthResponse } from "@spottoyt/shared";
import pkg from "../package.json";

// The Spotify app runs on https://xpui.app.spotify.com and calls us on
// 127.0.0.1, so every response needs CORS plus Chromium's private network
// access header.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Private-Network": "true",
};

type Handler = (req: Request) => Response | Promise<Response>;

const routes: Record<string, Handler> = {
  "GET /health": () =>
    json({
      ok: true,
      version: pkg.version ?? "0.0.0",
    } satisfies HealthResponse),
};

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const route = routes[`${req.method} ${new URL(req.url).pathname}`];
  if (!route) return json({ error: "Not found" }, 404);

  try {
    return await route(req);
  } catch (error) {
    console.error(error);
    return json({ error: "Internal error" }, 500);
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}
