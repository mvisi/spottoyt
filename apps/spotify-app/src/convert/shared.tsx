import type { MatchCandidate, YoutubeTrack } from "@spottoyt/shared";
import { youtubeMusicUrl } from "../helper";
import type { PlaylistTrack } from "../spotify";
import { Art, formatDuration, Icon } from "../ui";
import { PreviewButton } from "./Preview";
import type { Row } from "./reviewState";

export type ReviewActions = {
  /** Accept `track`, or the row's current pick. */
  accept(row: Row, track?: YoutubeTrack): void;
  /** Accept if open, undo if accepted. */
  toggleAccept(row: Row): void;
  /** Skip, or unskip. */
  toggleSkip(row: Row): void;
  /** Change the pick without accepting it yet. */
  pick(row: Row, track: YoutubeTrack): void;
  /** Run the YouTube searches for this track again. */
  searchAgain(row: Row): void;
  /** Swap an added track's video on YouTube for `track`. */
  replace(row: Row, track: YoutubeTrack): Promise<void>;
};

export function TrackCell({
  title,
  sub,
  image,
  youtube,
  video,
}: {
  title: string;
  sub: string;
  image?: string;
  youtube?: boolean;
  video?: boolean;
}) {
  return (
    <div className="syt-t">
      <Art src={image} size={40} youtube={youtube} />
      <div className="syt-t-txt">
        <div className="syt-t-title">
          {title}
          {video && <span className="syt-tag">Video</span>}
        </div>
        <div className="syt-t-sub">{sub}</div>
      </div>
    </div>
  );
}

export function YoutubeCell({ track }: { track: YoutubeTrack }) {
  return (
    <TrackCell
      title={track.title}
      sub={[track.artists.join(", "), track.album].filter(Boolean).join(" · ")}
      image={track.thumbnailUrl}
      youtube
      video={track.kind === "video"}
    />
  );
}

/** One line of status for the Match column. */
export function MatchStatus({ row }: { row: Row }) {
  const { match, decision } = row;
  if (decision?.kind === "added" && decision.suspect)
    return (
      <span
        className="syt-dot warn"
        title={`Scores ${decision.suspect.score} now: ${decision.suspect.reasons.join(", ")}. Expand to replace it.`}
      >
        <i />
        Looks wrong · {decision.suspect.score}
      </span>
    );
  if (decision?.kind === "added")
    return (
      <span className="syt-dot ok">
        <i />
        On YouTube
      </span>
    );
  if (!match || !decision)
    return (
      <span className="syt-dot idle syt-pulse">
        <i />
        Matching…
      </span>
    );
  if (decision.kind === "skipped")
    return (
      <span className="syt-dot idle">
        <i />
        Skipped
      </span>
    );
  if (decision.kind === "accepted") {
    if (decision.by === "you")
      return (
        <span className="syt-dot ok">
          <i />
          Picked
        </span>
      );
    const score = match.candidates[0]?.score;
    return (
      <span className="syt-dot ok">
        <i />
        Auto{score !== undefined ? ` · ${score}` : ""}
      </span>
    );
  }
  if (match.status === "error")
    return (
      <span className="syt-dot bad">
        <i />
        Search failed
      </span>
    );
  if (match.status === "not_found")
    return (
      <span className="syt-dot bad">
        <i />
        Not found
      </span>
    );
  const score =
    decision.pick &&
    match.candidates.find((c) => c.videoId === decision.pick?.videoId)?.score;
  return (
    <span
      className={`syt-dot ${score !== undefined && score >= 70 ? "warn" : "bad"}`}
    >
      <i />
      {score !== undefined && score >= 70 ? "Check" : "Unsure"}
      {score !== undefined ? ` · ${score}` : ""}
    </span>
  );
}

export function CandidateLine({
  candidate,
  spotify,
  index,
  picked,
  onClick,
}: {
  candidate: MatchCandidate;
  spotify: PlaylistTrack;
  index: number;
  picked: boolean;
  onClick: () => void;
}) {
  return (
    <div className={`syt-cand${picked ? " pick" : ""}`}>
      <button type="button" className="syt-cand-main" onClick={onClick}>
        <span className="syt-k">{index + 1}</span>
        <YoutubeCell track={candidate} />
        <span className="syt-why">
          {candidate.reasons.join(" · ") || "Looks right"}
        </span>
        <span className="syt-d">
          {formatDuration(candidate.durationMs)} vs{" "}
          {formatDuration(spotify.durationMs)}
        </span>
        <span className="syt-score">{candidate.score}</span>
      </button>
      <PreviewButton track={candidate} />
      <a
        className="syt-ic"
        href={youtubeMusicUrl(candidate.videoId)}
        target="_blank"
        rel="noreferrer"
        title="Open on YouTube Music"
      >
        <Icon.external />
      </a>
    </div>
  );
}
