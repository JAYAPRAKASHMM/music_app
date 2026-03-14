const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'music.youtube.com',
]);

const ALLOWED_QUALITIES = new Set(['64k', '96k', '128k', '192k', '256k', '320k']);

function isValidYoutubeUrl(rawUrl) {
  try {
    const parsedUrl = new URL(rawUrl);
    return ALLOWED_HOSTS.has(parsedUrl.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function normalizeQuality(rawQuality, fallbackQuality) {
  if (!rawQuality) {
    return fallbackQuality;
  }

  return ALLOWED_QUALITIES.has(rawQuality) ? rawQuality : null;
}

module.exports = {
  isValidYoutubeUrl,
  normalizeQuality,
  ALLOWED_QUALITIES: [...ALLOWED_QUALITIES],
};
