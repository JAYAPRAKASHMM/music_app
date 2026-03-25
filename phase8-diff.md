# Phase 8 Implementation Diff

This diff focuses on bypassing the strict execution block encountered on Android.

## Strategy Analysis
*   **The Problem:** The Javascript successfully bridged to the Java code (Hooray!), but Android blocked `ProcessBuilder.start()` with:
    `Cannot run program ".../files/bin/yt-dlp": error=13, Permission denied`.
*   **The Cause:** Starting in Android 10 (API level 29), Google implemented W^X (Write XOR Execute) security policies across the entire OS. Apps are completely forbidden from executing files located in their writable home directories (like `getFilesDir()` or `getCacheDir()`). The `setExecutable(true)` call succeeds, but the kernel (SELinux) blocks the actual execution.
*   **The Fix:** The only officially supported way to execute external binaries in modern Android is to trick the Android Package Manager into treating the external binary as a standard C/C++ library (`.so`). 
    1. During build, we place the binary inside `android/app/src/main/jniLibs/arm64-v8a/libytdlp.so`.
    2. When Android installs the APK, it sees `.so` files in the `jniLibs` folder, cryptographically signs them, and installs them natively into `applicationInfo.nativeLibraryDir` with kernel-level executable permissions already applied.
    3. We can just execute the path to the `.so` file! No more `BinaryExtractor` needed.

## Steps

1. **Delete** `BinaryExtractor.java`.
2. **Remove** `BinaryExtractor.extractBinaries(this);` from `MainActivity.java`.
3. **Move/Rename** the binary from `android/app/src/main/assets/bin/yt-dlp` to `android/app/src/main/jniLibs/arm64-v8a/libytdlp.so` (and delete the old assets folder).
4. **Update** `LocalBackendPlugin.java` to resolve the path using `getContext().getApplicationInfo().nativeLibraryDir + "/libytdlp.so"`.

## File: `android/app/src/main/java/com/monify/player/plugins/LocalBackendPlugin.java` (MODIFICATION)
```diff
@@ -9,8 +9,7 @@
 import com.getcapacitor.PluginMethod;
 import com.getcapacitor.annotation.CapacitorPlugin;
 
-import com.monify.player.BinaryExtractor;
-
 import java.io.BufferedReader;
+import java.io.File;
 import java.io.InputStreamReader;
 
 @CapacitorPlugin(name = "LocalBackendPlugin")
@@ -28,7 +27,14 @@
 
         getBridge().execute(() -> {
             try {
-                String ytDlpPath = BinaryExtractor.getYtDlpPath(getContext());
+                String nativeLibraryDir = getContext().getApplicationInfo().nativeLibraryDir;
+                String ytDlpPath = new File(nativeLibraryDir, "libytdlp.so").getAbsolutePath();
+                
+                if (!new File(ytDlpPath).exists()) {
+                    call.reject("yt-dlp binary (libytdlp.so) not found in nativeLibraryDir.");
+                    return;
+                }
+
                 Log.d(TAG, "Executing yt-dlp binary at: " + ytDlpPath);
                 ProcessBuilder pb = new ProcessBuilder(
```

If you approve this plan, I will automate the file movements, rename the binary, delete the extractor, apply the diffs, and commit it to GitHub!
