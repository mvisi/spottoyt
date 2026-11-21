import { useEffect, useState } from "react";
import { APP_PATH, parse, type View } from "./nav";

/** The current view, following Spotify's back and forward buttons. */
export function useView(): View {
  const history = Spicetify.Platform.History;
  const [view, setView] = useState(() => parse(history.location));
  useEffect(
    () =>
      history.listen((location) => {
        if (location.pathname.startsWith(APP_PATH)) {
          setView(parse(location));
        }
      }),
    [history],
  );
  return view;
}
