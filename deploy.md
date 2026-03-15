# Deploying Monify to Render.com 🚀

Monify is currently a **full-stack Node.js application** (Express backend serving static frontend files). Render.com is an excellent, free host for deploying Node Web Services.

Because Monify relies heavily on real-time binary pipes using `yt-dlp` and `ffmpeg`, we must ensure the host server environment has these native binaries installed! Render uses Docker underneath, but its native "Node Build" environment might not have `yt-dlp` and `ffmpeg`.

## Step 1: Prepare the Source Code

Ensure you have a `.gitignore` file so you don't accidentally push your secret API key or `node_modules` to GitHub!

Your `.gitignore` must explicitly include:
```text
node_modules/
.env
api.apikey
*.out
*.err
```

## Step 2: Push to GitHub
1. Initialize a git repository locally: `git init` (if not done).
2. Commit your files: `git add .` and `git commit -m "Initial commit"`
3. Create a **Private Repository** (Highly Recommended to prevent bots finding your code) on GitHub.
4. Push your local code to the GitHub repository.

## Step 3: Setting Up Render.com

1. Create a free account at [Render.com](https://render.com).
2. Click **New +** and select **Web Service**.
3. Under "Connect a repository", connect your GitHub account and select your Monify repository.
4. Name your service (e.g., `monify-music`).
5. Choose your Region.
6. **Environment Configuration**:
   - Runtime: **Node**
   - Build Command: `npm run install:server`
   - Start Command: `npm start`
7. Choose the **Free** instance type.

## ⚠️ Step 4: The Critical Security Step (API KEYS)

**DO NOT EVER hardcode your `YOUTUBE_API_KEY` into `index.js` or commit the `api.apikey` or `.env` file to GitHub.** Bots scrape GitHub 24/7 to steal YouTube API keys to fuel their own spam bots, running up your quota or resulting in account bans.

**How to safely provide the key to Render:**
1. While creating the Web Service (before clicking Create), scroll down to the **Advanced** section.
2. Click **Add Environment Variable**.
3. Keep the "Key" box as: `YOUTUBE_API_KEY`
4. Copy-paste your actual API key exactly string (from your local `api.apikey` or `.env`) into the "Value" box securely.
5. Add any other environment variables your `env.js` config requires (e.g., `PORT` = `10000`).

## Step 5: Fixing the Missing System Dependencies (`ffmpeg` & `yt-dlp`)

Render's native Node JS environment doesn't come with `ffmpeg` or `yt-dlp` installed globally on the Linux OS.
If you deploy right now, the website will load, you can search for songs (because it uses the API Key), but **Playback will fail** giving a HTTP 500 error because the `spawn('ffmpeg')` child process will crash.

To fix this, you must slightly alter how Render builds your environment by moving to a `render.yaml` Blueprint or Dockerfile, OR by using Render's handy **Build Scripts**.

In your Render **Environment Variables** (Advanced tab), add a special key:
**Key**: `RENDER_POST_BUILD_SCRIPT`
**Value**: `apt-get update && apt-get install -y ffmpeg curl && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp`

*(Note: Depending on Render's root permissions on free tiers, if that script fails, you'll need to package an `apt-get` alternative script locally or switch the environment from "Node" to "Docker" and provide a 4-line `Dockerfile`).*

## Step 6: Deploy 🚀

Click **Create Web Service**. Render will spend a few minutes installing Node modules, processing the post-build script, and spinning up the server.

Once you see `Music Player Engine ready`, click the URL given by Render (e.g., `https://monify-music.onrender.com`).
You are live!
