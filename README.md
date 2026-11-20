# SpottoYT

Local-first app for converting Spotify playlists into reviewed YouTube Music playlists.

## Layout

```text
apps/web                  React + Vite UI
apps/api                  Fastify API (matching, storage, import events)
apps/spicetify-extension  Spotify desktop bridge that pushes playlists to the API
apps/ytmusic-worker       Python worker using ytmusicapi
packages/shared           Shared Zod schemas and types
packages/ui               shadcn-style components and Tailwind theme
```

## Setup

```bash
bun install
cp .env.example .env

# YouTube Music worker
python -m venv apps/ytmusic-worker/.venv
apps/ytmusic-worker/.venv/bin/pip install -r apps/ytmusic-worker/requirements.txt

bun run dev
```

The API picks up the worker's `.venv` automatically and falls back to `python` on the PATH.

## Spotify import

Build the extension and install it into Spicetify:

```bash
bun run build:spicetify
cp apps/spicetify-extension/dist/spottoyt.js ~/.config/spicetify/Extensions/
spicetify config extensions spottoyt.js
spicetify apply
```

In Spotify desktop, right-click a playlist and choose **Extract to SpottoYT**. The extension posts the playlist's metadata (no credentials) to `http://127.0.0.1:4317/imports/spicetify`, and the web app picks it up over `/events`.

If the API runs on another port, set it from Spotify DevTools:

```js
Spicetify.LocalStorage.set("spottoyt-api-url", "http://127.0.0.1:4317")
```
