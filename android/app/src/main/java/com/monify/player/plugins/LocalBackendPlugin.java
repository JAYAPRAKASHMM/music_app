package com.monify.player.plugins;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;

@CapacitorPlugin(name = "LocalBackendPlugin")
public class LocalBackendPlugin extends Plugin {
    private static final String TAG = "LocalBackendPlugin";

    @PluginMethod
    public void initYoutubeDL(PluginCall call) {
        new Thread(() -> {
            try {
                YoutubeDL.getInstance().init(getContext());
                Log.d(TAG, "YoutubeDL initialized successfully");

                JSObject result = new JSObject();
                result.put("status", "DONE");
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "initYoutubeDL failed: " + e.getMessage());
                call.reject("initYoutubeDL failed: " + e.getMessage());
            }
        }).start();
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
                Log.d(TAG, "Requesting stream URL for: " + url);

                YoutubeDLRequest request = new YoutubeDLRequest(url);
                request.addOption("-f", "bestaudio[ext=m4a]/bestaudio");
                request.addOption("-g");

                YoutubeDLResponse response = YoutubeDL.getInstance().execute(request, null, null);
                String streamUrl = response.getOut().trim();

                Log.d(TAG, "Resolved stream URL: " + streamUrl);

                if (streamUrl.isEmpty()) {
                    call.reject("yt-dlp returned empty stream URL");
                    return;
                }

                JSObject result = new JSObject();
                result.put("url", streamUrl);
                call.resolve(result);

            } catch (Exception e) {
                Log.e(TAG, "Failed to resolve stream URL: " + e.getMessage());
                call.reject("Failed to resolve stream URL: " + e.getMessage());
            }
        });
    }
}
