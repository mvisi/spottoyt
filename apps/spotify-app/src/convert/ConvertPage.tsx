import { useEffect, useState } from "react";
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
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlaylist(uri).then(setPlaylist, (e) => {
      console.error("[SpottoYT]", e);
      setError("Couldn't read that playlist from Spotify.");
    });
  }, [uri]);

  if (error) return <p className="syt-error">{error}</p>;
  if (!playlist) return <p className="syt-muted">Reading playlist…</p>;
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
  return <Review playlist={playlist} onBack={onBack} />;
}
