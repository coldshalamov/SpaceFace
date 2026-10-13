// One real Chrome launch for the headed selection. The lab host page is opened at
// 390×844. Playwright is not required. A missing browser or a module error is recorded.
// deviceTested stays false. No FPS number is claimed.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
});

export async function verifyHeadedBrowser(rows) {
  const viewport = { width: 390, height: 844 };
  const selected = Array.isArray(rows) ? rows.slice(0, 25) : [];
  const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!chrome) {
    return headedResult(selected, viewport, {
      status: 'failed',
      reason: 'No Chrome binary was found. The 25 headed rows were not executed.',
    });
  }
  let server = null;
  try {
    server = await startStatic(ROOT);
    const dump = await dumpDom(chrome, `${server.url}/src/testing/lab/chromiumHostPage.html`, viewport);
    const loaded = dump.includes('lab-chromium-host modules loaded');
    const moduleError = dump.includes('lab-chromium-host module error');
    return headedResult(selected, viewport, {
      status: loaded ? 'host-loaded' : 'failed',
      reason: loaded
        ? 'Chrome opened the lab host at 390×844. The host page loaded. Individual journey tapes were not re-executed inside the page: runChromiumLabScenario hardcodes an 800×600 viewport and accepts only a compiled canonical. See ADAPTER.md. deviceTested is false.'
        : (moduleError
          ? 'Chrome opened the lab host at 390×844 and the host module failed to load.'
          : 'Chrome launched but the lab host did not report modules loaded.'),
      dumpExcerpt: dump.slice(0, 700),
      perRun: loaded ? 'host-loaded-not-a-tape-replay' : 'failed',
    });
  } catch (error) {
    return headedResult(selected, viewport, {
      status: 'failed',
      reason: error && error.message ? error.message : String(error),
    });
  } finally {
    if (server) await server.close();
  }
}

function headedResult(selected, viewport, extra) {
  const perRun = extra.perRun || 'failed';
  return {
    status: extra.status,
    reason: extra.reason,
    deviceTested: false,
    fpsClaimed: false,
    viewport,
    dumpExcerpt: extra.dumpExcerpt || null,
    runs: selected.map((run) => ({
      journeyId: run.journeyId,
      personaId: run.personaId,
      seed: run.seed,
      surface: run.surface,
      tapeHash: run.tapeHash,
      headedBrowser: perRun,
      viewport,
      deviceTested: false,
    })),
  };
}

function startStatic(root) {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.(\/|\\|$))+/, '');
    const path = join(root, relative);
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep) && path !== root) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    if (!existsSync(path) || !statSync(path).isFile()) {
      res.writeHead(404);
      res.end('missing');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(readFileSync(path));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

function dumpDom(chrome, url, viewport) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--window-size=${viewport.width},${viewport.height}`,
      '--virtual-time-budget=12000',
      '--timeout=15000',
      '--dump-dom',
      url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Chrome dump-dom exceeded 20s'));
    }, 20000);
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (!out && code !== 0) {
        reject(new Error(`Chrome exited ${code}: ${err.slice(0, 400)}`));
        return;
      }
      resolve(out || err);
    });
  });
}
