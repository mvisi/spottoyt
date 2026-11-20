import type { YoutubeTrack } from "@spottoyt/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { helper } from "../helper";
import type { Playlist } from "../spotify";
import { Art, Icon, notify } from "../ui";
import { FocusView } from "./FocusView";
import {
  buildRows,
  countRows,
  type Filter,
  filterRows,
  needsReview,
  nextOpen,
  type Override,
  type Row,
} from "./reviewState";
import type { ReviewActions } from "./shared";
import { TableView } from "./TableView";
import { useMatching } from "./useMatching";

type Layout = "table" | "focus";
const LAYOUT_KEY = "spottoyt:review-layout";

const FILTERS: Array<[Filter, string]> = [
  ["all", "All"],
  ["review", "Needs review"],
  ["auto", "Auto"],
  ["skipped", "Skipped"],
];

export function Review({
  playlist,
  onBack,
}: {
  playlist: Playlist;
  onBack: () => void;
}) {
  const { matches, progress, run, cancel } = useMatching(playlist.tracks);
  const [overrides, setOverrides] = useState<ReadonlyMap<string, Override>>(
    new Map(),
  );
  const [layout, setLayout] = useState<Layout>(() =>
    Spicetify.LocalStorage.get(LAYOUT_KEY) === "focus" ? "focus" : "table",
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const rows = useMemo(
    () => buildRows(playlist.tracks, matches, overrides),
    [playlist.tracks, matches, overrides],
  );
  const counts = countRows(rows);
  const list = useMemo(
    () =>
      layout === "focus" ? rows.filter(needsReview) : filterRows(rows, filter),
    [rows, layout, filter],
  );

  const setOverride = useCallback((uri: string, override: Override | null) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      if (override) next.set(uri, override);
      else next.delete(uri);
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((uri: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }, []);

  // Moves to the next undecided row after deciding one, in Focus layout.
  const advanceFrom = (row: Row) => {
    if (layout !== "focus") return;
    const index = list.indexOf(row);
    const next = nextOpen(list, index);
    if (next !== -1) setSelected(next);
  };

  const actions: ReviewActions = {
    accept(row, track) {
      const chosen: YoutubeTrack | undefined =
        track ??
        (row.decision?.kind === "pending" ? row.decision.pick : undefined);
      if (!chosen) return;
      if (
        row.decision?.kind === "accepted" &&
        row.decision.track.videoId === chosen.videoId
      ) {
        advanceFrom(row);
        return;
      }
      setOverride(row.track.uri, { kind: "accepted", track: chosen });
      // Remember the pick in every playlist this track shows up in.
      helper
        .setManualMatch(row.track.uri, chosen)
        .catch((e) => notify(`Couldn't save your pick: ${e.message}`, true));
      advanceFrom(row);
    },
    toggleAccept(row) {
      const decision = row.decision;
      if (decision?.kind !== "accepted") return actions.accept(row);
      setOverride(row.track.uri, { kind: "pending", pick: decision.track });
      if (decision.by === "you") {
        helper
          .clearManualMatch(row.track.uri)
          .catch((e) => notify(`Couldn't undo your pick: ${e.message}`, true));
      }
    },
    toggleSkip(row) {
      if (row.decision?.kind === "skipped") {
        setOverride(row.track.uri, null);
        return;
      }
      setOverride(row.track.uri, { kind: "skipped" });
      advanceFrom(row);
    },
    pick(row, track) {
      setOverride(row.track.uri, { kind: "pending", pick: track });
    },
    rematch(row) {
      void run([row.track]);
    },
  };

  // Keyboard: j/k move, a accept, s skip, Enter expand (Table) or accept
  // (Focus), 1–6 pick a candidate. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        (target instanceof Element &&
          target.closest("input, textarea, [contenteditable]")) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      const row = list[selected];
      const key = e.key;

      if (key === "j" || key === "ArrowDown")
        setSelected((s) => Math.min(s + 1, list.length - 1));
      else if (key === "k" || key === "ArrowUp")
        setSelected((s) => Math.max(s - 1, 0));
      else if (!row) return;
      else if (key === "a" || (key === "Enter" && layout === "focus"))
        actions.accept(row);
      else if (key === "s") actions.toggleSkip(row);
      else if (key === "Enter") toggleExpanded(row.track.uri);
      else if (/^[1-6]$/.test(key)) {
        const candidate = row.match?.candidates[Number(key) - 1];
        if (!candidate) return;
        if (layout === "focus") actions.pick(row, candidate);
        else actions.accept(row, candidate);
      } else return;

      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  });

  const matching =
    progress.status === "running" || progress.status === "starting";
  const failedRows = rows.filter(
    (r) => r.match?.status === "error" || !r.match,
  );
  const decided = counts.accepted + counts.skipped;

  return (
    <div>
      <div className="syt-hero">
        <Art src={playlist.image} size={160} />
        <div className="syt-t-txt">
          <button type="button" className="syt-link" onClick={onBack}>
            <Icon.back /> Change playlist
          </button>
          <div className="syt-big">{playlist.name}</div>
          <div className="syt-stats">
            <span>
              <b>{counts.total}</b> tracks
            </span>
            <span>
              <b>{counts.accepted}</b> matched
            </span>
            <span>
              <b>{counts.open}</b> to review
            </span>
            <span>
              <b>{counts.skipped}</b> skipped
            </span>
            {playlist.skippedItems > 0 && (
              <span>
                {playlist.skippedItems} local files or episodes left out
              </span>
            )}
          </div>
        </div>
      </div>

      {matching && (
        <div className="syt-banner">
          <div className="syt-progress">
            <div
              style={{
                width: `${(progress.done / Math.max(progress.total, 1)) * 100}%`,
              }}
            />
          </div>
          <span className="syt-muted">
            Matching {progress.done} of {progress.total}
          </span>
          <button type="button" className="syt-link" onClick={cancel}>
            Stop
          </button>
        </div>
      )}
      {!matching &&
        (progress.status === "failed" || progress.status === "cancelled") && (
          <div className="syt-banner bad">
            <span>
              {progress.status === "failed"
                ? `Matching stopped: ${progress.error}`
                : "Matching stopped."}
            </span>
            {failedRows.length > 0 && (
              <button
                type="button"
                className="syt-ghost"
                onClick={() => run(failedRows.map((r) => r.track))}
              >
                <Icon.retry /> Match the remaining {failedRows.length}
              </button>
            )}
          </div>
        )}

      <div className="syt-bar">
        <button
          type="button"
          className="syt-cta"
          disabled
          title="Creating the YouTube Music playlist is the next step being built"
        >
          Create on YouTube Music
        </button>
        <span className="syt-muted small">
          {decided} of {counts.total} decided
        </span>
        <span className="syt-spacer" />
        {layout === "table" && (
          <div className="syt-seg">
            {FILTERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={filter === id ? "on" : ""}
                onClick={() => {
                  setFilter(id);
                  setSelected(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="syt-seg">
          {(["table", "focus"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={layout === id ? "on" : ""}
              onClick={() => {
                setLayout(id);
                setSelected(0);
                Spicetify.LocalStorage.set(LAYOUT_KEY, id);
              }}
            >
              {id === "table" ? "Table" : "Focus"}
            </button>
          ))}
        </div>
      </div>

      {layout === "table" ? (
        <TableView
          rows={list}
          selected={selected}
          onSelect={setSelected}
          expanded={expanded}
          onToggleExpanded={toggleExpanded}
          actions={actions}
        />
      ) : (
        <FocusView
          queue={list}
          selected={selected}
          onSelect={setSelected}
          actions={actions}
        />
      )}
    </div>
  );
}
