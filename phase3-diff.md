# Phase 3 Implementation Diff

This file contains the proposed changes to implement Phase 3: Frontend Integration.

## File: `client/assets/app.js` (MODIFICATION)
```diff
@@ -354,12 +354,23 @@
   elements.playerView.classList.remove('hidden');
 }
 
 function buildMediaUrl(endpoint, extraParams = {}) {
   const params = new URLSearchParams({
     url: elements.urlInput.value,
     quality: elements.qualitySelect.value,
     ...extraParams,
   });
 
   return `${getApiBaseUrl()}${endpoint}?${params.toString()}`;
 }
 
+async function resolveStreamUrl(videoUrl) {
+  const isNative = window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.LocalBackendPlugin;
+  if (isNative) {
+    const result = await window.Capacitor.Plugins.LocalBackendPlugin.getStreamUrl({
+      url: videoUrl
+    });
+    return result.url;
+  }
+
+  return buildMediaUrl('/api/stream');
+}
+
 async function startPlayback() {
   if (!state.selectedVideo) {
     return;
   }
 
   setLoading(true);
   setPlayerStatus('Starting stream...');
 
-  const nextSrc = buildMediaUrl('/api/stream');
-  if (elements.audio.src !== nextSrc) {
-    elements.audio.src = nextSrc;
-  }
+  try {
+    const nextSrc = await resolveStreamUrl(state.selectedVideo.url);
+    if (elements.audio.src !== nextSrc) {
+      elements.audio.src = nextSrc;
+    }
 
-  try {
     await elements.audio.play();
     setPlaying(true);
     setPlayerStatus(`Playing ${state.selectedVideo.title}`);
   } catch (error) {
     console.error('Playback failed:', error);
     stopPlayback(true);
     setPlayerStatus('Playback failed. Try another song.');
   } finally {
     setLoading(false);
   }
 }
```
Edited phase3-diff.md

I've updated `phase3-diff.md` with your requested adjustments:

1. `buildMediaUrl('/api/stream')` is now called without the second parameter, relying on the function's internal extraction of `elements.urlInput.value`.
2. The `isNative` check was added using optional chaining exactly as written:
 `const isNative = window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.LocalBackendPlugin;`

You can view the updated file at `d:\company\MusicPlayer\phase3-diff.md`. Are we good to apply the changes to `app.js` now?