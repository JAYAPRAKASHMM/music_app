# Phase 5 Implementation Diff

This diff focuses purely on adding telemetry and logging to trace the exact string value returned by the local backend plugin for playback. No behavior modifications are made.

## File: `android/app/src/main/java/com/monify/player/plugins/LocalBackendPlugin.java` (MODIFICATION)
```diff
@@ -26,16 +26,19 @@
 
         getBridge().execute(() -> {
             try {
                 String ytDlpPath = BinaryExtractor.getYtDlpPath(getContext());
+                Log.d(TAG, "Executing yt-dlp binary at: " + ytDlpPath);
                 ProcessBuilder pb = new ProcessBuilder(
                         ytDlpPath,
                         "-f",
                         "bestaudio",
                         "-g",
                         url
                 );
+                
+                Log.d(TAG, "Running command: " + String.join(" ", pb.command()));
 
                 Process process = pb.start();
 
                 // Read stdout
@@ -43,6 +46,7 @@
                 String streamUrl = null;
                 String line;
                 while ((line = reader.readLine()) != null) {
+                    Log.d(TAG, "yt-dlp stdout line: " + line);
                     if (streamUrl == null && (line.startsWith("http://") || line.startsWith("https://"))) {
                         streamUrl = line;
                         break; // Stop reading stdout once the first stream URL is found
@@ -66,6 +70,7 @@
                     call.reject("Failed to resolve stream URL");
                 } else {
+                    Log.i(TAG, "Successfully extracted stream URL: " + streamUrl);
                     JSObject result = new JSObject();
                     result.put("url", streamUrl);
                     call.resolve(result);
```

## File: `client/assets/app.js` (MODIFICATION)
```diff
@@ -99,6 +99,14 @@
   elements.audio.addEventListener('timeupdate', updateProgress);
   elements.audio.addEventListener('ended', handleSongEnd);
   elements.audio.addEventListener('playing', () => setPlaying(true));
   elements.audio.addEventListener('pause', () => setPlaying(false));
+  
+  // Debugging audio events
+  elements.audio.addEventListener('error', (e) => {
+    const mediaError = elements.audio.error;
+    console.error(`[AUDIO ERROR EVENT] Code: ${mediaError ? mediaError.code : 'Unknown'}, Message: ${mediaError ? mediaError.message : 'Unknown'}`, e);
+  });
+  elements.audio.addEventListener('loadedmetadata', () => console.log('[AUDIO EVENT] loadedmetadata triggered.'));
+  elements.audio.addEventListener('canplay', () => console.log('[AUDIO EVENT] canplay triggered. Audio is ready.'));
 
   elements.playPauseBtn.addEventListener('click', togglePlayback);
@@ -375,10 +383,13 @@
   const isNative = window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.LocalBackendPlugin;
   if (isNative) {
+    console.log('[DEBUG] resolveStreamUrl: Native plugin detected. Requesting stream for:', videoUrl);
     const result = await window.Capacitor.Plugins.LocalBackendPlugin.getStreamUrl({
       url: videoUrl
     });
+    console.log('[DEBUG] resolveStreamUrl: Native plugin returned result:', result);
     return result.url;
   }
 
   return buildMediaUrl('/api/stream');
 }
 
@@ -387,14 +398,16 @@
     return;
   }
 
+  console.log('[DEBUG] startPlayback: Selected video:', state.selectedVideo);
+
   setLoading(true);
   setPlayerStatus('Starting stream...');
 
   try {
     const nextSrc = await resolveStreamUrl(state.selectedVideo.url);
+    console.log('[DEBUG] startPlayback: Next audio src assigned:', nextSrc);
     if (elements.audio.src !== nextSrc) {
       elements.audio.src = nextSrc;
     }
 
     await elements.audio.play();
```
