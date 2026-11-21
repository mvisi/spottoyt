import { useState } from "react";

/** Cover art. Falls back to a blank square if the image fails to load. */
export function Art({
  src,
  size,
  wide,
  youtube,
}: {
  src?: string;
  size?: number;
  wide?: boolean;
  youtube?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`syt-art${wide ? " wide" : ""}${youtube ? " yt" : ""}`}
      style={size && !wide ? { width: size, height: size } : undefined}
    >
      {src && !failed && (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

const svg = (paths: string[], filled = false) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill={filled ? "currentColor" : "none"}
    stroke={filled ? "none" : "currentColor"}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths.map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
);

export const Icon = {
  check: () => svg(["M20 6 9 17l-5-5"]),
  skip: () =>
    svg(["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "m5.7 5.7 12.6 12.6"]),
  chevron: (open: boolean) => svg([open ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"]),
  back: () => svg(["m15 18-6-6 6-6"]),
  play: () => svg(["M7 4v16l13-8z"], true),
  external: () =>
    svg([
      "M15 3h6v6",
      "M10 14 21 3",
      "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
    ]),
  search: () => svg(["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "m21 21-4.3-4.3"]),
  retry: () => svg(["M21 12a9 9 0 1 1-3-6.7L21 8", "M21 3v5h-5"]),
  close: () => svg(["M18 6 6 18", "m6 6 12 12"]),
  link: () =>
    svg([
      "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7",
      "M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
    ]),
};

export function formatDuration(ms?: number) {
  if (!ms) return "–";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "just now", "5 min ago", "3 days ago", or a date past a month. */
export function formatAgo(iso?: string) {
  if (!iso) return "never";
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  const ago = (n: number, unit: string) =>
    `${Math.floor(n)} ${unit}${Math.floor(n) === 1 ? "" : "s"} ago`;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return ago(seconds / 3600, "hour");
  if (seconds < 30 * 86400) return ago(seconds / 86400, "day");
  return new Date(iso).toLocaleDateString();
}

export function notify(message: string, isError = false) {
  Spicetify.showNotification(message, isError, 3000);
}
