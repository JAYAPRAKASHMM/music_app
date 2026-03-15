package com.monify.player.plugins;

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
import java.util.Map;

@CapacitorPlugin(name = "LocalBackendPlugin")
public class LocalBackendPlugin extends Plugin {
    private static final String TAG = "LocalBackendPlugin";
    // volatile ensures the init flag is visible across threads
    private static volatile boolean initialized = false;

    @Override
    public void load() {
        super.load();
        // NewPipe.init() only sets the downloader (no I/O), safe to call on main thread
        if (!initialized) {
            try {
                NewPipe.init(new SimpleDownloader());
                initialized = true;
                Log.d(TAG, "NewPipeExtractor initialized");
            } catch (Exception e) {
                Log.e(TAG, "NewPipeExtractor init failed: " + e.getMessage());
            }
        }
    }

    /** Stub so JS initYoutubeDL() toast resolves immediately */
    @PluginMethod
    public void initYoutubeDL(PluginCall call) {
        JSObject result = new JSObject();
        result.put("status", "DONE");
        call.resolve(result);
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

        // getBridge().execute() uses a thread-pool executor — safe for network I/O
        final String finalUrl = videoUrl;
        getBridge().execute(() -> {
            try {
                Log.d(TAG, "Extracting stream for: " + finalUrl);
                StreamInfo info = StreamInfo.getInfo(ServiceList.YouTube, finalUrl);
                List<AudioStream> audioStreams = info.getAudioStreams();

                if (audioStreams == null || audioStreams.isEmpty()) {
                    call.reject("No audio streams found for: " + finalUrl);
                    return;
                }

                // Walk the stream list: prefer m4a (most compatible with Android WebView)
                // Only accept streams that are direct URLs (not DASH manifests)
                String streamUrl = null;

                // Pass 1: m4a direct URL
                for (AudioStream stream : audioStreams) {
                    if (stream.isUrl() && stream.getContent() != null
                            && stream.getFormat() == MediaFormat.M4A) {
                        streamUrl = stream.getContent();
                        break;
                    }
                }

                // Pass 2: any direct URL stream as fallback
                if (streamUrl == null) {
                    for (AudioStream stream : audioStreams) {
                        if (stream.isUrl() && stream.getContent() != null
                                && !stream.getContent().isEmpty()) {
                            streamUrl = stream.getContent();
                            break;
                        }
                    }
                }

                if (streamUrl == null || streamUrl.isEmpty()) {
                    call.reject("No direct stream URL found (all streams are manifests)");
                    return;
                }

                Log.d(TAG, "Resolved: " + streamUrl.substring(0, Math.min(100, streamUrl.length())));
                JSObject result = new JSObject();
                result.put("url", streamUrl);
                call.resolve(result);

            } catch (Exception e) {
                String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                Log.e(TAG, "getStreamUrl failed: " + msg);
                call.reject("Failed to resolve stream URL: " + msg);
            }
        });
    }

    /** HttpURLConnection-based downloader for NewPipeExtractor */
    private static class SimpleDownloader extends Downloader {
        private static final String UA =
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/124.0.0.0 Safari/537.36";
        private static final int TIMEOUT_MS = 15_000;

        @Override
        public Response execute(Request request) throws IOException {
            HttpURLConnection conn =
                    (HttpURLConnection) new URL(request.url()).openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);

            // Set HTTP method (GET, POST, HEAD, etc.)
            String method = request.httpMethod();
            conn.setRequestMethod(method != null ? method : "GET");

            conn.setRequestProperty("User-Agent", UA);

            // Copy request headers — skip null keys (HttpURLConnection rejects them)
            for (Map.Entry<String, List<String>> h : request.headers().entrySet()) {
                if (h.getKey() == null) continue;
                for (String v : h.getValue()) {
                    conn.setRequestProperty(h.getKey(), v);
                }
            }

            // Send body for POST requests (v0.24.2 api: dataToSend())
            byte[] body = request.dataToSend();
            if (body != null && body.length > 0) {
                conn.setDoOutput(true);
                conn.getOutputStream().write(body);
            }

            conn.connect();
            int code = conn.getResponseCode();

            // Read response body with explicit UTF-8
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

            // Filter null keys from response headers to prevent NPE in NewPipe
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
