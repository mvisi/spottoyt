# Agent Instructions

SpottoYT converts Spotify playlists into reviewed YouTube Music playlists. It's a personal, local-only tool with two parts:

- `apps/spotify-app`: a Spicetify custom app (React, rendered inside Spotify desktop). It reads playlists through Spicetify and owns all UI.
- `apps/helper`: a Bun server on 127.0.0.1 that talks to YouTube Music and stores matches and linked playlists in SQLite.
- `packages/shared`: the HTTP contract between them.

The project is early. Propose simplifications or rewrites when they make the code easier to maintain, rather than building on top of what's there.

- The Spotify app uses Spotify's own React 18 (`Spicetify.React`), not a bundled copy. `scripts/build.ts` redirects `react` imports to it, so only use React 18 APIs.
- Spicetify relies on Spotify internals that can change on update. Keep Spicetify calls in a few small modules and add types to `src/spicetify.d.ts` as needed.
- YouTube Music credentials and calls stay in the helper. The Spotify app only talks to the helper.
- Use `bun test` for tests. Run `bun run typecheck` while working and `bun run lint` before finishing.
