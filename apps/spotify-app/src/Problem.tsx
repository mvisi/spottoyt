import { type ConnectionState, fixFor } from "./status";

/** The current connection problem and how to fix it. Nothing when all's well. */
export function ProblemBanner({
  connection,
  full,
}: {
  connection: ConnectionState;
  /** The bigger panel, for the Settings page. */
  full?: boolean;
}) {
  const fix = fixFor(connection);
  if (!fix) return null;
  return (
    <div className={full ? "syt-panel" : "syt-banner bad syt-problem"}>
      <div className="syt-problem-text">
        <div className="syt-strong">{fix.title}</div>
        <div className="syt-muted small">{fix.detail}</div>
      </div>
      {fix.command && <pre className="syt-code">{fix.command}</pre>}
      {connection.helperOnline && (
        <button
          type="button"
          className="syt-ghost"
          disabled={connection.checking}
          onClick={connection.refresh}
        >
          {connection.checking ? "Checking…" : "Check again"}
        </button>
      )}
    </div>
  );
}
