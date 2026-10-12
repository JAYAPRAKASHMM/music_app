# Monify

Monify is a local music-streaming app that takes a YouTube or YouTube Music URL, extracts the best available audio with `yt-dlp`, transcodes it to MP3 with `ffmpeg`, and streams it directly to the browser without writing media files to disk. It also features a robust offline playback engine via Android Capacitor to play embedded high-resolution local `.mp3` and `.m4a` files.

## Project Structure

```text
MusicPlayer/
|- client/
|  |- assets/
|  |  |- app.js
|  |  |- config.js
|  |  |- disk.svg
|  |  |- logo.svg
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
|  |- package.json
|  `- package-lock.json
|- .env.example
|- ARCHITECTURE_HOTPATH.md
|- package.json
`- README.md
```

## Install

From the repository root:

```bash
npm run install:server
```

## Environment Setup

Create a local `.env` file from `.env.example` and set your real YouTube Data API key:

```bash
cp .env.example .env
```

Windows PowerShell alternative:

```powershell
Copy-Item .env.example .env
```

Required value:

- `YOUTUBE_DATA_API_KEY`

The app still supports the legacy `api.apikey` file, but `.env` is the preferred setup.

## Run

```bash
npm run dev
```

Then open the URL shown in the terminal. If port `3001` is already in use, the server automatically starts on the next available port.

## API Endpoints

- `GET /api/health`
- `GET /api/search?q=<query>`
- `GET /api/resolve?url=<youtube-url>`
- `GET /api/stream?url=<youtube-url>&quality=<bitrate>`
- `GET /api/download?url=<youtube-url>&quality=<bitrate>&title=<song-title>`

Supported quality values:

- `64k`
- `96k`
- `128k`
- `192k`
- `256k`
- `320k`

## Notes

- Media is streamed through memory pipes; songs are not stored as files by the app.
- Search results are cached server-side, and the UI preloads a small Tamil trending set for quick discovery.
- **Offline Mode:** The Android version leverages native Capacitor plugins to scan, extract ID3 format album art, and locally stream native `.mp3` and `.m4a` files directly from the device's Downloads folder without any network API dependencies.
- If playback fails, check the server terminal first because most failures come from invalid URLs, unavailable videos, missing API keys, or `yt-dlp` extraction issues.
