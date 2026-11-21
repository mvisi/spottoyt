import type { YoutubeTrack } from "@spottoyt/shared";
import { createContext, type ReactNode, useContext, useState } from "react";
import { youtubeMusicUrl } from "../helper";
import { Icon } from "../ui";

const PreviewContext = createContext<(track: YoutubeTrack) => void>(() => {});

/**
 * A small floating YouTube player for hearing a candidate without leaving
 * Spotify. YouTube decides availability by IP, so in regions where YouTube
 * Music is blocked it needs the full VPN on.
 */
export function PreviewProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<YoutubeTrack | null>(null);

  const play = (next: YoutubeTrack) => {
    void Spicetify.Player.pause();
    setTrack(next);
  };

  return (
    <PreviewContext.Provider value={play}>
      {children}
      {track && (
        <div className="syt-player">
          <div className="syt-player-head">
            <div className="syt-t-txt">
              <div className="syt-t-title">{track.title}</div>
              <div className="syt-t-sub">{track.artists.join(", ")}</div>
            </div>
            <a
              className="syt-ic"
              href={youtubeMusicUrl(track.videoId)}
              target="_blank"
              rel="noreferrer"
              title="Open on YouTube Music"
            >
              <Icon.external />
            </a>
            <button
              type="button"
              className="syt-ic"
              title="Close"
              onClick={() => setTrack(null)}
            >
              <Icon.close />
            </button>
          </div>
          <iframe
            key={track.videoId}
            title="YouTube preview"
            src={`https://www.youtube.com/embed/${track.videoId}?autoplay=1&rel=0`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
          <div className="syt-player-note">
            Not playing? YouTube may be blocking your region. Turn on the VPN.
          </div>
        </div>
      )}
    </PreviewContext.Provider>
  );
}

export function PreviewButton({ track }: { track: YoutubeTrack }) {
  const play = useContext(PreviewContext);
  return (
    <button
      type="button"
      className="syt-ic"
      title="Preview here"
      onClick={(e) => {
        e.stopPropagation();
        play(track);
      }}
    >
      <Icon.play />
    </button>
  );
}
