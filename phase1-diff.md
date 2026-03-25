# Phase 1 Implementation Diff

This file contains the proposed changes to implement Phase 1: Binary Extraction natively in Android, without applying them to the repository yet.

## File: `android/app/src/main/java/com/monify/player/BinaryExtractor.java` (NEW FILE)
```java
package com.monify.player;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

public class BinaryExtractor {
    private static final String TAG = "BinaryExtractor";
    private static final String ASSETS_BIN_DIR = "bin";
    private static final String INTERNAL_BIN_DIR = "bin";
    private static final String YT_DLP_BIN = "yt-dlp";

    /**
     * Extracts required binaries from assets to internal storage.
     */
    public static void extractBinaries(Context context) {
        extractBinary(context, YT_DLP_BIN);
    }

    private static void extractBinary(Context context, String binaryName) {
        File binDir = new File(context.getFilesDir(), INTERNAL_BIN_DIR);
        if (!binDir.exists()) {
            binDir.mkdirs();
        }

        File file = new File(binDir, binaryName);
        if (file.exists()) {
            Log.d(TAG, binaryName + " already exists in internal storage.");
            ensurePermissions(file, binaryName);
            return;
        }

        try (InputStream is = context.getAssets().open(ASSETS_BIN_DIR + "/" + binaryName);
             FileOutputStream os = new FileOutputStream(file)) {
             
            byte[] buffer = new byte[8192];
            int length;
            while ((length = is.read(buffer)) > 0) {
                os.write(buffer, 0, length);
            }
            
            Log.d(TAG, "Successfully extracted " + binaryName + " to " + file.getAbsolutePath());
            ensurePermissions(file, binaryName);
            
        } catch (IOException e) {
            Log.e(TAG, "Failed to extract " + binaryName, e);
        }
    }

    private static void ensurePermissions(File file, String binaryName) {
        file.setReadable(true);
        file.setWritable(true);
        boolean executable = file.setExecutable(true);
        
        if (!executable) {
            Log.w(TAG, "setExecutable(true) returned false for " + binaryName + ". Attempting chmod.");
            try {
                Runtime.getRuntime().exec("chmod +x " + file.getAbsolutePath());
            } catch (Exception e) {
                Log.e(TAG, "Failed to execute chmod on " + binaryName, e);
            }
        }
    }

    /**
     * Helper method to retrieve the absolute path of a specific binary.
     */
    public static String getBinaryPath(Context context, String binaryName) {
        File binDir = new File(context.getFilesDir(), INTERNAL_BIN_DIR);
        File file = new File(binDir, binaryName);
        return file.getAbsolutePath();
    }
    
    /**
     * Specific helper method to retrieve the yt-dlp binary path.
     */
    public static String getYtDlpPath(Context context) {
        return getBinaryPath(context, YT_DLP_BIN);
    }
}
```

## File: `android/app/src/main/java/com/monify/player/MainActivity.java` (MODIFICATION)
```diff
@@ -1,5 +1,14 @@
 package com.monify.player;
 
+// Import Bundle for onCreate
+import android.os.Bundle;
 import com.getcapacitor.BridgeActivity;
 
-public class MainActivity extends BridgeActivity {}
+public class MainActivity extends BridgeActivity {
+    @Override
+    protected void onCreate(Bundle savedInstanceState) {
+        super.onCreate(savedInstanceState);
+        
+        BinaryExtractor.extractBinaries(this);
+    }
+}
```
