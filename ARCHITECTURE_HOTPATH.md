# Monify Architecture And Hot Paths

This document describes the current technical architecture of the project and the runtime hot paths that matter most in daily usage.

## Tech stack

### Frontend

- Vanilla HTML, CSS, and JavaScript in `client/`
- `lucide` icons loaded from CDN
- HTML5 `<audio>` element for playback
- `localStorage` for recently played songs and trending cache persistence

### Android app shell

- Capacitor Android wrapper
- Native plugin: `LocalBackendPlugin`
- `NewPipeExtractor` for direct YouTube audio stream resolution
- Android `DownloadManager` for native downloads

### Backend

- Node.js + Express in `server/`
- YouTube Data API v3 for search and metadata
- `yt-dlp` + `ffmpeg` for web streaming and browser downloads

## Project directory

```text
MusicPlayer/
|- client/
|  |- assets/
|  |  |- app.js
|  |  |- config.js
|  |  `- styles.css
|  `- index.html
|- android/
|  `- app/src/main/java/com/monify/player/
|     |- MainActivity.java
|     `- plugins/LocalBackendPlugin.java
|- server/
|  `- src/
|     |- app.js
|     |- routes/
|     |  |- search.routes.js
|     |  `- stream.routes.js
|     |- services/
|     |  |- streaming.service.js
|     |  `- youtube-search.service.js
|     `- utils/
|- README.md
|- DOWNLOAD_FLOW_PLAN.md
`- ARCHITECTURE_HOTPATH.md
```

## Default landing flow

When the landing page loads, these actions happen immediately.

1. `index.html` loads the UI shell, `config.js`, and `app.js`.
2. `lucide.createIcons()` renders the icon placeholders.
3. `selectVideo(DEFAULT_SONG, { keepSearchOpen: true })` runs.
4. `selectVideo()` updates `state.selectedVideo`, pushes the song into `recentlyPlayed`, stores that in `localStorage`, and updates the player UI.
5. `resolveSongMetadata()` runs for the selected song.
6. If the app is running on Android with the native plugin available, metadata resolution stops there because native search already returns enough metadata.
7. If the app is running as a web app, `resolveSongMetadata()` can call `GET /api/resolve?url=...` to fill in title, channel, and thumbnail if needed.
8. `preloadTrending()` starts in the background.
9. `updateProgressUi(0)` resets the seek bar and time labels.
10. No autoplay happens by default.

### User-visible result

- The player screen opens with the default song art and metadata.
- The app is idle but ready to play.
- Trending songs begin warming in the background.

## What happens when Play is clicked

The play flow depends on whether the app is running in the browser or inside the Android Capacitor shell.

### Shared frontend flow

1. The play button triggers `togglePlayback()`.
2. If no audio source is loaded yet, `togglePlayback()` calls `startPlayback()`.
3. `startPlayback()` sets loading state and shows `Starting stream...`.
4. `startPlayback()` calls `resolveStreamUrl(state.selectedVideo.url)`.

### Android native playback path

If `window.Capacitor.Plugins.LocalBackendPlugin` exists:

1. `resolveStreamUrl()` calls `LocalBackendPlugin.getStreamUrl({ url })`.
2. The Capacitor bridge invokes `LocalBackendPlugin.getStreamUrl(...)` in Java.
3. The plugin uses `NewPipeExtractor` to fetch `StreamInfo` for the YouTube URL.
4. It reads `audioStreams` from the extractor result.
5. It prefers a direct `M4A` stream because it is the safest option for Android WebView audio playback.
6. If no `M4A` direct stream exists, it falls back to the first direct audio URL.
7. The plugin returns the direct stream URL to JavaScript.
8. `startPlayback()` assigns that direct URL to `elements.audio.src`.
9. The browser engine inside WebView begins streaming directly from the resolved media URL.
10. On success, the UI switches to playing state.

### Web / backend playback path

If the native plugin is not available:

1. `resolveStreamUrl()` falls back to `buildMediaUrl('/api/stream')`.
2. That creates a URL like `/api/stream?url=<youtube-url>&quality=<bitrate>`.
3. The `<audio>` element requests that backend route.
4. Express validates the URL and bitrate.
5. The backend acquires a stream capacity slot.
6. `createStreamingPipeline()` launches `yt-dlp` and `ffmpeg`.
7. `yt-dlp` pulls the source audio from YouTube.
8. `ffmpeg` transcodes the stream to MP3 at the selected bitrate.
9. `ffmpeg.stdout` is piped directly to the HTTP response.
10. The browser plays that MP3 stream as bytes arrive.

### Important playback cleanup behavior

When playback is stopped through `stopPlayback()`:

- `audio.pause()` is called
- the `src` attribute is removed
- `audio.load()` is called

That is important because it actively tears down the network stream instead of leaving the browser buffering in the background.

## What happens when Download is clicked

The download flow also splits into Android native and web/backend behavior.

### Shared frontend validation

1. Clicking the download button triggers `downloadSelectedVideo()`.
2. If no song is selected, nothing happens.
3. If the song duration is greater than 420 seconds, the action is blocked with the existing length warning.
4. The selected title is used as the base download filename.

### Android native download path

If `hasNativeBackend()` is true:

1. The UI enters loading state and shows `Preparing download...`.
2. JavaScript calls `LocalBackendPlugin.download({ url, title })`.
3. The native plugin resolves the preferred direct audio stream using the same extractor logic used for playback.
4. The plugin sanitizes the filename.
5. It infers a file extension from the selected stream format, typically `m4a` or `webm`.
6. It builds an Android `DownloadManager.Request` using the direct stream URL.
7. The request is queued into Android `DownloadManager`.
8. Android handles the network download outside the web layer.
9. The plugin returns metadata such as `downloadId`, `filename`, and `mimeType`.
10. The frontend shows `Download started` with the filename.

### Native download result

- Files are saved in the device Downloads directory.
- Native download saves the original resolved container, not MP3.
- This is intentional because the current Android architecture does not use native `yt-dlp`/`ffmpeg` transcoding.

### Web / backend download path

If the native plugin is not available:

1. The frontend creates an invisible anchor element.
2. The anchor points to `/api/download?url=...&quality=...&title=...&duration=...`.
3. The browser requests the backend route.
4. `stream.routes.js` validates the request and applies the same duration guard.
5. The request is routed through the same streaming pipeline as playback.
6. The backend adds `Content-Disposition: attachment; filename="<title>.mp3"`.
7. The browser treats the response as a downloadable MP3 file.

## What happens when Search is used

There are two search paths.

### Search UI behavior

1. Clicking the search button opens the search view.
2. `showSearchView()` first tries to show cached trending results immediately.
3. Submitting the form calls `searchVideos(query, { label: 'Search results' })`.
4. `searchVideos()` normalizes the query to lowercase for in-memory caching.
5. If the query already exists in `state.cache`, results render immediately with no network call.

### Android native search path

If `window.Capacitor?.isNativePlatform?.()` is true:

1. `searchVideos()` calls `performNativeYoutubeSearch(query)`.
2. The frontend reads the YouTube API key from `window.MONIFY_CONFIG.youtubeApiKey` or `localStorage`.
3. It calls the YouTube Data API `search` endpoint to fetch video IDs.
4. It then calls the YouTube Data API `videos` endpoint to fetch durations and thumbnails.
5. Results are filtered:
   - duration must be at least 60 seconds
   - duration must be below 360 seconds
   - titles containing `#shorts` are removed
6. The final list is cached into `state.cache` and rendered.

### Web / backend search path

If the app is running in the browser:

1. `searchVideos()` calls `GET /api/search?q=<query>`.
2. `search.routes.js` trims the query and appends `song` if it does not already end with `song` or `songs`.
3. `youtube-search.service.js` checks its server-side timed LRU cache.
4. If the result is not cached, it calls YouTube Data API `search`.
5. It then calls YouTube Data API `videos`.
6. The backend maps raw API responses into the app’s result structure.
7. The backend filters out shorts and out-of-range durations.
8. Results are cached server-side and then returned to the client.
9. The client stores the results in its own in-memory `state.cache` and renders them.

### Result selection after search

When a user clicks a result item:

1. `selectVideo(item)` runs
2. the UI is updated immediately
3. the item is inserted into recently played
4. metadata is resolved if necessary
5. `startPlayback()` is called right after selection

## What happens with Local Downloads

The app features a dedicated local media scanner to play offline tracks directly from device storage.

### Native directory scanning

If `window.Capacitor.Plugins.LocalBackendPlugin` exists:

1. Clicking the "Local Downloads" button invokes `LocalBackendPlugin.getSavedSongs()`.
2. The Capacitor plugin requests native `READ_EXTERNAL_STORAGE` and `READ_MEDIA_AUDIO` permissions runtime.
3. Once granted, it scans the `Environment.DIRECTORY_DOWNLOADS` directory for `.mp3`, `.m4a`, `.aac`, `.webm`, and `.opus` formats.
4. For each file, it instantiates `MediaMetadataRetriever` to extract embedded thumbnail ID3 tags and converts them to base64 images.
5. Files are sorted by the latest modified timestamp and returned to the frontend.

### Frontend processing and UI

1. The frontend stores all songs in `localDownloadsState.allSongs`.
2. A custom Trie-based alphanumeric indexing algorithm tokenizes filenames, allowing instant search lookups for any substring inside the "Local Downloads" modal.
3. The UI paginates results 100 at a time.
4. Any song without an embedded thumbnail is uniformly assigned one of three high-res random fallback default thumbnails (`default download thumbnail_1/2/3.jpg`).
5. When a local track is selected, the `PlaybackPool` isolates playback so `Next` and `Prev` interact exclusively with your downloaded history and local database, ensuring offline isolation.
6. The frontend bypasses the Express streaming endpoints and assigns `elements.audio.src` directly to the `file://` converted URL structure via Capacitor, playing directly from disk.
7. Quality toggles normally tied to `yt-dlp` bitrates are safely hidden to prevent stream crashes.

## How trending song cache works

Trending uses both persistent cache and in-memory cache.

### Query used

The app currently uses this hardcoded query:

- `tamil trending songs`

### Background preload

On first page load, `preloadTrending()` runs automatically.

1. It checks `localStorage.getItem('monify_trending')`.
2. It checks `localStorage.getItem('monify_trending_time')`.
3. If cached data exists and is less than 2 hours old, the cached list is loaded into `state.trendingResults` and no new network request is made.
4. If the cache is missing or expired, `searchVideos(TRENDING_QUERY, { skipRender: true, limit: 50 })` is executed.
5. The fetched results are stored in `state.trendingResults`.
6. The same results are serialized into `localStorage` with a timestamp.

### Search-view trending behavior

When the search view opens:

1. `showSearchView()` first checks `state.cache.get(TRENDING_QUERY)`.
2. If not found, it falls back to `state.trendingResults`.
3. If either contains data, the UI renders those songs immediately under the label `Trending Now`.
4. If nothing is available yet, `searchVideos(TRENDING_QUERY, { cacheAsTrending: true, limit: 50, label: 'Trending Now' })` runs.
5. When `cacheAsTrending` is true, `searchVideos()` copies the first 10 results into `state.trendingResults`.

### Where trending is used later

Trending is not just for the search page.

It is also the source pool for:

- `Play Something New`
- next/previous navigation when trending is available
- random playback on song end

If `state.trendingResults` is empty, the app falls back to `DEFAULT_SONG`.

## Supporting state objects on hot paths

### Frontend state

`state` in `client/assets/app.js` carries the live runtime state:

- `selectedVideo`
- `isPlaying`
- `isLoading`
- `searchResults`
- `trendingResults`
- `recentlyPlayed`
- `cache`
- `metadataCache`
- `progressLocked`
- `activeQueryLabel`

### Backend caches

The backend search service uses:

- `TimedLruCache` for completed search responses
- `inFlightSearches` to deduplicate concurrent identical searches

This prevents repeated YouTube API calls when the same query is requested simultaneously.

## Current architecture summary

The current app is hybrid.

### On Android

- Search: YouTube Data API directly from the frontend
- Play: native `NewPipeExtractor` stream resolution
- Download: native `DownloadManager` using the resolved direct stream URL

### On the web

- Search: Express backend + YouTube Data API
- Play: Express + `yt-dlp` + `ffmpeg`
- Download: Express + `yt-dlp` + `ffmpeg` with attachment headers

That split is intentional. It keeps the working Android playback/download path free from the older native `yt-dlp` execution design, while preserving the existing backend pipeline for browser usage.
