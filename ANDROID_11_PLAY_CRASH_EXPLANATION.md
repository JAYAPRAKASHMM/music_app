# Moto G9 Android 11 Play Crash Explanation

## Symptom

- Search works.
- Tapping the play button crashes or fails on the Android app.

## Why search works but play does not

These two actions use different code paths.

### Search path

Search stays in JavaScript and calls the YouTube Data API directly:

- `client/assets/app.js`
- `performNativeYoutubeSearch(...)`

That means search does **not** depend on the native Android audio resolver.

### Play path

Play goes through the native Android plugin:

- `client/assets/app.js`
- `startPlayback()`
- `resolveStreamUrl(...)`
- `window.Capacitor.Plugins.LocalBackendPlugin.getStreamUrl(...)`
- `android/app/src/main/java/com/monify/player/plugins/LocalBackendPlugin.java`

Inside that plugin, the app uses `NewPipeExtractor` to resolve a direct YouTube audio stream URL before the `<audio>` element starts playback.

## Most likely root cause

The problem is most likely in the native playback resolver, not in search.

This project currently does:

1. Search in JS with YouTube Data API.
2. Playback in native Java with `NewPipeExtractor`.

On Moto G9 / Android 11, the unstable part is the native playback step:

- `StreamInfo.getInfo(ServiceList.YouTube, videoUrl)`
- audio stream extraction from NewPipe

If that extraction fails, play breaks even though search still works.

## Why this happens

Common reasons for this exact split behavior:

- YouTube page structure changed and the extractor fails for some videos.
- `NewPipeExtractor` returns no usable direct audio stream.
- The native plugin throws an exception while resolving the stream URL.
- Android WebView playback is fine, but the app never gets a valid media URL from the plugin.

## Evidence in this repo

The Android plugin is the only special step used by play:

- `android/app/src/main/java/com/monify/player/plugins/LocalBackendPlugin.java`

The key code is:

```java
StreamInfo info = StreamInfo.getInfo(ServiceList.YouTube, videoUrl);
List<AudioStream> audioStreams = info.getAudioStreams();
```

If this part fails, playback cannot start.

Search does not touch this code, so search can still work normally.

## Best fix

The safest fix is:

### Option 1: Bypass the native extractor for Android playback

Use the backend stream endpoint for playback instead of `LocalBackendPlugin.getStreamUrl(...)`.

That means Android play should use:

- `/api/stream`

instead of:

- `NewPipeExtractor`

Why this is the safest fix:

- it removes the fragile native YouTube extraction step
- it makes Android play use the same server streaming path as web
- search can stay exactly as it is

## Alternative fix

### Option 2: Keep native playback but harden the plugin

If you want native playback, then you need to:

- add stronger exception logging in `LocalBackendPlugin`
- verify the exact Logcat crash
- handle extractor failures without crashing
- possibly replace or upgrade the extractor approach if NewPipe is unreliable for current YouTube responses

This is riskier than Option 1 because the app still depends on direct YouTube extraction on the phone.

## Recommended conclusion

For this app, the practical answer is:

**Search works because it uses the YouTube API in JavaScript. Play crashes because it uses the Android native plugin and `NewPipeExtractor` to resolve audio, and that resolver is the weak point on Android 11.**

## Recommended implementation direction

Change Android playback so it follows the same backend path as web playback.

In practice, that means changing the logic in:

- `client/assets/app.js`

so playback does not prefer:

- `window.Capacitor.Plugins.LocalBackendPlugin.getStreamUrl(...)`

and instead uses:

- `buildMediaUrl('/api/stream')`

## Short answer

This is not a search problem.

This is a native Android playback resolver problem.

Search works because it uses JS + YouTube API.
Play fails because it uses `LocalBackendPlugin` + `NewPipeExtractor`.

The clean fix is to stop using the native extractor for playback and use the backend streaming route for Android too.
