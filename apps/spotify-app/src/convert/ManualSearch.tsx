import type { YoutubeTrack, YoutubeTrackKind } from "@spottoyt/shared";
import { useEffect, useState } from "react";
import { helper, parseVideoId, youtubeMusicUrl } from "../helper";
import type { PlaylistTrack } from "../spotify";
import { Art, formatDuration, Icon } from "../ui";
import { PreviewButton } from "./Preview";

/** Search YouTube Music yourself, or paste a link, and pick a result. */
export function ManualSearch({
  track,
  onPick,
  autoFocus,
}: {
  track: PlaylistTrack;
  onPick: (result: YoutubeTrack) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState(() => defaultQuery(track));
  const [kind, setKind] = useState<YoutubeTrackKind>("song");
  const [results, setResults] = useState<YoutubeTrack[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when moving to another track.
  useEffect(() => {
    setQuery(defaultQuery(track));
    setResults(null);
    setError(null);
  }, [track]);

  const submit = async (searchKind = kind) => {
    const text = query.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const videoId = parseVideoId(text);
      setResults(
        videoId
          ? [await helper.video(videoId)]
          : (await helper.search(text, searchKind)).results,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResults(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="syt-manual">
      <form
        className="syt-manual-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          className="syt-input grow"
          value={query}
          placeholder="Search YouTube Music or paste a link"
          // biome-ignore lint/a11y/noAutofocus: opened on purpose to type into
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="syt-seg">
          {(["song", "video"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={kind === k ? "on" : ""}
              onClick={() => {
                setKind(k);
                if (results) void submit(k);
              }}
            >
              {k === "song" ? "Songs" : "Videos"}
            </button>
          ))}
        </div>
        <button type="submit" className="syt-ghost" disabled={busy}>
          <Icon.search /> {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {error && <p className="syt-error">{error}</p>}
      {results && !results.length && <p className="syt-muted">No results.</p>}
      {results && results.length > 0 && (
        <div className="syt-results">
          {results.slice(0, 10).map((r) => (
            <div key={r.videoId} className="syt-result">
              <Art src={r.thumbnailUrl} size={40} youtube />
              <div className="syt-t-txt">
                <div className="syt-t-title">
                  {r.title}
                  {r.kind === "video" && <span className="syt-tag">Video</span>}
                </div>
                <div className="syt-t-sub">
                  {[r.artists.join(", "), r.album].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className="syt-d">
                {formatDuration(r.durationMs)} vs{" "}
                {formatDuration(track.durationMs)}
              </span>
              <PreviewButton track={r} />
              <a
                className="syt-ic"
                href={youtubeMusicUrl(r.videoId)}
                target="_blank"
                rel="noreferrer"
                title="Open on YouTube Music"
              >
                <Icon.external />
              </a>
              <button
                type="button"
                className="syt-ghost"
                onClick={() => onPick(r)}
              >
                Use this
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Song - Remastered 2011" by "Artist" → "Song Artist". */
function defaultQuery(track: PlaylistTrack) {
  const title = track.title
    .replace(/\s*[([][^)\]]*(remaster|feat\.?|ft\.)[^)\]]*[)\]]/gi, "")
    .replace(/\s+[-–—]\s+.*(remaster|feat\.?|ft\.).*$/i, "")
    .trim();
  return `${title} ${track.artists[0] ?? ""}`.trim();
}
