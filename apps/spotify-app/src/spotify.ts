// Reads playlists through Spicetify. These APIs are Spotify internals and
// can change on update, so all Spicetify data access lives here.
import type { SpotifyTrack } from "@spottoyt/shared";

export type PlaylistSummary = {
  uri: string;
  name: string;
  image?: string;
  owner?: string;
  trackCount?: number;
};

/** A Spotify track plus what the UI shows but matching doesn't need. */
export type PlaylistTrack = SpotifyTrack & { image?: string; position: number };

export type Playlist = {
  uri: string;
  name: string;
  image?: string;
  tracks: PlaylistTrack[];
  /** Local files and podcast episodes, which can't be matched. */
  skippedItems: number;
};

export async function loadPlaylists(): Promise<PlaylistSummary[]> {
  const root = await Spicetify.Platform.RootlistAPI.getContents();
  const out: PlaylistSummary[] = [];

  const walk = (items: Spicetify.Platform.RootlistItem[] = []) => {
    for (const item of items) {
      if (item.type === "folder" && "items" in item) {
        walk(item.items as Spicetify.Platform.RootlistItem[] | undefined);
      } else if (item.type === "playlist" && typeof item.uri === "string") {
        const p = item as Extract<
          Spicetify.Platform.RootlistItem,
          { type: "playlist" }
        >;
        out.push({
          uri: p.uri,
          name: p.name,
          image: pickImage(p.images),
          owner: p.owner?.displayName ?? p.owner?.name,
          trackCount: p.totalLength,
        });
      }
    }
  };
  walk(root.items);
  return out;
}

export async function loadPlaylist(uri: string): Promise<Playlist> {
  const [meta, contents] = await Promise.all([
    Spicetify.Platform.PlaylistAPI.getMetadata(uri).catch(() => null),
    Spicetify.Platform.PlaylistAPI.getContents(uri, { limit: 100_000 }),
  ]);
  const items = contents.items ?? [];
  const tracks: PlaylistTrack[] = [];

  for (const item of items) {
    const artists = (item.artists ?? [])
      .map((a) => a.name)
      .filter((name): name is string => Boolean(name));
    if (
      !item.uri?.startsWith("spotify:track:") ||
      item.isLocal ||
      !item.name ||
      !artists.length
    ) {
      continue;
    }
    tracks.push({
      uri: item.uri,
      title: item.name,
      artists,
      album: item.album?.name || undefined,
      durationMs: item.duration?.milliseconds ?? 0,
      image: pickImage(item.album?.images, 64),
      position: tracks.length,
    });
  }

  return {
    uri,
    name: meta?.name ?? "Playlist",
    image: pickImage(meta?.images),
    tracks,
    skippedItems: items.length - tracks.length,
  };
}

export function playOnSpotify(uri: string) {
  void Spicetify.Player.playUri(uri);
}

/** The smallest image at least `min` pixels wide, else the largest. */
function pickImage(images: Spicetify.Platform.Image[] = [], min = 300) {
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= min) ?? sorted.at(-1))?.url;
}
