// The context menu (extension) hands a playlist URI to the app through
// localStorage, since the app may not be mounted yet when it's clicked.
export const PENDING_PLAYLIST_KEY = "spottoyt:pending-playlist";
export const PENDING_PLAYLIST_EVENT = "spottoyt:pending-playlist";

export function takePendingPlaylist() {
  const uri = localStorage.getItem(PENDING_PLAYLIST_KEY);
  if (uri) localStorage.removeItem(PENDING_PLAYLIST_KEY);
  return uri;
}
