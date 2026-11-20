import { useEffect, useState } from "react";
import { helper } from "./helper";
import { PENDING_PLAYLIST_EVENT, takePendingPlaylist } from "./pending";

type Tab = "convert" | "library" | "settings";
const tabs: Array<[Tab, string]> = [
  ["convert", "Convert"],
  ["library", "Library"],
  ["settings", "Settings"],
];

export function App() {
  const [tab, setTab] = useState<Tab>("convert");
  const [playlistUri, setPlaylistUri] = useState<string | null>(null);
  const helperOnline = useHelperStatus();

  useEffect(() => {
    const take = () => {
      const uri = takePendingPlaylist();
      if (uri) {
        setPlaylistUri(uri);
        setTab("convert");
      }
    };
    take();
    window.addEventListener(PENDING_PLAYLIST_EVENT, take);
    return () => window.removeEventListener(PENDING_PLAYLIST_EVENT, take);
  }, []);

  return (
    <div className="syt">
      <nav className="syt-nav">
        <span className="syt-brand">SpottoYT</span>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`syt-tab${tab === id ? " on" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <span className="syt-spacer" />
        <span
          className={`syt-status${helperOnline === null ? "" : helperOnline ? " ok" : " bad"}`}
        >
          <i />
          {helperOnline === null
            ? "Checking helper…"
            : helperOnline
              ? "Helper connected"
              : "Helper not running"}
        </span>
      </nav>
      <main className="syt-pad">
        {tab === "convert" && (
          <p className="syt-sub">
            {playlistUri
              ? `Selected ${playlistUri}`
              : "Pick a playlist to convert."}
          </p>
        )}
        {tab === "library" && (
          <p className="syt-sub">Linked playlists go here.</p>
        )}
        {tab === "settings" && <p className="syt-sub">Settings go here.</p>}
      </main>
    </div>
  );
}

function useHelperStatus() {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () =>
      helper.health().then(
        () => alive && setOnline(true),
        () => alive && setOnline(false),
      );
    check();
    const timer = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return online;
}
