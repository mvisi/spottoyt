import type { SpotifyTrack, YoutubeTrack } from "@spottoyt/shared";
import type { Db } from "../db";

export type CachedCandidates = {
  candidates: YoutubeTrack[];
  /** Keys of the searches already run, see `searchKey`. */
  searches: string[];
};

export type MatchStore = {
  getCandidates(spotifyUri: string): CachedCandidates | null;
  saveCandidates(spotify: SpotifyTrack, cached: CachedCandidates): void;
  getManual(spotifyUri: string): YoutubeTrack | null;
  setManual(spotifyUri: string, track: YoutubeTrack): void;
  clearManual(spotifyUri: string): void;
};

export function createMatchStore(db: Db): MatchStore {
  const getCandidates = db.query<
    { candidates: string; searches: string },
    { uri: string }
  >(
    "SELECT candidates, searches FROM track_candidates WHERE spotify_uri = $uri",
  );
  const saveCandidates = db.query(
    `INSERT INTO track_candidates (spotify_uri, spotify_track, candidates, searches, searched_at)
     VALUES ($uri, $spotify, $candidates, $searches, $at)
     ON CONFLICT (spotify_uri) DO UPDATE SET
       spotify_track = excluded.spotify_track,
       candidates = excluded.candidates,
       searches = excluded.searches,
       searched_at = excluded.searched_at`,
  );
  const getManual = db.query<{ track: string }, { uri: string }>(
    "SELECT track FROM manual_matches WHERE spotify_uri = $uri",
  );
  const setManual = db.query(
    `INSERT INTO manual_matches (spotify_uri, track, picked_at)
     VALUES ($uri, $track, $at)
     ON CONFLICT (spotify_uri) DO UPDATE SET
       track = excluded.track,
       picked_at = excluded.picked_at`,
  );
  const clearManual = db.query(
    "DELETE FROM manual_matches WHERE spotify_uri = $uri",
  );

  return {
    getCandidates(uri) {
      const row = getCandidates.get({ uri });
      return row
        ? {
            candidates: JSON.parse(row.candidates),
            searches: JSON.parse(row.searches),
          }
        : null;
    },
    saveCandidates(spotify, cached) {
      saveCandidates.run({
        uri: spotify.uri,
        spotify: JSON.stringify(spotify),
        candidates: JSON.stringify(cached.candidates),
        searches: JSON.stringify(cached.searches),
        at: new Date().toISOString(),
      });
    },
    getManual(uri) {
      const row = getManual.get({ uri });
      return row ? JSON.parse(row.track) : null;
    },
    setManual(uri, track) {
      setManual.run({
        uri,
        track: JSON.stringify(track),
        at: new Date().toISOString(),
      });
    },
    clearManual(uri) {
      clearManual.run({ uri });
    },
  };
}
