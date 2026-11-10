// Replay stranger tapes in Chrome at 390×844. Each tape is stepped by
// browserJourneyHost on that journey's systems. The flight-only lab page is
// not a replay of combat, docking, mining, or the other journeys.
// deviceTested stays false. No FPS claim.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, existsSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { journeyWorldStepped } from './browserJourneyHost.js';
import { tapeTicks } from './tape.mjs';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const HOST_PAGE = '/tools/agentic/stranger-lab/public/journeyHostPage.html';

export { journeyWorldStepped };
const VIEWPORT = Object.freeze({ width: 390, height: 844 });
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
  '.glb': 'model/gltf-binary',
});

export async function verifyHeadedBrowser(rows) {
  const selected = Array.isArray(rows) ? rows.slice(0, 25) : [];
  const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!chrome) {
    return headedResult(selected, {
      status: 'unverified',
      reason: 'No Chrome binary was found. The tapes were not replayed.',
    });
  }
  let server = null;
  let browser = null;
  try {
    server = await startStatic(ROOT);
    browser = await launchChrome(chrome, VIEWPORT);
    const page = await connectPage(browser.port, `${server.url}${HOST_PAGE}`);
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    const ready = await waitForHost(page);
    if (!ready.ok) {
      return headedResult(selected, {
        status: 'unverified',
        reason: ready.error,
        viewportMeasured: ready.viewport || null,
      });
    }
    const results = [];
    for (const run of selected) {
      results.push(await replayOne(page, server, run));
    }
    const failed = results.filter((row) => row.headedBrowser !== 'replayed');
    return {
      status: failed.length ? 'unverified' : 'replayed',
      reason: failed.length
        ? `${failed.length} of ${results.length} tapes did not replay in the browser. ${failed[0].error || ''}`.trim()
        : `Chrome stepped ${results.length} tapes at ${VIEWPORT.width}×${VIEWPORT.height} on each journey's systems.`,
      deviceTested: false,
      fpsClaimed: false,
      viewport: VIEWPORT,
      viewportMeasured: ready.viewport,
      runs: results,
    };
  } catch (error) {
    return headedResult(selected, {
      status: 'unverified',
      reason: error && error.message ? error.message : String(error),
    });
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
  }
}

async function replayOne(page, server, run) {
  const base = {
    journeyId: run.journeyId,
    personaId: run.personaId,
    seed: run.seed,
    surface: run.surface,
    tapeHash: run.tapeHash,
    viewport: VIEWPORT,
    deviceTested: false,
    fpsClaimed: false,
  };
  const frames = run && run.tape && Array.isArray(run.tape.frames) ? run.tape.frames : [];
  if (!frames.length) {
    return {
      ...base,
      headedBrowser: 'unverified',
      browserStatus: 'unverified',
      error: 'tape has no frames to step',
    };
  }
  let tapeId = null;
  try {
    tapeId = await server.postTape({
      journeyId: run.journeyId,
      seed: run.seed >>> 0,
      tape: { frames },
    });
  } catch (error) {
    return {
      ...base,
      headedBrowser: 'unverified',
      browserStatus: 'unverified',
      error: error && error.message ? error.message : String(error),
    };
  }
  const expression = `(async () => {
    const host = window.__SF_STRANGER_LAB__;
    const response = await fetch('/__stranger_tape/${tapeId}');
    const request = await response.json();
    const result = await host.replayJourneyTape(request);
    const evidence = result && result.evidence;
    return {
      ok: !!(result && result.ok),
      status: result && result.status || null,
      error: result && result.error || null,
      ticks: result && result.ticks,
      systems: evidence && evidence.systems || null,
      kinds: evidence && evidence.builtKinds || null,
      hostile: evidence && evidence.builtHostile,
      tetherActive: evidence && evidence.builtTetherActive,
      dockPhase: evidence && evidence.dockPhase || null,
      sectorId: evidence && evidence.sectorId || null,
      simTime: evidence && evidence.simTime,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    };
  })()`;
  try {
    const evaluated = await page.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluated.exceptionDetails) {
      const text = evaluated.exceptionDetails.text
        || (evaluated.exceptionDetails.exception && evaluated.exceptionDetails.exception.description)
        || 'browser evaluate threw';
      return { ...base, headedBrowser: 'unverified', browserStatus: 'unverified', error: String(text).slice(0, 500) };
    }
    const value = evaluated.result && evaluated.result.value;
    const sized = value && value.innerWidth === VIEWPORT.width && value.innerHeight === VIEWPORT.height;
    const evidence = value && {
      systems: value.systems,
      builtKinds: value.kinds,
      builtHostile: value.hostile,
      builtTetherActive: value.tetherActive,
    };
    const worldOk = value && value.status === 'stepped' && journeyWorldStepped(run.journeyId, evidence);
    const stepped = worldOk && Number.isFinite(value.ticks) && value.ticks === tapeTicks({ frames });
    if (!stepped || !sized) {
      return {
        ...base,
        headedBrowser: 'unverified',
        browserStatus: 'unverified',
        error: !value
          ? 'browser returned no journey result'
          : (!sized
            ? `viewport ${value.innerWidth}×${value.innerHeight}, wanted ${VIEWPORT.width}×${VIEWPORT.height}`
            : (value.error || `journey ${run.journeyId} world was not stepped (systems ${(value.systems || []).join(', ')}; kinds ${JSON.stringify(value.kinds || {})})`)),
      };
    }
    return {
      ...base,
      headedBrowser: 'replayed',
      ticks: value.ticks,
      browserStatus: 'pass',
      systems: value.systems,
      worldKinds: value.kinds,
      hostile: value.hostile,
    };
  } catch (error) {
    return {
      ...base,
      headedBrowser: 'unverified',
      browserStatus: 'unverified',
      error: error && error.message ? error.message : String(error),
    };
  }
}

function headedResult(selected, extra) {
  return {
    status: 'unverified',
    reason: extra.reason,
    deviceTested: false,
    fpsClaimed: false,
    viewport: VIEWPORT,
    viewportMeasured: extra.viewportMeasured || null,
    runs: selected.map((run) => ({
      journeyId: run.journeyId,
      personaId: run.personaId,
      seed: run.seed,
      surface: run.surface,
      tapeHash: run.tapeHash,
      headedBrowser: 'unverified',
      browserStatus: 'unverified',
      viewport: VIEWPORT,
      deviceTested: false,
      fpsClaimed: false,
      error: extra.reason,
    })),
  };
}

function startStatic(root) {
  const tapes = new Map();
  let tapeSeq = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/__stranger_tape' && req.method === 'POST') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const id = String(++tapeSeq);
        tapes.set(id, Buffer.concat(chunks));
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(id);
      });
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/__stranger_tape/')) {
      const id = url.pathname.slice('/__stranger_tape/'.length);
      const body = tapes.get(id);
      if (!body) {
        res.writeHead(404);
        res.end('missing');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(body);
      return;
    }
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.(\/|\\|$))+/, '');
    const path = join(root, relative);
    const rootPrefix = root.endsWith(sep) ? root : root + sep;
    if (path !== root && !path.startsWith(rootPrefix)) {
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
      const url = `http://127.0.0.1:${address.port}`;
      resolve({
        url,
        postTape: async (payload) => {
          const response = await fetch(`${url}/__stranger_tape`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new Error(`tape post ${response.status}`);
          return response.text();
        },
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

function launchChrome(chrome, viewport) {
  const userData = mkdtempSync(join(tmpdir(), 'stranger-chrome-'));
  const child = spawn(chrome, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userData}`,
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    `--window-size=${viewport.width},${viewport.height}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Chrome did not open a DevTools port. ${stderr.slice(0, 400)}`));
    }, 20000);
    const watch = () => {
      const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    };
    child.stderr.on('data', watch);
    child.on('exit', () => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited before DevTools was ready. ${stderr.slice(0, 400)}`));
    });
  });
  return ready.then((port) => ({
    port,
    close: async () => {
      if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL');
      await new Promise((resolve) => {
        if (child.exitCode != null || child.signalCode != null) resolve();
        else child.once('exit', resolve);
      });
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          rmSync(userData, { recursive: true, force: true });
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }
    },
  }));
}

async function connectPage(port, url) {
  let target = null;
  let lastError = null;
  for (const method of ['PUT', 'GET']) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method });
      if (!response.ok) {
        lastError = new Error(`json/new ${method} ${response.status}`);
        continue;
      }
      target = await response.json();
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!target || !target.webSocketDebuggerUrl) {
    throw lastError || new Error('Chrome did not return a page websocket');
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('page websocket failed')), { once: true });
  });
  const page = new Cdp(ws);
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  return page;
}

async function waitForHost(page) {
  const deadline = Date.now() + 60000;
  let last = null;
  while (Date.now() < deadline) {
    const evaluated = await page.send('Runtime.evaluate', {
      expression: `(() => {
        const host = window.__SF_STRANGER_LAB__;
        return {
          ready: !!(host && host.ready && host.replayJourneyTape),
          status: host && host.status || null,
          error: host && host.error || null,
          stack: host && host.stack || null,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        };
      })()`,
      returnByValue: true,
    });
    last = evaluated.result && evaluated.result.value;
    if (last && last.ready) {
      return { ok: true, viewport: { width: last.innerWidth, height: last.innerHeight } };
    }
    if (last && last.status === 'error') {
      const detail = [last.error, last.stack].filter(Boolean).join('\n');
      return { ok: false, error: detail || 'journey host module failed', viewport: { width: last.innerWidth, height: last.innerHeight } };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { ok: false, error: `lab host did not become ready (${last && last.status})`, viewport: last };
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.next = 0;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'cdp error'));
      else pending.resolve(message.result || {});
    });
  }

  send(method, params = {}) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}
