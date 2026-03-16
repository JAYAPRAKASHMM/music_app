package com.monify.player.plugins;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.schabi.newpipe.extractor.MediaFormat;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamInfo;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@CapacitorPlugin(name = "LocalBackendPlugin")
public class LocalBackendPlugin extends Plugin {
    private static final String TAG = "LocalBackendPlugin";
    private static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/124.0.0.0 Safari/537.36";
    private static volatile boolean initialized = false;

    @Override
    public void load() {
        super.load();
        if (!initialized) {
            try {
                NewPipe.init(new SimpleDownloader());
                initialized = true;
                Log.d(TAG, "NewPipeExtractor initialized");
            } catch (Exception e) {
                Log.e(TAG, "NewPipeExtractor init failed", e);
            }
        }
    }

    @PluginMethod
    public void getStreamUrl(PluginCall call) {
        String videoUrl = call.getString("url");
        if (videoUrl == null || videoUrl.isEmpty()) {
            call.reject("Must provide a video url");
            return;
        }

        if (!initialized) {
            call.reject("NewPipeExtractor not initialized yet");
            return;
        }

        getBridge().execute(() -> {
            try {
                AudioSelection selection = resolvePreferredAudioStream(videoUrl);
                JSObject result = new JSObject();
                result.put("url", selection.url);
                result.put("mimeType", selection.mimeType);
                result.put("extension", selection.extension);
                call.resolve(result);
            } catch (Exception e) {
                String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                Log.e(TAG, "getStreamUrl failed", e);
                call.reject("Failed to resolve stream URL: " + msg);
            }
        });
    }

    @PluginMethod
    public void download(PluginCall call) {
        String videoUrl = call.getString("url");
        if (videoUrl == null || videoUrl.isEmpty()) {
            call.reject("Must provide a video url");
            return;
        }

        if (!initialized) {
            call.reject("NewPipeExtractor not initialized yet");
            return;
        }

        final String requestedTitle = call.getString("title", "song");
        getBridge().execute(() -> {
            try {
                AudioSelection selection = resolvePreferredAudioStream(videoUrl);
                String safeTitle = sanitizeFileName(requestedTitle);
                String fileName = safeTitle + "." + selection.extension;

                DownloadManager downloadManager =
                        (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
                if (downloadManager == null) {
                    call.reject("Android DownloadManager is unavailable");
                    return;
                }

                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(selection.url));
                request.setTitle(safeTitle);
                request.setDescription("Monify audio download");
                request.setMimeType(selection.mimeType);
                request.addRequestHeader("User-Agent", USER_AGENT);
                request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setAllowedOverMetered(true);
                request.setAllowedOverRoaming(true);
                request.setVisibleInDownloadsUi(true);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

                long downloadId = downloadManager.enqueue(request);

                JSObject result = new JSObject();
                result.put("downloadId", downloadId);
                result.put("filename", fileName);
                result.put("mimeType", selection.mimeType);
                call.resolve(result);
            } catch (Exception e) {
                String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                Log.e(TAG, "download failed", e);
                call.reject("Failed to start download: " + msg);
            }
        });
    }

    private AudioSelection resolvePreferredAudioStream(String videoUrl) throws Exception {
        Log.d(TAG, "Extracting stream for: " + videoUrl);
        StreamInfo info = StreamInfo.getInfo(ServiceList.YouTube, videoUrl);
        List<AudioStream> audioStreams = info.getAudioStreams();

        if (audioStreams == null || audioStreams.isEmpty()) {
            throw new IllegalStateException("No audio streams found for: " + videoUrl);
        }

        AudioStream selectedStream = null;

        for (AudioStream stream : audioStreams) {
            if (stream.isUrl() && stream.getContent() != null
                    && stream.getFormat() == MediaFormat.M4A) {
                selectedStream = stream;
                break;
            }
        }

        if (selectedStream == null) {
            for (AudioStream stream : audioStreams) {
                if (stream.isUrl() && stream.getContent() != null
                        && !stream.getContent().isEmpty()) {
                    selectedStream = stream;
                    break;
                }
            }
        }

        if (selectedStream == null) {
            throw new IllegalStateException("No direct stream URL found (all streams are manifests)");
        }

        String streamUrl = selectedStream.getContent();
        String extension = inferExtension(selectedStream.getFormat());
        String mimeType = inferMimeType(extension);

        Log.d(TAG, "Resolved audio stream format=" + extension + " url="
                + streamUrl.substring(0, Math.min(100, streamUrl.length())));

        return new AudioSelection(streamUrl, extension, mimeType);
    }

    private static String sanitizeFileName(String rawValue) {
        String normalized = String.valueOf(rawValue == null ? "song" : rawValue)
                .replaceAll("[<>:\"/\\\\|?*\\x00-\\x1F]", " ")
                .replaceAll("\\s+", " ")
                .trim();

        if (normalized.isEmpty()) {
            return "song";
        }

        return normalized.length() > 120 ? normalized.substring(0, 120).trim() : normalized;
    }

    private static String inferExtension(MediaFormat format) {
        String normalized = String.valueOf(format).toLowerCase(Locale.US);
        if (normalized.contains("m4a")) {
            return "m4a";
        }
        if (normalized.contains("webm") || normalized.contains("weba")) {
            return "webm";
        }
        if (normalized.contains("opus")) {
            return "opus";
        }
        if (normalized.contains("mp3")) {
            return "mp3";
        }
        return "m4a";
    }

    private static String inferMimeType(String extension) {
        switch (extension) {
            case "webm":
                return "audio/webm";
            case "opus":
                return "audio/ogg";
            case "mp3":
                return "audio/mpeg";
            case "m4a":
            default:
                return "audio/mp4";
        }
    }

    private static final class AudioSelection {
        final String url;
        final String extension;
        final String mimeType;

        AudioSelection(String url, String extension, String mimeType) {
            this.url = url;
            this.extension = extension;
            this.mimeType = mimeType;
        }
    }

    private static class SimpleDownloader extends Downloader {
        private static final int TIMEOUT_MS = 15_000;

        @Override
        public Response execute(Request request) throws IOException {
            HttpURLConnection conn =
                    (HttpURLConnection) new URL(request.url()).openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);

            String method = request.httpMethod();
            conn.setRequestMethod(method != null ? method : "GET");
            conn.setRequestProperty("User-Agent", USER_AGENT);

            for (Map.Entry<String, List<String>> h : request.headers().entrySet()) {
                if (h.getKey() == null) continue;
                for (String v : h.getValue()) {
                    conn.setRequestProperty(h.getKey(), v);
                }
            }

            byte[] body = request.dataToSend();
            if (body != null && body.length > 0) {
                conn.setDoOutput(true);
                conn.getOutputStream().write(body);
            }

            conn.connect();
            int code = conn.getResponseCode();

            InputStream is = code < 400 ? conn.getInputStream() : conn.getErrorStream();
            String responseBody = "";
            if (is != null) {
                try {
                    byte[] bytes = is.readAllBytes();
                    responseBody = new String(bytes, StandardCharsets.UTF_8);
                } catch (Exception ignored) {
                } finally {
                    is.close();
                }
            }

            Map<String, List<String>> filteredHeaders = new HashMap<>();
            for (Map.Entry<String, List<String>> e : conn.getHeaderFields().entrySet()) {
                if (e.getKey() != null) {
                    filteredHeaders.put(e.getKey(), new ArrayList<>(e.getValue()));
                }
            }

            return new Response(
                    code,
                    conn.getResponseMessage(),
                    filteredHeaders,
                    responseBody,
                    conn.getURL().toString()
            );
        }
    }
}
