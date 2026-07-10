import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./gameServer.cjs');

export async function acquireVisualProbeServer({ explicitUrl = '', root } = {}) {
  if (explicitUrl) {
    return {
      baseUrl: explicitUrl,
      ownsServer: false,
      server: null,
      async close() {},
    };
  }
  if (!root) throw new TypeError('visual probe server root is required');

  const server = createGameServer({ root, async: true });
  try {
    await listenOnEphemeralLoopback(server);
  } catch (error) {
    if (server.listening) await closeServer(server).catch(() => {});
    throw error;
  }

  const address = server.address();
  if (!address || typeof address === 'string' || !Number.isInteger(address.port)) {
    await closeServer(server).catch(() => {});
    throw new Error('visual probe server did not report an assigned TCP port');
  }

  let closePromise = null;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    ownsServer: true,
    server,
    close() {
      if (!closePromise) closePromise = closeServer(server);
      return closePromise;
    },
  };
}

function listenOnEphemeralLoopback(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
