# Download Flow Plan

## Current state

Search and playback are the active, working paths now:

- Android search uses the YouTube Data API directly from `client/assets/app.js`.
- Android playback uses `LocalBackendPlugin.getStreamUrl(...)` plus `NewPipeExtractor`.
- Web playback/download still use the existing Node routes (`/api/stream` and `/api/download`).

## Old implementations identified from the docs

The Markdown docs describe earlier Android plans that are no longer the live architecture:

- `android-local-backend-plan.md` assumes native `yt-dlp` and optional native `ffmpeg` execution on-device.
- `phase8-diff.md` proposes packaging `yt-dlp` as `libytdlp.so` and executing it directly.
- `phase5-diff.md` and related phase notes are centered on debugging native `yt-dlp` execution.

These are now obsolete for playback because the app has already moved to `NewPipeExtractor`.

## Cleanup already applied

- Removed debug-heavy playback logs from `client/assets/app.js`.
- Removed the old `initYoutubeDL()` startup stub/toast flow from the client and plugin.
- Kept the current working search and playback behavior unchanged.

## Download implementation direction

### Android

Use the same extraction path as playback:

1. `downloadSelectedVideo()` calls `LocalBackendPlugin.download(...)`.
2. `LocalBackendPlugin.download(...)` resolves the preferred direct audio stream using `NewPipeExtractor`.
3. The plugin hands that direct URL to Android `DownloadManager`.
4. The file is saved into the public Downloads directory with a sanitized filename.

Why this direction:

- It matches the current working playback stack.
- It avoids reviving the old `yt-dlp` execution path.
- It keeps the server optional for Android instead of making downloads depend on the Node backend.

### Web / desktop

Keep the existing `/api/download` route as-is.

That path still makes sense for browser usage because the server can transcode and stream an MP3 attachment.

## Remaining verification checklist

1. Test download on a physical Android device.
2. Confirm the file appears in the Downloads app and plays back correctly.
3. Verify at least one M4A-backed track and one WebM-backed track.
4. Confirm that playback still works after the cleanup.
5. If devices below Android 10 must be supported, add and test legacy storage permission handling.

## Known limitation

Native Android download now saves the original resolved audio container (`.m4a`, `.webm`, etc.), not a transcoded MP3.

That is intentional for now because the old on-device transcoding plan was the broken architecture described in the earlier docs.

## If native download needs MP3 later

Do it as a separate phase, not as part of this cleanup:

1. Add a maintained backend-assisted download endpoint for Android, or
2. Add a dedicated native transcoding pipeline with explicit storage and background-job handling.

The second option is much more complex and should not be mixed into the current playback cleanup.
