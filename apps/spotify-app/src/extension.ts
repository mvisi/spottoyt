// Runs at Spotify startup: adds "Convert with SpottoYT" to playlist menus.
import { PENDING_PLAYLIST_EVENT, PENDING_PLAYLIST_KEY } from "./pending";

function register() {
  if (
    !Spicetify.ContextMenu ||
    !Spicetify.URI ||
    !Spicetify.Platform?.History
  ) {
    setTimeout(register, 300);
    return;
  }

  const isPlaylist = (uris: string[]) => {
    const uri = uris.length === 1 ? uris[0] : undefined;
    if (!uri) return false;
    const { type } = Spicetify.URI.fromString(uri);
    return (
      type === Spicetify.URI.Type.PLAYLIST ||
      type === Spicetify.URI.Type.PLAYLIST_V2
    );
  };

  new Spicetify.ContextMenu.Item(
    "Convert with SpottoYT",
    ([uri]) => {
      if (!uri) return;
      localStorage.setItem(PENDING_PLAYLIST_KEY, uri);
      window.dispatchEvent(new Event(PENDING_PLAYLIST_EVENT));
      Spicetify.Platform.History.push("/spottoyt");
    },
    isPlaylist,
    "playlist",
  ).register();
}

register();
