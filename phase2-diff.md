# Phase 2 Implementation Diff

This file contains the proposed changes to implement Phase 2: Native Android Bridge.

## File: `android/app/src/main/java/com/monify/player/plugins/LocalBackendPlugin.java` (NEW FILE)
```java
package com.monify.player.plugins;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.monify.player.BinaryExtractor;

import java.io.BufferedReader;
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
                String ytDlpPath = BinaryExtractor.getYtDlpPath(getContext());
                ProcessBuilder pb = new ProcessBuilder(
                        ytDlpPath,
                        "-f",
                        "bestaudio",
                        "-g",
                        url
                );

                Process process = pb.start();

                // Read stdout
                BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
                String streamUrl = null;
                String line;
                while ((line = reader.readLine()) != null) {
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
```

## File: `android/app/src/main/java/com/monify/player/MainActivity.java` (MODIFICATION)
```diff
@@ -1,13 +1,15 @@
 package com.monify.player;
 
 import android.os.Bundle;
 import com.getcapacitor.BridgeActivity;
 
 public class MainActivity extends BridgeActivity {
     @Override
     protected void onCreate(Bundle savedInstanceState) {
         super.onCreate(savedInstanceState);
         
         BinaryExtractor.extractBinaries(this);
+        registerPlugin(com.monify.player.plugins.LocalBackendPlugin.class);
     }
 }
```
Edited phase2-diff.md

The requested adjustments have been made to Phase 2:

1.  In `LocalBackendPlugin.java`, reading `stdout` now stops explicitly (`break;`) when the first valid URL is found.
2.  `process.destroy()` has been added right after `process.waitFor()` to prevent process leaks.
3.  In `MainActivity.java`, the plugin registration is accurately placed *after* `super.onCreate(savedInstanceState)` and `BinaryExtractor.extractBinaries(this)`.

You can view the updated script diff in `d:\company\MusicPlayer\phase2-diff.md`. 

Let me know if this revision looks perfect or if you want me to apply the changes to the Android app!