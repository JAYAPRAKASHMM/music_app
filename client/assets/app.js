lucide.createIcons();

const TRENDING_QUERY = window.MONIFY_CONFIG.trendingQuery;
const TRENDING_LIMIT = window.MONIFY_CONFIG.trendingLimit;
const FALLBACK_THUMBNAIL = '/assets/logo.svg';
const DEFAULT_SONG = window.MONIFY_CONFIG.defaultSong;

const elements = {
  playerView: document.getElementById('player-view'),
  searchView: document.getElementById('search-view'),
  searchTrigger: document.getElementById('search-trigger'),
  qualityMenuBtn: document.getElementById('quality-menu-btn'),
  qualityMenu: document.getElementById('quality-menu'),
  qualitySelect: document.getElementById('quality-select'),
  vinylDisc: document.getElementById('vinyl-disc'),
  discThumbnail: document.getElementById('disc-thumbnail'),
  selectedTitle: document.getElementById('selected-title'),
  selectedArtist: document.getElementById('selected-artist'),
  downloadBtn: document.getElementById('download-btn'),
  playBtn: document.getElementById('play-btn'),
  playGlyph: document.getElementById('play-glyph'),
  loadingIndicator: document.getElementById('loading-indicator'),
  playerStatus: document.getElementById('player-status'),
  audio: document.getElementById('audio-player'),
  urlInput: document.getElementById('url-input'),
  backBtn: document.getElementById('back-btn'),
  searchForm: document.getElementById('search-form'),
  searchInput: document.getElementById('search-input'),
  results: document.getElementById('results'),
  searchCount: document.getElementById('search-count'),
  resultsLabel: document.getElementById('results-label'),
  progressSlider: document.getElementById('progress-slider'),
  currentTime: document.getElementById('current-time'),
  totalTime: document.getElementById('total-time'),
  prevBtn: document.getElementById('prev-btn'),
  nextBtn: document.getElementById('next-btn'),
  upNextBtn: document.getElementById('up-next-btn'),
  recentBtn: document.getElementById('recent-btn'),
};

const state = {
  isPlaying: false,
  isLoading: false,
  selectedVideo: null,
  searchResults: [],
  trendingResults: [],
  recentlyPlayed: JSON.parse(localStorage.getItem('monify_recent') || '[]'),
  cache: new Map(),
  activeQueryLabel: 'Results',
  progressLocked: false,
  metadataCache: new Map(),
};

function hasNativeBackend() {
  return !!window.Capacitor?.Plugins?.LocalBackendPlugin;
}

function getApiBaseUrl() {
  return `${window.location.protocol}//${window.location.host}`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function getKnownDuration() {
  if (Number.isFinite(elements.audio.duration) && elements.audio.duration > 0) {
    return elements.audio.duration;
  }

  return state.selectedVideo?.durationSeconds || 0;
}

function updateProgressUi(current = elements.audio.currentTime || 0) {
  const duration = getKnownDuration();
  const progress = duration > 0 ? Math.min((current / duration) * 100, 100) : 0;
  elements.progressSlider.value = progress;
  elements.progressSlider.style.setProperty('--progress', `${progress}%`);
  elements.currentTime.textContent = formatTime(current);
  elements.totalTime.textContent = formatTime(duration);
}

function setPlayerStatus(message) {
  elements.playerStatus.textContent = message;
}

function refreshIcons() {
  lucide.createIcons();
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  elements.loadingIndicator.classList.toggle('hidden', !isLoading);
  elements.playGlyph.classList.toggle('hidden', isLoading);
}

function setPlaying(isPlaying) {
  state.isPlaying = isPlaying;
  elements.vinylDisc.classList.toggle('playing', isPlaying);
  elements.playGlyph.innerHTML = `<i data-lucide="${isPlaying ? 'pause' : 'play'}"></i>`;
  refreshIcons();
}

function buildSongMeta(video) {
  const parts = [];
  if (video.channelTitle) {
    parts.push(video.channelTitle);
  }
  if (video.note) {
    parts.push(video.note);
  }
  return parts.join(' • ');
}

function getCompactTitle(title) {
  const normalized = String(title || '').trim();
  if (!normalized) {
    return 'Loading title...';
  }

  const words = normalized.split(/\s+/);
  if (words.length <= 5) {
    return words.join(' ');
  }

  return `${words.slice(0, 5).join(' ')}...`;
}

function applySongToUi(video) {
  elements.selectedTitle.textContent = getCompactTitle(video.title);
  elements.selectedTitle.title = video.title || '';
  elements.selectedArtist.textContent = buildSongMeta(video);
  elements.urlInput.value = video.url;
  elements.discThumbnail.src = video.thumbnail || FALLBACK_THUMBNAIL;
  elements.discThumbnail.alt = `${video.title || 'Song'} thumbnail`;
  elements.discThumbnail.classList.toggle('local-thumb', !!video.isLocalThumb);
  elements.qualityMenuBtn.style.display = video.isLocalThumb ? 'none' : '';
  elements.totalTime.textContent = formatTime(video.durationSeconds || 0);
  updateProgressUi(0);
}

async function resolveSongMetadata(video) {
  if (!video?.url) {
    return video;
  }

  if (video.title && video.channelTitle && video.thumbnail) {
    return video;
  }

  if (state.metadataCache.has(video.url)) {
    return {
      ...video,
      ...state.metadataCache.get(video.url),
    };
  }

  // If native, skip /api/resolve because performNativeYoutubeSearch already gets high-res thumbs
  if (hasNativeBackend()) {
    return video;
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/resolve?url=${encodeURIComponent(video.url)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Resolve failed.');
    }

    const cleanTitle = (data.title || video.title || 'Unknown title').replace(/\bvideo\b/gi, '').replace(/\s{2,}/g, ' ').trim();

    const resolved = {
      title: cleanTitle,
      channelTitle: data.channelTitle || video.channelTitle || '',
      thumbnail: data.thumbnail || video.thumbnail || FALLBACK_THUMBNAIL,
    };

    state.metadataCache.set(video.url, resolved);

    return {
      ...video,
      ...resolved,
    };
  } catch (error) {
    console.error('Metadata resolve failed:', error);
    return {
      ...video,
      title: video.title || 'Unknown title',
      channelTitle: video.channelTitle || '',
      thumbnail: video.thumbnail || FALLBACK_THUMBNAIL,
    };
  }
}

async function selectVideo(video, options = {}) {
  state.selectedVideo = { ...video };
  applySongToUi(state.selectedVideo);

  // Add to recently played (avoiding immediate duplicates)
  if (!state.recentlyPlayed.length || state.recentlyPlayed[0].url !== video.url) {
    state.recentlyPlayed = [state.selectedVideo, ...state.recentlyPlayed.filter(v => v.url !== video.url)].slice(0, 20);
    localStorage.setItem('monify_recent', JSON.stringify(state.recentlyPlayed));
  }

  if (!options.keepSearchOpen) {
    hideSearchView();
  }

  const resolvedVideo = await resolveSongMetadata(state.selectedVideo);
  if (state.selectedVideo?.url !== video.url) {
    return;
  }

  state.selectedVideo = resolvedVideo;
  applySongToUi(state.selectedVideo);

  if (!options.keepStatus) {
    setPlayerStatus('Ready to play');
  }
}

function renderResults(items) {
  elements.results.innerHTML = '';
  elements.searchCount.textContent = `${items.length} songs`;
  elements.resultsLabel.textContent = state.activeQueryLabel;

  if (!items.length) {
    elements.results.innerHTML = '<p class="empty-state">No songs found.</p>';
    return;
  }

  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'result-item';
    btn.innerHTML = `
      <img src="${item.thumbnail || FALLBACK_THUMBNAIL}" class="result-thumb" alt="${item.title}">
      <div class="result-info">
        <h3>${item.title}</h3>
        <p>${item.channelTitle || 'Unknown'}</p>
      </div>
      <span class="result-play-btn"><i data-lucide="play"></i></span>
    `;
    btn.addEventListener('click', async () => {
      await selectVideo(item);
      startPlayback();
    });
    elements.results.appendChild(btn);
  });

  refreshIcons();
}

function parseIsoDuration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || 0, 10);
  const m = parseInt(match[2] || 0, 10);
  const s = parseInt(match[3] || 0, 10);
  return h * 3600 + m * 60 + s;
}

async function performNativeYoutubeSearch(query) {
  const apiKey = window.MONIFY_CONFIG?.youtubeApiKey || localStorage.getItem('youtubeApiKey');
  if (!apiKey) {
    throw new Error('YouTube API key is missing. Set it in config or localStorage.');
  }

  const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

  // Step 1: Search for Video IDs
  const searchParams = new URLSearchParams({
    key: apiKey,
    q: query,
    part: 'snippet',
    type: 'video',
    maxResults: '20',
    videoEmbeddable: 'true',
    safeSearch: 'moderate',
  });
  const searchRes = await fetch(`${YOUTUBE_API_BASE}/search?${searchParams.toString()}`);
  const searchData = await searchRes.json();
  if (!searchRes.ok) throw new Error(searchData.error?.message || 'YT Search failed');

  const videoIds = (searchData.items || []).map(i => i.id?.videoId).filter(Boolean);
  if (!videoIds.length) return [];

  // Step 2: Fetch Details (Duration)
  const detailsParams = new URLSearchParams({
    key: apiKey,
    id: videoIds.join(','),
    part: 'contentDetails,snippet',
    maxResults: String(videoIds.length),
  });
  const detailsRes = await fetch(`${YOUTUBE_API_BASE}/videos?${detailsParams.toString()}`);
  const detailsData = await detailsRes.json();
  if (!detailsRes.ok) throw new Error(detailsData.error?.message || 'YT Details failed');

  return (detailsData.items || []).map((item) => {
    const durationSeconds = parseIsoDuration(item.contentDetails?.duration || '');
    const thumbnail = item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '';
    return {
      id: item.id,
      title: item.snippet?.title || '',
      channelTitle: item.snippet?.channelTitle || '',
      thumbnail: thumbnail,
      url: `https://www.youtube.com/watch?v=${item.id}`,
      durationSeconds: durationSeconds,
    };
  })
    .filter(item => item.durationSeconds >= 60 && item.durationSeconds < 360)
    .filter(item => !item.title.toLowerCase().includes('#shorts'))
    .slice(0, 20);
}

async function searchVideos(query, options = {}) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  if (state.cache.has(normalizedQuery)) {
    const cached = state.cache.get(normalizedQuery);
    if (!options.skipRender) {
      state.searchResults = cached;
      state.activeQueryLabel = options.label || 'Results';
      renderResults(cached);
    }
    return cached;
  }

  if (!options.skipRender) {
    elements.results.innerHTML = '<p class="empty-state">Loading songs...</p>';
    elements.searchCount.textContent = '';
  }

  let rawResults = [];

  if (window.Capacitor?.isNativePlatform?.()) {
    rawResults = await performNativeYoutubeSearch(query);
  } else {
    const response = await fetch(`${getApiBaseUrl()}/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Search failed.');
    }
    rawResults = data.results || [];
  }

  const limit = options.limit || rawResults.length || 0;
  const results = rawResults.slice(0, limit).map((item) => {
    const cleanTitle = (item.title || '').replace(/\bvideo\b/gi, '').replace(/\s{2,}/g, ' ').trim();
    return { ...item, title: cleanTitle };
  });

  state.cache.set(normalizedQuery, results);

  if (options.cacheAsTrending) {
    state.trendingResults = results.slice(0, 10);
  }

  if (!options.skipRender) {
    state.searchResults = results;
    state.activeQueryLabel = options.label || 'Results';
    renderResults(results);
  }

  return results;
}

async function preloadTrending() {
  try {
    const cached = localStorage.getItem('monify_trending');
    const cacheTime = localStorage.getItem('monify_trending_time');

    // Use cache if less than 2 hours old
    if (cached && cacheTime && (Date.now() - parseInt(cacheTime, 10) < 2 * 60 * 60 * 1000)) {
      state.trendingResults = JSON.parse(cached);
      return;
    }

    const results = await searchVideos(TRENDING_QUERY, {
      skipRender: true,
      cacheAsTrending: false, // We'll handle caching manually here
      limit: TRENDING_LIMIT,
    });

    state.trendingResults = results;
    localStorage.setItem('monify_trending', JSON.stringify(results));
    localStorage.setItem('monify_trending_time', Date.now().toString());
  } catch (error) {
    console.error('Trending preload failed:', error);
  }
}

function showSearchView() {
  elements.playerView.classList.add('hidden');
  elements.searchView.classList.remove('hidden');
  elements.searchInput.focus();

  const cachedTrending = state.cache.get(TRENDING_QUERY) || state.trendingResults;
  if (cachedTrending.length) {
    state.searchResults = cachedTrending;
    state.activeQueryLabel = 'Trending Now';
    renderResults(cachedTrending);
    return;
  }

  searchVideos(TRENDING_QUERY, {
    cacheAsTrending: true,
    limit: TRENDING_LIMIT,
    label: 'Trending Now',
  }).catch((error) => {
    console.error('Search preload failed:', error);
    elements.results.innerHTML = '<p class="error-state">Unable to load songs.</p>';
  });
}

function hideSearchView() {
  elements.searchView.classList.add('hidden');
  const dView = document.getElementById('downloads-view');
  if (dView && !dView.classList.contains('hidden')) {
     return; // Don't show player if downloads is active
  }
  elements.playerView.classList.remove('hidden');
}

function buildMediaUrl(endpoint, extraParams = {}) {
  const params = new URLSearchParams({
    url: elements.urlInput.value,
    quality: elements.qualitySelect.value,
    ...extraParams,
  });

  return `${getApiBaseUrl()}${endpoint}?${params.toString()}`;
}

function normalizeYoutubeUrl(videoUrl) {
  try {
    const parsed = new URL(videoUrl);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (id) {
        return `https://www.youtube.com/watch?v=${id}`;
      }
    }

    const id = parsed.searchParams.get('v');
    if (id) {
      return `https://www.youtube.com/watch?v=${id}`;
    }
  } catch (error) {
    console.warn('Could not normalize YouTube URL:', error);
  }

  return videoUrl;
}

function shouldRetryNativeResolve(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('no audio streams found') || message.includes('page needs to be reloaded');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestNativeStreamUrl(videoUrl) {
  const result = await window.Capacitor.Plugins.LocalBackendPlugin.getStreamUrl({
    url: normalizeYoutubeUrl(videoUrl)
  });

  const trimmedUrl = typeof result.url === 'string' ? result.url.trim() : null;
  if (!trimmedUrl) {
    throw new Error('LocalBackendPlugin returned an empty or invalid stream URL string');
  }

  return trimmedUrl;
}

async function resolveStreamUrl(videoUrl) {
  if (hasNativeBackend()) {
    try {
      return await requestNativeStreamUrl(videoUrl);
    } catch (error) {
      if (shouldRetryNativeResolve(error)) {
        console.warn('Retrying transient native stream resolution failure:', error);
        await wait(250);
        return requestNativeStreamUrl(videoUrl);
      }

      console.error('LocalBackendPlugin getStreamUrl failed:', error);
      throw error;
    }
  }

  return buildMediaUrl('/api/stream');
}

async function startPlayback() {
  if (!state.selectedVideo) {
    return;
  }


  setLoading(true);
  setPlayerStatus('Starting stream...');

  try {
    let nextSrc;
    if (state.selectedVideo.isLocalThumb) {
      if (state.selectedVideo.url.startsWith('mock/')) throw new Error('Mock file - wont play in browser');
      nextSrc = state.selectedVideo.url;
    } else {
      nextSrc = await resolveStreamUrl(state.selectedVideo.url);
    }

    if (!nextSrc) {
      throw new Error('Received empty stream URL');
    }

    if (elements.audio.src !== nextSrc) {
      elements.audio.src = nextSrc;
    }

    await elements.audio.play();
    setPlaying(true);
    setPlayerStatus(`Playing ${state.selectedVideo.title}`);
  } catch (error) {
    console.error('Playback failed:', error);
    stopPlayback(true);
    setPlayerStatus('Playback failed. Try another song.');
  } finally {
    setLoading(false);
  }
}

function stopPlayback(silent = false) {
  elements.audio.pause();

  // CRITICAL FIX: Murder the HTTP connection to prevent server leak
  if (elements.audio.src) {
    elements.audio.removeAttribute('src');
    elements.audio.load();
  }

  setPlaying(false);
  setLoading(false);
  updateProgressUi(0);
  if (!silent) {
    setPlayerStatus('Ready to play');
  }
}

function togglePlayback() {
  if (!state.selectedVideo) {
    return;
  }

  if (!elements.audio.src) {
    startPlayback();
    return;
  }

  if (!elements.audio.paused) {
    elements.audio.pause();
    setPlaying(false);
    setPlayerStatus('Paused');
    return;
  }

  elements.audio.play()
    .then(() => {
      setPlaying(true);
      setPlayerStatus(`Playing ${state.selectedVideo.title}`);
    })
    .catch((error) => {
      console.error('Resume failed:', error);
      setPlayerStatus('Playback failed. Try another song.');
    });
}

function getPlaybackPool() {
  if (state.selectedVideo?.isLocalThumb) {
    if (localDownloadsState.allSongs.length > 0) {
      return localDownloadsState.allSongs.map(song => {
         let src = song.path;
         if (window.Capacitor?.convertFileSrc) {
           src = window.Capacitor.convertFileSrc(src.startsWith('/') ? 'file://' + src : src);
         }
         return {
           id: song.path, title: song.title.replace(/\.[^/.]+$/, ''),
           channelTitle: 'Local Audio', thumbnail: song.thumbnail || FALLBACK_THUMBNAIL, url: src, durationSeconds: 0,
           isLocalThumb: true
         };
      });
    }
    return [state.selectedVideo];
  }
  return state.trendingResults.length ? state.trendingResults : [DEFAULT_SONG];
}

function chooseAdjacent(direction) {
  const pool = getPlaybackPool();
  if (!pool.length) {
    return null;
  }

  const currentIndex = pool.findIndex((item) => item.id === state.selectedVideo?.id || item.url === state.selectedVideo?.url);
  if (currentIndex === -1) {
    return pool[0];
  }

  const nextIndex = (currentIndex + direction + pool.length) % pool.length;
  return pool[nextIndex];
}

function chooseRandomTrending() {
  const pool = getPlaybackPool();
  if (!pool.length) {
    return null;
  }

  const candidates = pool.filter((item) => item.id !== state.selectedVideo?.id);
  if (!candidates.length) {
    return pool[0];
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function playChosen(video) {
  if (!video) {
    return;
  }

  await selectVideo(video);
  startPlayback();
}

async function downloadSelectedVideo() {
  if (!state.selectedVideo) {
    return;
  }

  const durationSeconds = state.selectedVideo.durationSeconds || 0;
  if (durationSeconds > 420) {
    const min = Math.round(durationSeconds / 60);
    alert(`Bro, what are you going to listen to for ${min} minutes? It's a music player, not an audiobook! Play something under 7 mins.`);
    return;
  }

  const fileTitle = state.selectedVideo.title || 'song';

  if (hasNativeBackend()) {
    setLoading(true);
    setPlayerStatus('Preparing download...');

    try {
      let result;
      try {
        result = await window.Capacitor.Plugins.LocalBackendPlugin.download({
          url: normalizeYoutubeUrl(state.selectedVideo.url),
          title: fileTitle,
        });
      } catch (firstError) {
        if (shouldRetryNativeResolve(firstError)) {
          console.warn('Download attempt failed, retrying...', firstError);
          setPlayerStatus('Retrying download...');
          await wait(500);
          result = await window.Capacitor.Plugins.LocalBackendPlugin.download({
            url: normalizeYoutubeUrl(state.selectedVideo.url),
            title: fileTitle,
          });
        } else {
          throw firstError;
        }
      }
      const downloadLabel = result?.filename ? `: ${result.filename}` : '';
      setPlayerStatus(`Download started${downloadLabel}`);
    } catch (error) {
      console.error('Native download failed:', error);
      setPlayerStatus('Download failed. Try again.');
    } finally {
      setLoading(false);
    }

    return;
  }

  const anchor = document.createElement('a');
  anchor.href = buildMediaUrl('/api/download', { title: fileTitle, duration: durationSeconds });
  anchor.download = `${fileTitle}.mp3`;
  anchor.click();
  setPlayerStatus('Download started');
}

elements.searchTrigger.addEventListener('click', showSearchView);
elements.backBtn.addEventListener('click', hideSearchView);
elements.qualityMenuBtn.addEventListener('click', () => {
  elements.qualityMenu.classList.toggle('hidden');
});

document.addEventListener('click', (event) => {
  if (!elements.qualityMenu.contains(event.target) && !elements.qualityMenuBtn.contains(event.target)) {
    elements.qualityMenu.classList.add('hidden');
  }
});

elements.qualitySelect.addEventListener('change', () => {
  elements.qualityMenu.classList.add('hidden');
  if (state.isPlaying) {
    startPlayback();
  }
});

elements.playBtn.addEventListener('click', togglePlayback);
elements.downloadBtn.addEventListener('click', downloadSelectedVideo);
elements.recentBtn?.addEventListener('click', () => {
  elements.playerView.classList.add('hidden');
  elements.searchView.classList.remove('hidden');
  state.activeQueryLabel = 'Recently Played';
  renderResults(state.recentlyPlayed);
});
elements.prevBtn.addEventListener('click', () => { 
  if (state.recentlyPlayed.length > 1) {
    playChosen(state.recentlyPlayed[1]);
  } else {
    playChosen(chooseAdjacent(-1));
  }
});
elements.nextBtn.addEventListener('click', () => { playChosen(chooseAdjacent(1)); });
elements.upNextBtn.addEventListener('click', () => { playChosen(chooseRandomTrending()); });

elements.searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = elements.searchInput.value.trim();
  if (!query) {
    return;
  }

  try {
    await searchVideos(query, { label: 'Search results' });
  } catch (error) {
    console.error('Search failed:', error);
    elements.results.innerHTML = '<p class="error-state">Error performing search.</p>';
  }
});

elements.progressSlider.addEventListener('input', () => {
  state.progressLocked = true;
  const duration = getKnownDuration();
  const targetTime = (Number(elements.progressSlider.value) / 100) * duration;
  elements.progressSlider.style.setProperty('--progress', `${elements.progressSlider.value}%`);
  elements.currentTime.textContent = formatTime(targetTime);
});

elements.progressSlider.addEventListener('change', () => {
  const duration = getKnownDuration();
  if (duration > 0) {
    elements.audio.currentTime = (Number(elements.progressSlider.value) / 100) * duration;
  }
  state.progressLocked = false;
});

elements.audio.addEventListener('loadedmetadata', () => {
  updateProgressUi(elements.audio.currentTime || 0);
});

elements.audio.addEventListener('timeupdate', () => {
  if (!state.progressLocked) {
    updateProgressUi(elements.audio.currentTime || 0);
  }
});

elements.audio.addEventListener('playing', () => {
  setPlaying(true);
  setLoading(false);
});

elements.audio.addEventListener('pause', () => {
  if (!elements.audio.ended && !state.isLoading) {
    setPlaying(false);
  }
});

elements.audio.addEventListener('error', (e) => {
  const mediaError = elements.audio.error;
  console.error(`[AUDIO ERROR EVENT] Code: ${mediaError ? mediaError.code : 'Unknown'}, Message: ${mediaError ? mediaError.message : 'Unknown'}`, e);
  stopPlayback(true);
  setPlayerStatus('Stream error. Try another song.');
});


elements.audio.addEventListener('ended', () => {
  setPlaying(false);
  playChosen(chooseRandomTrending());
});

const downloadsView = document.getElementById('downloads-view');
const downloadsTrigger = document.getElementById('downloads-trigger');
const downloadsBackBtn = document.getElementById('downloads-back-btn');
const downloadsResults = document.getElementById('downloads-results');
const downloadsCount = document.getElementById('downloads-count');
const downloadsSearchInput = document.getElementById('downloads-search-input');
const downloadsPrevPage = document.getElementById('downloads-prev-page');
const downloadsNextPage = document.getElementById('downloads-next-page');
const downloadsPageInfo = document.getElementById('downloads-page-info');
const downloadsPagination = document.getElementById('downloads-pagination');

class TrieNode {
  constructor() {
    this.children = {};
    this.songs = [];
  }
}

const localDownloadsState = {
  allSongs: [],
  trieRoot: new TrieNode(),
  currentPage: 1,
  currentQuery: ''
};

function insertTrie(title, song) {
  const words = title.toLowerCase().split(/[^a-z0-9]+/);
  for (const word of words) {
    if (!word) continue;
    let curr = localDownloadsState.trieRoot;
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (!curr.children[char]) curr.children[char] = new TrieNode();
      curr = curr.children[char];
      if (!curr.songs.includes(song)) curr.songs.push(song);
    }
  }
}

function searchTrie(query) {
  if (!query) return localDownloadsState.allSongs;
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return localDownloadsState.allSongs;

  let resultSets = [];
  for (const word of words) {
    let node = localDownloadsState.trieRoot;
    let found = true;
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (node.children[char]) node = node.children[char];
      else { found = false; break; }
    }
    if (found) resultSets.push(new Set(node.songs));
    else return []; 
  }
  
  if (!resultSets.length) return [];
  let intersection = new Set(resultSets[0]);
  for (let i = 1; i < resultSets.length; i++) {
      intersection = new Set([...intersection].filter(x => resultSets[i].has(x)));
  }
  return Array.from(intersection);
}

async function renderDownloadsPage(page = 1, query = '') {
  localDownloadsState.currentPage = page;
  localDownloadsState.currentQuery = query;
  
  if (!localDownloadsState.allSongs.length && !query) {
    downloadsResults.innerHTML = '<p class="empty-state">Scanning downloads...</p>';
    if (window.Capacitor?.Plugins?.LocalBackendPlugin?.getSavedSongs) {
      try {
        const res = await window.Capacitor.Plugins.LocalBackendPlugin.getSavedSongs();
        localDownloadsState.allSongs = res.songs || [];
      } catch(e) { console.error('Failed to get saved songs', e); }
    } else {
      localDownloadsState.allSongs = Array.from({length: 120}, (_, i) => ({
        title: `Mock Local Song ${i+1}`,
        path: `mock/song_${i+1}.mp3`,
        lastModified: Date.now() - i*1000
      }));
    }
    localDownloadsState.trieRoot = new TrieNode();
    for (const song of localDownloadsState.allSongs) {
      insertTrie(song.title, song);
    }
  }
  
  const filtered = searchTrie(query);
  const totalPages = Math.ceil(filtered.length / 100) || 1;
  const start = (page - 1) * 100;
  const pageSongs = filtered.slice(start, start + 100);
  
  downloadsCount.textContent = `${filtered.length} songs`;
  downloadsPageInfo.textContent = `Page ${page} of ${totalPages}`;
  downloadsPrevPage.disabled = page <= 1;
  downloadsNextPage.disabled = page >= totalPages;
  downloadsPagination.classList.toggle('hidden', totalPages <= 1);
  
  downloadsResults.innerHTML = '';
  if (!pageSongs.length) {
    downloadsResults.innerHTML = '<p class="empty-state">No downloads found.</p>';
    return;
  }
  
  pageSongs.forEach(song => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'result-item';

    let thumb = song.thumbnail;
    if (!thumb) {
        const thumbnails = [
          '/assets/default download thumbnail_1.jpg',
          '/assets/default download thumbnail_2.jpg',
          '/assets/default download thumbnail_3.jpg'
        ];
        thumb = thumbnails[Math.floor(Math.random() * thumbnails.length)];
        song.thumbnail = thumb; // save it so it doesn't swap on re-renders
    }

    btn.innerHTML = `
      <img src="${thumb}" class="result-thumb" alt="Local">
      <div class="result-info">
        <h3>${song.title}</h3>
        <p>Local File</p>
      </div>
      <span class="result-play-btn"><i data-lucide="play"></i></span>
    `;
    btn.addEventListener('click', async () => {
       let src = song.path;
       if (window.Capacitor?.convertFileSrc) {
         src = window.Capacitor.convertFileSrc(src.startsWith('/') ? 'file://' + src : src);
       }
       const mockVideo = {
         id: song.path, title: song.title.replace(/\.[^/.]+$/, ''),
         channelTitle: 'Local Audio', thumbnail: thumb, url: src, durationSeconds: 0,
         isLocalThumb: thumb.includes('default download thumbnail') || thumb.includes('mock')
       };
       await selectVideo(mockVideo, { keepSearchOpen: false });
       hideDownloadsView();
       if (src.startsWith('mock/')) { setPlayerStatus('Mock file - wont play in browser'); return; }
       elements.audio.src = src;
       elements.audio.play().then(() => {
         setPlaying(true); setPlayerStatus(`Playing ${mockVideo.title}`);
       }).catch(e => { console.error(e); setPlayerStatus('Failed to play local file'); });
    });
    downloadsResults.appendChild(btn);
  });
  refreshIcons();
}

function showDownloadsView() {
  elements.playerView.classList.add('hidden');
  elements.searchView.classList.add('hidden');
  downloadsView.classList.remove('hidden');
  renderDownloadsPage(1, '');
}

function hideDownloadsView() {
  downloadsView.classList.add('hidden');
  elements.playerView.classList.remove('hidden');
}

downloadsTrigger?.addEventListener('click', showDownloadsView);
downloadsBackBtn?.addEventListener('click', hideDownloadsView);

let searchTimer;
downloadsSearchInput?.addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => renderDownloadsPage(1, e.target.value), 250);
});

downloadsPrevPage?.addEventListener('click', () => {
  if (localDownloadsState.currentPage > 1) renderDownloadsPage(localDownloadsState.currentPage - 1, localDownloadsState.currentQuery);
});
downloadsNextPage?.addEventListener('click', () => {
  renderDownloadsPage(localDownloadsState.currentPage + 1, localDownloadsState.currentQuery);
});

selectVideo(DEFAULT_SONG, { keepSearchOpen: true });
preloadTrending();
updateProgressUi(0);
