import type { PlaylistState } from "@spottoyt/shared";
import { useEffect, useState } from "react";
import { helper } from "../helper";
import { loadPlaylist, type Playlist } from "../spotify";
import { PlaylistPicker } from "./PlaylistPicker";
import { Review } from "./Review";

export function ConvertPage({
  playlistUri,
  onPlaylistChange,
}: {
  playlistUri: string | null;
  onPlaylistChange: (uri: string | null) => void;
}) {
  if (!playlistUri) return <PlaylistPicker onPick={onPlaylistChange} />;
  return (
    <LoadedReview
      key={playlistUri}
      uri={playlistUri}
      onBack={() => onPlaylistChange(null)}
    />
  );
}

function LoadedReview({ uri, onBack }: { uri: string; onBack: () => void }) {
  const [loaded, setLoaded] = useState<{
    playlist: Playlist;
    state: PlaylistState;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      loadPlaylist(uri).catch((e) => {
        console.error("[SpottoYT]", e);
        throw new Error("Couldn't read that playlist from Spotify.");
      }),
      helper.playlistState(uri).catch((e: Error) => {
        throw new Error(`Couldn't reach the SpottoYT helper: ${e.message}`);
      }),
    ]).then(
      ([playlist, state]) => setLoaded({ playlist, state }),
      (e: Error) => setError(e.message),
    );
  }, [uri]);

  if (error) return <p className="syt-error">{error}</p>;
  if (!loaded) return <p className="syt-muted">Reading playlist…</p>;
  const { playlist, state } = loaded;
  if (!playlist.tracks.length) {
    return (
      <p className="syt-muted">
        {playlist.name} has no Spotify tracks to convert.{" "}
        <button type="button" className="syt-link" onClick={onBack}>
          Pick another
        </button>
      </p>
    );
  }
  return <Review playlist={playlist} initial={state} onBack={onBack} />;
}
