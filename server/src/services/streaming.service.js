const { spawn } = require('child_process');
const { binaries } = require('../config/binaries');

function createStreamingPipeline({ url, quality }) {
  if (!binaries.ffmpegPath) {
    throw new Error('ffmpeg binary could not be resolved.');
  }

  if (!binaries.ytDlpPath) {
    throw new Error('yt-dlp binary could not be resolved.');
  }

  const ytDlpProcess = spawn(binaries.ytDlpPath, [
    '-f',
    'bestaudio',
    '--quiet',
    '--no-warnings',
    '-o',
    '-',
    url,
  ]);

  const ffmpegProcess = spawn(binaries.ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    'pipe:0',
    '-f',
    'mp3',
    '-b:a',
    quality,
    '-vn',
    'pipe:1',
  ]);

  let cleanedUp = false;

  const ignoreStreamShutdownError = (error) => {
    if (!error || error.code === 'EPIPE' || error.code === 'EOF') {
      return;
    }

    console.error('stream pipeline error:', error);
  };

  ytDlpProcess.stdout.on('error', ignoreStreamShutdownError);
  ytDlpProcess.stdin.on('error', ignoreStreamShutdownError);
  ffmpegProcess.stdout.on('error', ignoreStreamShutdownError);
  ffmpegProcess.stdin.on('error', ignoreStreamShutdownError);

  ytDlpProcess.stdout.pipe(ffmpegProcess.stdin);

  return {
    ytDlpProcess,
    ffmpegProcess,
    cleanup() {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;

      ytDlpProcess.stdout.unpipe(ffmpegProcess.stdin);
      ffmpegProcess.stdout.destroy();
      ffmpegProcess.stdin.destroy();

      if (ytDlpProcess.pid && !ytDlpProcess.killed) {
        ytDlpProcess.kill();
      }

      if (ffmpegProcess.pid && !ffmpegProcess.killed) {
        ffmpegProcess.kill();
      }
    },
  };
}

module.exports = { createStreamingPipeline };
