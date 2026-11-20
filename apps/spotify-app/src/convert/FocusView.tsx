import { useEffect, useRef } from "react";
import { youtubeMusicUrl } from "../helper";
import { playOnSpotify } from "../spotify";
import { Art, formatDuration, Icon } from "../ui";
import { ManualSearch } from "./ManualSearch";
import type { Row } from "./reviewState";
import { CandidateLine, type ReviewActions } from "./shared";

/** Walks through the tracks the helper couldn't settle, one at a time. */
export function FocusView({
  queue,
  selected,
  onSelect,
  actions,
}: {
  queue: Row[];
  selected: number;
  onSelect: (index: number) => void;
  actions: ReviewActions;
}) {
  const current = queue[Math.min(selected, queue.length - 1)];
  const left = queue.filter((r) => r.decision?.kind === "pending").length;
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div className="syt-focus">
      <div className="syt-queue">
        <div className="syt-queue-h">Needs review · {left} left</div>
        {queue.map((row, i) => (
          <button
            key={row.track.uri}
            ref={row === current ? selectedRef : undefined}
            type="button"
            className={`syt-q${row === current ? " sel" : ""}`}
            onClick={() => onSelect(i)}
          >
            <Art src={row.track.image} size={32} />
            <div className="syt-t-txt">
              <div className="syt-t-title">{row.track.title}</div>
              <div className="syt-t-sub">{row.track.artists.join(", ")}</div>
            </div>
            {row.decision?.kind === "accepted" && (
              <span className="syt-ok">
                <Icon.check />
              </span>
            )}
            {row.decision?.kind === "skipped" && (
              <span className="syt-muted">
                <Icon.skip />
              </span>
            )}
          </button>
        ))}
      </div>

      {!current ? (
        <div className="syt-card syt-muted">
          Nothing needs review. Every track matched confidently.
        </div>
      ) : (
        <FocusCard row={current} actions={actions} />
      )}
    </div>
  );
}

function FocusCard({ row, actions }: { row: Row; actions: ReviewActions }) {
  const { track, match, decision } = row;
  const pickId =
    decision?.kind === "accepted"
      ? decision.track.videoId
      : decision?.kind === "pending"
        ? decision.pick?.videoId
        : undefined;

  return (
    <div className="syt-card">
      <div className="syt-src">
        <Art src={track.image} size={96} />
        <div className="syt-t-txt">
          <div className="syt-muted small">
            Spotify · track {track.position + 1}
          </div>
          <div className="syt-h2">{track.title}</div>
          <div className="syt-muted">{track.artists.join(", ")}</div>
          <div className="syt-muted small">
            {[track.album, formatDuration(track.durationMs)]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <button
          type="button"
          className="syt-ghost"
          onClick={() => playOnSpotify(track.uri)}
        >
          <Icon.play /> Play on Spotify
        </button>
      </div>

      {match?.status === "error" && (
        <p className="syt-error">
          Search failed: {match.error}{" "}
          <button
            type="button"
            className="syt-link"
            onClick={() => actions.rematch(row)}
          >
            Try again
          </button>
        </p>
      )}

      <div className="syt-cands">
        {match?.candidates.map((c, k) => (
          <CandidateLine
            key={c.videoId}
            candidate={c}
            spotify={track}
            index={k}
            picked={c.videoId === pickId && decision?.kind !== "skipped"}
            onClick={() => actions.pick(row, c)}
          />
        ))}
        {match && !match.candidates.length && match.status !== "error" && (
          <p className="syt-muted">
            YouTube Music had nothing close. Search yourself below or skip.
          </p>
        )}
      </div>

      <div className="syt-foot">
        <button
          type="button"
          className="syt-cta"
          disabled={!pickId || decision?.kind === "accepted"}
          onClick={() => actions.accept(row)}
        >
          <Icon.check />{" "}
          {decision?.kind === "accepted" ? "Accepted" : "Use pick"}
        </button>
        <button
          type="button"
          className="syt-ghost"
          onClick={() => actions.toggleSkip(row)}
        >
          {decision?.kind === "skipped" ? "Unskip" : "Skip track"}
        </button>
        {pickId && (
          <a
            className="syt-ghost"
            href={youtubeMusicUrl(pickId)}
            target="_blank"
            rel="noreferrer"
          >
            <Icon.external /> Open pick on YouTube Music
          </a>
        )}
        <span className="syt-keys">
          <kbd>1</kbd>–<kbd>6</kbd> pick <kbd>Enter</kbd> use <kbd>s</kbd> skip{" "}
          <kbd>j</kbd>/<kbd>k</kbd> move
        </span>
      </div>

      <ManualSearch track={track} onPick={(r) => actions.accept(row, r)} />
    </div>
  );
}
