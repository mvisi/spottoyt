import type {
  ErrorResponse,
  HealthResponse,
  SearchResponse,
  Settings,
  YoutubeStatus,
} from "@spottoyt/shared";
import { z } from "zod";
import { type SettingsStore, settingsPatchSchema } from "./settings";
import type { YoutubeClient } from "./youtube";

export type Deps = {
  version: string;
  settings: SettingsStore;
  youtube: YoutubeClient;
};

// The Spotify app runs on https://xpui.app.spotify.com and calls us on
// 127.0.0.1, so every response needs CORS plus Chromium's private network
// access header.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Private-Network": "true",
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "q is required"),
  kind: z.enum(["song", "video"]).default("song"),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

type Route = (req: Request, url: URL) => Response | Promise<Response>;

export function createHandler(deps: Deps) {
  const routes: Record<string, Route> = {
    "GET /health": () =>
      json<HealthResponse>({ ok: true, version: deps.version }),

    "GET /youtube/status": async (_req, url) =>
      json<YoutubeStatus>(
        await deps.youtube.status({
          refresh: url.searchParams.get("refresh") === "1",
        }),
      ),

    "GET /youtube/search": async (_req, url) => {
      const query = parse(
        searchQuerySchema,
        Object.fromEntries(url.searchParams),
      );
      const limit = query.limit ?? deps.settings.get().searchLimit;
      const results = await deps.youtube.search(query.q, query.kind, limit);
      return json<SearchResponse>({ results });
    },

    "GET /settings": () => json<Settings>(deps.settings.get()),

    "PATCH /settings": async (req) => {
      const patch = parse(settingsPatchSchema, await readJson(req));
      return json<Settings>(deps.settings.update(patch));
    },
  };

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return json<ErrorResponse>({ error: "Not found" }, 404);

    try {
      return await route(req, url);
    } catch (error) {
      if (error instanceof HttpError) {
        return json<ErrorResponse>({ error: error.message }, error.status);
      }
      console.error(error);
      return json<ErrorResponse>({ error: "Internal error" }, 500);
    }
  };
}

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, z.prettifyError(result.error));
  }
  return result.data;
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

function json<T>(body: T, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}
