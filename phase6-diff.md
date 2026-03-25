# Phase 6 Implementation Diff

This file contains the proposed change to fix the Capacitor Plugin Registration issue.

## Strategy Analysis
*   **The Problem:** The Chrome console logs show that `window.Capacitor.Plugins.LocalBackendPlugin` is entirely missing (evaluating to undefined), meaning `app.js` bypasses the native attempt and falls back to hitting `https://localhost/api/stream`.
*   **The Cause:** Your `package.json` reveals the app is using **Capacitor v8**. In Capacitor v3+, the `registerPlugin()` method inside `onCreate()` requires a slightly different initialization lifecycle. Calling `registerPlugin` synchronously right after `super.onCreate` sometimes fails to bind the plugin to the WebView bridge if the bridge hasn't finished initializing. 
*   **The Fix:** Capacitor provides an overridden `onCreate` method specifically for this, allowing us to pass a list of plugin classes directly into `this.init()` or by appending them to the generated plugin list. For modern Capacitor versions, the recommended approach when bypassing the auto-generator is simply using `registerPlugin` inside the `init()` lambda, or placing `registerPlugin` *before* `super.onCreate(savedInstanceState)`.

## File: `android/app/src/main/java/com/monify/player/MainActivity.java` (MODIFICATION)
```diff
@@ -6,10 +6,13 @@
 public class MainActivity extends BridgeActivity {
     @Override
     protected void onCreate(Bundle savedInstanceState) {
-        super.onCreate(savedInstanceState);
-        
+        registerPlugin(com.monify.player.plugins.LocalBackendPlugin.class);
+        super.onCreate(savedInstanceState);
+
         BinaryExtractor.extractBinaries(this);
-        registerPlugin(com.monify.player.plugins.LocalBackendPlugin.class);
     }
 }
```
