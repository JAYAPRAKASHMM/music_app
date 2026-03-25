User requested adding a configurable trending search limit (default 50) to [config.js](cci:7://file:///d:/company/MusicPlayer/client/assets/config.js:0:0-0:0).

Let me first check where the hardcoded values like `50` and the `TRENDING_QUERY` are used in [app.js](cci:7://file:///d:/company/MusicPlayer/client/assets/app.js:0:0-0:0) to make sure I capture all the values that should move to config:

Searched for "TRENDING_QUERY"
Searched for "limit: 50"

The grep didn't find due to encoding. Let me check the lines directly:

Searched for "limit.*50"

I already know the structure from viewing the file. Lines 3, 398, and 424 use the trending query and limit of 50. Let me update the plan and config to include the trending search limit, then proceed to execution.

Edited implementation_plan.md

Good, plan is updated. Now let me proceed to execution since the user already approved the initial plan and this is a minor addition they requested. Let me start implementing all three fixes:

Plan approved and updated to include `trendingQuery` and `trendingLimit` in config.

Edited config.js
Edited app.js

Now I need to replace the hardcoded `limit: 50` occurrences in [app.js](cci:7://file:///d:/company/MusicPlayer/client/assets/app.js:0:0-0:0) with `TRENDING_LIMIT`. Let me find those:

Viewed app.js:388-425
Edited app.js

Config deduplication is done. Now let me move on to the download retry fix and the Android icon. Let me update the task and proceed:

Completed config deduplication: removed inline default song duplicate from [app.js](cci:7://file:///d:/company/MusicPlayer/client/assets/app.js:0:0-0:0), added `trendingQuery` and `trendingLimit` to [config.js](cci:7://file:///d:/company/MusicPlayer/client/assets/config.js:0:0-0:0), replaced hardcoded limit values in [app.js](cci:7://file:///d:/company/MusicPlayer/client/assets/app.js:0:0-0:0) with `TRENDING_LIMIT`.

Edited LocalBackendPlugin.java

Now add the JS-side retry for download. Let me view the current download function:

Viewed app.js:637-660
Edited app.js

Now let me work on the Android app icon. Let me generate the icon PNGs from the SVG logo:

Completed config deduplication and download retry fixes. Added retry logic in both [LocalBackendPlugin.java](cci:7://file:///d:/company/MusicPlayer/android/app/src/main/java/com/monify/player/plugins/LocalBackendPlugin.java:0:0-0:0) (Java side) and [app.js](cci:7://file:///d:/company/MusicPlayer/client/assets/app.js:0:0-0:0) (JS download function).

Ran command: `npm install --save-dev sharp`

Sharp is installed. Now let me create a script to generate all the Android icon PNGs:

Created generate_icons.js
Ran command: `node /tmp/generate_icons.js`

Windows path issue — `/tmp` maps to `D:\tmp` on Windows. Let me use a Windows-compatible path:

Created generate_icons.js