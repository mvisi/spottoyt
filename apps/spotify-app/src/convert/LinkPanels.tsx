// The parts of the review page about the YouTube Music playlist itself:
// creating it, and showing how it differs from what SpottoYT added.
import type { YoutubeDiff } from "@spottoyt/shared";
import { useEffect, useState } from "react";
import { helper, youtubeMusicUrl } from "../helper";
import { searchOnSpotify } from "../spotify";
import { Icon } from "../ui";
import { YoutubeCell } from "./shared";

export function CreateForm({
  defaultTitle,
  count,
  undecided,
  onCreate,
  onCancel,
}: {
  defaultTitle: string;
  count: number;
  undecided: number;
  onCreate: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  return (
    <form
      className="syt-banner syt-create"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onCreate(title.trim());
      }}
    >
      <label className="syt-create-field">
        <span className="syt-muted small">YouTube Music playlist name</span>
        <input
          className="syt-input"
          value={title}
          // biome-ignore lint/a11y/noAutofocus: the form opens on request
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <span className="syt-muted small">
        Private playlist with {count} tracks.
        {undecided > 0 &&
          ` ${undecided} undecided ${undecided === 1 ? "track stays" : "tracks stay"} out for now and can be added later.`}
      </span>
      <span className="syt-spacer" />
      <button type="button" className="syt-ghost" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className="syt-cta" disabled={!title.trim()}>
        Create
      </button>
    </form>
  );
}

/**
 * Songs on the YouTube playlist that didn't come from Spotify, so you can
 * add them there by hand. Nothing is ever removed from YouTube.
 */
export function YoutubeDiffPanel({
  playlistUri,
  version,
  onUnlink,
}: {
  playlistUri: string;
  /** Bump to fetch again, e.g. after adding tracks. */
  version: number;
  onUnlink: () => void;
}) {
  const [diff, setDiff] = useState<YoutubeDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // `version` isn't read inside: changing it is what triggers a fetch.
  useEffect(() => {
    let live = true;
    helper.youtubeDiff(playlistUri).then(
      (d) => {
        if (!live) return;
        setDiff(d);
        setError(null);
      },
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [playlistUri, version]);

  if (error) {
    const gone = /is gone/.test(error);
    return (
      <div className="syt-banner bad">
        <span>
          {gone ? error : `Couldn't read the YouTube Music playlist: ${error}`}
        </span>
        {gone && (
          <button
            type="button"
            className="syt-ghost"
            onClick={() =>
              confirmUnlink ? onUnlink() : setConfirmUnlink(true)
            }
          >
            {confirmUnlink ? "Click again to unlink" : "Unlink to start over"}
          </button>
        )}
      </div>
    );
  }
  if (!diff) return null;

  const { onlyOnYoutube, removedOnYoutube } = diff;
  if (!onlyOnYoutube.length && !removedOnYoutube.length) return null;

  return (
    <div className="syt-diff">
      {onlyOnYoutube.length > 0 && (
        <button
          type="button"
          className="syt-diff-head"
          onClick={() => setOpen(!open)}
        >
          {Icon.chevron(open)}
          <span>
            <b>{onlyOnYoutube.length}</b>{" "}
            {onlyOnYoutube.length === 1 ? "song is" : "songs are"} only on
            YouTube Music. Add {onlyOnYoutube.length === 1 ? "it" : "them"} to
            Spotify if you want them there too.
          </span>
        </button>
      )}
      {open && (
        <div className="syt-alts">
          {onlyOnYoutube.map((track) => (
            <div key={track.videoId} className="syt-cand">
              <div className="syt-cand-main static">
                <YoutubeCell track={track} />
              </div>
              <button
                type="button"
                className="syt-ghost small"
                title="Search for it on Spotify"
                onClick={() =>
                  searchOnSpotify(
                    [track.title, track.artists[0]].filter(Boolean).join(" "),
                  )
                }
              >
                <Icon.search /> Find on Spotify
              </button>
              <a
                className="syt-ic"
                href={youtubeMusicUrl(track.videoId)}
                target="_blank"
                rel="noreferrer"
                title="Open on YouTube Music"
              >
                <Icon.external />
              </a>
            </div>
          ))}
        </div>
      )}
      {removedOnYoutube.length > 0 && (
        <p className="syt-muted small">
          {removedOnYoutube.length}{" "}
          {removedOnYoutube.length === 1 ? "track was" : "tracks were"} removed
          on YouTube Music after being added. SpottoYT won't add{" "}
          {removedOnYoutube.length === 1 ? "it" : "them"} again.
        </p>
      )}
    </div>
  );
}
