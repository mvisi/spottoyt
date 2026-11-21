// For a track already on YouTube: pick a better version and swap it in.
// The only way SpottoYT removes anything from a YouTube playlist.
import type { MatchCandidate, YoutubeTrack } from "@spottoyt/shared";
import { useEffect, useState } from "react";
import { helper } from "../helper";
import type { PlaylistTrack } from "../spotify";
import { Icon } from "../ui";
import { ManualSearch } from "./ManualSearch";
import { CandidateLine, YoutubeCell } from "./shared";

/** Matches one track on its own, without touching the page's match job. */
async function matchOne(track: PlaylistTrack): Promise<MatchCandidate[]> {
  const job = await helper.startMatchJob([track]);
  for (let i = 0; i < 150; i++) {
    const update = await helper.matchJob(job.id, 0);
    if (update.status !== "running") return update.results[0]?.candidates ?? [];
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return [];
}

export function ReplacePanel({
  track,
  current,
  onReplace,
}: {
  track: PlaylistTrack;
  /** What's on the YouTube playlist now. */
  current: YoutubeTrack;
  onReplace: (replacement: YoutubeTrack) => Promise<void>;
}) {
  const [candidates, setCandidates] = useState<MatchCandidate[] | null>(null);
  const [chosen, setChosen] = useState<YoutubeTrack | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    matchOne(track).then(
      (found) => live && setCandidates(found),
      () => live && setCandidates([]),
    );
    return () => {
      live = false;
    };
  }, [track]);

  const others = candidates?.filter((c) => c.videoId !== current.videoId);

  return (
    <div className="syt-alts">
      {chosen ? (
        <div className="syt-replace">
          <span className="syt-muted small">Replace with</span>
          <YoutubeCell track={chosen} />
          <span className="syt-muted small">
            This removes “{current.title}” from the YouTube Music playlist and
            puts this one in its place.
          </span>
          <div className="syt-replace-acts">
            <button
              type="button"
              className="syt-ghost"
              disabled={busy}
              onClick={() => setChosen(null)}
            >
              Back
            </button>
            <button
              type="button"
              className="syt-cta"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onReplace(chosen);
                setBusy(false);
              }}
            >
              {busy ? "Replacing…" : "Replace on YouTube Music"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {candidates === null && (
            <span className="syt-muted small">Looking for other versions…</span>
          )}
          {others?.map((c, k) => (
            <CandidateLine
              key={c.videoId}
              candidate={c}
              spotify={track}
              index={k}
              picked={false}
              onClick={() => setChosen(c)}
            />
          ))}
          {others?.length === 0 && (
            <span className="syt-muted small">No other versions found.</span>
          )}
          {searching ? (
            <ManualSearch track={track} autoFocus onPick={setChosen} />
          ) : (
            <button
              type="button"
              className="syt-link"
              onClick={() => setSearching(true)}
            >
              <Icon.search /> Search YouTube Music yourself or paste a link
            </button>
          )}
        </>
      )}
    </div>
  );
}
