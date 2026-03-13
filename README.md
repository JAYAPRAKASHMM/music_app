# Infinity Player

Infinity Player is a local music-streaming app that takes a YouTube or YouTube Music URL, extracts the best available audio with `yt-dlp`, transcodes it to MP3 with `ffmpeg`, and streams it directly to a browser audio player without writing media files to disk.

## What Was Improved

- Split the backend into focused modules: config, routes, validation, and streaming service.
- Split the frontend into separate HTML, CSS, and JavaScript assets.
- Added request validation for supported hosts and bitrate values.
- Added a health endpoint for smoke checks and local diagnostics.
- Simplified root scripts so the whole project can be run from the repository root.

## Project Structure

```text
MusicPlayer/
|- client/
|  |- assets/
|  |  |- app.js
|  |  `- styles.css
|  `- index.html
|- context/
|- server/
|  |- src/
|  |  |- config/
|  |  |- routes/
|  |  |- services/
|  |  |- utils/
|  |  |- app.js
|  |  `- index.js
|  |- index.js
|  |- package.json
|  `- package-lock.json
|- ARCHITECTURE_HOTPATH.md
|- package.json
`- README.md
```

## Runtime Flow

1. The browser submits a YouTube URL and bitrate.
2. The frontend requests `/api/stream`.
3. The Express server validates the input and starts a streaming pipeline.
4. `yt-dlp` pulls the best source audio to stdout.
5. `ffmpeg` converts that audio to MP3 in-memory.
6. Express streams the MP3 response back to the browser.

## Prerequisites

- Node.js 18+ recommended
- Windows is the currently validated environment for this repo
- Internet access for `yt-dlp` to fetch YouTube audio sources

## Install

From the repository root:

```bash
npm run install:server
```

This installs backend dependencies inside [`server/package.json`](/D:/company/MusicPlayer/server/package.json).

## Run The Project

Start the server from the repository root:

```bash
npm start
```

Then open:

```text
http://localhost:3001
```

The Express server serves both the API and the static frontend, so you do not need a separate client server.

## Available Scripts

At the repo root in [`package.json`](/D:/company/MusicPlayer/package.json):

- `npm run install:server` installs backend dependencies
- `npm start` starts the application on port `3001`
- `npm run start:server` starts only the backend entrypoint
- `npm run dev` runs the same server entrypoint for local development

## API Endpoints

- `GET /api/health` returns server status metadata
- `GET /api/stream?url=<youtube-url>&quality=<bitrate>` streams MP3 audio

Supported `quality` values:

- `64k`
- `96k`
- `128k`
- `192k`
- `256k`
- `320k`

## Example Stream Request

```text
http://localhost:3001/api/stream?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DsdeaVlqsqGM&quality=128k
```

## Recommended Next Improvements

1. Add automated tests for URL validation and stream route error handling.
2. Introduce structured logging for child-process failures and request timing.
3. Add a metadata endpoint so the UI can show title, duration, and thumbnail before playback.
4. Add queue/history support only after the API contract is stable.

## Notes

- Media is streamed through memory pipes; songs are not stored as files by the app.
- If playback fails, check the server terminal first because most failures come from invalid URLs, unavailable videos, or `yt-dlp` extraction issues.
- The architecture details for the streaming hot path are documented in [`ARCHITECTURE_HOTPATH.md`](/D:/company/MusicPlayer/ARCHITECTURE_HOTPATH.md).
"# music_app" 
