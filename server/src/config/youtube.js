require('./load-env');
const fs = require('fs');
const path = require('path');

const apiKeyPath = path.resolve(__dirname, '..', '..', '..', 'api.apikey');

function readYoutubeApiKey() {
  try {
    const value = fs.readFileSync(apiKeyPath, 'utf8').trim();
    return value || null;
  } catch {
    return null;
  }
}

const youtube = {
  apiKey: process.env.YOUTUBE_DATA_API_KEY || readYoutubeApiKey(),
};

module.exports = { youtube };
