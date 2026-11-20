import { helperUrl } from "./helper";
import { type ConnectionState, summarize } from "./status";

export function SettingsPage({ connection }: { connection: ConnectionState }) {
  const { helperOnline, youtube, checking, refresh } = connection;
  const summary = summarize(connection);

  return (
    <section className="syt-section">
      <h2 className="syt-h2">Connection</h2>
      <div className="syt-panel">
        <Row
          label="Helper"
          value={helperOnline ? `Running at ${helperUrl()}` : "Not running"}
          ok={!!helperOnline}
        />
        <Row
          label="YouTube Music account"
          value={
            !youtube
              ? "Unknown"
              : !youtube.configured
                ? "Not set up"
                : youtube.signedIn
                  ? "Signed in"
                  : "Cookie no longer works"
          }
          ok={!!youtube?.signedIn}
        />
        <Row
          label="YouTube Music search"
          value={
            !youtube
              ? "Unknown"
              : youtube.searchAvailable
                ? "Available"
                : "Returns no songs"
          }
          ok={!!youtube?.searchAvailable}
        />
        {youtube?.error && <p className="syt-error">{youtube.error}</p>}
        <div className="syt-panel-foot">
          <button
            type="button"
            className="syt-ghost"
            disabled={!helperOnline || checking}
            onClick={refresh}
          >
            {checking ? "Checking…" : "Check again"}
          </button>
          {youtube && (
            <span className="syt-muted">
              Last checked {new Date(youtube.checkedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
      {summary.tone !== "ok" && summary.tone !== "idle" && (
        <Fix connection={connection} />
      )}
    </section>
  );
}

function Row({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="syt-kv">
      <span className="syt-muted">{label}</span>
      <span className={`syt-dot ${ok ? "ok" : "bad"}`}>
        <i />
        {value}
      </span>
    </div>
  );
}

function Fix({ connection }: { connection: ConnectionState }) {
  const { helperOnline, youtube } = connection;
  let title: string;
  let steps: string[];

  if (!helperOnline) {
    title = "Start the helper";
    steps = ["bun run dev"];
  } else if (!youtube?.configured || !youtube.signedIn) {
    title = youtube?.configured
      ? "Refresh your YouTube Music cookie"
      : "Sign in to YouTube Music";
    steps = ["bun run setup:youtube"];
  } else {
    title = "Route the helper through a VPN";
    steps = [
      "wireproxy -c ~/.config/spottoyt/wireproxy.conf",
      "# then set HTTPS_PROXY=http://127.0.0.1:25345 in .env and restart the helper",
    ];
  }

  return (
    <div className="syt-panel">
      <div className="syt-strong">{title}</div>
      <p className="syt-muted">Run in the SpottoYT repo:</p>
      <pre className="syt-code">{steps.join("\n")}</pre>
    </div>
  );
}
