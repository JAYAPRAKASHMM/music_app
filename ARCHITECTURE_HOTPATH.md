# 🚀 The Infinity Player Architecture & Hot paths

This document breaks down the core architecture of the Monify (Infinity) Music Player, focusing on the critical paths from the browser to the backend systems, explaining step-by-step how user interactions trigger cascades of events.

---

## 1️⃣ What happens at the default landing page?

When a user visits the default landing page (`index.html`):
1. **UI Initialization**: The browser loads the static assets (`app.js`, `styles.css`) and parses the DOM.
2. **Default Song Selection**: The `selectVideo()` function is executed immediately, taking `DEFAULT_SONG` (id: `n_fA0hU5-a4`, "JP likes this song") and populating the UI (updating the thumbnail, title, and setting the duration to 2:00).
3. **Ghost Loading (Trending)**: The frontend asynchronously fires `preloadTrending()`, initiating a background HTTP `GET /api/search?q=tamil trending songs` request to the backend. This data is cached in memory limit to 10 items.
4. **No Autoplay**: The audio does **NOT** start playing automatically to save bandwidth and compute, waiting for user intent.

## 2️⃣ What happens if I click the Search button and search for something?

1. **Clicking the Search Icon**: The UI transitions to the search view. Because `preloadTrending()` already fetched data in the background during page load, the 10 "tamil trending songs" automatically appear instantly, providing a zero-latency experience.
2. **Submitting a New Query**:
   - The frontend clears the UI and sends a `GET /api/search?q={query}`.
   - The Node.js backend (`youtube-search.service.js`) checks its LRU cache. If missed, it contacts the **Google YouTube Data API v3**.
3. **API Usage & Quota Points (Backend)**:
   - **Call 1**: It hits `/search` (maxResults=40) to find matching video IDs. **Cost: 100 Quota Points**.
   - **Call 2**: It hits `/videos` (part=contentDetails,snippet) using those IDs to fetch precise durations and high-res thumbnails. **Cost: 1 Quota Point** (or a few depending on snippet parts).
   - **Total Cost per unique search**: **~101 Quota Points**.
   - **Results Yield**: Out of 40 videos, the backend filters out `#shorts`, filters durations (between 1min and 6mins), and slices the final array to **maximum 20 results** returned to the frontend.

## 3️⃣ What happens if I click "Play Something New"?

1. The frontend executes the `chooseRandomTrending()` function.
2. It looks at the `.trendingResults` array (which was preloaded silently with the trending Tamil songs).
3. It filters out the currently playing song to avoid repeats.
4. It picks a song at random and instantly forces a `selectVideo(video)` and `startPlayback()` call.
5. Because the metadata was already fetched in the background, this interaction feels instantaneous.

## 4️⃣ What happens if I click the Play / Download buttons?

### **Clicking Play 🎵**
1. **The Request**: `startPlayback()` assigns the `/api/stream?url=...&quality=...` URL directly into the `<audio>` tag's `src` attribute.
2. **Zero-Disk Streaming**: The Express server receives the request. Instead of downloading a file, it spawns a microscopic child process of `yt-dlp`.
3. **The Pipe**: `yt-dlp` begins extracting raw audio chunks from YouTube servers and pipes the binary stream directly into `ffmpeg`.
4. **On-the-fly Transcoding**: `ffmpeg` transcodes the Opus/AAC audio into standard `.mp3` at the selected bitrate (e.g., 128k) in RAM.
5. **Delivery**: The FFmpeg output pipe `ffmpegProcess.stdout.pipe(res)` is directly hooked to your HTTP connection. Music starts playing the millisecond the first bytes traverse the pipe.

### **Clicking Download ⬇️**
1. **The Request**: `downloadSelectedVideo()` dynamically generates an invisible `<a>` element in the DOM with `href="/api/download?url=...&title=..."`.
2. **The Output**: It is routed to the exact same powerful zero-disk pipeline as streaming. However, the server sets an HTTP header `Content-Disposition: attachment; filename="{title}.mp3"`.
3. The browser interprets this header and triggers a classic file download utilizing the same real-time transcoded stream.

## 5️⃣ What happens if I click Play and stop while it's loading?

1. **Clicking Play (Loading)**: The audio starts buffering, `state.isLoading` goes true, and the play icon turns into a loading spinner. The backend begins spinning up `yt-dlp` and `ffmpeg`.
2. **Clicking Stop/Pause (Before Playback)**: The user clicks the button again, triggering `audio.pause()` via `togglePlayback()`. The UI resets back to "Paused".
3. **The Hidden Aftermath**: Because of standard browser capabilities, `audio.pause()` **does NOT gracefully sever the HTTP connection**. The browser merely stops the playhead and keeps the connection open, greedily buffering the rest of the file in the background just in case you resume.
4. **Backend Consequence**: The Express `res.on('close')` event does not fire! Server processes `yt-dlp` and `ffmpeg` continue furiously downloading and transcoding the entire 4-minute song, tying up server memory, CPU slots, and concurrency blockers for a song the user aborted.
