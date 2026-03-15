export const STREAM_STALE_WINDOW_MS = 60 * 1000;
export const DEFAULT_STREAM_TTL_MS = 15 * 60 * 1000;
export const DEFAULT_FILE_EXTENSION = 'webm';
export const MAX_STREAM_RETRIES = 1;

export function extractVideoId(input) {
  if (!input) {
    return '';
  }

  if (typeof input === 'object') {
    if (typeof input.videoId === 'string' && input.videoId.trim()) {
      return input.videoId.trim();
    }

    if (typeof input.id === 'string' && input.id.trim()) {
      return input.id.trim();
    }

    if (typeof input.url === 'string') {
      return extractVideoId(input.url);
    }
  }

  const raw = String(input).trim();
  if (!raw) {
    return '';
  }

  if (/^[\w-]{11}$/.test(raw)) {
    return raw;
  }

  try {
    const parsed = new URL(raw);

    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.replace(/^\//, '').slice(0, 11);
    }

    if (parsed.searchParams.has('v')) {
      return parsed.searchParams.get('v').slice(0, 11);
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    const embeddedId = parts.find((part, index) => (
      ['embed', 'shorts', 'live'].includes(parts[index - 1]) && /^[\w-]{11}$/.test(part)
    ));

    return embeddedId || '';
  } catch (_error) {
    return '';
  }
}

export function toWatchUrl(input, videoId = extractVideoId(input)) {
  if (typeof input === 'object' && typeof input.url === 'string' && input.url.trim()) {
    return input.url.trim();
  }

  const raw = String(input || '').trim();
  if (!raw) {
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
}

export function isStreamFresh(stream) {
  if (!stream?.streamUrl) {
    return false;
  }

  if (!Number.isFinite(stream.expiresAt)) {
    return true;
  }

  return stream.expiresAt - Date.now() > STREAM_STALE_WINDOW_MS;
}

export function normalizeStreamResult(input, result) {
  const videoId = extractVideoId(input);
  const sourceUrl = toWatchUrl(input, videoId);

  if (!result || typeof result.streamUrl !== 'string' || !result.streamUrl.trim()) {
    throw new Error('Extractor did not return a playable stream URL.');
  }

  const expiresAt = Number.isFinite(result.expiresAt)
    ? result.expiresAt
    : Date.now() + DEFAULT_STREAM_TTL_MS;

  return {
    videoId,
    sourceUrl,
    streamUrl: result.streamUrl.trim(),
    mimeType: result.mimeType || 'audio/webm',
    expiresAt,
    fileExtension: result.fileExtension || DEFAULT_FILE_EXTENSION,
  };
}
