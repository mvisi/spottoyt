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

### YouTube Music sign-in

```bash
bun run setup:youtube
```

It asks for your YouTube Music cookie (open music.youtube.com signed in, DevTools → Network, any `youtubei` request, copy the `cookie` request header), checks that it signs in, and saves it to `~/.config/spottoyt/youtube-cookie`. Run it again whenever the cookie expires.

### Unsupported regions

YouTube Music returns no songs or videos to IPs in countries where it isn't available. To route only the helper through a VPN, run a WireGuard config (Proton and most providers offer them) as a local proxy with [wireproxy](https://github.com/windtf/wireproxy):

```ini
# ~/.config/spottoyt/wireproxy.conf
WGConfig = /home/you/.config/spottoyt/proton-us.conf

[http]
BindAddress = 127.0.0.1:25345
```

```bash
bun run vpn   # same as: wireproxy -s -c ~/.config/spottoyt/wireproxy.conf
```

Then set `HTTPS_PROXY=http://127.0.0.1:25345` in `.env`. The helper and `setup:youtube` pick it up.

## Syncing

Creating a playlist on YouTube Music links it to the Spotify one. The Library tab lists linked playlists and how many new Spotify tracks each has. Opening one shows only what's new, and **Add to YouTube Music** appends the accepted tracks.

Syncing only ever adds. Nothing is removed from the YouTube playlist, and the Spotify playlist is never changed. Songs you added on YouTube yourself are listed as "only on YouTube Music" so you can add them to Spotify by hand, and tracks you removed on YouTube aren't added back.

## Development

```bash
bun run dev            # wireproxy, helper on :4317, plus a watch build copied into Spicetify
spicetify watch -a     # in another terminal: reloads Spotify when the app changes
```

The helper logs to `~/.local/state/spottoyt/helper.log` (moved to `helper.log.1` past 5 MB). Include it when reporting a problem.

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
