import { useEffect, useState } from "react";
import { helper } from "../helper";
import { loadPlaylists, type PlaylistSummary } from "../spotify";
import { Art } from "../ui";

export function PlaylistPicker({ onPick }: { onPick: (uri: string) => void }) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [linked, setLinked] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    helper.playlists().then(
      (links) => setLinked(new Set(links.map((l) => l.spotifyUri))),
      () => {},
    );
    loadPlaylists().then(setPlaylists, (e) => {
      console.error("[SpottoYT]", e);
      setError("Couldn't read your playlists from Spotify.");
    });
  }, []);

  if (error) return <p className="syt-error">{error}</p>;
  if (!playlists) return <p className="syt-muted">Loading your playlists…</p>;

  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? playlists.filter((p) => p.name.toLowerCase().includes(needle))
    : playlists;

  return (
    <section>
      <div className="syt-row-between">
        <h1 className="syt-h1">Convert a playlist</h1>
        <input
          className="syt-input"
          placeholder="Filter playlists"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <p className="syt-muted">
        Pick one below, or right-click any playlist in Spotify and choose
        Convert with SpottoYT.
      </p>
      <div className="syt-grid">
        {shown.map((p) => (
          <button
            key={p.uri}
            type="button"
            className="syt-tile"
            onClick={() => onPick(p.uri)}
          >
            <Art src={p.image} />
            <div className="syt-tile-name">
              {p.name}
              {linked.has(p.uri) && <span className="syt-tag">Linked</span>}
            </div>
            <div className="syt-tile-sub">
              {[
                p.owner,
                p.trackCount !== undefined ? `${p.trackCount} tracks` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </button>
        ))}
      </div>
      {!shown.length && (
        <p className="syt-muted">No playlists match “{filter}”.</p>
      )}
    </section>
  );
}
