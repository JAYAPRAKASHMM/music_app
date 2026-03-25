# Android Local Backend Implementation Plan

## Repository Analysis
*   **Frontend (`client/`)**: Contains Vanilla HTML/JS/CSS. Network logic lies inside `app.js` using `fetch()` to `/api/search`, `/api/resolve`, and setting the direct `<audio src="...">` and anchor tags (`<a href="...">`) to `/api/stream` and `/api/download`.
*   **Backend (`server/`)**: A Node.js Express server. Features a `streaming.service.js` which uses `child_process.spawn` to run `yt-dlp` (extracts direct audio via `tube` links piped via stdout) and `ffmpeg` (for transcoding if quality differs). 
*   **Android (`android/`)**: A Capacitor-based wrapper around the frontend. Contains an assets folder (`app/src/main/assets/bin`) with precompiled execution binaries for `yt-dlp` and `ffmpeg`. The `MainActivity.java` currently just extends `BridgeActivity` without native plugins.

## Current Architecture
The current mobile app utilizes standard Client-Server architecture heavily reliant on an active internet connection to a dedicated Node server.
1. Android WebView loads the static frontend from internal assets.
2. Frontend forms API calls to `https://[server-url]/api/*`.
3. Node server receives the request, spins up local `yt-dlp`/`ffmpeg` binaries.
4. Node server pipes the audio output as a streaming HTTP response back to the Capacitor WebView's `<audio>` element.

## Target Architecture
The objective is to eliminate the remote Node server requirement entirely on Android devices by running the binary processes natively on the phone.
1. Android WebView loads the static frontend.
2. Frontend JS queries the Capacitor environment (e.g., `Capacitor.isNativePlatform()`). 
3. If native, JS calls a custom Capacitor Plugin (e.g., `LocalBackendPlugin`).
4. `LocalBackendPlugin` runs `yt-dlp -f bestaudio -g <video_url>` natively via Android's `java.lang.ProcessBuilder`.
5. The extracted direct audio URL (e.g., `googlevideo.com/videoplayback?...`) is returned to the UI.
6. The JS frontend sets the `<audio src="...">` directly to this resolved URL, allowing the native WebView player to stream from Google servers directly, removing the need for `ffmpeg` transcoding. 
7. For searches, the native plugin queries the YouTube API (or a lightweight search mechanism like `yt-dlp "ytsearch10:query" -j`) and returns the JSON to JS.

## Step-by-Step Implementation Phases

### Phase 1: Native Asset Preparation
1. Implement a resource copier inside Android's `MainActivity.java` (or an initialization class).
2. On app launch, check if `yt-dlp` and `ffmpeg` exist in the app's internal `getFilesDir()`.
3. If they don't exist, copy them from `assets/bin/*` to the internal storage.
4. Use `Runtime.getRuntime().exec("chmod +x " + binaryPath)` to ensure they are executable on the Linux kernel.

### Phase 2: Capacitor Bridge Implementation
1. Create a `LocalBackendPlugin.java` extending `com.getcapacitor.Plugin`.
2. Register the plugin within `MainActivity.java` via `this.registerPlugin(LocalBackendPlugin.class)`.
3. Create `@PluginMethod` annotated functions:
    *   `search(PluginCall call)`: Executes `yt-dlp "ytsearch15:query" -j`, parses the JSON lines, and returns a structured array of results to the frontend.
    *   `resolve(PluginCall call)`: Not strictly necessary if `stream` handles extraction, but can fetch metadata.
    *   `getStreamUrl(PluginCall call)`: Executes `yt-dlp -f bestaudio -g <url>`, returning the raw direct URL string.
    *   `download(PluginCall call)`: (Optional) Executes `yt-dlp -f bestaudio -o /Downloads/<file> <url>` natively using Android's DownloadManager or internal storage.

### Phase 3: Frontend Refactoring
1. Subclass or adapt API calls in `app.js`.
2. Use `window.Capacitor?.Plugins?.LocalBackendPlugin` to detect if the plugin is available.
3. Update `searchVideos()`: If native, await `LocalBackendPlugin.search({ query })` instead of fetching `/api/search`.
4. Update `startPlayback()`: If native, omit the `/api/stream` endpoint. Instead, await `LocalBackendPlugin.getStreamUrl({ url })`, then assign the resulting direct `googlevideo.com` URL to `elements.audio.src`.
5. Update `downloadSelectedVideo()`: Instead of an anchor tag, invoke `LocalBackendPlugin.download(...)`.

### Phase 4: Testing & Verification
1. Run application on a physical Android device or an ABI-compatible emulator (ensure `yt-dlp` binary architecture matches the testing device, e.g., aarch64 vs x86_64).
2. Use Logcat to monitor the standard output/error of the `ProcessBuilder`.
3. Use Chrome Remote Debugging (`chrome://inspect`) to verify the JS `audio.src` successfully resolves to the direct HTTP stream string rather than a Node proxy.

## Files That Will Be Modified
1. `android/app/src/main/java/com/monify/player/MainActivity.java`
2. `android/app/src/main/java/com/monify/player/LocalBackendPlugin.java` (NEW)
3. `android/app/src/main/java/com/monify/player/BinaryExtractor.java` (NEW)
4. `client/assets/app.js` (Frontend bridging detection)
5. `client/index.html` (Include `@capacitor/core` script if not bundled)

## Risks and Edge Cases
1. **Binary Architecture Mismatch**: The `bin/yt-dlp` in assets must be compiled for Android architectures (usually `aarch64`). If it's a generic x86 Linux binary, or worse, Windows `exe`, the `ProcessBuilder` will fail with an `Exec format error`.
2. **Execution Permissions**: Starting from recent Android versions, executing binaries from the data directory has become restrictive depending on target API levels (W^X restrictions in Android 10+). It might be necessary to package binaries as shared libraries (`libytdlp.so`) instead of standard executables in internal storage.
3. **Direct URL Expiry**: URLs returned by `yt-dlp -g` are IP-bound and expire after a few hours. Seeking within the `<audio>` element may trigger a 403 Forbidden eventually, requiring a mechanism to refresh the stream URL seamlessly if playback stalls.
4. **Bandwidth / Transcoding Loss**: Since `ffmpeg` transcoding on the phone is extremely battery/CPU intensive, bypassing it and using the raw stream is preferred, but the raw audio is typically `webm` / `opus` or `m4a`. Android WebView supports these formats inherently, so `ffmpeg` might be completely unnecessary for the Android build.
5. **Slow Initialization**: Extracting `yt-dlp` takes a second or two on older phones. The frontend should show a loading indicator during the `getStreamUrl` bridge call.
