import { isStreamFresh } from './types.js';

const streamCache = new Map();

export function getCachedStream(videoId) {
  if (!videoId || !streamCache.has(videoId)) {
    return null;
  }

  const cached = streamCache.get(videoId);
  if (!isStreamFresh(cached)) {
    streamCache.delete(videoId);
    return null;
  }

  return cached;
}

export function setCachedStream(videoId, stream) {
  if (!videoId || !stream) {
    return stream;
  }

  streamCache.set(videoId, stream);
  return stream;
}

export function invalidateCachedStream(videoId) {
  if (!videoId) {
    return;
  }

  streamCache.delete(videoId);
}
