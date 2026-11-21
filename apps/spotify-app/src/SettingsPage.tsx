import type { Settings } from "@spottoyt/shared";
import { useEffect, useState } from "react";
import { helper, helperUrl } from "./helper";
import { ProblemBanner } from "./Problem";
import type { ConnectionState } from "./status";
import { notify } from "./ui";

export function SettingsPage({ connection }: { connection: ConnectionState }) {
  const { helperOnline, youtube, checking, refresh } = connection;

  return (
    <>
      <section className="syt-section">
        <h2 className="syt-h2">Connection</h2>
        <div className="syt-panel">
          <Row
            label="Helper"
            value={helperOnline ? `Running at ${helperUrl()}` : "Not running"}
            ok={!!helperOnline}
          />
          {youtube?.vpn && (
            <Row
              label="VPN tunnel"
              value={youtube.vpn === "up" ? "Running" : "Not running"}
              ok={youtube.vpn === "up"}
            />
          )}
          <Row
            label="YouTube Music account"
            value={
              !youtube || youtube.vpn === "down"
                ? "Unknown"
                : !youtube.configured
                  ? "Not set up"
                  : youtube.signedIn
                    ? "Signed in"
                    : "Sign-in expired"
            }
            ok={!!youtube?.signedIn}
          />
          <Row
            label="YouTube Music search"
            value={
              !youtube || youtube.vpn === "down"
                ? "Unknown"
                : youtube.searchAvailable
                  ? "Available"
                  : "Returns no songs"
            }
            ok={!!youtube?.searchAvailable}
          />
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
        <ProblemBanner connection={connection} full />
      </section>
      {helperOnline && <MatchingSettings />}
    </>
  );
}

function MatchingSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  // The slider moves freely; it's saved when you let go.
  const [score, setScore] = useState(90);

  useEffect(() => {
    helper.settings().then(
      (s) => {
        setSettings(s);
        setScore(s.autoAcceptScore);
      },
      () => {},
    );
  }, []);

  const save = async (patch: Partial<Settings>) => {
    try {
      const next = await helper.updateSettings(patch);
      setSettings(next);
      setScore(next.autoAcceptScore);
    } catch (e) {
      notify(`Couldn't save the setting: ${(e as Error).message}`, true);
    }
  };

  if (!settings) return null;
  const saveScore = () => {
    if (score !== settings.autoAcceptScore)
      void save({ autoAcceptScore: score });
  };

  return (
    <section className="syt-section">
      <h2 className="syt-h2">Matching</h2>
      <div className="syt-panel">
        <label className="syt-setting">
          <div>
            <div className="syt-strong">Auto-accept score</div>
            <div className="syt-muted small">
              Matches scoring this or higher are accepted without asking you.
              Lower means less reviewing but more wrong versions slipping
              through. 90 is the default.
            </div>
          </div>
          <div className="syt-range">
            <input
              type="range"
              min={70}
              max={100}
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              onPointerUp={saveScore}
              onKeyUp={saveScore}
              onBlur={saveScore}
            />
            <b>{score}</b>
          </div>
        </label>
        <label className="syt-setting">
          <div>
            <div className="syt-strong">Use music videos</div>
            <div className="syt-muted small">
              Search videos too when no song version matches well. Some tracks
              only exist on YouTube as the artist's video.
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.includeVideos}
            onChange={(e) => save({ includeVideos: e.target.checked })}
          />
        </label>
        <p className="syt-muted small">
          Changes apply the next time you open a playlist.
        </p>
      </div>
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
