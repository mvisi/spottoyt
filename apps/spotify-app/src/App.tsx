import { useEffect, useState } from "react";
import { ConvertPage } from "./convert/ConvertPage";
import { PENDING_PLAYLIST_EVENT, takePendingPlaylist } from "./pending";
import { SettingsPage } from "./SettingsPage";
import { summarize, useConnection } from "./status";

type Tab = "convert" | "library" | "settings";
const tabs: Array<[Tab, string]> = [
  ["convert", "Convert"],
  ["library", "Library"],
  ["settings", "Settings"],
];

export function App() {
  const [tab, setTab] = useState<Tab>("convert");
  const [playlistUri, setPlaylistUri] = useState<string | null>(null);
  const connection = useConnection();
  const summary = summarize(connection);

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
        <button
          type="button"
          className={`syt-dot ${summary.tone}`}
          title="Connection details"
          onClick={() => setTab("settings")}
        >
          <i />
          {summary.label}
        </button>
      </nav>
      <main className="syt-pad">
        {tab === "convert" && (
          <ConvertPage
            playlistUri={playlistUri}
            onPlaylistChange={setPlaylistUri}
          />
        )}
        {tab === "library" && (
          <p className="syt-muted">Linked playlists go here.</p>
        )}
        {tab === "settings" && <SettingsPage connection={connection} />}
      </main>
    </div>
  );
}
