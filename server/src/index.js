const http = require('http');
const { createApp } = require('./app');
const { env } = require('./config/env');

const app = createApp();
const server = http.createServer(app);

const originalWarn = console.warn.bind(console);
console.warn = (...args) => {
  const text = args.map((arg) => String(arg)).join(' ');

  if (text.includes('[YOUTUBEJS][Player]: Failed to extract signature decipher function.')) {
    return;
  }

  if (text.includes('[YOUTUBEJS][Player]: Failed to extract n decipher function.')) {
    return;
  }

  if (text.includes('ExperimentalWarning') && text.includes('Importing JSON modules is an experimental feature')) {
    return;
  }

  originalWarn(...args);
};

process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (
    warning?.name === 'ExperimentalWarning'
    && String(warning.message || '').includes('Importing JSON modules is an experimental feature')
  ) {
    return;
  }

  originalWarn(warning);
});

function formatLocalUrl(address) {
  const host = address.address === '::' || address.address === '0.0.0.0'
    ? 'localhost'
    : address.address;

  return `http://${host}:${address.port}`;
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      server.off('error', onError);
      resolve(server.address());
    };

    server.once('error', onError);
    server.once('listening', onListening);

    if (env.host) {
      server.listen(port, env.host);
      return;
    }

    server.listen(port);
  });
}

async function startServer() {
  let lastError = null;

  for (let attempt = 0; attempt <= env.portFallbackRange; attempt += 1) {
    const port = env.port + attempt;

    try {
      const address = await listen(port);

      if (attempt > 0) {
        console.warn(`Port ${env.port} was busy, started on ${formatLocalUrl(address)} instead.`);
      } else {
        console.log(`Music Player Engine ready at ${formatLocalUrl(address)}`);
      }

      return;
    } catch (error) {
      lastError = error;

      if (error.code !== 'EADDRINUSE') {
        throw error;
      }
    }
  }

  throw new Error(
    `No open port found in range ${env.port}-${env.port + env.portFallbackRange}. Last error: ${lastError && lastError.message}`,
  );
}

function shutdown(signal) {
  console.log(`${signal} received, shutting down server.`);
  server.close((error) => {
    if (error) {
      console.error('server shutdown error:', error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  console.error('unhandled rejection:', error);
});
process.on('uncaughtException', (error) => {
  console.error('uncaught exception:', error);
  process.exitCode = 1;
  shutdown('uncaughtException');
});

startServer().catch((error) => {
  console.error('server startup failed:', error);
  process.exit(1);
});
