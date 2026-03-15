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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Scanner;

@CapacitorPlugin(name = "LocalBackendPlugin")
public class LocalBackendPlugin extends Plugin {
    private static final String TAG = "LocalBackendPlugin";
    private static boolean initialized = false;

    @Override
    public void load() {
        super.load();
        if (!initialized) {
            try {
                NewPipe.init(new SimpleDownloader());
                initialized = true;
                Log.d(TAG, "NewPipeExtractor initialized successfully");
            } catch (Exception e) {
                Log.e(TAG, "Failed to init NewPipeExtractor: " + e.getMessage());
            }
        }
    }

    /** Stub kept so the JS initYoutubeDL() toast resolves immediately */
    @PluginMethod
    public void initYoutubeDL(PluginCall call) {
        JSObject result = new JSObject();
        result.put("status", "DONE");
        call.resolve(result);
    }

    @PluginMethod
    public void getStreamUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Must provide a video url");
            return;
        }

        getBridge().execute(() -> {
            try {
                Log.d(TAG, "Extracting stream for: " + url);
                StreamInfo info = StreamInfo.getInfo(ServiceList.YouTube, url);
                List<AudioStream> audioStreams = info.getAudioStreams();

                if (audioStreams == null || audioStreams.isEmpty()) {
                    call.reject("No audio streams found for: " + url);
                    return;
                }

                // Prefer m4a format for best Android WebView compatibility
                String streamUrl = null;
                for (AudioStream stream : audioStreams) {
                    String content = stream.getContent();
                    if (content != null && stream.getFormat() == MediaFormat.M4A) {
                        streamUrl = content;
                        break;
                    }
                }
                // Fall back to the first available stream if no m4a
                if (streamUrl == null) {
                    streamUrl = audioStreams.get(0).getContent();
                }

                if (streamUrl == null || streamUrl.isEmpty()) {
                    call.reject("Stream URL was empty");
                    return;
                }

                Log.d(TAG, "Resolved stream URL (first 80): " + streamUrl.substring(0, Math.min(80, streamUrl.length())));
                JSObject result = new JSObject();
                result.put("url", streamUrl);
                call.resolve(result);

            } catch (Exception e) {
                Log.e(TAG, "getStreamUrl failed: " + e.getMessage());
                call.reject("Failed to resolve stream URL: " + e.getMessage());
            }
        });
    }

    /** Minimal HttpURLConnection-based downloader for NewPipeExtractor */
    private static class SimpleDownloader extends Downloader {
        private static final String UA =
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/124.0.0.0 Safari/537.36";

        @Override
        public Response execute(Request request) throws IOException {
            HttpURLConnection conn = (HttpURLConnection) new URL(request.url()).openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent", UA);

            for (Map.Entry<String, List<String>> h : request.headers().entrySet()) {
                for (String v : h.getValue()) {
                    conn.setRequestProperty(h.getKey(), v);
                }
            }

            byte[] body = request.httpBody();
            if (body != null) {
                conn.setDoOutput(true);
                conn.setRequestMethod("POST");
                conn.getOutputStream().write(body);
            }

            conn.connect();
            int code = conn.getResponseCode();
            InputStream is = code < 400 ? conn.getInputStream() : conn.getErrorStream();
            String responseBody = "";
            if (is != null) {
                try (Scanner s = new Scanner(is).useDelimiter("\\A")) {
                    responseBody = s.hasNext() ? s.next() : "";
                }
            }

            Map<String, List<String>> headers = new HashMap<>(conn.getHeaderFields());
            return new Response(code, conn.getResponseMessage(), headers, responseBody, conn.getURL().toString());
        }
    }
}
