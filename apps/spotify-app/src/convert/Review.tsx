import type {
  PlaylistLink,
  PlaylistState,
  YoutubeTrack,
} from "@spottoyt/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { helper, youtubePlaylistUrl } from "../helper";
import type { Playlist } from "../spotify";
import { Art, Icon, notify } from "../ui";
import { FocusView } from "./FocusView";
import { CreateForm, YoutubeDiffPanel } from "./LinkPanels";
import { PreviewProvider } from "./Preview";
import {
  buildRows,
  countRows,
  type Filter,
  filterRows,
  needsReview,
  nextOpen,
  type Override,
  type Row,
  type SavedStates,
  tracksToAdd,
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
const LINKED_FILTERS: Array<[Filter, string]> = [
  ["new", "New"],
  ["review", "Needs review"],
  ["skipped", "Skipped"],
  ["added", "On YouTube"],
  ["all", "All"],
];

/** Tracks per add request, so progress shows and a failure loses little. */
const ADD_CHUNK = 50;

export function Review({
  playlist,
  initial,
  onBack,
}: {
  playlist: Playlist;
  /** What the helper has saved for this playlist when the page opened. */
  initial: PlaylistState;
  onBack: () => void;
}) {
  const [saved, setSaved] = useState<SavedStates>(initial.tracks);
  const [link, setLink] = useState<PlaylistLink | null>(initial.link);
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [diffVersion, setDiffVersion] = useState(0);

  // Tracks already on YouTube are settled, so only the rest get matched.
  const toMatch = useMemo(
    () =>
      playlist.tracks.filter((t) => initial.tracks[t.uri]?.state !== "added"),
    [playlist.tracks, initial.tracks],
  );
  const { matches, progress, run, cancel } = useMatching(toMatch);
  const [overrides, setOverrides] = useState<ReadonlyMap<string, Override>>(
    new Map(),
  );
  const [layout, setLayout] = useState<Layout>(() =>
    Spicetify.LocalStorage.get(LAYOUT_KEY) === "focus" ? "focus" : "table",
  );
  const [filter, setFilter] = useState<Filter>(initial.link ? "new" : "all");
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const rows = useMemo(
    () => buildRows(playlist.tracks, matches, overrides, saved),
    [playlist.tracks, matches, overrides, saved],
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

  const settled = (row: Row) => row.decision?.kind === "added";

  const actions: ReviewActions = {
    accept(row, track) {
      if (settled(row)) return;
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
      if (settled(row)) return;
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
      if (settled(row) || !row.decision) return;
      const uri = row.track.uri;
      const skip = row.decision.kind !== "skipped";
      // Saved right away, so skips survive closing Spotify.
      setSaved((prev) => {
        const next = { ...prev };
        if (skip)
          next[uri] = { state: "skipped", at: new Date().toISOString() };
        else delete next[uri];
        return next;
      });
      helper.setSkipped(playlist.uri, uri, skip).catch((e) => {
        notify(`Couldn't save that skip: ${e.message}`, true);
        setSaved((prev) => {
          const next = { ...prev };
          if (skip) delete next[uri];
          else next[uri] = { state: "skipped", at: new Date().toISOString() };
          return next;
        });
      });
      if (skip) advanceFrom(row);
    },
    pick(row, track) {
      if (settled(row)) return;
      setOverride(row.track.uri, { kind: "pending", pick: track });
    },
    searchAgain(row) {
      if (settled(row)) return;
      searchAgain([row]);
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
  // Unsure tracks you haven't decided on: worth another search.
  const unsureRows = rows.filter(
    (r) => needsReview(r) && r.decision?.kind === "pending",
  );

  function searchAgain(targets: Row[]) {
    if (matching) {
      notify("Wait for matching to finish first.");
      return;
    }
    // Drop unconfirmed picks so the new results show. Accepted picks are
    // saved in the helper and survive the search.
    for (const row of targets) {
      if (row.decision?.kind !== "accepted") setOverride(row.track.uri, null);
    }
    void run(
      targets.map((r) => r.track),
      true,
    );
  }
  const failedRows = rows.filter(
    (r) => r.match?.status === "error" || !r.match,
  );
  const decided = counts.added + counts.accepted + counts.skipped;
  const pendingAdds = tracksToAdd(rows);

  // Adds every accepted track that isn't on YouTube yet, in playlist order.
  async function addToYoutube() {
    const items = tracksToAdd(rows);
    if (!items.length) return;
    setAdding({ done: 0, total: items.length });
    let done = 0;
    try {
      for (let i = 0; i < items.length; i += ADD_CHUNK) {
        const res = await helper.addTracks(
          playlist.uri,
          items.slice(i, i + ADD_CHUNK),
        );
        done += Math.min(ADD_CHUNK, items.length - i);
        setSaved((prev) => ({ ...prev, ...res.tracks }));
        setLink(res.link);
        setAdding({ done, total: items.length });
      }
      notify(
        `Added ${items.length} ${items.length === 1 ? "track" : "tracks"} to YouTube Music`,
      );
    } catch (e) {
      notify(
        `Adding stopped after ${done} of ${items.length}: ${(e as Error).message}. Try again to add the rest.`,
        true,
      );
    } finally {
      setAdding(null);
      setDiffVersion((v) => v + 1);
    }
  }

  async function create(title: string) {
    setCreating(false);
    try {
      const created = await helper.linkPlaylist(
        playlist.uri,
        playlist.name,
        title,
      );
      setLink(created);
      setFilter("new");
      await addToYoutube();
    } catch (e) {
      notify(`Couldn't create the playlist: ${(e as Error).message}`, true);
    }
  }

  async function unlink() {
    try {
      await helper.unlinkPlaylist(playlist.uri);
      setLink(null);
      setSaved((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(([, s]) => s.state === "skipped"),
        ),
      );
      setFilter("all");
      notify("Unlinked. Matching the tracks again to start over.");
      void run(playlist.tracks);
    } catch (e) {
      notify(`Couldn't unlink: ${(e as Error).message}`, true);
    }
  }

  return (
    <PreviewProvider>
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
            {link && (
              <span>
                <b>{counts.added}</b> on YouTube
              </span>
            )}
            <span>
              <b>{counts.accepted}</b> {link ? "ready to add" : "matched"}
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
          {link && (
            <a
              className="syt-link small"
              href={youtubePlaylistUrl(link.youtubePlaylistId)}
              target="_blank"
              rel="noreferrer"
            >
              <Icon.link /> Linked to “{link.youtubeTitle}” on YouTube Music
            </a>
          )}
        </div>
      </div>

      {link && (
        <YoutubeDiffPanel
          playlistUri={playlist.uri}
          version={diffVersion}
          onUnlink={unlink}
        />
      )}

      {adding && (
        <div className="syt-banner">
          <div className="syt-progress">
            <div
              style={{
                width: `${(adding.done / Math.max(adding.total, 1)) * 100}%`,
              }}
            />
          </div>
          <span className="syt-muted">
            Adding to YouTube Music: {adding.done} of {adding.total}
          </span>
        </div>
      )}

      {creating && (
        <CreateForm
          defaultTitle={playlist.name}
          count={pendingAdds.length}
          undecided={counts.open + counts.matching}
          onCreate={create}
          onCancel={() => setCreating(false)}
        />
      )}

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
        {link ? (
          <button
            type="button"
            className="syt-cta"
            disabled={!pendingAdds.length || adding !== null}
            onClick={addToYoutube}
          >
            {pendingAdds.length
              ? `Add ${pendingAdds.length} to YouTube Music`
              : "Nothing new to add"}
          </button>
        ) : (
          <button
            type="button"
            className="syt-cta"
            disabled={!pendingAdds.length || creating || adding !== null}
            onClick={() => setCreating(true)}
          >
            Create on YouTube Music
          </button>
        )}
        <span className="syt-muted small">
          {decided} of {counts.total} decided
        </span>
        <span className="syt-spacer" />
        {!matching && unsureRows.length > 0 && (
          <button
            type="button"
            className="syt-ghost"
            title="YouTube's results change over time. Searching again can find what was missing."
            onClick={() => searchAgain(unsureRows)}
          >
            <Icon.retry /> Search again for {unsureRows.length} unsure
          </button>
        )}
        {layout === "table" && (
          <div className="syt-seg">
            {(link ? LINKED_FILTERS : FILTERS).map(([id, label]) => (
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
    </PreviewProvider>
  );
}
