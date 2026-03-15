import { getCachedStream, invalidateCachedStream, setCachedStream } from './cache.js';
import { extractVideoId, normalizeStreamResult, toWatchUrl } from './types.js';

const DEFAULT_RESOLVER_TIMEOUT_MS = 10000;
const DEFAULT_PROVIDER_ORDER = [
  {
    kind: 'piped',
    baseUrl: 'https://pipedapi.kavin.rocks',
  },
  {
    kind: 'piped',
    baseUrl: 'https://pipedapi.adminforge.de',
  },
  {
    kind: 'invidious',
    baseUrl: 'https://inv.nadeko.net',
  },
];

function getConfiguredResolver() {
  const resolver = window.MONIFY_CONFIG?.streamResolver;

  if (typeof resolver !== 'function') {
    throw new Error(
      'No browser stream resolver is configured. Set window.MONIFY_CONFIG.streamResolver to a client-side extractor function.',
    );
  }

  return resolver;
}

function buildResolverInput(input, options = {}) {
  const videoId = extractVideoId(input);
  const url = toWatchUrl(input, videoId);

  if (!videoId && !url) {
    throw new Error('A valid YouTube videoId or watch URL is required.');
  }

  return {
    videoId,
    url,
    preferredQuality: options.preferredQuality || null,
    forceRefresh: Boolean(options.forceRefresh),
  };
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function parseUrlExpiry(streamUrl) {
  if (!streamUrl) {
    return null;
  }

  try {
    const parsed = new URL(streamUrl);
    const rawExpire = parsed.searchParams.get('expire') || parsed.searchParams.get('expires');
    if (!rawExpire) {
      return null;
    }

    const expireValue = Number(rawExpire);
    if (!Number.isFinite(expireValue)) {
      return null;
    }

    return expireValue > 1e12 ? expireValue : expireValue * 1000;
  } catch (_error) {
    return null;
  }
}

function inferFileExtension(mimeType, fallback = 'webm') {
  const normalized = String(mimeType || '').toLowerCase();

  if (normalized.includes('audio/mp4') || normalized.includes('video/mp4')) {
    return 'm4a';
  }

  if (normalized.includes('audio/webm') || normalized.includes('video/webm')) {
    return 'webm';
  }

  if (normalized.includes('audio/mpeg')) {
    return 'mp3';
  }

  if (normalized.includes('audio/ogg')) {
    return 'ogg';
  }

  return fallback;
}

function extractMimeType(stream) {
  return stream?.mimeType || stream?.type || stream?.container || 'audio/webm';
}

function extractStreamUrl(stream) {
  return stream?.url || stream?.streamUrl || stream?.manifestUrl || '';
}

function isAudioStream(stream) {
  const mimeType = extractMimeType(stream);
  return /audio\//i.test(mimeType) || Boolean(stream?.audioQuality || stream?.bitrate || stream?.audioTrack);
}

function qualityPreferenceScore(stream, preferredQuality) {
  const target = Number.parseInt(String(preferredQuality || '').replace(/\D/g, ''), 10);
  const bitrate = Number(stream?.bitrate || stream?.bitrateKbps || 0);

  if (!target || !bitrate) {
    return 0;
  }

  return -Math.abs(bitrate - target * 1000);
}

function chooseBestAudioStream(streams, preferredQuality) {
  const audioStreams = streams.filter((stream) => isAudioStream(stream) && extractStreamUrl(stream));

  if (!audioStreams.length) {
    throw new Error('No audio streams were returned by the resolver provider.');
  }

  return audioStreams.sort((left, right) => {
    const leftUrl = extractStreamUrl(left);
    const rightUrl = extractStreamUrl(right);
    const leftDirect = /googlevideo\.com/i.test(leftUrl) ? 1 : 0;
    const rightDirect = /googlevideo\.com/i.test(rightUrl) ? 1 : 0;
    const leftBitrate = Number(left?.bitrate || left?.bitrateKbps || 0);
    const rightBitrate = Number(right?.bitrate || right?.bitrateKbps || 0);
    const leftPref = qualityPreferenceScore(left, preferredQuality);
    const rightPref = qualityPreferenceScore(right, preferredQuality);

    return (
      rightDirect - leftDirect
      || rightPref - leftPref
      || rightBitrate - leftBitrate
    );
  })[0];
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveViaPiped(input, provider, config) {
  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  const timeoutMs = provider.timeoutMs || config.streamResolverTimeoutMs || DEFAULT_RESOLVER_TIMEOUT_MS;
  const endpoint = `${baseUrl}/streams/${encodeURIComponent(input.videoId)}`;
  const payload = await fetchJsonWithTimeout(endpoint, timeoutMs);
  const bestStream = chooseBestAudioStream(payload.audioStreams || [], input.preferredQuality);
  const mimeType = extractMimeType(bestStream);
  const streamUrl = extractStreamUrl(bestStream);

  return {
    streamUrl,
    mimeType,
    expiresAt: parseUrlExpiry(streamUrl),
    fileExtension: inferFileExtension(mimeType, bestStream?.format || 'webm'),
  };
}

async function resolveViaInvidious(input, provider, config) {
  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  const timeoutMs = provider.timeoutMs || config.streamResolverTimeoutMs || DEFAULT_RESOLVER_TIMEOUT_MS;
  const endpoint = `${baseUrl}/api/v1/videos/${encodeURIComponent(input.videoId)}`;
  const payload = await fetchJsonWithTimeout(endpoint, timeoutMs);
  const adaptiveFormats = [
    ...(Array.isArray(payload.audioStreams) ? payload.audioStreams : []),
    ...(Array.isArray(payload.adaptiveFormats) ? payload.adaptiveFormats : []),
    ...(Array.isArray(payload.formatStreams) ? payload.formatStreams : []),
  ];
  const bestStream = chooseBestAudioStream(adaptiveFormats, input.preferredQuality);
  const mimeType = extractMimeType(bestStream);
  const streamUrl = extractStreamUrl(bestStream);

  return {
    streamUrl,
    mimeType,
    expiresAt: parseUrlExpiry(streamUrl),
    fileExtension: inferFileExtension(mimeType, bestStream?.container || 'webm'),
  };
}

function getProviderLabel(provider) {
  return `${provider.kind}:${normalizeBaseUrl(provider.baseUrl)}`;
}

async function resolveWithProviders(input, config = window.MONIFY_CONFIG || {}) {
  const providers = Array.isArray(config.streamProviders) && config.streamProviders.length
    ? config.streamProviders
    : DEFAULT_PROVIDER_ORDER;

  const failures = [];

  for (const provider of providers) {
    if (!provider?.baseUrl || !provider?.kind) {
      continue;
    }

    const label = getProviderLabel(provider);

    try {
      if (provider.kind === 'piped') {
        const result = await resolveViaPiped(input, provider, config);
        console.info(`[resolver] success ${label}`);
        return result;
      }

      if (provider.kind === 'invidious') {
        const result = await resolveViaInvidious(input, provider, config);
        console.info(`[resolver] success ${label}`);
        return result;
      }

      failures.push(`${label} -> unsupported provider kind`);
    } catch (error) {
      const message = `${label} -> ${error.message}`;
      failures.push(message);
      console.warn(`[resolver] failed ${message}`);
    }
  }

  throw new Error(`All stream providers failed: ${failures.join(' | ')}`);
}

window.MonifyYoutubeResolver = {
  resolve: resolveWithProviders,
};

export async function resolveYoutubeAudioStream(input, options = {}) {
  const resolverInput = buildResolverInput(input, options);

  if (!options.forceRefresh) {
    const cached = getCachedStream(resolverInput.videoId);
    if (cached) {
      return cached;
    }
  } else {
    invalidateCachedStream(resolverInput.videoId);
  }

  const resolver = getConfiguredResolver();
  const result = await resolver(resolverInput);
  const normalized = normalizeStreamResult(resolverInput, result);

  return setCachedStream(normalized.videoId, normalized);
}

export async function refreshYoutubeAudioStream(previous, options = {}) {
  const input = previous?.sourceUrl || previous?.videoId || previous?.url || previous;
  return resolveYoutubeAudioStream(input, { ...options, forceRefresh: true });
}

export { extractVideoId };
