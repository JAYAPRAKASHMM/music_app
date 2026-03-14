const express = require('express');

const router = express.Router();

router.get('/resolve', async (req, res) => {
  const url = String(req.query.url || '').trim();

  if (!url) {
    return res.status(400).json({ error: 'Query parameter "url" is required.' });
  }

  try {
    const target = new URL('https://www.youtube.com/oembed');
    target.searchParams.set('url', url);
    target.searchParams.set('format', 'json');

    const response = await fetch(target);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || `oEmbed failed with status ${response.status}`);
    }

    return res.json({
      title: data.title || '',
      channelTitle: data.author_name || '',
      thumbnail: data.thumbnail_url || '',
    });
  } catch (error) {
    console.error('resolve metadata error:', error);
    return res.status(502).json({
      error: 'Unable to resolve YouTube metadata for this URL.',
    });
  }
});

module.exports = router;
