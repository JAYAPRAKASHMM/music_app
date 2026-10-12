const express = require('express');
const { searchVideos } = require('../services/youtube-search.service');

const router = express.Router();

router.get('/search', async (req, res) => {
  let query = String(req.query.q || '').trim();

  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }

  const minDuration = parseInt(req.query.minDuration, 10) || 120;

  // Auto-append 'song' to narrow down results to music
  if (!query.toLowerCase().endsWith('song') && !query.toLowerCase().endsWith('songs')) {
    query += ' song';
  }

  try {
    const results = await searchVideos(query, minDuration);
    return res.json({ results });
  } catch (error) {
    console.error('youtube search error:', error);
    return res.status(500).json({
      error: 'YouTube search failed. Check your API key and server connectivity.',
    });
  }
});

module.exports = router;
