const { youtube } = require('../config/youtube');
const { env } = require('../config/env');
const { parseIso8601DurationToSeconds } = require('../utils/youtube-duration');
const { TimedLruCache } = require('../utils/timed-lru-cache');

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const queryCache = new TimedLruCache({
  maxEntries: env.searchCacheMaxEntries,
  ttlMs: env.searchCacheTtlMs,
});
const inFlightSearches = new Map();

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`YouTube API request failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function searchVideos(query, minDuration = 120) {
  if (!youtube.apiKey) {
    throw new Error('YouTube Data API key is missing.');
  }

  const normalizedQuery = query.trim().toLowerCase();
  const cachedResults = queryCache.get(normalizedQuery);

  if (cachedResults) {
    return cachedResults;
  }

  if (inFlightSearches.has(normalizedQuery)) {
    return inFlightSearches.get(normalizedQuery);
  }

  const searchPromise = (async () => {
    const searchParams = new URLSearchParams({
      key: youtube.apiKey,
      q: query,
      part: 'snippet',
      type: 'video',
      maxResults: '50',
      videoEmbeddable: 'true',
      safeSearch: 'moderate',
    });

    const searchResponse = await fetchJson(`${YOUTUBE_API_BASE}/search?${searchParams.toString()}`);
    const videoIds = searchResponse.items
      .map((item) => item.id && item.id.videoId)
      .filter(Boolean);

    if (videoIds.length === 0) {
      queryCache.set(normalizedQuery, []);
      return [];
    }

    const detailsParams = new URLSearchParams({
      key: youtube.apiKey,
      id: videoIds.join(','),
      part: 'contentDetails,snippet',
      maxResults: String(videoIds.length),
    });

    const detailsResponse = await fetchJson(`${YOUTUBE_API_BASE}/videos?${detailsParams.toString()}`);

    const results = detailsResponse.items
      .map((item) => {
        const durationSeconds = parseIso8601DurationToSeconds(item.contentDetails.duration);
        let thumbnailUrl = '';
        if (item.snippet.thumbnails) {
          thumbnailUrl = (item.snippet.thumbnails.high || item.snippet.thumbnails.medium || item.snippet.thumbnails.default || {}).url || '';
        }

        return {
          id: item.id,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          thumbnail: thumbnailUrl,
          url: `https://www.youtube.com/watch?v=${item.id}`,
          durationSeconds,
        };
      })
      .filter((item) => item.durationSeconds !== null && item.durationSeconds >= minDuration)
      .filter((item) => !item.title.toLowerCase().includes('#shorts'));

    queryCache.set(normalizedQuery, results);
    return results;
  })();

  inFlightSearches.set(normalizedQuery, searchPromise);

  try {
    return await searchPromise;
  } finally {
    inFlightSearches.delete(normalizedQuery);
  }
}

module.exports = { searchVideos };
