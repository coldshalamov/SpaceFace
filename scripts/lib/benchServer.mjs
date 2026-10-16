// In-process static server for the UI bench. Serves the repo the same way `server.js` does
// and mounts a disposable player save drawer for controls that exercise real save writes.
// It does not boot the game.

import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./gameServer.cjs');

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function findFreePort() {
  return new Promise((resolve, reject) => {
    const socket = createNetServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      socket.close(() => resolve(port));
    });
  });
}

export async function startBenchServer({ sourceOverlay = null } = {}) {
  const playerStoreDir = await mkdtemp(join(tmpdir(), 'spaceface-ui-bench-'));
  let server = null;
  try {
    const port = await findFreePort();
    server = createGameServer({
      root: ROOT,
      async: true,
      devDiagnostics: false,
      playerStoreDir,
      ...(sourceOverlay ? { sourceOverlay } : {}),
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    const baseUrl = `http://127.0.0.1:${port}/`;
    let closePromise = null;
    return {
      baseUrl,
      close() {
        if (!closePromise) {
          closePromise = (async () => {
            try {
              await new Promise((resolve, reject) => {
                server.close((error) => error ? reject(error) : resolve());
              });
            } finally {
              await rm(playerStoreDir, { recursive: true, force: true });
            }
          })();
        }
        return closePromise;
      },
    };
  } catch (error) {
    try { server?.close(); } catch { /* Startup failed before the listener was usable. */ }
    await rm(playerStoreDir, { recursive: true, force: true });
    throw error;
  }
}
