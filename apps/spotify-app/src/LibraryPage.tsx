// Spotify playlists that have a YouTube Music copy, and how many new
// Spotify tracks each one has waiting.
import type { PlaylistLink } from "@spottoyt/shared";
import { useCallback, useEffect, useState } from "react";
import { helper, youtubePlaylistUrl } from "./helper";
import { loadPlaylist, loadPlaylists, type PlaylistSummary } from "./spotify";
import { Art, formatAgo, Icon, notify } from "./ui";

type Entry = {
  link: PlaylistLink;
  summary?: PlaylistSummary;
  /** Spotify tracks not added or skipped yet. Undefined while counting. */
  waiting?: number | "error";
};

export function LibraryPage({ onOpen }: { onOpen: (uri: string) => void }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [links, summaries] = await Promise.all([
        helper.playlists(),
        loadPlaylists().catch(() => [] as PlaylistSummary[]),
      ]);
      const byUri = new Map(summaries.map((s) => [s.uri, s]));
      setEntries(
        links.map((link) => ({ link, summary: byUri.get(link.spotifyUri) })),
      );
      setError(null);

      // Count new tracks per playlist, filling them in as they finish.
      for (const link of links) {
        Promise.all([
          loadPlaylist(link.spotifyUri),
          helper.playlistState(link.spotifyUri),
        ]).then(
          ([playlist, state]) =>
            setWaiting(
              link.spotifyUri,
              playlist.tracks.filter((t) => !state.tracks[t.uri]).length,
            ),
          () => setWaiting(link.spotifyUri, "error"),
        );
      }
    } catch (e) {
      setError(`Couldn't reach the SpottoYT helper: ${(e as Error).message}`);
    }
  }, []);

  const setWaiting = (uri: string, waiting: Entry["waiting"]) =>
    setEntries(
      (prev) =>
        prev?.map((e) => (e.link.spotifyUri === uri ? { ...e, waiting } : e)) ??
        null,
    );

  useEffect(() => {
    void load();
  }, [load]);

  async function unlink(uri: string) {
    if (confirming !== uri) {
      setConfirming(uri);
      return;
    }
    setConfirming(null);
    try {
      await helper.unlinkPlaylist(uri);
      notify("Unlinked. The YouTube Music playlist itself is still there.");
      void load();
    } catch (e) {
      notify(`Couldn't unlink: ${(e as Error).message}`, true);
    }
  }

  if (error) return <p className="syt-error">{error}</p>;
  if (!entries) return <p className="syt-muted">Loading linked playlists…</p>;

  return (
    <section>
      <h1 className="syt-h1">Library</h1>
      <p className="syt-muted">
        Spotify playlists with a YouTube Music copy. Open one to add its new
        tracks. Nothing is ever removed on YouTube, and Spotify is never
        changed.
      </p>
      {!entries.length && (
        <p className="syt-muted">
          Nothing linked yet. Convert a playlist and create it on YouTube Music
          to see it here.
        </p>
      )}
      <div className="syt-lib">
        {entries.map(({ link, summary, waiting }) => (
          <div key={link.spotifyUri} className="syt-lib-row">
            <Art src={summary?.image} size={56} />
            <div className="syt-t-txt">
              <div className="syt-t-title">{link.spotifyName}</div>
              <div className="syt-t-sub">
                {link.added} on YouTube
                {link.skipped > 0 && ` · ${link.skipped} skipped`} · last added{" "}
                {formatAgo(link.syncedAt ?? link.createdAt)}
              </div>
              {!summary && (
                <div className="syt-t-sub">
                  Not in your Spotify library anymore.
                </div>
              )}
            </div>
            <span
              className={`syt-dot ${
                waiting === undefined
                  ? "idle"
                  : waiting === "error"
                    ? "bad"
                    : waiting > 0
                      ? "warn"
                      : "ok"
              }`}
            >
              <i />
              {waiting === undefined
                ? "Checking…"
                : waiting === "error"
                  ? "Couldn't check"
                  : waiting > 0
                    ? `${waiting} new`
                    : "Up to date"}
            </span>
            <div className="syt-acts">
              <button
                type="button"
                className="syt-ghost"
                onClick={() => onOpen(link.spotifyUri)}
              >
                {typeof waiting === "number" && waiting > 0
                  ? "Review new"
                  : "Open"}
              </button>
              <a
                className="syt-ic"
                href={youtubePlaylistUrl(link.youtubePlaylistId)}
                target="_blank"
                rel="noreferrer"
                title={`Open “${link.youtubeTitle}” on YouTube Music`}
              >
                <Icon.external />
              </a>
              <button
                type="button"
                className="syt-link small"
                title="Forget the link. The YouTube Music playlist stays."
                onClick={() => unlink(link.spotifyUri)}
              >
                {confirming === link.spotifyUri ? "Click again" : "Unlink"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
