# Monify App Overview For New Agents

## What this web app is

Monify is a lightweight music web app that lets a user search for songs, pick a result, and then either:

- stream the audio in the browser, or
- download the same audio as an MP3 file.

The media source is YouTube or YouTube Music. The app does not store songs as files during normal playback. Instead, the server pulls audio from YouTube on demand with `yt-dlp`, pipes it through `ffmpeg`, transcodes it to MP3, and streams the bytes directly to the browser.

In practical terms, this is not a full music platform with user accounts, playlists, databases, or persistent media storage. It is a single-process Node.js web app that wraps YouTube search + extraction behind a custom UI.

## High-level architecture

The app is separated logically into frontend and backend, but both are served by the same Node.js application.

- Frontend: static files in `client/`
- Backend: Express server in `server/src/`
- Hosting model: one Node process serves both the API and the static frontend

So the app is not split into separate deployable frontend and backend services. It is one combined web application with a clear client/server boundary inside the same repository and runtime.

## Repository layout

```text
MusicPlayer/
|- client/
|  |- index.html
|  `- assets/
|     |- app.js
|     |- config.js
|     |- styles.css
|     |- logo.svg
|     `- disk.svg
|- server/
|  |- package.json
|  |- package-lock.json
|  |- index.js
|  `- src/
|     |- index.js
|     |- app.js
|     |- config/
|     |- routes/
|     |- services/
|     `- utils/
|- context/
|- .env.example
|- Dockerfile
|- README.md
|- ARCHITECTURE_HOTPATH.md
`- package.json
```

## Runtime model

### Single-server model

The backend Express app serves:

- static assets from `client/`
- JSON API routes under `/api`
- the SPA-like fallback route `* -> client/index.html`

That means:

- the browser downloads the frontend directly from the same server
- the frontend calls the same origin for API requests
- there is no separate API host configured in code

The frontend builds API URLs from `window.location.protocol` and `window.location.host`, so it assumes the UI and API live on the same origin.

## Frontend technical details

### Technology choices

The frontend uses:

- plain HTML in [client/index.html](D:\company\MusicPlayer\client\index.html)
- plain CSS in [client/assets/styles.css](D:\company\MusicPlayer\client\assets\styles.css)
- plain browser JavaScript in [client/assets/app.js](D:\company\MusicPlayer\client\assets\app.js)
- a small global config object in [client/assets/config.js](D:\company\MusicPlayer\client\assets\config.js)
- Lucide icons loaded from a CDN
- Google Fonts (`Space Grotesk`) loaded from a CDN

There is no React, Vue, Angular, TypeScript, Vite, Webpack, Babel, Redux, or frontend test framework.

### Frontend structure

`index.html` contains two main views:

- `#player-view`: the default player UI
- `#search-view`: the search UI

The app switches between these by adding/removing the `.hidden` class. It is a manual view toggle, not a router-based SPA.

Key UI elements:

- search button
- player card
- audio quality selector
- vinyl-style artwork display
- playback controls
- search form and results list
- hidden `<audio>` element used for actual playback

### Frontend state management

All frontend state lives in one in-memory `state` object in `client/assets/app.js`.

Important state fields:

- `isPlaying`
- `isLoading`
- `selectedVideo`
- `searchResults`
- `trendingResults`
- `recentlyPlayed`
- `cache`
- `metadataCache`
- `activeQueryLabel`
- `progressLocked`

This is fully manual state management with direct DOM updates. There is no state library.

### Frontend persistence

The frontend uses `localStorage` for two things:

- `monify_recent`: recently played songs
- `monify_trending` and `monify_trending_time`: cached trending results

Trending cache TTL on the client is 2 hours.

### Frontend behavior flow

On initial load:

1. Lucide icons are initialized.
2. A default song from `window.MONIFY_CONFIG.defaultSong` is selected into UI state.
3. The app preloads trending search results in the background using the query `"tamil trending songs"`.
4. Playback does not start automatically.

When searching:

1. The user opens the search view.
2. The frontend either shows cached trending results or requests `/api/search?q=...`.
3. Clicking a result calls `selectVideo(...)` and then `startPlayback()`.

When playing:

1. The frontend builds `/api/stream?url=...&quality=...`.
2. It assigns that URL to the hidden `<audio>` element’s `src`.
3. The browser streams MP3 bytes from the backend.

When downloading:

1. The frontend builds `/api/download?...`.
2. It creates a temporary `<a>` element and clicks it.
3. The browser downloads the streamed MP3 as an attachment.

### Frontend metadata resolution

Search results already include metadata from the backend, but `selectVideo()` still calls `/api/resolve?url=...` if title/channel/thumbnail data is incomplete.

This endpoint uses YouTube oEmbed, not the YouTube Data API.

### Frontend audio control details

The `<audio>` element is the real playback engine.

The frontend listens for:

- `loadedmetadata`
- `timeupdate`
- `playing`
- `pause`
- `error`
- `ended`

Progress bar seeking is implemented by setting `audio.currentTime`.

One important behavior is in `stopPlayback()`:

- it pauses the audio
- removes the `src`
- calls `audio.load()`

This is intentionally done to force the browser to close the stream and avoid orphaned backend transcoding processes.

## Backend technical details

### Technology choices

The backend uses:

- Node.js
- Express 4
- `cors`
- `ffmpeg-static`
- `youtube-dl-exec` for bundling/accessing `yt-dlp`
- native `fetch` from modern Node runtime
- child processes via `spawn()`

There is no database, ORM, Redis, queue worker, job scheduler, authentication layer, or websocket service.

### Backend entry points

- [server/index.js](D:\company\MusicPlayer\server\index.js): thin shim that requires `src/index`
- [server/src/index.js](D:\company\MusicPlayer\server\src\index.js): creates the HTTP server and handles startup/shutdown
- [server/src/app.js](D:\company\MusicPlayer\server\src\app.js): builds the Express app

### Express app composition

The Express app does the following:

- enables CORS
- enables JSON body parsing
- serves static files from `client/`
- mounts API routers under `/api`
- uses a generic error handler
- sends `client/index.html` for any unmatched route

### API endpoints

The server exposes these routes:

- `GET /api/health`
- `GET /api/search?q=...`
- `GET /api/resolve?url=...`
- `GET /api/stream?url=...&quality=...`
- `GET /api/download?url=...&quality=...&title=...&duration=...`

#### `/api/health`

Returns simple health metadata:

- status
- service name
- timestamp

#### `/api/search`

Purpose:

- search YouTube videos using the YouTube Data API v3

Behavior:

- requires query parameter `q`
- auto-appends `" song"` unless the query already ends with `song` or `songs`
- calls `searchVideos(query)` from `youtube-search.service.js`

Search implementation details:

1. Calls YouTube `/search` API for up to 50 videos.
2. Extracts video IDs.
3. Calls YouTube `/videos` API for `contentDetails,snippet`.
4. Converts ISO 8601 durations to seconds.
5. Filters out:
   - videos under 60 seconds
   - videos 6 minutes or longer
   - titles containing `#shorts`
6. Returns up to 50 filtered results.

Returned result shape:

- `id`
- `title`
- `channelTitle`
- `thumbnail`
- `url`
- `durationSeconds`

#### `/api/resolve`

Purpose:

- fetch lightweight metadata for a YouTube URL

Implementation:

- uses `https://www.youtube.com/oembed`
- returns:
  - `title`
  - `channelTitle`
  - `thumbnail`

This route does not use `yt-dlp`.

#### `/api/stream`

Purpose:

- stream a YouTube audio source as live MP3 bytes

Validation:

- `url` is required
- URL must belong to allowed YouTube hosts
- `quality` must be one of:
  - `64k`
  - `96k`
  - `128k`
  - `192k`
  - `256k`
  - `320k`

Operational behavior:

1. Acquire a stream slot from the in-memory concurrency limiter.
2. Set response headers:
   - `Content-Type: audio/mpeg`
   - `Cache-Control: no-store`
3. Create a streaming pipeline.
4. Pipe FFmpeg stdout directly into the HTTP response.
5. On request close, response close, child-process error, or process exit, clean everything up and release the concurrency slot.

#### `/api/download`

Same pipeline as `/api/stream`, but adds:

- `Content-Disposition: attachment; filename="...mp3"`

It also blocks downloads longer than 420 seconds (7 minutes) when duration is supplied.

The frontend also enforces the same 7-minute download restriction before making the request.

## Streaming pipeline internals

The streaming core lives in [server/src/services/streaming.service.js](D:\company\MusicPlayer\server\src\services\streaming.service.js).

### Pipeline steps

1. Spawn `yt-dlp` with output directed to stdout.
2. Spawn `ffmpeg` and read input from `pipe:0`.
3. Pipe `yt-dlp.stdout -> ffmpeg.stdin`.
4. Pipe `ffmpeg.stdout -> HTTP response`.

`yt-dlp` command behavior:

- format: `bestaudio`
- output: stdout
- quiet/no warnings

`ffmpeg` command behavior:

- input from stdin
- output format `mp3`
- bitrate controlled by selected quality
- no video output
- output to stdout

### Cleanup behavior

Cleanup is explicit and important:

- unpipe `yt-dlp.stdout` from `ffmpeg.stdin`
- destroy `ffmpeg` stdio streams
- kill both child processes if still alive

This cleanup is triggered from multiple events so aborted playback does not keep transcoding in the background.

## Search subsystem

The search logic lives in [server/src/services/youtube-search.service.js](D:\company\MusicPlayer\server\src\services\youtube-search.service.js).

### External dependency

The app relies on the YouTube Data API v3 for search.

Required credential:

- `YOUTUBE_DATA_API_KEY`

Fallback is supported through the `api.apikey` file in the repository root, but `.env` is the intended configuration path.

### Search caching

Server-side search caching uses a custom in-memory TTL + LRU cache:

- class: `TimedLruCache`
- default TTL: 5 minutes
- default max entries: 100

The search service also deduplicates concurrent identical searches with `inFlightSearches`, so if multiple requests for the same query arrive at once, only one upstream YouTube request chain is executed.

## Concurrency control

Streaming concurrency is managed in [server/src/services/stream-capacity.service.js](D:\company\MusicPlayer\server\src\services\stream-capacity.service.js).

Characteristics:

- in-memory only
- process-local only
- default max concurrent streams: `2`
- no distributed coordination

If capacity is full, `/api/stream` and `/api/download` return HTTP `503` with a capacity snapshot.

This means the app is intentionally conservative about CPU usage, because MP3 transcoding is expensive relative to the size of the app.

## Configuration system

The backend loads `.env` manually via [server/src/config/load-env.js](D:\company\MusicPlayer\server\src\config\load-env.js). It does not use the `dotenv` package.

Supported environment variables from `.env.example`:

- `HOST`
- `PORT`
- `PORT_FALLBACK_RANGE`
- `DEFAULT_AUDIO_QUALITY`
- `SEARCH_CACHE_TTL_MS`
- `SEARCH_CACHE_MAX_ENTRIES`
- `MAX_CONCURRENT_STREAMS`
- `YOUTUBE_DATA_API_KEY`

Resolved runtime config is centralized in [server/src/config/env.js](D:\company\MusicPlayer\server\src\config\env.js).

Notable defaults:

- port `3001`
- fallback port scan range `10`
- default quality `128k`
- max concurrent streams `2`

### Binary resolution

Binary resolution is centralized in [server/src/config/binaries.js](D:\company\MusicPlayer\server\src\config\binaries.js).

- `ffmpeg` path comes from `ffmpeg-static`
- `yt-dlp` path is resolved from the `youtube-dl-exec` package contents

In Docker, the image also installs system `ffmpeg` and downloads a `yt-dlp` binary, but the Node app itself primarily resolves binaries through the npm packages.

## Deployment and startup

### Local startup

Root scripts in [package.json](D:\company\MusicPlayer\package.json):

- `npm run install:server`
- `npm start`
- `npm run start:server`
- `npm run dev`

The root app entry starts `server/src/index.js`.

### Server startup logic

`server/src/index.js`:

- creates an HTTP server from the Express app
- tries `PORT`, then increments until a free port is found
- logs the final local URL
- handles `SIGINT`, `SIGTERM`, `unhandledRejection`, and `uncaughtException`

This is a simple but useful developer-friendly startup flow.

### Docker

[Dockerfile](D:\company\MusicPlayer\Dockerfile) uses:

- `node:18-bullseye-slim`
- installs `ffmpeg`, `curl`, and `python3`
- downloads latest `yt-dlp`
- installs server dependencies
- copies full repo
- exposes port `3001`

The Docker image assumes a single-container deployment running the same combined frontend/backend server.

## Data storage model

There is no traditional persistent data layer.

What exists:

- client-side `localStorage` for recents and trending cache
- server-side in-memory search cache
- server-side in-memory active stream counter

What does not exist:

- SQL database
- NoSQL database
- filesystem media library
- user auth/session store
- object storage

If the server restarts, all backend memory state is lost. If the browser storage is cleared, recents/trending cache are lost.

## Separation of frontend and backend

Short answer:

- yes, the code is separated into frontend and backend directories
- no, they are not separate deployed applications
- both are part of the same web app and are served by the same Node server

A new agent should think of this as:

- a monorepo-style single app
- static frontend + API backend
- one runtime, one deployment unit

## External services and dependencies

The app depends on these outside systems:

- YouTube Data API v3 for search
- YouTube oEmbed endpoint for lightweight metadata resolution
- YouTube media delivery for actual audio source extraction
- `yt-dlp` for extraction
- `ffmpeg` for transcoding
- Lucide CDN for icons
- Google Fonts CDN for typography

Without the YouTube API key, search will fail. Without working `yt-dlp`/`ffmpeg`, streaming and downloads will fail.

## Current limitations and engineering tradeoffs

### Strengths

- very small codebase
- easy to run locally
- no build step for frontend
- clear route/service separation on the backend
- explicit cleanup for streaming child processes
- conservative concurrency limit to avoid overload

### Limitations

- no automated tests in the repository
- no TypeScript
- no linting or formatting pipeline visible at the root
- no authentication or authorization
- no persistent queue/playlist system
- no database-backed history
- no distributed scaling model
- search quality depends on YouTube API responses and quota
- streaming reliability depends on `yt-dlp` and upstream YouTube behavior

### Important operational caveat

This app does live transcoding per active stream. That is CPU-heavy compared to typical static web apps. Capacity is intentionally capped, and any future feature work should respect that constraint.

## How a new agent should reason about the app

If you are modifying this project, mentally model it as three layers:

1. Browser UI layer
   - manual DOM rendering
   - local state object
   - `<audio>` tag playback

2. Express orchestration layer
   - validation
   - routing
   - static file serving
   - stream lifecycle cleanup
   - concurrency gating

3. Media/search integration layer
   - YouTube Data API for search metadata
   - YouTube oEmbed for lightweight metadata
   - `yt-dlp` for audio extraction
   - `ffmpeg` for MP3 transcoding

Most app behavior can be understood by following this path:

`user action in browser -> frontend state update -> /api request -> backend service -> external YouTube/binary integration -> response stream -> browser audio/download behavior`

## Most important source files

- [client/index.html](D:\company\MusicPlayer\client\index.html)
- [client/assets/app.js](D:\company\MusicPlayer\client\assets\app.js)
- [client/assets/styles.css](D:\company\MusicPlayer\client\assets\styles.css)
- [server/src/app.js](D:\company\MusicPlayer\server\src\app.js)
- [server/src/index.js](D:\company\MusicPlayer\server\src\index.js)
- [server/src/routes/search.routes.js](D:\company\MusicPlayer\server\src\routes\search.routes.js)
- [server/src/routes/resolve.routes.js](D:\company\MusicPlayer\server\src\routes\resolve.routes.js)
- [server/src/routes/stream.routes.js](D:\company\MusicPlayer\server\src\routes\stream.routes.js)
- [server/src/services/youtube-search.service.js](D:\company\MusicPlayer\server\src\services\youtube-search.service.js)
- [server/src/services/streaming.service.js](D:\company\MusicPlayer\server\src\services\streaming.service.js)
- [server/src/services/stream-capacity.service.js](D:\company\MusicPlayer\server\src\services\stream-capacity.service.js)
- [server/src/config/env.js](D:\company\MusicPlayer\server\src\config\env.js)
- [server/src/config/binaries.js](D:\company\MusicPlayer\server\src\config\binaries.js)

## Final summary

Monify is a single-process Node.js music web app with:

- a static vanilla-JS frontend
- an Express backend
- YouTube API search
- live YouTube audio extraction through `yt-dlp`
- live MP3 transcoding through `ffmpeg`
- no database
- no separate frontend deployment
- no separate backend deployment

It is clearly divided in code as frontend and backend, but operationally it is one combined application.
