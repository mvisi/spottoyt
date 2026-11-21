import { useEffect, useRef, useState } from "react";
import { playOnSpotify } from "../spotify";
import { Icon } from "../ui";
import { ManualSearch } from "./ManualSearch";
import { ReplacePanel } from "./ReplacePanel";
import type { Row } from "./reviewState";
import {
  CandidateLine,
  MatchStatus,
  type ReviewActions,
  TrackCell,
  YoutubeCell,
} from "./shared";

export function TableView({
  rows,
  selected,
  onSelect,
  expanded,
  onToggleExpanded,
  actions,
}: {
  rows: Row[];
  selected: number;
  onSelect: (index: number) => void;
  expanded: ReadonlySet<string>;
  onToggleExpanded: (uri: string) => void;
  actions: ReviewActions;
}) {
  const selectedRef = useRef<HTMLDivElement>(null);
  const [searching, setSearching] = useState<string | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!rows.length) return <p className="syt-muted syt-empty">Nothing here.</p>;

  return (
    <div className="syt-table">
      <div className="syt-thead">
        <span>#</span>
        <span>Spotify</span>
        <span>YouTube Music</span>
        <span>Match</span>
        <span
          className="syt-keys"
          title="j/k move · a accept · s skip · Enter alternatives · 1–6 pick"
        >
          <kbd>j</kbd>
          <kbd>k</kbd>
          <kbd>a</kbd>
          <kbd>s</kbd>
        </span>
      </div>
      {rows.map((row, i) => {
        const { track, match, decision } = row;
        const open = expanded.has(track.uri);
        const settled = decision?.kind === "added";
        const shown =
          decision?.kind === "accepted" || decision?.kind === "added"
            ? decision.track
            : decision?.kind === "pending"
              ? decision.pick
              : undefined;

        return (
          <div key={track.uri}>
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: rows are driven by the j/k shortcuts */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: same as above */}
            <div
              ref={i === selected ? selectedRef : undefined}
              className={`syt-tr${i === selected ? " sel" : ""}${decision?.kind === "skipped" ? " dim" : ""}`}
              onClick={() => onSelect(i)}
              onDoubleClick={() => playOnSpotify(track.uri)}
            >
              <span className="syt-n">{track.position + 1}</span>
              <TrackCell
                title={track.title}
                sub={track.artists.join(", ")}
                image={track.image}
              />
              {shown && settled ? (
                <YoutubeCell track={shown} />
              ) : !match ? (
                <span className="syt-none">Searching…</span>
              ) : decision?.kind === "skipped" ? (
                <span className="syt-none">Won't be added</span>
              ) : shown ? (
                <YoutubeCell track={shown} />
              ) : (
                <span className="syt-none">
                  {match.status === "error"
                    ? match.error
                    : "No match. Search yourself or skip."}
                </span>
              )}
              <MatchStatus row={row} />
              <div className="syt-acts">
                {match?.status === "error" && (
                  <button
                    type="button"
                    className="syt-ic"
                    title="Try again"
                    onClick={() => actions.searchAgain(row)}
                  >
                    <Icon.retry />
                  </button>
                )}
                {(match || settled) && (
                  <button
                    type="button"
                    className="syt-ic"
                    title={
                      settled
                        ? "Replace with another version (Enter)"
                        : "Alternatives and search (Enter)"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExpanded(track.uri);
                    }}
                  >
                    {Icon.chevron(open)}
                  </button>
                )}
                <button
                  type="button"
                  className={`syt-ic${decision?.kind === "accepted" || settled ? " on-ok" : ""}`}
                  title={settled ? "Already on YouTube Music" : "Accept (a)"}
                  disabled={
                    !decision ||
                    settled ||
                    (decision.kind === "pending" && !decision.pick)
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.toggleAccept(row);
                  }}
                >
                  <Icon.check />
                </button>
                <button
                  type="button"
                  className={`syt-ic${decision?.kind === "skipped" ? " on-skip" : ""}`}
                  title="Skip (s)"
                  disabled={!decision || settled}
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.toggleSkip(row);
                  }}
                >
                  <Icon.skip />
                </button>
              </div>
            </div>
            {open && settled && shown && (
              <ReplacePanel
                track={track}
                current={shown}
                onReplace={(replacement) => actions.replace(row, replacement)}
              />
            )}
            {open && match && !settled && (
              <div className="syt-alts">
                {match.candidates.map((c, k) => (
                  <CandidateLine
                    key={c.videoId}
                    candidate={c}
                    spotify={track}
                    index={k}
                    picked={
                      decision?.kind === "accepted" &&
                      decision.track.videoId === c.videoId
                    }
                    onClick={() => actions.accept(row, c)}
                  />
                ))}
                {searching === track.uri ? (
                  <ManualSearch
                    track={track}
                    autoFocus
                    onPick={(r) => actions.accept(row, r)}
                  />
                ) : (
                  <button
                    type="button"
                    className="syt-link"
                    onClick={() => setSearching(track.uri)}
                  >
                    <Icon.search /> Search YouTube Music yourself or paste a
                    link
                  </button>
                )}
                <button
                  type="button"
                  className="syt-link"
                  onClick={() => actions.searchAgain(row)}
                >
                  <Icon.retry /> Run the automatic search again
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
