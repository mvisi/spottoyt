# SpottoYT

Convert Spotify playlists into YouTube Music playlists, reviewed from inside Spotify desktop.

- `apps/spotify-app`: Spicetify custom app. All the UI lives here.
- `apps/helper`: local Bun server that talks to YouTube Music and keeps the match database.
- `packages/shared`: the contract between the two.

## Requirements

- [Bun](https://bun.sh)
- Spotify desktop with [Spicetify](https://spicetify.app) installed

## Setup

```bash
bun install
bun run link-spotify   # builds, installs into Spicetify, and runs spicetify apply
```

Spotify restarts and **SpottoYT** shows up in the sidebar. You can also right-click a playlist and pick **Convert with SpottoYT**.

## Development

```bash
bun run dev            # helper on :4317, plus a watch build copied into Spicetify
spicetify watch -a     # in another terminal: reloads Spotify when the app changes
```

```bash
bun run typecheck
bun run test
bun run lint
```

The helper reads `SPOTTOYT_PORT` and `SPOTTOYT_DATA_DIR` (see `.env.example`). If you change the port, set the app's helper URL from Spotify DevTools:

```js
Spicetify.LocalStorage.set("spottoyt:helper-url", "http://127.0.0.1:4318");
```

To uninstall: `spicetify config custom_apps spottoyt- && spicetify apply`.
