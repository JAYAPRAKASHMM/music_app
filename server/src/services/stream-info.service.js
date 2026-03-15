let innertubePromise;

const CLIENT_FALLBACK_ORDER = ['MWEB', 'YTMUSIC', 'IOS', 'WEB'];

async function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = import('youtubei.js')
      .then(({ Innertube }) => Innertube.create());
  }

  return innertubePromise;
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

function inferFileExtension(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();

  if (normalized.includes('mp4')) {
    return 'm4a';
  }

  if (normalized.includes('webm')) {
    return 'webm';
  }

  if (normalized.includes('mpeg')) {
    return 'mp3';
  }

  if (normalized.includes('ogg')) {
    return 'ogg';
  }

  return 'm4a';
}

function qualityPreferenceScore(format, preferredQuality) {
  const target = Number.parseInt(String(preferredQuality || '').replace(/\D/g, ''), 10);
  const bitrate = Number(format?.bitrate || 0);

  if (!target || !bitrate) {
    return 0;
  }

  return -Math.abs(bitrate - target * 1000);
}

function isAudioOnlyFormat(format) {
  return Boolean(
    format
    && format.has_audio
    && !format.has_video
    && typeof format.mime_type === 'string'
    && format.mime_type.startsWith('audio/')
  );
}

function codecPreferenceScore(format) {
  const mimeType = String(format?.mime_type || '').toLowerCase();

  if (mimeType.includes('mp4') || mimeType.includes('mp4a')) {
    return 3000;
  }

  if (mimeType.includes('opus') && mimeType.includes('webm')) {
    return 2000;
  }

  if (mimeType.includes('webm')) {
    return 1000;
  }

  return 0;
}

function chooseBestAudioFormat(formats, preferredQuality) {
  const audioFormats = formats.filter(isAudioOnlyFormat);

  if (!audioFormats.length) {
    throw new Error('No audio-only formats were returned by YouTube.');
  }

  return audioFormats.sort((left, right) => {
    const leftHasUrl = left?.url ? 1 : 0;
    const rightHasUrl = right?.url ? 1 : 0;
    const leftCodec = codecPreferenceScore(left);
    const rightCodec = codecPreferenceScore(right);
    const leftPreferred = qualityPreferenceScore(left, preferredQuality);
    const rightPreferred = qualityPreferenceScore(right, preferredQuality);
    const leftBitrate = Number(left?.bitrate || 0);
    const rightBitrate = Number(right?.bitrate || 0);

    return rightHasUrl - leftHasUrl || rightCodec - leftCodec || rightPreferred - leftPreferred || rightBitrate - leftBitrate;
  })[0];
}

async function resolveFromClient(yt, videoId, preferredQuality, client) {
  const info = await yt.getBasicInfo(videoId, { client });

  if (info.playability_status?.status && info.playability_status.status !== 'OK') {
    throw new Error(info.playability_status.reason || `Video is not playable (${info.playability_status.status}).`);
  }

  const formats = info.streaming_data?.adaptive_formats || [];
  const selected = chooseBestAudioFormat(formats, preferredQuality);
  const streamUrl = selected.url || await selected.decipher(yt.session.player);

  if (!streamUrl) {
    throw new Error(`No audio stream URL could be resolved for client ${client}.`);
  }

  return {
    streamUrl,
    mimeType: selected.mime_type,
    expiresAt: parseUrlExpiry(streamUrl) || (Date.now() + 60 * 60 * 1000),
    fileExtension: inferFileExtension(selected.mime_type),
    client,
  };
}

async function resolveStreamInfo({ videoId, preferredQuality }) {
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
    throw new Error('A valid YouTube videoId is required.');
  }

  const yt = await getInnertube();
  const failures = [];

  for (const client of CLIENT_FALLBACK_ORDER) {
    try {
      const result = await resolveFromClient(yt, videoId, preferredQuality, client);
      console.log(`[stream-info] ok videoId=${videoId} client=${client} ext=${result.fileExtension}`);
      return {
        streamUrl: result.streamUrl,
        mimeType: result.mimeType,
        expiresAt: result.expiresAt,
        fileExtension: result.fileExtension,
      };
    } catch (error) {
      failures.push(`${client}: ${error.message}`);
    }
  }

  throw new Error(`Unable to resolve stream info from YouTube. ${failures.join(' | ')}`);
}

module.exports = {
  resolveStreamInfo,
};
