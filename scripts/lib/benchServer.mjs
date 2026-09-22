// In-process static server for the UI bench. Serves the repo the same way `server.js` does
// and does not mount the player save drawer. It does not boot the game.

import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
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

export async function startBenchServer() {
  const port = await findFreePort();
  const server = createGameServer({
    root: ROOT,
    async: true,
    devDiagnostics: false,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
