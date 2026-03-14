const express = require('express');
const { env } = require('../config/env');
const { createStreamingPipeline } = require('../services/streaming.service');
const { tryAcquireStreamSlot, getStreamCapacitySnapshot } = require('../services/stream-capacity.service');
const { isValidYoutubeUrl, normalizeQuality, ALLOWED_QUALITIES } = require('../utils/stream-request');

const router = express.Router();

function sanitizeDownloadFilename(rawValue) {
  const normalized = String(rawValue || 'song')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return normalized || 'song';
}

function handleStreamRequest(req, res, contentDisposition) {
  const youtubeUrl = req.query.url;
  const quality = normalizeQuality(req.query.quality, env.defaultQuality);

  if (!youtubeUrl) {
    return res.status(400).json({ error: 'Query parameter "url" is required.' });
  }

  if (!isValidYoutubeUrl(youtubeUrl)) {
    return res.status(400).json({
      error: 'Only YouTube and YouTube Music URLs are supported.',
    });
  }

  if (!quality) {
    return res.status(400).json({
      error: `Unsupported quality. Allowed values: ${ALLOWED_QUALITIES.join(', ')}`,
    });
  }

  const slot = tryAcquireStreamSlot();

  if (!slot) {
    const capacity = getStreamCapacitySnapshot();
    return res.status(503).json({
      error: 'Server is busy. Try again in a moment.',
      capacity,
    });
  }

  const startedAt = Date.now();
  console.log(`[stream] start ${youtubeUrl} @ ${quality}`);

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-store');
  if (contentDisposition) {
    res.setHeader('Content-Disposition', contentDisposition);
  }

  let pipeline;

  try {
    pipeline = createStreamingPipeline({ url: youtubeUrl, quality });
  } catch (error) {
    console.error('stream pipeline setup error:', error);
    slot.release();
    return res.status(500).json({
      error: 'Streaming pipeline could not be created. Check server dependencies.',
    });
  }

  let streamOpened = false;
  let finalized = false;

  const finalize = (reason) => {
    if (finalized) {
      return;
    }

    finalized = true;
    pipeline.cleanup();
    slot.release();
    console.log(`[stream] end reason=${reason} durationMs=${Date.now() - startedAt}`);
  };

  pipeline.ytDlpProcess.on('error', (error) => {
    console.error('yt-dlp error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to start yt-dlp.' });
    }
    finalize('yt-dlp-error');
  });

  pipeline.ffmpegProcess.on('error', (error) => {
    console.error('ffmpeg error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to start ffmpeg.' });
    }
    finalize('ffmpeg-error');
  });

  pipeline.ffmpegProcess.stdout.once('data', () => {
    streamOpened = true;
    console.log(`[stream] first-byte in ${Date.now() - startedAt}ms`);
  });

  pipeline.ytDlpProcess.once('close', (code) => {
    if (code === 0 || streamOpened || res.writableEnded) {
      return;
    }

    if (!res.headersSent) {
      res.status(502).json({ error: 'yt-dlp could not extract the requested stream.' });
    }

    finalize(`yt-dlp-close-${code}`);
  });

  pipeline.ffmpegProcess.once('close', (code) => {
    if (code === 0 || res.writableEnded) {
      finalize(`ffmpeg-close-${code}`);
      return;
    }

    if (!res.headersSent) {
      res.status(502).json({ error: 'FFmpeg failed to transcode the requested stream.' });
    } else if (!res.destroyed) {
      res.end();
    }

    finalize(`ffmpeg-close-${code}`);
  });

  pipeline.ffmpegProcess.stdout.pipe(res);

  res.on('close', () => {
    finalize('response-close');
  });

  req.on('aborted', () => {
    finalize('request-aborted');
  });

  req.on('close', () => {
    finalize('request-close');
  });
}

router.get('/stream', (req, res) => {
  handleStreamRequest(req, res, null);
});

router.get('/download', (req, res) => {
  const durationSeconds = parseInt(req.query.duration, 10);
  
  if (!Number.isNaN(durationSeconds) && durationSeconds > 420) {
    const min = Math.round(durationSeconds / 60);
    return res.status(400).json({ error: `Bro, what are you going to listen to for ${min} minutes? It's a music player, not an audiobook! Play something under 7 mins.` });
  }

  const filename = sanitizeDownloadFilename(req.query.title);
  handleStreamRequest(req, res, `attachment; filename="${filename}.mp3"`);
});

module.exports = router;
