# Agent Instructions

SpottoYT converts Spotify playlists into reviewed YouTube Music playlists. It's a personal, local-only tool with two parts:

- `apps/spotify-app`: a Spicetify custom app (React, rendered inside Spotify desktop). It reads playlists through Spicetify and owns all UI.
- `apps/helper`: a Bun server on 127.0.0.1 that talks to YouTube Music and stores matches and linked playlists in SQLite.
- `packages/shared`: the HTTP contract between them.

The project is early. Propose simplifications or rewrites when they make the code easier to maintain, rather than building on top of what's there.

- The Spotify app uses Spotify's own React 18 (`Spicetify.React`), not a bundled copy. `scripts/build.ts` redirects `react` imports to it, so only use React 18 APIs.
- Spicetify relies on Spotify internals that can change on update. Keep Spicetify calls in a few small modules and add types to `src/spicetify.d.ts` as needed.
- YouTube Music credentials and calls stay in the helper, and only `apps/helper/src/youtube.ts` imports youtubei.js. Patch library bugs there (its playlist delete is broken in 18.3.0, so call `/playlist/delete` directly). The Spotify app only talks to the helper.
- YouTube Music hides songs from IPs in unsupported regions. The user's machine is in one, so live YouTube tests need `HTTPS_PROXY=http://127.0.0.1:25345` with wireproxy running (see README).
- The helper logs requests, slow or failed YouTube calls, and match job results to `~/.local/state/spottoyt/helper.log` (`src/log.ts`). When the user reports a helper error, read that file first.
- Use `bun test` for tests. Run `bun run typecheck` while working and `bun run lint` before finishing.
