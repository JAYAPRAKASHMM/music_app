# Project Memory

## 2026-03-13

### Current Architecture

- The app is a local streaming wrapper with a static frontend in `client/` and an Express backend in `server/`.
- The server exposes `GET /api/health` and `GET /api/stream`.
- Audio flow: browser -> Express -> `yt-dlp` -> `ffmpeg` -> browser audio element.

### Changes Made

- Refactored the backend into `server/src/config`, `server/src/routes`, `server/src/services`, and `server/src/utils`.
- Split the frontend into `client/index.html`, `client/assets/styles.css`, and `client/assets/app.js`.
- Added request validation for YouTube hosts and supported bitrates.
- Added a root `README.md` with install and run instructions.
- Fixed incorrect static path resolution for `client/index.html`.
- Hardened stream cleanup to avoid server crashes when playback is stopped mid-stream.
- Added official YouTube Data API search support using the API key from `api.apikey`.
- Added a search-first UI that only shows titles for videos shorter than 6 minutes.
- Added a selected-result player view with visible quality selection, play, and download actions.
- Added in-memory TTL caching and in-flight deduplication for YouTube search queries.
- Added a stream concurrency limiter so transcoding load is capped instead of overloading the server.
- Added basic stream timing logs for start, first-byte, and shutdown reason tracking.

### Current Product Direction

- Keep the runtime simple: one Node server serving both API and frontend.
- Avoid adding heavy frontend tooling until search, metadata, and queueing requirements are stable.
- Prefer server-side wrappers for YouTube interactions instead of scraping directly from the browser.

### Recommended Next Steps

1. Add a YouTube search endpoint wrapper on the server.
2. Return lightweight metadata before playback.
3. Add automated tests around search filtering, stream validation, and process cleanup.
4. Add queue and playlist features only after search is stable.
