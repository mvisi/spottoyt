// The only module that talks to YouTube Music. Everything else uses the
// YoutubeClient type, so library quirks stay contained here.
import { existsSync, statSync } from "node:fs";
import type {
  YoutubeStatus,
  YoutubeTrack,
  YoutubeTrackKind,
} from "@spottoyt/shared";
import { Innertube, Log, UniversalCache, YTNodes } from "youtubei.js";

Log.setLevel(Log.Level.ERROR);

export type YoutubeClient = {
  status(options?: { refresh?: boolean }): Promise<YoutubeStatus>;
  search(
    query: string,
    kind: YoutubeTrackKind,
    limit: number,
  ): Promise<YoutubeTrack[]>;
};

// A query that always has song results where YouTube Music is available.
const REGION_PROBE_QUERY = "Bohemian Rhapsody Queen";
const STATUS_TTL_MS = 5 * 60 * 1000;

export function createYoutubeClient(cookiePath: string): YoutubeClient {
  let session: { cookieVersion: number; innertube: Promise<Innertube> } | null =
    null;
  let cachedStatus: { at: number; value: YoutubeStatus } | null = null;

  // Rebuild the session when the cookie file changes, so re-running
  // `setup:youtube` takes effect without restarting the helper.
  const cookieVersion = () =>
    existsSync(cookiePath) ? statSync(cookiePath).mtimeMs : 0;

  const innertube = () => {
    const version = cookieVersion();
    if (!session || session.cookieVersion !== version) {
      const cookie = version
        ? Bun.file(cookiePath)
            .text()
            .then((text) => text.trim())
        : Promise.resolve(undefined);
      const created = cookie.then((value) =>
        Innertube.create({
          cookie: value,
          // Results language and region. Doesn't bypass IP-based blocking.
          lang: "en",
          location: "US",
          retrieve_player: false,
          cache: new UniversalCache(false),
        }),
      );
      // Don't keep a failed session around; retry on the next call.
      created.catch(() => {
        if (session?.innertube === created) session = null;
      });
      session = { cookieVersion: version, innertube: created };
    }
    return session.innertube;
  };

  const search = async (
    query: string,
    kind: YoutubeTrackKind,
    limit: number,
  ) => {
    const yt = await innertube();
    const res = await yt.music.search(query, { type: kind });
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
        (await search(REGION_PROBE_QUERY, "song", 1)).length > 0;
    } catch (error) {
      errors.push(`Search failed: ${message(error)}`);
    }

    if (configured) {
      try {
        // session.logged_in only checks the cookie locally. Fetching the
        // account's playlists proves it actually works.
        await (await innertube()).getPlaylists();
        status.signedIn = true;
      } catch (error) {
        errors.push(`Sign-in failed: ${message(error)}`);
      }
    }

    if (errors.length) status.error = errors.join(" ");
    return status;
  };

  return {
    search,
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

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
