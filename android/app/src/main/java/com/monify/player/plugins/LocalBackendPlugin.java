package com.monify.player.plugins;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;

@CapacitorPlugin(name = "LocalBackendPlugin")
public class LocalBackendPlugin extends Plugin {
    private static final String TAG = "LocalBackendPlugin";

    @PluginMethod
    public void getStreamUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Must provide a video url");
            return;
        }

        getBridge().execute(() -> {
            try {
                String nativeLibraryDir = getContext().getApplicationInfo().nativeLibraryDir;
                String ytDlpPath = new File(nativeLibraryDir, "libytdlp.so").getAbsolutePath();
                
                if (!new File(ytDlpPath).exists()) {
                    call.reject("yt-dlp binary (libytdlp.so) not found in nativeLibraryDir.");
                    return;
                }

                Log.d(TAG, "Executing yt-dlp binary at: " + ytDlpPath);
                ProcessBuilder pb = new ProcessBuilder(
                        ytDlpPath,
                        "-f",
                        "bestaudio[ext=m4a]",
                        "-g",
                        url
                );
                
                Log.d(TAG, "Running command: " + String.join(" ", pb.command()));

                Process process = pb.start();

                // Read stdout
                BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
                String streamUrl = null;
                String line;
                while ((line = reader.readLine()) != null) {
                    Log.d(TAG, "yt-dlp stdout line: " + line);
                    if (streamUrl == null && (line.startsWith("http://") || line.startsWith("https://"))) {
                        streamUrl = line;
                        break; // Stop reading stdout once the first stream URL is found
                    }
                }

                // Read stderr for logging
                BufferedReader errorReader = new BufferedReader(new InputStreamReader(process.getErrorStream()));
                StringBuilder errorOutput = new StringBuilder();
                String errLine;
                while ((errLine = errorReader.readLine()) != null) {
                    errorOutput.append(errLine).append("\n");
                }
                
                if (errorOutput.length() > 0) {
                    Log.d(TAG, "yt-dlp stderr: " + errorOutput.toString());
                }

                int exitCode = process.waitFor();
                process.destroy(); // Prevent process leaks

                if (exitCode != 0 || streamUrl == null) {
                    Log.e(TAG, "yt-dlp failed with exit code " + exitCode + ". Error: " + errorOutput.toString());
                    call.reject("Failed to resolve stream URL");
                } else {
                    Log.i(TAG, "Successfully extracted stream URL: " + streamUrl);
                    JSObject result = new JSObject();
                    result.put("url", streamUrl);
                    call.resolve(result);
                }

            } catch (Exception e) {
                Log.e(TAG, "Error executing yt-dlp", e);
                call.reject("Failed to resolve stream URL: " + e.getMessage());
            }
        });
    }
}
