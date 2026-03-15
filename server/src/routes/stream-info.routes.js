const express = require('express');
const { resolveStreamInfo } = require('../services/stream-info.service');

const router = express.Router();

function getRequestParams(req) {
  return {
    videoId: String(req.query.videoId || '').trim(),
    preferredQuality: String(req.query.quality || '').trim(),
  };
}

function validateVideoId(videoId, res) {
  if (!videoId) {
    res.status(400).json({ error: 'Query parameter "videoId" is required.' });
    return false;
  }

  return true;
}

router.get('/stream-info', async (req, res) => {
  const { videoId, preferredQuality } = getRequestParams(req);

  if (!validateVideoId(videoId, res)) {
    return;
  }

  try {
    const stream = await resolveStreamInfo({ videoId, preferredQuality });
    const params = new URLSearchParams({ videoId });
    if (preferredQuality) {
      params.set('quality', preferredQuality);
    }

    return res.json({
      streamUrl: `/api/stream-open?${params.toString()}`,
      mimeType: stream.mimeType,
      expiresAt: stream.expiresAt,
      fileExtension: stream.fileExtension,
    });
  } catch (error) {
    console.error('stream info resolve error:', error);
    return res.status(500).json({ error: error.message || 'Unable to resolve stream info.' });
  }
});

router.get('/stream-open', async (req, res) => {
  const { videoId, preferredQuality } = getRequestParams(req);

  if (!validateVideoId(videoId, res)) {
    return;
  }

  try {
    const stream = await resolveStreamInfo({ videoId, preferredQuality });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return res.redirect(302, stream.streamUrl);
  } catch (error) {
    console.error('stream open resolve error:', error);
    return res.status(500).json({ error: error.message || 'Unable to open stream.' });
  }
});

module.exports = router;
