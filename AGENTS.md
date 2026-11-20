# Agent Instructions

SpottoYT converts Spotify playlists into reviewed YouTube Music playlists. It runs locally: a Spicetify extension pushes playlist metadata to a local API, and a Python worker talks to YouTube Music.

The project is early and being reimagined. Propose simplifications or rewrites when they make the code easier to maintain, rather than building on top of what's there.

- Keep secrets out of `apps/web`. Only `VITE_` env values that are safe to expose may reach the client, and YouTube Music auth stays on the API side.
- Call YouTube Music only from `apps/ytmusic-worker` (through the API's `YtmusicService`), never from React.
- The Spicetify extension relies on Spotify desktop internals, so keep it small and limited to sending playlist metadata. Matching, review, and storage belong in the API.
