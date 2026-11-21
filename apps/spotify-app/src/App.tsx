import { ConvertPage } from "./convert/ConvertPage";
import { LibraryPage } from "./LibraryPage";
import { navigate, type Tab, type View } from "./nav";
import { ProblemBanner } from "./Problem";
import { SettingsPage } from "./SettingsPage";
import { summarize, useConnection } from "./status";
import { useView } from "./useView";

const tabs: Array<[Tab, string]> = [
  ["convert", "Convert"],
  ["library", "Library"],
  ["settings", "Settings"],
];

/** The last Convert view, so the Convert tab returns to the open review. */
let lastConvert: View = { tab: "convert" };

export function App() {
  const view = useView();
  const connection = useConnection();
  const summary = summarize(connection);
  if (view.tab === "convert") lastConvert = view;

  return (
    <div className="syt">
      <nav className="syt-nav">
        <span className="syt-brand">SpottoYT</span>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`syt-tab${view.tab === id ? " on" : ""}`}
            onClick={() => {
              if (id === view.tab) {
                // Clicking Convert again goes back to the playlist list.
                if (id === "convert" && view.playlist) navigate({ tab: id });
                return;
              }
              navigate(id === "convert" ? lastConvert : { tab: id });
            }}
          >
            {label}
          </button>
        ))}
        <span className="syt-spacer" />
        <button
          type="button"
          className={`syt-dot ${summary.tone}`}
          title="Connection details"
          onClick={() => navigate({ tab: "settings" })}
        >
          <i />
          {summary.label}
        </button>
      </nav>
      <main className="syt-pad">
        {view.tab !== "settings" && <ProblemBanner connection={connection} />}
        {view.tab === "convert" && (
          <ConvertPage
            playlistUri={view.playlist ?? null}
            backLabel={
              view.from === "library" ? "Back to Library" : "All playlists"
            }
            onOpen={(uri) =>
              navigate({ tab: "convert", playlist: uri, from: "convert" })
            }
            onBack={() => navigate({ tab: view.from ?? "convert" })}
          />
        )}
        {view.tab === "library" && (
          <LibraryPage
            onOpen={(uri) =>
              navigate({ tab: "convert", playlist: uri, from: "library" })
            }
          />
        )}
        {view.tab === "settings" && <SettingsPage connection={connection} />}
      </main>
    </div>
  );
}
