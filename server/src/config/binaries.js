const path = require('path');

const binaries = {
  ffmpegPath: path.join(process.cwd(), "bin/ffmpeg"),
  ytDlpPath: path.join(process.cwd(), "bin/yt-dlp"),
};

module.exports = { binaries };