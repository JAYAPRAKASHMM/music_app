const express = require('express');
const cors = require('cors');
const path = require('path');
const { env } = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const searchRoutes = require('./routes/search.routes');
const streamRoutes = require('./routes/stream.routes');
const resolveRoutes = require('./routes/resolve.routes');

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(env.clientDir));

  app.use('/api', healthRoutes);
  app.use('/api', searchRoutes);
  app.use('/api', streamRoutes);
  app.use('/api', resolveRoutes);

  app.use((err, _req, res, _next) => {
    console.error('request handling error:', err);

    if (res.headersSent) {
      return res.end();
    }

    return res.status(500).json({
      error: 'Internal server error.',
    });
  });

  app.get('*', (_req, res) => {
    res.sendFile(path.join(env.clientDir, 'index.html'));
  });

  return app;
}

module.exports = { createApp };
