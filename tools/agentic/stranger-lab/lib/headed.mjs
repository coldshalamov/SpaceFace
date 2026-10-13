// Replay stranger tapes in Chrome at 390×844. The lab host page steps each tape
// through runBrowserLabScenarioInternal. deviceTested stays false. No FPS claim.
// A launch or replay that does not step the tape is unverified, with the error.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, existsSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSimScenario } from '../../../../src/contracts/simScenarioSchema.js';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const HOST_PAGE = '/src/testing/lab/chromiumHostPage.html';
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

export function canonicalForRun(run) {
  const frames = run && run.tape && Array.isArray(run.tape.frames) ? run.tape.frames : [];
  const doc = {
    schema: 'spaceface.simScenario.v1',
    id: `stranger.${run.journeyId}.${run.personaId}.${run.seed}`,
    version: 1,
    title: `Stranger tape ${run.journeyId}`,
    evidenceClass: 'focused-fixture',
    runtimeProfile: 'focused-lab',
    seed: run.seed >>> 0,
    ticks: Math.max(1, frames.length || (run.ticks | 0) || 1),
    world: {
      fixtureProfile: 'empty-flight',
      sectorId: 'sector_helios_prime',
      mode: 'flight',
      physicsBackend: 'rapier-dynamic',
      flightBackend: 'v3',
      aiBackend: 'legacy',
    },
    entities: [{
      alias: 'player',
      profile: 'ship.starter',
      role: 'player',
      team: 0,
      factionId: 'faction_free',
      isPlayer: true,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      heading: Math.PI / 2,
      persistent: true,
    }],
    frames: frames.map((frame) => ({
      tick: frame.tick | 0,
      input: {
        moveX: Number(frame.moveX) || 0,
        moveZ: Number(frame.moveZ) || 0,
        turnIntent: Number(frame.turnIntent) || 0,
        boost: !!frame.boost,
        fire: !!frame.fire,
        reelDelta: frame.reel < 0 ? -1 : (frame.reel > 0 ? 1 : 0),
        masslineHeld: !!frame.tether,
      },
    })),
    assertions: [{
      kind: 'metric',
      metric: 'invariant.finiteState',
      op: '==',
      value: 1,
    }],
    metrics: [{ name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } }],
    observer: { enabled: false },
  };
  return compileSimScenario(doc);
}

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
      results.push(await replayOne(page, run));
    }
    const failed = results.filter((row) => row.headedBrowser !== 'replayed');
    return {
      status: failed.length ? 'unverified' : 'replayed',
      reason: failed.length
        ? `${failed.length} of ${results.length} tapes did not replay in the browser. ${failed[0].error || ''}`.trim()
        : `Chrome stepped ${results.length} tapes at ${VIEWPORT.width}×${VIEWPORT.height}.`,
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

async function replayOne(page, run) {
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
  const compiled = canonicalForRun(run);
  if (!compiled.ok) {
    const issue = compiled.validation && compiled.validation.issues && compiled.validation.issues[0];
    return {
      ...base,
      headedBrowser: 'unverified',
      error: issue ? `${issue.path} ${issue.message}` : 'tape did not compile to a lab scenario',
    };
  }
  const expression = `(async () => {
    const host = window.__SF_BROWSER_LAB__;
    const result = await host.runBrowserLabScenarioInternal(${JSON.stringify(compiled.canonical)}, { skipMultiRunEquivalence: true });
    return {
      ok: !!(result && result.ok),
      status: result && result.status || null,
      error: result && (result.error || (result.oracle && result.oracle.failed && result.oracle.failed[0] && result.oracle.failed[0].reason)) || null,
      ticks: result && result.ticks,
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
      return { ...base, headedBrowser: 'unverified', error: String(text).slice(0, 500) };
    }
    const value = evaluated.result && evaluated.result.value;
    const stepped = value && (value.status === 'pass' || value.status === 'fail') && Number.isFinite(value.ticks);
    const sized = value && value.innerWidth === VIEWPORT.width && value.innerHeight === VIEWPORT.height;
    if (!stepped || !sized || value.status !== 'pass') {
      return {
        ...base,
        headedBrowser: 'unverified',
        error: !stepped
          ? (value && value.error) || `browser status ${value && value.status}`
          : (!sized
            ? `viewport ${value.innerWidth}×${value.innerHeight}, wanted ${VIEWPORT.width}×${VIEWPORT.height}`
            : (value.error || 'browser oracle did not pass')),
        browserStatus: value && value.status,
        ticks: value && value.ticks,
      };
    }
    return {
      ...base,
      headedBrowser: 'replayed',
      ticks: value.ticks,
      browserStatus: value.status,
    };
  } catch (error) {
    return { ...base, headedBrowser: 'unverified', error: error && error.message ? error.message : String(error) };
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
      viewport: VIEWPORT,
      deviceTested: false,
      fpsClaimed: false,
      error: extra.reason,
    })),
  };
}

function startStatic(root) {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
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
      resolve({
        url: `http://127.0.0.1:${address.port}`,
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
  const deadline = Date.now() + 30000;
  let last = null;
  while (Date.now() < deadline) {
    const evaluated = await page.send('Runtime.evaluate', {
      expression: `(() => {
        const host = window.__SF_BROWSER_LAB__;
        return {
          ready: !!(host && host.ready && host.runBrowserLabScenarioInternal),
          status: host && host.status || null,
          error: host && host.error || null,
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
      return { ok: false, error: last.error || 'lab host module failed', viewport: { width: last.innerWidth, height: last.innerHeight } };
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
