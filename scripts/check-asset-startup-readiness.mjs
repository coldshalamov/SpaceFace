#!/usr/bin/env node
// check-asset-startup-readiness.mjs
//
// Independent runtime evidence lane (ASSET-STARTUP-RUNTIME-CHECK-GROK-001).
// Boots the canonical player root via server.js, walks Main Menu → New Game → Launch,
// and either reaches playable flight or fails closed while still menu/loading — with
// component-boundary evidence for authored-asset preload and required URL HTTP status.
//
// Intentional non-goals:
//   • Does not edit/weaken main.js authored gates, manifests, assets, or quality flags.
//   • Does not use debug flight routes, query params, or alternate launch paths.
//   • Does not replace probe-authored-assets-live.mjs (that probe uses withDebugFlight +
//     injected game:new) or check-first-15-runtime.mjs (B0 rail / one-verb, thin asset diag).
//
// Pass = mode flight + alive player after normal Launch, with evidence printed.
// Fail closed = still menu (or never flight) after Launch timeout; evidence dumped, exit 1.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const START_TIMEOUT_MS = Number(process.env.SF_ASSET_STARTUP_TIMEOUT_MS) || 180000;
const BOOT_TIMEOUT_MS = Number(process.env.SF_ASSET_BOOT_TIMEOUT_MS) || 90000;
const SCHEMA = 'spaceface.assetStartupReadiness.v1';
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);
  const assetHttp = createAssetHttpTracker(page);
  const busEvents = [];

  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });

  // Canonical player root only — no alternate probe routes / debug game paths / quality flags.
  const navResponse = await page.goto(server.baseUrl, {
    waitUntil: 'domcontentloaded',
    timeout: BOOT_TIMEOUT_MS,
  });
  assert.ok(navResponse, 'canonical root navigation must return an HTTP response');
  assertCanonicalRoot(page.url(), server.baseUrl, 'post-navigation page URL');
  assert.equal(new URL(page.url()).search, '', 'canonical root must have empty query string');

  await page.waitForFunction(
    () => window.SF && window.SF.state && window.SF.bus && window.SF.ctx,
    null,
    { timeout: BOOT_TIMEOUT_MS },
  );
  await waitForVisible(page, '[data-screen="mainMenu"]', BOOT_TIMEOUT_MS, 'main menu');
  await waitForBootOverlayGone(page);

  // Instrument start-failure + mode transitions without changing game behavior.
  await page.evaluate(() => {
    const sf = window.SF;
    const bag = (window.__SF_ASSET_STARTUP_EVIDENCE__ = {
      startFailed: [],
      modeChanges: [],
      gameStarted: 0,
    });
    if (!sf || !sf.bus || typeof sf.bus.on !== 'function') return;
    sf.bus.on('game:startFailed', (payload) => {
      bag.startFailed.push({
        at: Date.now(),
        error: payload && payload.error ? String(payload.error) : String(payload || ''),
      });
    });
    sf.bus.on('mode:changed', (payload) => {
      bag.modeChanges.push({
        at: Date.now(),
        mode: payload && payload.mode,
        previousMode: payload && payload.previousMode,
      });
    });
    sf.bus.on('game:started', () => { bag.gameStarted += 1; });
  });

  const opened = await clickButton(page, 'New Game');
  assert.equal(opened, true, 'main menu should expose New Game');
  await waitForVisible(page, '[data-screen="newGame"]', 10000, 'new-game screen');
  assertCanonicalRoot(page.url(), server.baseUrl, 'New Game screen URL');

  const preLaunch = await collectBoundaryEvidence(page, assetHttp, 'pre-launch');

  const launched = await clickButton(page, 'Launch');
  assert.equal(launched, true, 'New Game should expose Launch');

  let flightOk = false;
  let flightError = null;
  try {
    await page.waitForFunction(() => {
      const sf = window.SF;
      const state = sf && sf.state;
      const player = state && state.entities && state.entities.get(state.playerId);
      return !!(state && state.mode === 'flight' && player && player.alive !== false && player.hull > 0);
    }, null, { timeout: START_TIMEOUT_MS });
    flightOk = true;
  } catch (err) {
    flightError = err && err.message ? err.message : String(err);
  }

  const evidence = await collectBoundaryEvidence(page, assetHttp, flightOk ? 'post-flight' : 'post-timeout');
  const busBag = await page.evaluate(() => window.__SF_ASSET_STARTUP_EVIDENCE__ || null).catch(() => null);
  if (busBag) {
    busEvents.push(busBag);
  }

  const report = {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    route: server.baseUrl,
    canonicalRoot: true,
    query: new URL(page.url()).search,
    flightOk,
    flightError,
    preLaunch: summarizeEvidence(preLaunch),
    evidence: summarizeEvidence(evidence),
    bus: busBag,
    pageIssues: summarizeIssues(issues.errorIssues()),
  };

  console.log(JSON.stringify(report, null, 2));

  // Fail closed: New Game / Launch must not leave the player on menu.
  if (!flightOk) {
    const mode = evidence && evidence.state && evidence.state.mode;
    const boundary = classifyFailingBoundary(evidence, busBag, assetHttp.snapshot());
    console.error(
      `FAIL-CLOSED: Launch did not reach playable flight (mode=${mode || 'unknown'}).\n`
      + `failingBoundary=${boundary}\n`
      + 'Do not weaken main.js authored gates. Capture above is the component-boundary evidence package.',
    );
    process.exitCode = 1;
    throw new Error(
      `asset startup readiness fail-closed at boundary=${boundary}; mode=${mode}; `
      + `preload=${JSON.stringify(evidence && evidence.preload)}; `
      + `cause=${flightError || 'timeout'}`,
    );
  }

  assert.equal(evidence.state.mode, 'flight', 'Launch must enter flight mode');
  assert.ok(evidence.state.player && evidence.state.player.alive !== false,
    'Launch must leave an alive player in flight');
  assert.equal(new URL(page.url()).search, '', 'flight must remain on canonical root with no query flags');
  // Authored gate preservation: if flight is live, library preload must have completed (not failed).
  assert.equal(evidence.preload.requested, true, 'flight path must request authored part library preload');
  assert.equal(evidence.preload.completed, true, 'flight path must complete authored part library preload');
  assert.equal(evidence.preload.failed, false, 'flight path must not mark authored part library preload failed');

  console.log(
    `Asset startup readiness OK: Launch → flight (player=${evidence.state.player.id}) `
    + `preload=${evidence.preload.status} requiredUrls=${evidence.requiredUrls.length} `
    + `httpOk=${evidence.http.okCount}/${evidence.http.trackedCount}`,
  );
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.kill) server.kill();
}

// ── Evidence collection ───────────────────────────────────────────────────────

async function collectBoundaryEvidence(page, assetHttp, phase) {
  const inPage = await page.evaluate(async () => {
    const sf = window.SF || null;
    const state = sf && sf.state || null;
    const playerEntity = state && state.entities && state.entities.get(state.playerId);
    const body = (document.body && document.body.innerText) || '';
    const boot = document.getElementById('boot-overlay');
    const toastBlob = [...document.querySelectorAll('.sf-toast, .toast, [role="alert"], [role="status"]')]
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' | ')
      .slice(0, 800);

    // Preload promise published by renderer at boot (main.js waitForAuthoredPartLibrary).
    const readyPromise = state && state.render && state.render.authoredPartLibraryReady;
    let preload = {
      requested: !!(readyPromise && typeof readyPromise.then === 'function'),
      completed: false,
      failed: false,
      status: 'missing',
      valueKind: null,
    };
    if (preload.requested) {
      const pending = Symbol('pending');
      try {
        const raced = await Promise.race([
          Promise.resolve(readyPromise).then(
            (value) => ({ ok: true, value }),
            (error) => ({ ok: false, error }),
          ),
          new Promise((resolve) => queueMicrotask(() => resolve(pending))),
        ]);
        if (raced === pending) {
          preload = { ...preload, status: 'pending', completed: false, failed: false };
        } else if (raced.ok) {
          const { isAuthoredPartLibraryUsable } = await import('/src/render/partsLibrary.js');
          const usable = isAuthoredPartLibraryUsable(raced.value);
          const failed = !usable;
          preload = {
            ...preload,
            completed: usable,
            failed,
            status: failed ? 'resolved-unusable' : 'resolved-usable',
            valueKind: raced.value == null ? 'null' : typeof raced.value,
          };
        } else {
          preload = {
            ...preload,
            completed: false,
            failed: true,
            status: 'rejected',
            valueKind: 'error',
            error: raced.error && raced.error.message ? raced.error.message : String(raced.error),
          };
        }
      } catch (error) {
        preload = {
          ...preload,
          completed: false,
          failed: true,
          status: 'evaluate-error',
          error: error && error.message ? error.message : String(error),
        };
      }
    }

    // Required authored URLs from the live contract (release mode is default play).
    let requiredUrls = [];
    let contract = null;
    let release = null;
    let loaderSample = null;
    try {
      const [partsLibrary, releaseMode, assetLoader] = await Promise.all([
        import('./src/render/partsLibrary.js'),
        import('./src/render/releaseMode.js'),
        import('./src/render/assetLoader.js'),
      ]);
      contract = {
        version: partsLibrary.PART_LIBRARY_CONTRACT && partsLibrary.PART_LIBRARY_CONTRACT.version,
        root: partsLibrary.PART_LIBRARY_CONTRACT && partsLibrary.PART_LIBRARY_CONTRACT.root,
        releaseRoot: partsLibrary.PART_LIBRARY_CONTRACT && partsLibrary.PART_LIBRARY_CONTRACT.releaseRoot,
        slotCounts: {},
      };
      release = typeof releaseMode.isReleaseAssetMode === 'function'
        ? releaseMode.isReleaseAssetMode()
        : true;
      const partRoot = release
        ? (partsLibrary.PART_LIBRARY_CONTRACT.releaseRoot || 'assets/ships/release/parts/')
        : (partsLibrary.PART_LIBRARY_CONTRACT.root || 'assets/ships/parts/');
      const slots = (partsLibrary.PART_LIBRARY_CONTRACT && partsLibrary.PART_LIBRARY_CONTRACT.slots) || {};
      for (const [slot, files] of Object.entries(slots)) {
        contract.slotCounts[slot] = (files || []).length;
        for (const file of files || []) {
          requiredUrls.push({ slot, url: `${partRoot}${file}` });
        }
      }
      // Optional runtime info (decoders / paths) — never mutates game state.
      const renderer = state && state.render && state.render.renderer;
      if (renderer && typeof assetLoader.getAuthoredAssetRuntimeInfo === 'function') {
        loaderSample = await assetLoader.getAuthoredAssetRuntimeInfo(renderer);
      }
    } catch (error) {
      contract = {
        error: error && error.message ? error.message : String(error),
      };
    }

    // Ship visual boundary sample (does not force upgrades).
    const ships = [];
    if (state && Array.isArray(state.entityList)) {
      for (const entity of state.entityList) {
        if (!entity || entity.type !== 'ship' || entity.alive === false) continue;
        const data = entity.mesh && entity.mesh.userData || {};
        ships.push({
          id: entity.id,
          defId: entity.data && entity.data.defId || null,
          isPlayer: entity.id === state.playerId,
          authoredAssetState: data.authoredAssetState || null,
          authoredAssetMode: data.authoredAssetMode || null,
          fallbackParts: Array.isArray(data.proceduralFallbackParts)
            ? data.proceduralFallbackParts.slice(0, 8)
            : [],
        });
      }
    }

    return {
      phase: null,
      preload,
      requiredUrls,
      contract,
      release,
      loaderSample,
      state: {
        mode: state && state.mode || null,
        tick: state && state.tick || 0,
        simTime: state && state.simTime || 0,
        playerId: state && state.playerId || null,
        player: playerEntity ? {
          id: playerEntity.id,
          alive: playerEntity.alive !== false,
          hull: playerEntity.hull,
          hullMax: playerEntity.hullMax,
          defId: playerEntity.data && playerEntity.data.defId || null,
          pos: {
            x: playerEntity.pos && playerEntity.pos.x || 0,
            z: playerEntity.pos && playerEntity.pos.z || 0,
          },
        } : null,
        shipCount: ships.length,
        ships: ships.slice(0, 12),
      },
      ui: {
        bootHidden: !boot || boot.classList.contains('hidden'),
        toastBlob,
        bodyHint: (body.match(/authored ship|preload|procedural fallback|refusing to|Game assets failed/i) || [null])[0],
        bodySnippet: body.replace(/\s+/g, ' ').trim().slice(0, 500),
      },
    };
  });

  const http = matchRequiredHttp(inPage.requiredUrls || [], assetHttp.snapshot());
  return {
    phase,
    preload: inPage.preload,
    requiredUrls: inPage.requiredUrls,
    contract: inPage.contract,
    release: inPage.release,
    loaderSample: inPage.loaderSample,
    state: inPage.state,
    ui: inPage.ui,
    http,
  };
}

function summarizeEvidence(evidence) {
  if (!evidence) return null;
  return {
    phase: evidence.phase,
    preload: evidence.preload,
    release: evidence.release,
    contract: evidence.contract,
    loaderSample: evidence.loaderSample,
    state: evidence.state,
    ui: evidence.ui,
    requiredUrlCount: (evidence.requiredUrls || []).length,
    requiredUrlsSample: (evidence.requiredUrls || []).slice(0, 8),
    http: evidence.http,
  };
}

function matchRequiredHttp(requiredUrls, tracked) {
  const byPath = new Map();
  for (const entry of tracked) {
    const key = normalizeAssetPath(entry.url);
    if (!key) continue;
    // Keep worst status if duplicates (prefer first non-2xx).
    const prev = byPath.get(key);
    if (!prev || (prev.status >= 200 && prev.status < 300 && entry.status >= 400)) {
      byPath.set(key, entry);
    } else if (!prev) {
      byPath.set(key, entry);
    }
  }

  const rows = [];
  let okCount = 0;
  let failCount = 0;
  let missingCount = 0;
  for (const req of requiredUrls) {
    const key = normalizeAssetPath(req.url);
    const hit = byPath.get(key) || null;
    let status = hit ? hit.status : null;
    let ok = hit ? hit.ok : null;
    if (!hit) {
      missingCount += 1;
    } else if (hit.ok) {
      okCount += 1;
    } else {
      failCount += 1;
    }
    rows.push({
      slot: req.slot,
      url: req.url,
      status,
      ok,
      fromNetwork: !!hit,
    });
  }

  return {
    trackedCount: tracked.length,
    requiredCount: requiredUrls.length,
    okCount,
    failCount,
    missingCount,
    // Prefer failures + missing first for diagnosis.
    sample: [
      ...rows.filter((r) => r.ok === false),
      ...rows.filter((r) => r.fromNetwork === false),
      ...rows.filter((r) => r.ok === true),
    ].slice(0, 24),
  };
}

function normalizeAssetPath(url) {
  if (!url) return '';
  try {
    const u = new URL(url, 'http://127.0.0.1/');
    let path = u.pathname || '';
    if (path.startsWith('/')) path = path.slice(1);
    return path;
  } catch (_) {
    return String(url).replace(/^\//, '');
  }
}

function classifyFailingBoundary(evidence, busBag, trackedHttp) {
  const mode = evidence && evidence.state && evidence.state.mode;
  const preload = evidence && evidence.preload || {};
  const http = evidence && evidence.http || {};
  const startFailed = busBag && Array.isArray(busBag.startFailed) ? busBag.startFailed : [];
  const uiHint = evidence && evidence.ui && (evidence.ui.bodyHint || evidence.ui.toastBlob || '');

  if (startFailed.length > 0) {
    return 'game:startFailed';
  }
  if (/authored ship|preload|procedural fallback|refusing to|Game assets failed/i.test(String(uiHint))) {
    return 'authored-gate-message';
  }
  if (preload.requested && preload.failed) {
    return 'preload-failed';
  }
  if (preload.requested && preload.status === 'pending') {
    return 'preload-pending-timeout';
  }
  if (!preload.requested) {
    return 'preload-not-requested';
  }
  if (http.failCount > 0) {
    return 'required-url-http-failed';
  }
  if (mode === 'menu') {
    return 'remains-menu';
  }
  if (mode === 'loading') {
    return 'stuck-loading';
  }
  if (mode === 'flight' && !(evidence.state && evidence.state.player)) {
    return 'flight-without-player';
  }
  if (trackedHttp && trackedHttp.length === 0 && (http.requiredCount || 0) > 0) {
    return 'no-asset-http-observed';
  }
  return `mode-${mode || 'unknown'}`;
}

function createAssetHttpTracker(page) {
  const rows = [];
  page.on('response', (response) => {
    try {
      const url = response.url();
      if (!/\/assets\/ships\//i.test(url) && !/assets\/ships\//i.test(url)) return;
      rows.push({
        url,
        status: response.status(),
        ok: response.ok(),
        method: response.request().method(),
      });
      if (rows.length > 400) rows.splice(0, rows.length - 400);
    } catch (_) {
      // ignore tracker errors
    }
  });
  page.on('requestfailed', (request) => {
    try {
      const url = request.url();
      if (!/assets\/ships\//i.test(url)) return;
      const failure = request.failure();
      rows.push({
        url,
        status: 0,
        ok: false,
        method: request.method(),
        error: failure && failure.errorText || 'requestfailed',
      });
      if (rows.length > 400) rows.splice(0, rows.length - 400);
    } catch (_) {
      // ignore
    }
  });
  return {
    snapshot() {
      return rows.slice();
    },
  };
}

function assertCanonicalRoot(actual, expectedBase, label) {
  const a = new URL(actual);
  const e = new URL(expectedBase);
  assert.equal(a.origin, e.origin, `${label}: origin must match owned server`);
  assert.ok(a.pathname === '/' || a.pathname === e.pathname, `${label}: pathname must stay at root`);
  assert.equal(a.search, '', `${label}: must not add query flags`);
  assert.equal(a.hash, '', `${label}: must not add hash routes`);
}

// ── Browser harness (mirrors first-15-runtime canonical patterns) ─────────────

async function waitForVisible(page, selector, timeoutMs, label) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
  }, selector, { timeout: timeoutMs }).catch((err) => {
    throw new Error('Timed out waiting for ' + label + ': ' + err.message);
  });
}

async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const normalized = String(wanted || '').replace(/\s+/g, ' ').trim();
    const button = [...document.querySelectorAll('button')].find((candidate) => (
      String(candidate.textContent || '').replace(/\s+/g, ' ').trim() === normalized
    ));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, label);
}

async function waitForBootOverlayGone(page, timeoutMs = 90000) {
  await page.waitForFunction(() => {
    const o = document.getElementById('boot-overlay');
    if (!o) return true;
    const s = getComputedStyle(o);
    return o.classList.contains('hidden') || s.pointerEvents === 'none' || s.display === 'none' || s.visibility === 'hidden';
  }, null, { timeout: timeoutMs });
}

async function startFreshServer() {
  const port = await findFreePort(8147);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    }
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port found for asset startup readiness check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return !!res.ok;
  } catch (_) {
    return false;
  }
}
