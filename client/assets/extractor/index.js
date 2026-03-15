import { MAX_STREAM_RETRIES } from './types.js';
import { extractVideoId, refreshYoutubeAudioStream, resolveYoutubeAudioStream } from './youtube.js';

export async function resolveAudioStream(input, options = {}) {
  return resolveYoutubeAudioStream(input, options);
}

export async function refreshAudioStream(previous, options = {}) {
  return refreshYoutubeAudioStream(previous, options);
}

window.MonifyExtractor = {
  resolveAudioStream,
  refreshAudioStream,
  extractVideoId,
  MAX_STREAM_RETRIES,
};
