# Phase 4 Implementation Diff (Revised)

This file contains the revised Phase 4 proposal: implementing direct YouTube Data API searches natively in the frontend when running via the Android app, bypassing both the Node backend and `yt-dlp`.

## Strategy Analysis
*   **Performance issue**: Executing `yt-dlp` natively for a 50-item search would be too heavy and slow on Android.
*   **Revised Approach**: When `isNative` is true, the frontend will execute the exact same two-step YouTube Data API fetch process that the Node backend used (first fetching the video IDs, then fetching the duration/details).
*   **API Key Management**: We dynamically fetch the YouTube API key from `window.MONIFY_CONFIG?.youtubeApiKey` or `localStorage.getItem('youtubeApiKey')` to avoid committing it to the repository.
*   **Quota Limits**: Maximum search results have been reduced from 50 to 20.
*   **Native Code**: No changes are required to `LocalBackendPlugin.java` since search runs purely via regular JS `fetch`.

## File: `client/assets/app.js` (MODIFICATION)
```diff
@@ -252,6 +252,58 @@
   refreshIcons();
 }
 
+function parseIsoDuration(duration) {
+  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
+  if (!match) return 0;
+  const h = parseInt(match[1] || 0, 10);
+  const m = parseInt(match[2] || 0, 10);
+  const s = parseInt(match[3] || 0, 10);
+  return h * 3600 + m * 60 + s;
+}
+
+async function performNativeYoutubeSearch(query) {
+  const apiKey = window.MONIFY_CONFIG?.youtubeApiKey || localStorage.getItem('youtubeApiKey');
+  if (!apiKey) {
+    throw new Error('YouTube API key is missing. Set it in config or localStorage.');
+  }
+
+  const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
+  
+  // Step 1: Search for Video IDs
+  const searchParams = new URLSearchParams({
+    key: apiKey,
+    q: query,
+    part: 'snippet',
+    type: 'video',
+    maxResults: '20',
+    videoEmbeddable: 'true',
+    safeSearch: 'moderate',
+  });
+  const searchRes = await fetch(`${YOUTUBE_API_BASE}/search?${searchParams.toString()}`);
+  const searchData = await searchRes.json();
+  if (!searchRes.ok) throw new Error(searchData.error?.message || 'YT Search failed');
+  
+  const videoIds = (searchData.items || []).map(i => i.id?.videoId).filter(Boolean);
+  if (!videoIds.length) return [];
+
+  // Step 2: Fetch Details (Duration)
+  const detailsParams = new URLSearchParams({
+    key: apiKey,
+    id: videoIds.join(','),
+    part: 'contentDetails,snippet',
+    maxResults: String(videoIds.length),
+  });
+  const detailsRes = await fetch(`${YOUTUBE_API_BASE}/videos?${detailsParams.toString()}`);
+  const detailsData = await detailsRes.json();
+  if (!detailsRes.ok) throw new Error(detailsData.error?.message || 'YT Details failed');
+
+  return (detailsData.items || []).map((item) => {
+    const durationSeconds = parseIsoDuration(item.contentDetails?.duration || '');
+    const thumbnail = item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '';
+    return {
+      id: item.id,
+      title: item.snippet?.title || '',
+      channelTitle: item.snippet?.channelTitle || '',
+      thumbnail: thumbnail,
+      url: `https://www.youtube.com/watch?v=${item.id}`,
+      durationSeconds: durationSeconds,
+    };
+  })
+  .filter(item => item.durationSeconds >= 60 && item.durationSeconds < 360)
+  .filter(item => !item.title.toLowerCase().includes('#shorts'))
+  .slice(0, 20);
+}
+
 async function searchVideos(query, options = {}) {
   const normalizedQuery = query.trim().toLowerCase();
   if (!normalizedQuery) {
@@ -274,15 +326,23 @@
     elements.searchCount.textContent = '';
   }
 
-  const response = await fetch(`${getApiBaseUrl()}/api/search?q=${encodeURIComponent(query)}`);
-  const data = await response.json();
-
-  if (!response.ok) {
-    throw new Error(data.error || 'Search failed.');
-  }
-
-  const limit = options.limit || data.results.length || 0;
-  const results = (data.results || []).slice(0, limit).map((item) => {
+  let rawResults = [];
+  const isNative = window.Capacitor?.isNativePlatform?.();
+  
+  if (isNative) {
+    rawResults = await performNativeYoutubeSearch(query);
+  } else {
+    const response = await fetch(`${getApiBaseUrl()}/api/search?q=${encodeURIComponent(query)}`);
+    const data = await response.json();
+  
+    if (!response.ok) {
+      throw new Error(data.error || 'Search failed.');
+    }
+    rawResults = data.results || [];
+  }
+
+  const limit = options.limit || rawResults.length || 0;
+  const results = rawResults.slice(0, limit).map((item) => {
     const cleanTitle = (item.title || '').replace(/\bvideo\b/gi, '').replace(/\s{2,}/g, ' ').trim();
     return { ...item, title: cleanTitle };
   });
```