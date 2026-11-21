// The only module that talks to YouTube Music. Everything else uses the
// YoutubeClient type, so library quirks stay contained here.
import { existsSync, statSync } from "node:fs";
import type {
  YoutubeStatus,
  YoutubeTrack,
  YoutubeTrackKind,
} from "@spottoyt/shared";
import { Innertube, Log, UniversalCache, YTNodes } from "youtubei.js";
import { describeError, log } from "./log";

Log.setLevel(Log.Level.ERROR);

export type SearchOptions = {
  query: string;
  kind: YoutubeTrackKind;
  /**
   * Cap on results. One request returns the first page (about 20) either
   * way, and YouTube's ordering is noisy, so matching keeps them all.
   */
  limit?: number;
  /**
   * Language for result names. YouTube Music localizes artist and title
   * names (米津玄師 → "Kenshi Yonezu" in English), so match the source.
   */
  lang?: string;
};

export type YoutubeClient = {
  status(options?: { refresh?: boolean }): Promise<YoutubeStatus>;
  search(options: SearchOptions): Promise<YoutubeTrack[]>;
  /** Looks up one video, e.g. from a pasted link. Null if it doesn't exist. */
  video(videoId: string): Promise<YoutubeTrack | null>;
  /** Creates a private playlist and returns its ID. */
  createPlaylist(title: string, description: string): Promise<string>;
  /** Appends videos. YouTube ignores ones already in the playlist. */
  addToPlaylist(playlistId: string, videoIds: string[]): Promise<void>;
  /**
   * Puts `newVideoId` where `oldVideoId` is and removes the old one. Adds at
   * the end if the old one is gone already. Keeps the old one if
   * `keepOld`, e.g. when another track in the playlist uses it too.
   */
  replaceInPlaylist(
    playlistId: string,
    oldVideoId: string,
    newVideoId: string,
    options: { keepOld: boolean },
  ): Promise<void>;
  /** Everything in the playlist, or null if it no longer exists. */
  playlistTracks(playlistId: string): Promise<YoutubeTrack[] | null>;
};

/**
 * Thrown when a replacement was added but the old video couldn't be removed,
 * so callers can still record the new one.
 */
export class OldVideoNotRemoved extends Error {}

/**
 * YouTube rejects overlapping edits to one playlist with 409 Conflict. Runs
 * edits per playlist one at a time.
 */
const playlistLocks = new Map<string, Promise<unknown>>();
function withPlaylistLock<T>(playlistId: string, fn: () => Promise<T>) {
  const previous = playlistLocks.get(playlistId) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
  playlistLocks.set(playlistId, run);
  run
    .catch(() => {})
    .finally(() => {
      if (playlistLocks.get(playlistId) === run)
        playlistLocks.delete(playlistId);
    });
  return run;
}

/** An edit call, retried on network errors and on 409 Conflict. */
async function retryEdit<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [1000, 2500, 5000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await retryNetwork(fn);
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined || !/status code 409/.test(message(error))) {
        throw error;
      }
      log.warn(`Playlist edit conflict, retrying in ${delay}ms`, {
        attempt: attempt + 1,
      });
      await Bun.sleep(delay);
    }
  }
}

/** Videos per add request. */
const ADD_BATCH = 50;
/** Stops reading a playlist after this many pages (about 100 tracks each). */
const MAX_PLAYLIST_PAGES = 200;

// A query that always has song results where YouTube Music is available.
const REGION_PROBE_QUERY = "Bohemian Rhapsody Queen";
const STATUS_TTL_MS = 5 * 60 * 1000;
/**
 * Per request. A connection the proxy dropped (e.g. wireproxy restarted)
 * can hang without ever failing, so give up and let retryNetwork try again.
 */
const REQUEST_TIMEOUT_MS = 10_000;
/** Requests slower than this are logged. */
const SLOW_REQUEST_MS = 4_000;

/** fetch with a timeout, logging slow and failed YouTube requests. */
export const youtubeFetch = (async (input, init) => {
  const request = input instanceof Request ? input : null;
  const url = new URL(request ? request.url : String(input));
  const signals = [AbortSignal.timeout(REQUEST_TIMEOUT_MS)];
  const own = init?.signal ?? request?.signal;
  if (own) signals.push(own);
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  try {
    const res = await fetch(input, {
      ...init,
      signal: AbortSignal.any(signals),
    });
    if (!res.ok) {
      log.warn("YouTube request failed", {
        path: url.pathname,
        status: res.status,
        ms: elapsed(),
      });
    } else if (elapsed() > SLOW_REQUEST_MS) {
      log.warn("Slow YouTube request", { path: url.pathname, ms: elapsed() });
    }
    return res;
  } catch (error) {
    log.warn("YouTube request failed", {
      path: url.pathname,
      ms: elapsed(),
      ...describeError(error),
    });
    throw error;
  }
}) as typeof fetch;

export function createYoutubeClient(cookiePath: string): YoutubeClient {
  // One session per result language, all rebuilt when the cookie changes.
  const sessions = new Map<
    string,
    { cookieVersion: number; innertube: Promise<Innertube> }
  >();
  let cachedStatus: { at: number; value: YoutubeStatus } | null = null;

  // Rebuild the session when the cookie file changes, so re-running
  // `setup:youtube` takes effect without restarting the helper.
  const cookieVersion = () =>
    existsSync(cookiePath) ? statSync(cookiePath).mtimeMs : 0;

  const innertube = (lang = "en") => {
    const version = cookieVersion();
    const session = sessions.get(lang);
    if (session && session.cookieVersion === version) return session.innertube;

    const cookie = version
      ? Bun.file(cookiePath)
          .text()
          .then((text) => text.trim())
      : Promise.resolve(undefined);
    const created = cookie.then((value) =>
      Innertube.create({
        cookie: value,
        // Results language and region. Doesn't bypass IP-based blocking.
        lang,
        location: "US",
        retrieve_player: false,
        fetch: youtubeFetch,
        cache: new UniversalCache(false),
      }),
    );
    // Don't keep a failed session around; retry on the next call.
    created.catch((error) => {
      log.warn("Couldn't create a YouTube session", {
        lang,
        ...describeError(error),
      });
      if (sessions.get(lang)?.innertube === created) sessions.delete(lang);
    });
    sessions.set(lang, { cookieVersion: version, innertube: created });
    return created;
  };

  const search = async ({ query, kind, limit, lang }: SearchOptions) => {
    const yt = await innertube(lang);
    const res = await retryNetwork(() =>
      yt.music.search(query, { type: kind }),
    );
    const items = (res.contents ?? [])
      .flatMap((shelf) =>
        "contents" in shelf && shelf.contents ? [...shelf.contents] : [],
      )
      .filter((node) => node instanceof YTNodes.MusicResponsiveListItem);
    return items
      .map(toYoutubeTrack)
      .filter((track): track is YoutubeTrack => track !== null)
      .slice(0, limit);
  };

  const checkStatus = async (): Promise<YoutubeStatus> => {
    const configured = cookieVersion() !== 0;
    const status: YoutubeStatus = {
      configured,
      signedIn: false,
      searchAvailable: false,
      checkedAt: new Date().toISOString(),
    };
    const errors: string[] = [];

    try {
      status.searchAvailable =
        (await search({ query: REGION_PROBE_QUERY, kind: "song", limit: 1 }))
          .length > 0;
    } catch (error) {
      errors.push(`Search failed: ${message(error)}`);
    }

    if (configured) {
      try {
        // session.logged_in only checks the cookie locally. Fetching the
        // account's playlists proves it actually works.
        const yt = await innertube();
        await retryNetwork(() => yt.getPlaylists());
        status.signedIn = true;
      } catch (error) {
        errors.push(`Sign-in failed: ${message(error)}`);
      }
    }

    if (errors.length) status.error = errors.join(" ");
    return status;
  };

  const video = async (videoId: string) => {
    const yt = await innertube();
    try {
      // The regular YouTube client, not the Music one: only it returns the
      // description that tells songs ("Provided to YouTube by …") from videos.
      const info = await retryNetwork(() => yt.getBasicInfo(videoId));
      return toYoutubeTrackFromInfo(videoId, info.basic_info);
    } catch (error) {
      if (/unavailable|not found/i.test(message(error))) return null;
      throw error;
    }
  };

  const createPlaylist = async (title: string, description: string) => {
    const yt = await innertube();
    // Not retried: if the response got lost, a retry would make a duplicate.
    const res = await yt.playlist.create(title, [], "PRIVATE", description);
    if (!res.success || !res.playlist_id) {
      throw new Error(
        `YouTube didn't create the playlist (status ${res.status_code})`,
      );
    }
    log.info("Created YouTube playlist", { id: res.playlist_id, title });
    return res.playlist_id;
  };

  const addToPlaylist = async (playlistId: string, videoIds: string[]) => {
    const yt = await innertube();
    for (let i = 0; i < videoIds.length; i += ADD_BATCH) {
      const batch = videoIds.slice(i, i + ADD_BATCH);
      // Safe to retry: adding a video that's already there does nothing.
      await withPlaylistLock(playlistId, () =>
        retryEdit(() => yt.playlist.addVideos(playlistId, batch)),
      );
    }
    log.info("Added to YouTube playlist", {
      id: playlistId,
      videos: videoIds.length,
    });
  };

  const replaceInPlaylist = async (
    playlistId: string,
    oldVideoId: string,
    newVideoId: string,
    { keepOld }: { keepOld: boolean },
  ) =>
    withPlaylistLock(playlistId, async () => {
      const yt = await innertube();
      const current = await playlistTracks(playlistId);
      if (!current) throw new Error("The YouTube Music playlist is gone");
      const oldThere = current.some((t) => t.videoId === oldVideoId);

      await retryEdit(() => yt.playlist.addVideos(playlistId, [newVideoId]));
      if (oldThere) {
        // Position is nice to have. A failed move leaves it at the end.
        try {
          await retryEdit(() =>
            yt.playlist.moveVideo(playlistId, newVideoId, oldVideoId),
          );
        } catch (error) {
          log.warn("Couldn't move the replacement into place", {
            id: playlistId,
            ...describeError(error),
          });
        }
        if (!keepOld) {
          try {
            await retryEdit(() =>
              yt.playlist.removeVideos(playlistId, [oldVideoId]),
            );
          } catch (error) {
            log.warn(
              "Added the replacement but couldn't remove the old video",
              {
                id: playlistId,
                old: oldVideoId,
                ...describeError(error),
              },
            );
            throw new OldVideoNotRemoved(message(error));
          }
        }
      }
      log.info("Replaced a video in a YouTube playlist", {
        id: playlistId,
        old: oldVideoId,
        new: newVideoId,
        removedOld: oldThere && !keepOld,
      });
    });

  const playlistTracks = async (playlistId: string) => {
    const yt = await innertube();
    let page: Awaited<ReturnType<typeof yt.music.getPlaylist>>;
    try {
      page = await retryNetwork(() => yt.music.getPlaylist(playlistId));
    } catch (error) {
      if (/not found|does not exist|404|unavailable/i.test(message(error))) {
        return null;
      }
      throw error;
    }
    // The Music client returns deleted and new empty playlists alike: no
    // header, no items. The regular client tells them apart.
    if (!page.header) {
      try {
        await retryNetwork(() => yt.getPlaylist(playlistId));
        return [];
      } catch (error) {
        if (/does not exist|not found|404/i.test(message(error))) return null;
        throw error;
      }
    }
    const tracks: YoutubeTrack[] = [];
    for (let pages = 1; ; pages++) {
      for (const item of page.items) {
        if (!(item instanceof YTNodes.MusicResponsiveListItem)) continue;
        // Unavailable videos have no type, but they're still in the playlist.
        const track =
          toYoutubeTrack(item) ??
          (item.id
            ? {
                videoId: item.id,
                title: item.title ?? item.id,
                artists: [],
                kind: "video" as const,
              }
            : null);
        if (track) tracks.push(track);
      }
      if (!page.has_continuation || pages >= MAX_PLAYLIST_PAGES) break;
      const current = page;
      page = await retryNetwork(() => current.getContinuation());
    }
    return tracks;
  };

  return {
    search,
    video,
    createPlaylist,
    addToPlaylist,
    replaceInPlaylist,
    playlistTracks,
    async status({ refresh = false } = {}) {
      if (
        !refresh &&
        cachedStatus &&
        Date.now() - cachedStatus.at < STATUS_TTL_MS
      ) {
        return cachedStatus.value;
      }
      const value = await checkStatus();
      cachedStatus = { at: Date.now(), value };
      return value;
    },
  };
}

type SearchItem = {
  id?: string;
  title?: string;
  item_type?: string;
  artists?: { name: string }[];
  authors?: { name: string }[];
  album?: { name: string };
  duration?: { seconds: number };
  thumbnails?: { url: string; width: number }[];
};

export function toYoutubeTrack(item: SearchItem): YoutubeTrack | null {
  const kind =
    item.item_type === "song" || item.item_type === "video"
      ? item.item_type
      : null;
  if (!kind || !item.id || !item.title) return null;

  const artists = (item.artists?.length ? item.artists : (item.authors ?? []))
    .map((artist) => artist.name)
    .filter(Boolean);
  const thumbnail = [...(item.thumbnails ?? [])].sort(
    (a, b) => b.width - a.width,
  )[0];

  return {
    videoId: item.id,
    title: item.title,
    artists,
    album: item.album?.name || undefined,
    durationMs: item.duration?.seconds
      ? item.duration.seconds * 1000
      : undefined,
    kind,
    thumbnailUrl: thumbnail?.url,
  };
}

type VideoInfo = {
  title?: string;
  author?: string;
  duration?: number;
  short_description?: string;
  thumbnail?: { url: string; width: number }[];
};

export function toYoutubeTrackFromInfo(
  videoId: string,
  info: VideoInfo,
): YoutubeTrack | null {
  if (!info.title) return null;
  // Auto-generated song uploads describe themselves like:
  //   Provided to YouTube by <label>\n\n<Title> · <Artist>\n\n<Album>\n\n℗ ...
  const description = info.short_description ?? "";
  const isSong = description.startsWith("Provided to YouTube by");
  const paragraphs = description.split(/\n\s*\n/);
  const thumbnail = [...(info.thumbnail ?? [])].sort(
    (a, b) => b.width - a.width,
  )[0];

  return {
    videoId,
    title: info.title,
    artists: info.author ? [info.author.replace(/ - Topic$/, "")] : [],
    album: isSong ? paragraphs[2]?.trim() || undefined : undefined,
    durationMs: info.duration ? info.duration * 1000 : undefined,
    kind: isSong ? "song" : "video",
    thumbnailUrl: thumbnail?.url,
  };
}

// Errors from the connection itself, e.g. the VPN proxy resetting a socket.
// These usually succeed on a second try.
const NETWORK_ERROR =
  /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|socket|Unable to connect|fetch failed|network|TimeoutError|timed out/i;

export async function retryNetwork<T>(
  fn: () => Promise<T>,
  delays = [300, 1000],
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const delay = delays[attempt];
      const code = (error as { code?: string }).code ?? "";
      const name = error instanceof Error ? error.name : "";
      if (
        delay === undefined ||
        !NETWORK_ERROR.test(`${code} ${name} ${message(error)}`)
      ) {
        throw error;
      }
      log.warn(`Network error, retrying in ${delay}ms`, {
        attempt: attempt + 1,
        error: `${name} ${message(error)}`,
      });
      await Bun.sleep(delay);
    }
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
