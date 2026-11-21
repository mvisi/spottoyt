// Linked playlists and what's settled per track in each playlist.
import type {
  PlaylistLink,
  PlaylistState,
  PlaylistTrackState,
  YoutubeTrack,
} from "@spottoyt/shared";
import type { Db } from "../db";

export type PlaylistStore = {
  links(): PlaylistLink[];
  link(spotifyUri: string): PlaylistLink | null;
  state(spotifyUri: string): PlaylistState;
  createLink(link: {
    spotifyUri: string;
    spotifyName: string;
    youtubePlaylistId: string;
    youtubeTitle: string;
  }): PlaylistLink;
  /** Forgets the link and what was added. Skips stay. */
  unlink(spotifyUri: string): void;
  markAdded(
    playlistUri: string,
    tracks: Array<{ spotifyUri: string; track: YoutubeTrack }>,
  ): Record<string, PlaylistTrackState>;
  /** Skipping never overrides a track that's already added. */
  setSkipped(playlistUri: string, trackUri: string, skipped: boolean): void;
};

type LinkRow = {
  spotify_uri: string;
  spotify_name: string;
  youtube_playlist_id: string;
  youtube_title: string;
  created_at: string;
  synced_at: string | null;
  added: number;
  skipped: number;
};

type TrackRow = {
  track_uri: string;
  state: "added" | "skipped";
  track: string | null;
  updated_at: string;
};

const LINK_SELECT = `
  SELECT l.*,
    (SELECT COUNT(*) FROM playlist_tracks t
      WHERE t.playlist_uri = l.spotify_uri AND t.state = 'added') AS added,
    (SELECT COUNT(*) FROM playlist_tracks t
      WHERE t.playlist_uri = l.spotify_uri AND t.state = 'skipped') AS skipped
  FROM playlist_links l`;

export function createPlaylistStore(db: Db): PlaylistStore {
  const allLinks = db.query<LinkRow, []>(
    `${LINK_SELECT} ORDER BY l.spotify_name COLLATE NOCASE`,
  );
  const oneLink = db.query<LinkRow, { uri: string }>(
    `${LINK_SELECT} WHERE l.spotify_uri = $uri`,
  );
  const tracks = db.query<TrackRow, { uri: string }>(
    "SELECT track_uri, state, track, updated_at FROM playlist_tracks WHERE playlist_uri = $uri",
  );
  const insertLink = db.query(
    `INSERT INTO playlist_links (spotify_uri, spotify_name, youtube_playlist_id, youtube_title, created_at)
     VALUES ($uri, $name, $playlistId, $title, $at)`,
  );
  const deleteLink = db.query(
    "DELETE FROM playlist_links WHERE spotify_uri = $uri",
  );
  const deleteAdded = db.query(
    "DELETE FROM playlist_tracks WHERE playlist_uri = $uri AND state = 'added'",
  );
  const upsertAdded = db.query(
    `INSERT INTO playlist_tracks (playlist_uri, track_uri, state, track, updated_at)
     VALUES ($playlist, $track_uri, 'added', $track, $at)
     ON CONFLICT (playlist_uri, track_uri) DO UPDATE SET
       state = 'added', track = excluded.track, updated_at = excluded.updated_at`,
  );
  const touchLink = db.query(
    "UPDATE playlist_links SET synced_at = $at WHERE spotify_uri = $uri",
  );
  const skip = db.query(
    `INSERT INTO playlist_tracks (playlist_uri, track_uri, state, updated_at)
     VALUES ($playlist, $track_uri, 'skipped', $at)
     ON CONFLICT (playlist_uri, track_uri) DO NOTHING`,
  );
  const unskip = db.query(
    "DELETE FROM playlist_tracks WHERE playlist_uri = $playlist AND track_uri = $track_uri AND state = 'skipped'",
  );

  const link = (uri: string) => {
    const row = oneLink.get({ uri });
    return row ? toLink(row) : null;
  };

  return {
    links: () => allLinks.all().map(toLink),
    link,
    state(uri) {
      const states: Record<string, PlaylistTrackState> = {};
      for (const row of tracks.all({ uri })) {
        states[row.track_uri] =
          row.state === "added" && row.track
            ? {
                state: "added",
                track: JSON.parse(row.track),
                at: row.updated_at,
              }
            : { state: "skipped", at: row.updated_at };
      }
      return { link: link(uri), tracks: states };
    },
    createLink({ spotifyUri, spotifyName, youtubePlaylistId, youtubeTitle }) {
      insertLink.run({
        uri: spotifyUri,
        name: spotifyName,
        playlistId: youtubePlaylistId,
        title: youtubeTitle,
        at: new Date().toISOString(),
      });
      return link(spotifyUri) as PlaylistLink;
    },
    unlink(uri) {
      db.transaction(() => {
        deleteLink.run({ uri });
        deleteAdded.run({ uri });
      })();
    },
    markAdded(playlist, added) {
      const at = new Date().toISOString();
      const states: Record<string, PlaylistTrackState> = {};
      db.transaction(() => {
        for (const { spotifyUri, track } of added) {
          upsertAdded.run({
            playlist,
            track_uri: spotifyUri,
            track: JSON.stringify(track),
            at,
          });
          states[spotifyUri] = { state: "added", track, at };
        }
        touchLink.run({ uri: playlist, at });
      })();
      return states;
    },
    setSkipped(playlist, trackUri, skipped) {
      const params = { playlist, track_uri: trackUri };
      if (skipped) skip.run({ ...params, at: new Date().toISOString() });
      else unskip.run(params);
    },
  };
}

function toLink(row: LinkRow): PlaylistLink {
  return {
    spotifyUri: row.spotify_uri,
    spotifyName: row.spotify_name,
    youtubePlaylistId: row.youtube_playlist_id,
    youtubeTitle: row.youtube_title,
    createdAt: row.created_at,
    syncedAt: row.synced_at ?? undefined,
    added: row.added,
    skipped: row.skipped,
  };
}
