# Phase 7 Diagnostic and Fallback Patch Diff

This diff focuses on comprehensively verifying Native Platform detection and improving strict error boundary handling inside the audio pipeline. We are intentionally avoiding architectural changes to Capacitor in favor of granular logging.

### What these changes fix:
1. **Fix Native Environment Detection**: Drops the reliance on `isNativePlatform()` and instead explicitly checks if the `LocalBackendPlugin` exists on the `window` object.
2. **Validate Plugin Invocation**: Adds 3 distinct `console.log` lines to trace exactly *which* parts of the `window.Capacitor.Plugins` tree are populated.
3. **Trim & Validate URL**: Ensures the returned stream string is valid, non-empty, and strictly trimmed.
4. **Improved Error Handling**: If the native plugin fails or returns an empty URL, it explicitly throws an Error tracking the native failure rather than mysteriously failing lower down in HTML5 `<audio>`. This immediately surfaces the `yt-dlp` logs.
5. **Bypassing the API**: Yes, if `window.Capacitor.Plugins.LocalBackendPlugin` is successfully verified, the app will **absolutely bypass `buildMediaUrl('/api/stream')`** and route natively.

## File `client/assets/app.js` (MODIFICATION)

```diff
@@ -161,8 +161,8 @@
   }
 
   // If native, skip /api/resolve because performNativeYoutubeSearch already gets high-res thumbs
-  const isNative = window.Capacitor?.isNativePlatform?.();
+  const isNative = !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalBackendPlugin);
   if (isNative) {
     return video;
   }
 
@@ -441,18 +441,27 @@
 }
 
 async function resolveStreamUrl(videoUrl) {
-  const isNative = window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.LocalBackendPlugin;
+  console.log('[DEBUG] Validating plugin invocation:');
+  console.log('window.Capacitor:', !!window.Capacitor, window.Capacitor);
+  console.log('window.Capacitor.Plugins:', window.Capacitor ? !!window.Capacitor.Plugins : false, window.Capacitor?.Plugins);
+  console.log('window.Capacitor.Plugins.LocalBackendPlugin:', window.Capacitor?.Plugins ? !!window.Capacitor.Plugins.LocalBackendPlugin : false);
+
+  const isNative = !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalBackendPlugin);
+  
   if (isNative) {
     console.log('[DEBUG] resolveStreamUrl: Native plugin detected. Requesting stream for:', videoUrl);
     try {
       const result = await window.Capacitor.Plugins.LocalBackendPlugin.getStreamUrl({
         url: videoUrl
       });
       console.log('[DEBUG] resolveStreamUrl: Native plugin returned result:', result);
-      return typeof result.url === 'string' ? result.url.trim() : null;
+      
+      const trimmedUrl = typeof result.url === 'string' ? result.url.trim() : null;
+      if (!trimmedUrl) {
+        throw new Error('LocalBackendPlugin returned an empty or invalid stream URL string');
+      }
+      return trimmedUrl;
     } catch (e) {
-      console.error('LocalBackendPlugin getStreamUrl failed:', e);
-      throw Error('Native yt-dlp binary failed to extract URL');
+      console.error('[ERROR] LocalBackendPlugin getStreamUrl failed:', e);
+      throw e; // Pass on the actual error to prevent fallback to /api/stream
     }
   }
 
+  console.warn('[WARN] LocalBackendPlugin not detected! Falling back to /api/stream');
   return buildMediaUrl('/api/stream');
 }
 
@@ -458,6 +467,8 @@
   setPlayerStatus('Starting stream...');
 
   try {
+    console.log('[DEBUG] startPlayback: Requesting resolution for url:', state.selectedVideo.url);
     const nextSrc = await resolveStreamUrl(state.selectedVideo.url);
     console.log('[DEBUG] startPlayback: Next audio src assigned:', nextSrc);
     
```
