// Which view the app shows, kept in Spotify's history so its back and
// forward buttons move between views instead of leaving the app.
// No React here: the context-menu extension imports this at Spotify startup,
// before Spicetify.React exists. The hook lives in useView.ts.

export type Tab = "convert" | "library" | "settings";

export type View = {
  tab: Tab;
  /** Spotify playlist URI being reviewed, on the Convert tab. */
  playlist?: string;
  /** Where the playlist was opened from, for the back button. */
  from?: Tab;
};

export const APP_PATH = "/spottoyt";
const TABS: Tab[] = ["convert", "library", "settings"];

/** The view in a location's query, e.g. `?tab=convert&playlist=spotify:…`. */
export function parse(location: Spicetify.Platform.Location): View {
  const q = new URLSearchParams(location.search ?? "");
  const tab = q.get("tab") as Tab;
  const from = q.get("from") as Tab;
  return {
    tab: TABS.includes(tab) ? tab : "convert",
    playlist: q.get("playlist") ?? undefined,
    from: TABS.includes(from) ? from : undefined,
  };
}

// Spotify ignores a push to the URL it's already on, so each view gets its
// own query string rather than only history state.
export function navigate(view: View) {
  const q = new URLSearchParams({ tab: view.tab });
  if (view.playlist) q.set("playlist", view.playlist);
  if (view.from) q.set("from", view.from);
  Spicetify.Platform.History.push({
    pathname: APP_PATH,
    search: `?${q}`,
  });
}
