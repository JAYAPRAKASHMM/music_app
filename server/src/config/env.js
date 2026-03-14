require('./load-env');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');
const SERVER_DIR = path.join(ROOT_DIR, 'server');

const env = {
  host: process.env.HOST || null,
  port: Number(process.env.PORT || 3001),
  portFallbackRange: Number(process.env.PORT_FALLBACK_RANGE || 10),
  defaultQuality: process.env.DEFAULT_AUDIO_QUALITY || '128k',
  searchCacheTtlMs: Number(process.env.SEARCH_CACHE_TTL_MS || 5 * 60 * 1000),
  searchCacheMaxEntries: Number(process.env.SEARCH_CACHE_MAX_ENTRIES || 100),
  maxConcurrentStreams: Number(process.env.MAX_CONCURRENT_STREAMS || 2),
  clientDir: CLIENT_DIR,
  serverDir: SERVER_DIR,
  nodeEnv: process.env.NODE_ENV || 'development',
};

module.exports = { env };
