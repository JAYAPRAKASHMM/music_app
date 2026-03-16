# Playback Fix, Caching, And APK Size Notes

## What was changed

### 1. Transient native playback failure mitigation

Problem observed:

- `LocalBackendPlugin.getStreamUrl(...)` sometimes failed on the first attempt with:
  - `No audio streams found for: <youtube-url>`
- A second immediate attempt often succeeded for the same song.

Implemented fix in `client/assets/app.js`:

- Added `normalizeYoutubeUrl(videoUrl)`.
- Native playback now converts short YouTube URLs like `https://youtu.be/...?...` into canonical watch URLs like `https://www.youtube.com/watch?v=...` before asking the plugin for a stream.
- Added `shouldRetryNativeResolve(error)`.
- If the native plugin fails with one of the known transient messages:
  - `No audio streams found`
  - `The page needs to be reloaded`
  the frontend waits 250ms and retries the native stream resolution once.

Why this is safe:

- It only affects the native plugin path.
- It does not change the web/backend playback flow.
- It keeps the existing working behavior and only hardens the failure case.

### 2. Default song title fix

Problem observed:

- The thumbnail for the default song was present, but the title showed `Loading title...`.

Root cause:

- The configured default song had no `title` or `channelTitle`.

Implemented fix:

- Added `title` and `channelTitle` to the default song in:
  - `client/assets/config.js`
- Updated the JavaScript fallback `DEFAULT_SONG` in:
  - `client/assets/app.js`
- Also changed the default song URL to the canonical watch URL.

### 3. App logo asset refresh

Updated:

- `client/assets/logo.svg`

This refreshes the app’s SVG logo asset used by the web UI.

## What is cached right now

### Cached locally in the frontend

#### Search result cache

File:

- `client/assets/app.js`

Behavior:

- `state.cache` is an in-memory `Map()`.
- It stores search results by normalized query string.
- This cache exists only while the app session is alive.

#### Metadata cache

File:

- `client/assets/app.js`

Behavior:

- `state.metadataCache` is an in-memory `Map()` keyed by `video.url`.
- It stores resolved title/channel/thumbnail data for songs that went through metadata resolution.
- This is not persisted to disk.
- Yes, trending results can benefit from this if the same URLs later go through metadata resolution.

#### Recently played cache

File:

- `client/assets/app.js`

Behavior:

- `state.recentlyPlayed` is persisted in `localStorage` under `monify_recent`.
- This stores only song metadata objects, not audio files.

#### Trending cache

File:

- `client/assets/app.js`

Behavior:

- Trending results are persisted in `localStorage` under:
  - `monify_trending`
  - `monify_trending_time`
- They are reused for up to 2 hours.
- This stores result objects such as title, thumbnail, duration, and URL.
- This does not store song audio bytes.

### Cached on the backend

File:

- `server/src/services/youtube-search.service.js`

Behavior:

- Search results are cached in a timed LRU cache.
- There is also an `inFlightSearches` map to deduplicate concurrent identical requests.

## Are songs themselves cached?

Short answer:

- No, not by the app as a song library or offline cache.

More precise answer:

- Search results and metadata are cached.
- Trending metadata is cached in `localStorage`.
- The currently playing audio may be buffered temporarily by the browser or WebView media stack.
- The web backend streams audio through pipes and does not store song files as cache.
- Android native playback resolves a direct stream URL and plays it directly; it does not save the song unless the user explicitly clicks download.
- Android downloads are stored only when `DownloadManager` is used through the download button.

So:

- metadata: yes, cached
- search result lists: yes, cached
- trending result lists: yes, cached
- full song audio files: no, not automatically cached by the app

## Can APK size be reduced?

Yes, likely.

### Safe opportunities

#### 1. Remove dead Android assets

There are still signs of the older native `yt-dlp` / `ffmpeg` plan in the repo history and worktree.

If those binaries are no longer used by the Android build, removing them is the biggest likely APK size win.

#### 2. Enable release shrinking

In release builds, these can reduce APK size:

- `minifyEnabled true`
- `shrinkResources true`

This should only be enabled and tested carefully on a real release build.

#### 3. Optimize image assets

- compress splash images
- keep only required launcher assets
- prefer vector drawables or SVG where applicable for web assets

#### 4. Review Capacitor/Android dependencies

- remove unused plugins
- remove unused native libraries

### Important note

I did not change APK-size-related build settings in this round because that can affect release behavior and should be validated with an actual Android build.

## Files changed in this round

- `client/assets/app.js`
- `client/assets/config.js`
- `client/assets/logo.svg`
