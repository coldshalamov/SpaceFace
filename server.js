// Zero-dependency static file server for SpaceFace (browser dev path).
// Dev + local play: `node server.js [port]` (default 8123), then open http://localhost:8123/
//
// The HTTP core (MIME table, dev-freshness, static serving, containment check) lives in
// scripts/lib/gameServer.cjs and is SHARED with electron/main.cjs so the two launchers can never
// drift (one MIME table, one freshness function, one serving core). This file is a thin wrapper
// that adds the dev-only /__shot screenshot sink the browser path uses for headless captures.
// `npm run check:launch-policy` enforces that both launchers share that module.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./scripts/lib/gameServer.cjs');

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8123);

// Dev-only screenshot sink: the page POSTs a data: URL here and we save the bytes to
// .devshots/<name>.jpg so the dev loop can Read the rendered frame (the headless preview
// tab can't composite a real screenshot). Local-only, writes within ROOT/.devshots.
async function handleShot(req, res, { root }) {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 12 * 1024 * 1024) req.destroy(); });
  req.on('end', async () => {
    try {
      const m = /^data:image\/(png|jpe?g);base64,(.+)$/s.exec(raw.trim());
      if (!m) { res.writeHead(400); res.end('bad data url'); return; }
      const ext = m[1] === 'png' ? 'png' : 'jpg';
      const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '');
      const dir = join(root, '.devshots');
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${name}.${ext}`);
      await writeFile(file, Buffer.from(m[2], 'base64'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, file }));
    } catch (err) { res.writeHead(500); res.end('500 ' + err.message); }
  });
}

const server = createGameServer({
  root: ROOT,
  async: true,
  devDiagnostics: true,
  playerStoreDir: process.env.SPACEFACE_PLAYER_STORE_DIR || undefined,
  extraRoutes: [
    { test: (method, url) => method === 'POST' && url.startsWith('/__shot'), handle: handleShot },
  ],
});

server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`SpaceFace dev server could not start: port ${PORT} is already in use.`);
    console.error(`If SpaceFace is already running, open http://localhost:${PORT}/ or use scripts/launch-browser.mjs to reuse it.`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, () => {
  console.log(`SpaceFace dev server running -> http://localhost:${PORT}/`);
});
