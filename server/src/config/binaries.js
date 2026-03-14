const fs = require('fs');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');

function resolveYtDlpBinary() {
  const packageRoot = path.dirname(require.resolve('youtube-dl-exec/package.json'));
  const candidates = process.platform === 'win32'
    ? ['bin/yt-dlp.exe', 'bin/yt-dlp']
    : ['bin/yt-dlp', 'bin/yt-dlp.exe'];

  for (const relativePath of candidates) {
    const resolvedPath = path.join(packageRoot, relativePath);
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }

  throw new Error('yt-dlp binary could not be resolved from youtube-dl-exec.');
}

const binaries = {
  ffmpegPath,
  ytDlpPath: resolveYtDlpBinary(),
};

module.exports = { binaries };
