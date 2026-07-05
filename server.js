// Zero-dependency static file server for SpaceFace.
// Dev + local play: `node server.js [port]` (default 8123), then open http://localhost:8123/
import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8123);
const DEV_FRESHNESS_ROOTS = ['index.html', 'src', 'styles'];
let freshnessCache = { checkedAt: 0, version: '' };

// Dev-only screenshot sink: the page POSTs a data: URL here and we save the bytes to
// .devshots/<name>.jpg so the dev loop can Read the rendered frame (the headless preview
// tab can't composite a real screenshot). Local-only, writes within ROOT/.devshots.
async function handleShot(req, res) {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 12 * 1024 * 1024) req.destroy(); });
  req.on('end', async () => {
    try {
      const m = /^data:image\/(png|jpe?g);base64,(.+)$/s.exec(raw.trim());
      if (!m) { res.writeHead(400); res.end('bad data url'); return; }
      const ext = m[1] === 'png' ? 'png' : 'jpg';
      const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '');
      const dir = join(ROOT, '.devshots');
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${name}.${ext}`);
      await writeFile(file, Buffer.from(m[2], 'base64'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, file }));
    } catch (err) { res.writeHead(500); res.end('500 ' + err.message); }
  });
}

async function maxMtimeMs(file) {
  const s = await stat(file);
  if (!s.isDirectory()) return s.mtimeMs;
  let max = s.mtimeMs;
  const entries = await readdir(file, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'build' || entry.name === 'dist') continue;
    const child = join(file, entry.name);
    max = Math.max(max, await maxMtimeMs(child));
  }
  return max;
}

async function devFreshnessPayload() {
  const now = Date.now();
  if (freshnessCache.version && now - freshnessCache.checkedAt < 750) {
    return { dev: true, version: freshnessCache.version };
  }
  let max = 0;
  for (const rel of DEV_FRESHNESS_ROOTS) {
    try {
      max = Math.max(max, await maxMtimeMs(join(ROOT, rel)));
    } catch {}
  }
  const version = String(Math.round(max));
  freshnessCache = { checkedAt: now, version };
  return { dev: true, version };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && (req.url || '').startsWith('/__shot')) { await handleShot(req, res); return; }
    if (req.method === 'GET' && (req.url || '').startsWith('/__dev_freshness')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(await devFreshnessPayload()));
      return;
    }
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(ROOT, safe);
    if (!resolve(filePath).startsWith(resolve(ROOT))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    let s;
    try { s = await stat(filePath); }
    catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found: ' + safe); return; }
    if (s.isDirectory()) filePath = join(filePath, 'index.html');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('500 ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`SpaceFace dev server running -> http://localhost:${PORT}/`);
});
