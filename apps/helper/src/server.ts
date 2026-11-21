import type {
  AddTracksResponse,
  CheckAddedResponse,
  ErrorResponse,
  HealthResponse,
  MatchJob,
  PlaylistLink,
  PlaylistState,
  SearchResponse,
  Settings,
  SpotifyTrack,
  YoutubeDiff,
  YoutubeStatus,
  YoutubeTrack,
} from "@spottoyt/shared";
import { z } from "zod";
import { describeError, log } from "./log";
import type { MatchJobs } from "./matching/jobs";
import { languageForText } from "./matching/language";
import { scoreCandidate } from "./matching/score";
import type { MatchStore } from "./matching/store";
import type { PlaylistStore } from "./playlists/store";
import { type SettingsStore, settingsPatchSchema } from "./settings";
import {
  OldVideoNotRemoved,
  type YoutubeClient,
  YoutubeProblem,
} from "./youtube";

export type Deps = {
  version: string;
  settings: SettingsStore;
  youtube: YoutubeClient;
  jobs: MatchJobs;
  matches: MatchStore;
  playlists: PlaylistStore;
};

// The Spotify app runs on https://xpui.app.spotify.com and calls us on
// 127.0.0.1, so every response needs CORS plus Chromium's private network
// access header.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Private-Network": "true",
  // Spotify's browser may cache some responses, like a 410, otherwise.
  "Cache-Control": "no-store",
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * YouTube can take a few seconds to show tracks just added, so recent adds
 * aren't reported as removed.
 */
const RECENT_ADD_MS = 2 * 60 * 1000;

// ---------- Request schemas ----------

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "q is required"),
  kind: z.enum(["song", "video"]).default("song"),
  limit: z.coerce.number().int().min(1).max(20).optional(),
  lang: z
    .string()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
    .optional(),
});

const spotifyTrackSchema = z.object({
  uri: z.string().min(1),
  title: z.string().min(1),
  artists: z.array(z.string()),
  album: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
}) satisfies z.ZodType<SpotifyTrack>;

const youtubeTrackSchema = z.object({
  videoId: z.string().min(1),
  title: z.string().min(1),
  artists: z.array(z.string()),
  album: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  kind: z.enum(["song", "video"]),
  thumbnailUrl: z.string().optional(),
}) satisfies z.ZodType<YoutubeTrack>;

const startJobSchema = z.object({
  tracks: z.array(spotifyTrackSchema).min(1).max(10_000),
  fresh: z.boolean().optional(),
});

const setManualSchema = z.object({
  spotifyUri: z.string().min(1),
  track: youtubeTrackSchema,
});

const createLinkSchema = z.object({
  spotifyName: z.string().min(1),
  title: z.string().trim().min(1).max(150),
});

const addTracksSchema = z.object({
  tracks: z
    .array(
      z.object({ spotifyUri: z.string().min(1), track: youtubeTrackSchema }),
    )
    .min(1)
    .max(200),
});

const replaceTrackSchema = z.object({ track: youtubeTrackSchema });

const checkAddedSchema = z.object({
  tracks: z.array(spotifyTrackSchema).max(10_000),
});

/** Added tracks scoring under this get flagged for a second look. */
const SUSPECT_BELOW = 75;

const jobQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
});

// ---------- Routing ----------

type Params = Record<string, string>;
type Handler = (
  req: Request,
  url: URL,
  params: Params,
) => Response | Promise<Response>;
type Route = { method: string; parts: string[]; handler: Handler };

const route = (method: string, path: string, handler: Handler): Route => ({
  method,
  parts: path.split("/").filter(Boolean),
  handler,
});

function matchRoute(routes: Route[], method: string, pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  for (const r of routes) {
    if (r.method !== method || r.parts.length !== parts.length) continue;
    const params: Params = {};
    const ok = r.parts.every((part, i) => {
      const value = parts[i] as string;
      if (part.startsWith(":")) {
        params[part.slice(1)] = decodeURIComponent(value);
        return true;
      }
      return part === value;
    });
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

export function createHandler(deps: Deps) {
  const jobOr404 = (job: MatchJob | null) => {
    if (!job) throw new HttpError(404, "No such match job");
    return job;
  };

  const linkOr404 = (uri: string) => {
    const link = deps.playlists.link(uri);
    if (!link) throw new HttpError(404, "Not linked to a YouTube playlist yet");
    return link;
  };

  const routes: Route[] = [
    route("GET", "/health", () =>
      json<HealthResponse>({ ok: true, version: deps.version }),
    ),

    route("GET", "/youtube/status", async (_req, url) =>
      json<YoutubeStatus>(
        await deps.youtube.status({
          refresh: url.searchParams.get("refresh") === "1",
        }),
      ),
    ),

    route("GET", "/youtube/search", async (_req, url) => {
      const query = parse(
        searchQuerySchema,
        Object.fromEntries(url.searchParams),
      );
      const results = await youtubeCall(() =>
        deps.youtube.search({
          query: query.q,
          kind: query.kind,
          limit: query.limit,
          lang: query.lang ?? languageForText(query.q),
        }),
      );
      return json<SearchResponse>({ results });
    }),

    route("GET", "/youtube/videos/:id", async (_req, _url, { id = "" }) => {
      if (!/^[\w-]{11}$/.test(id)) {
        throw new HttpError(400, "Not a YouTube video ID");
      }
      const track = await youtubeCall(() => deps.youtube.video(id));
      if (!track) throw new HttpError(404, "That video doesn't exist");
      return json<YoutubeTrack>(track);
    }),

    route("GET", "/settings", () => json<Settings>(deps.settings.get())),

    route("PATCH", "/settings", async (req) => {
      const patch = parse(settingsPatchSchema, await readJson(req));
      return json<Settings>(deps.settings.update(patch));
    }),

    // Matching runs in the background. Start a job, then poll it with
    // ?since=<results already seen> to get only new results.
    route("POST", "/match-jobs", async (req) => {
      const body = parse(startJobSchema, await readJson(req));
      const job = deps.jobs.start(body.tracks, { fresh: body.fresh });
      return json<MatchJob>({ ...job, results: [] }, 201);
    }),

    route("GET", "/match-jobs/:id", (_req, url, { id = "" }) => {
      const job = jobOr404(deps.jobs.get(id));
      const { since } = parse(
        jobQuerySchema,
        Object.fromEntries(url.searchParams),
      );
      return json<MatchJob>({ ...job, results: job.results.slice(since) });
    }),

    route("DELETE", "/match-jobs/:id", (_req, _url, { id = "" }) => {
      const job = jobOr404(deps.jobs.cancel(id));
      return json<MatchJob>({ ...job, results: [] });
    }),

    // Your own picks. They win over search results from then on, in every
    // playlist the track appears in.
    route("PUT", "/manual-matches", async (req) => {
      const body = parse(setManualSchema, await readJson(req));
      deps.matches.setManual(body.spotifyUri, body.track);
      return new Response(null, { status: 204, headers: corsHeaders });
    }),

    route("DELETE", "/manual-matches", (_req, url) => {
      const uri = url.searchParams.get("spotifyUri");
      if (!uri) throw new HttpError(400, "spotifyUri is required");
      deps.matches.clearManual(uri);
      return new Response(null, { status: 204, headers: corsHeaders });
    }),

    // Linked playlists. Syncing only adds to YouTube: nothing there is
    // removed, and the Spotify side is read-only.
    route("GET", "/playlists", () =>
      json<PlaylistLink[]>(deps.playlists.links()),
    ),

    route("GET", "/playlists/:uri", (_req, _url, { uri = "" }) =>
      json<PlaylistState>(deps.playlists.state(uri)),
    ),

    route("POST", "/playlists/:uri/link", async (req, _url, { uri = "" }) => {
      const body = parse(createLinkSchema, await readJson(req));
      if (deps.playlists.link(uri)) {
        throw new HttpError(409, "This playlist is already linked");
      }
      const id = await youtubeCall(() =>
        deps.youtube.createPlaylist(
          body.title,
          `Made from the Spotify playlist "${body.spotifyName}" with SpottoYT.`,
        ),
      );
      const link = deps.playlists.createLink({
        spotifyUri: uri,
        spotifyName: body.spotifyName,
        youtubePlaylistId: id,
        youtubeTitle: body.title,
      });
      return json<PlaylistLink>(link, 201);
    }),

    // Forgets the link. The YouTube playlist itself stays.
    route("DELETE", "/playlists/:uri/link", (_req, _url, { uri = "" }) => {
      linkOr404(uri);
      deps.playlists.unlink(uri);
      return new Response(null, { status: 204, headers: corsHeaders });
    }),

    route("POST", "/playlists/:uri/tracks", async (req, _url, { uri = "" }) => {
      const link = linkOr404(uri);
      const body = parse(addTracksSchema, await readJson(req));
      const existing = deps.playlists.state(uri).tracks;
      const fresh = body.tracks.filter(
        (t) => existing[t.spotifyUri]?.state !== "added",
      );
      const videoIds = [...new Set(fresh.map((t) => t.track.videoId))];
      if (videoIds.length) {
        await youtubeCall(() =>
          deps.youtube.addToPlaylist(link.youtubePlaylistId, videoIds),
        );
      }
      const tracks = deps.playlists.markAdded(uri, fresh);
      return json<AddTracksResponse>({ tracks, link: linkOr404(uri) });
    }),

    // The one removal SpottoYT makes on YouTube, and only when you ask: swap
    // an added track's video for a better one, in the same position.
    route(
      "POST",
      "/playlists/:uri/tracks/:track/replace",
      async (req, _url, { uri = "", track: trackUri = "" }) => {
        const link = linkOr404(uri);
        const body = parse(replaceTrackSchema, await readJson(req));
        const tracks = deps.playlists.state(uri).tracks;
        const current = tracks[trackUri];
        if (current?.state !== "added") {
          throw new HttpError(
            409,
            "Only tracks already on YouTube can be replaced",
          );
        }
        const oldId = current.track.videoId;
        let warning: string | undefined;
        if (oldId !== body.track.videoId) {
          // Two Spotify tracks can share a video. Don't pull it from the other.
          const shared = Object.entries(tracks).some(
            ([other, s]) =>
              other !== trackUri &&
              s.state === "added" &&
              s.track.videoId === oldId,
          );
          try {
            await youtubeCall(() =>
              deps.youtube.replaceInPlaylist(
                link.youtubePlaylistId,
                oldId,
                body.track.videoId,
                { keepOld: shared },
              ),
            );
          } catch (error) {
            // The new video is on the playlist either way, so record it.
            if (
              !(
                error instanceof HttpError &&
                error.cause instanceof OldVideoNotRemoved
              )
            ) {
              throw error;
            }
            warning = `“${current.track.title}” is still on the YouTube playlist. Remove it there by hand.`;
          }
        }
        deps.matches.setManual(trackUri, body.track);
        const states = deps.playlists.markAdded(uri, [
          { spotifyUri: trackUri, track: body.track },
        ]);
        return json<AddTracksResponse>({
          tracks: states,
          link: linkOr404(uri),
          ...(warning ? { warning } : {}),
        });
      },
    ),

    // Added tracks that today's scoring would reject, e.g. karaoke versions
    // auto-accepted before it knew to look for them.
    route("POST", "/playlists/:uri/check", async (req, _url, { uri = "" }) => {
      const body = parse(checkAddedSchema, await readJson(req));
      const states = deps.playlists.state(uri).tracks;
      const suspect: CheckAddedResponse["suspect"] = {};
      for (const spotify of body.tracks) {
        const s = states[spotify.uri];
        if (s?.state !== "added") continue;
        if (deps.matches.getManual(spotify.uri)?.videoId === s.track.videoId) {
          continue;
        }
        const { score, reasons } = scoreCandidate(spotify, s.track);
        if (score < SUSPECT_BELOW) suspect[spotify.uri] = { score, reasons };
      }
      return json<CheckAddedResponse>({ suspect });
    }),

    route("PUT", "/playlists/:uri/skips/:track", (_req, _url, params) => {
      deps.playlists.setSkipped(params.uri ?? "", params.track ?? "", true);
      return new Response(null, { status: 204, headers: corsHeaders });
    }),

    route("DELETE", "/playlists/:uri/skips/:track", (_req, _url, params) => {
      deps.playlists.setSkipped(params.uri ?? "", params.track ?? "", false);
      return new Response(null, { status: 204, headers: corsHeaders });
    }),

    route(
      "GET",
      "/playlists/:uri/youtube",
      async (_req, _url, { uri = "" }) => {
        const link = linkOr404(uri);
        const items = await youtubeCall(() =>
          deps.youtube.playlistTracks(link.youtubePlaylistId),
        );
        if (!items) {
          throw new HttpError(
            410,
            "The YouTube Music playlist is gone. It may have been deleted there.",
          );
        }
        const added = Object.entries(deps.playlists.state(uri).tracks).flatMap(
          ([spotifyUri, s]) =>
            s.state === "added"
              ? [{ spotifyUri, videoId: s.track.videoId, at: s.at }]
              : [],
        );
        const addedIds = new Set(added.map((a) => a.videoId));
        const onYoutube = new Set(items.map((i) => i.videoId));
        return json<YoutubeDiff>({
          onlyOnYoutube: items.filter((i) => !addedIds.has(i.videoId)),
          removedOnYoutube: added
            .filter(
              (a) =>
                !onYoutube.has(a.videoId) &&
                Date.now() - Date.parse(a.at) > RECENT_ADD_MS,
            )
            .map((a) => a.spotifyUri),
        });
      },
    ),
  ];

  // Polls and health checks are frequent, so they're only logged when
  // something goes wrong.
  const quiet = (method: string, path: string) =>
    path === "/health" || (method === "GET" && path.startsWith("/match-jobs/"));

  const respond = async (req: Request, url: URL): Promise<Response> => {
    const found = matchRoute(routes, req.method, url.pathname);
    if (!found) return json<ErrorResponse>({ error: "Not found" }, 404);

    try {
      return await found.handler(req, url, found.params);
    } catch (error) {
      if (error instanceof HttpError) {
        return json<ErrorResponse>({ error: error.message }, error.status);
      }
      log.error(`${req.method} ${readable(url)} failed`, {
        ...describeError(error),
      });
      return json<ErrorResponse>({ error: "Internal error" }, 500);
    }
  };

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const started = performance.now();
    const res = await respond(req, url);
    const ms = Math.round(performance.now() - started);
    if (res.status >= 400 || !quiet(req.method, url.pathname)) {
      const line = `${req.method} ${readable(url)} ${res.status} ${ms}ms`;
      if (res.status >= 400) {
        const body = await res.clone().text();
        log.warn(line, { response: body.slice(0, 500) });
      } else {
        log.info(line);
      }
    }
    return res;
  };
}

/** Path and query with the query decoded, so 米津玄師 stays readable in logs. */
function readable(url: URL) {
  const query = [...url.searchParams]
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return query ? `${url.pathname}?${query}` : url.pathname;
}

/** Turns YouTube failures into a 502 the app can show, instead of a 500. */
async function youtubeCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // Known problems carry their own fix, e.g. "start the VPN".
    if (error instanceof YoutubeProblem) {
      throw new HttpError(503, error.message, { cause: error });
    }
    log.warn("YouTube Music call failed", describeError(error));
    const reason = error instanceof Error ? error.message : String(error);
    throw new HttpError(502, `YouTube Music: ${reason}`, { cause: error });
  }
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
