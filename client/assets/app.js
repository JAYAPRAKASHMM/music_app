lucide.createIcons();

const TRENDING_QUERY = 'tamil trending songs';
const FALLBACK_THUMBNAIL = '/assets/logo.svg';
const DEFAULT_SONG = window.MONIFY_CONFIG?.defaultSong || {
  id: 'n_fA0hU5-a4',
  url: 'https://youtu.be/n_fA0hU5-a4?si=3EZygpyeIBat5fJw',
  thumbnail: 'https://img.youtube.com/vi/n_fA0hU5-a4/hqdefault.jpg',
  durationSeconds: 120,
  note: 'JP likes this song',
};

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

elements.audio.referrerPolicy = 'no-referrer';

const state = {
  isPlaying: false,
  isLoading: false,
  selectedVideo: null,
  activeStream: null,
  searchResults: [],
  trendingResults: [],
  recentlyPlayed: JSON.parse(localStorage.getItem('monify_recent') || '[]'),
  cache: new Map(),
  activeQueryLabel: 'Results',
  progressLocked: false,
  metadataCache: new Map(),
  streamRetryCount: 0,
  playbackRequestId: 0,
};

function getApiBaseUrl() {
  return `${window.location.protocol}//${window.location.host}`;
}

function getExtractor() {
  if (!window.MonifyExtractor || typeof window.MonifyExtractor.resolveAudioStream !== 'function') {
    throw new Error('Browser extractor is not available.');
  }

  return window.MonifyExtractor;
}

function getPreferredQuality() {
  return elements.qualitySelect?.value || '128k';
}

function clearActiveStream() {
  state.activeStream = null;
  state.streamRetryCount = 0;
}

function isSameVideo(left, right) {
  if (!left || !right) {
    return false;
  }

  return Boolean(
    (left.id && right.id && left.id === right.id)
    || (left.url && right.url && left.url === right.url)
    || (left.videoId && right.videoId && left.videoId === right.videoId)
  );
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
  clearActiveStream();
  applySongToUi(state.selectedVideo);

  if (!state.recentlyPlayed.length || state.recentlyPlayed[0].url !== video.url) {
    state.recentlyPlayed = [state.selectedVideo, ...state.recentlyPlayed.filter((v) => v.url !== video.url)].slice(0, 20);
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

  const response = await fetch(`${getApiBaseUrl()}/api/search?q=${encodeURIComponent(query)}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Search failed.');
  }

  const limit = options.limit || data.results.length || 0;
  const results = (data.results || []).slice(0, limit).map((item) => {
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

    if (cached && cacheTime && (Date.now() - parseInt(cacheTime, 10) < 2 * 60 * 60 * 1000)) {
      state.trendingResults = JSON.parse(cached);
      return;
    }

    const results = await searchVideos(TRENDING_QUERY, {
      skipRender: true,
      cacheAsTrending: false,
      limit: 50,
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
    limit: 50,
    label: 'Trending Now',
  }).catch((error) => {
    console.error('Search preload failed:', error);
    elements.results.innerHTML = '<p class="error-state">Unable to load songs.</p>';
  });
}

function hideSearchView() {
  elements.searchView.classList.add('hidden');
  elements.playerView.classList.remove('hidden');
}

async function ensurePlayableStream(video, options = {}) {
  if (!video) {
    throw new Error('No video selected.');
  }

  if (!options.forceRefresh && state.activeStream && isSameVideo(video, state.selectedVideo)) {
    return state.activeStream;
  }

  const extractor = getExtractor();
  const input = {
    videoId: video.id,
    url: video.url,
  };

  const stream = options.forceRefresh
    ? await extractor.refreshAudioStream(state.activeStream || input, {
      preferredQuality: getPreferredQuality(),
    })
    : await extractor.resolveAudioStream(input, {
      preferredQuality: getPreferredQuality(),
    });

  state.activeStream = stream;
  return stream;
}

async function startPlayback(options = {}) {
  if (!state.selectedVideo) {
    return;
  }

  const playbackRequestId = ++state.playbackRequestId;
  setLoading(true);
  setPlayerStatus(options.forceRefresh ? 'Refreshing stream...' : 'Resolving audio...');

  try {
    const targetVideo = state.selectedVideo;
    const stream = await ensurePlayableStream(targetVideo, {
      forceRefresh: Boolean(options.forceRefresh),
    });

    if (playbackRequestId !== state.playbackRequestId || !isSameVideo(targetVideo, state.selectedVideo)) {
      return;
    }

    if (elements.audio.src !== stream.streamUrl) {
      elements.audio.src = stream.streamUrl;
    }

    await elements.audio.play();

    if (playbackRequestId !== state.playbackRequestId) {
      return;
    }

    state.streamRetryCount = 0;
    setPlaying(true);
    setPlayerStatus(`Playing ${state.selectedVideo.title}`);
  } catch (error) {
    console.error('Playback failed:', error);
    stopPlayback(true);
    setPlayerStatus(error.message || 'Playback failed. Try another song.');
  } finally {
    setLoading(false);
  }
}

function stopPlayback(silent = false) {
  elements.audio.pause();

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

async function retryPlaybackWithFreshUrl() {
  const maxRetries = window.MonifyExtractor?.MAX_STREAM_RETRIES ?? 1;
  if (state.streamRetryCount >= maxRetries) {
    stopPlayback(true);
    setPlayerStatus('Stream expired or unavailable.');
    return;
  }

  state.streamRetryCount += 1;
  await startPlayback({ forceRefresh: true });
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
      retryPlaybackWithFreshUrl().catch((retryError) => {
        console.error('Resume refresh failed:', retryError);
        setPlayerStatus(retryError.message || 'Playback failed. Try another song.');
      });
    });
}

function getPlaybackPool() {
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

function downloadSelectedVideo() {
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
  setPlayerStatus('Preparing download...');

  ensurePlayableStream(state.selectedVideo, { forceRefresh: true })
    .then((stream) => {
      const anchor = document.createElement('a');
      anchor.href = stream.streamUrl;
      anchor.download = `${fileTitle}.${stream.fileExtension || 'webm'}`;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setPlayerStatus('Download started');
    })
    .catch((error) => {
      console.error('Download failed:', error);
      setPlayerStatus(error.message || 'Download failed.');
    });
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
  clearActiveStream();
  if (state.isPlaying) {
    startPlayback({ forceRefresh: true });
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
elements.prevBtn.addEventListener('click', () => { playChosen(chooseAdjacent(-1)); });
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

elements.audio.addEventListener('error', async () => {
  try {
    await retryPlaybackWithFreshUrl();
  } catch (error) {
    console.error('Stream refresh failed:', error);
    stopPlayback(true);
    setPlayerStatus(error.message || 'Stream error. Try another song.');
  }
});

elements.audio.addEventListener('ended', () => {
  setPlaying(false);
  playChosen(chooseRandomTrending());
});

selectVideo(DEFAULT_SONG, { keepSearchOpen: true });
preloadTrending();
updateProgressUi(0);

