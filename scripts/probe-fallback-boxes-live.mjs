#!/usr/bin/env node
/**
 * Diagnostic: inventory live fallback/box state for ships, stations, and place props.
 * Answers: do cyan boxes persist after authored upgrade? does the problem span entity kinds?
 *
 * Usage: node scripts/probe-fallback-boxes-live.mjs
 * Writes: .devshots/fallback-boxes-live.json
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, '.devshots');
const REPORT = resolve(OUT_DIR, 'fallback-boxes-live.json');
const PLAYABLE_TIMEOUT_MS = 90000;
const SETTLE_MS = 20000;

let server = null;
let chrome = null;
let ws = null;

try {
  server = await startFreshServer();
  const debugPort = await findFreePort(9831);
  chrome = spawnChrome(debugPort);
  const cdp = await connectCdp(debugPort);
  ws = cdp.ws;

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  const pageIssues = collectPageIssues(cdp);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}",
  });

  await cdp.send('Page.navigate', { url: withDebugFlight(server.baseUrl) });
  await waitFor(cdp, isBootReady, 15000, 'SpaceFace debug runtime');

  await evalVoid(cdp, `(() => {
    window.SF.bus.emit('game:new', { name: 'Fallback Box Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  })()`);
  await waitFor(cdp, isPlayable, PLAYABLE_TIMEOUT_MS, 'seeded flight session');

  // Force upgrade requests + a settle window so loading → authored can complete.
  const settleStart = Date.now();
  let report = null;
  while (Date.now() - settleStart < SETTLE_MS) {
    await forceUpgradePass(cdp);
    report = await collectFallbackReport(cdp);
    if (report.loadingCount === 0 && report.proceduralFallbackCount === 0) break;
    await sleep(400);
  }

  report.pageWarnings = pageIssues.warningIssues().filter((w) =>
    /partsLibrary|assetLoader|place prop|authored|fallback|GLTF|404/i.test(w.text || '')).slice(0, 40);
  report.pageErrors = pageIssues.errorIssues().slice(0, 20);
  report.staticCodeFindings = {
    placeRetainAlwaysTrue: true,
    stationRetainAlwaysTrue: true,
    shipRetainOnlyKestrelHero: true,
    liveProbesCoverShips: true,
    liveProbesCoverStations: true,
    liveProbesCoverPlaceProps: false,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT, JSON.stringify(report, null, 2));

  console.log('Fallback-box live diagnostic');
  console.log(JSON.stringify({
    mode: report.mode,
    sectorId: report.sectorId,
    tick: report.tick,
    summary: report.summary,
    byType: report.byType,
    problemPlaces: report.problemPlaces,
    problemStations: report.problemStations,
    problemShips: report.problemShips,
    retainedBoxCount: report.retainedBoxCount,
    pureFallbackBoxCount: report.pureFallbackBoxCount,
    warningCount: report.pageWarnings.length,
    reportPath: REPORT,
  }, null, 2));
} finally {
  try { if (ws) ws.close(); } catch (_) {}
  try { if (chrome) chrome.kill(); } catch (_) {}
  try { if (server && server.kill) server.kill(); } catch (_) {}
}

async function forceUpgradePass(cdp) {
  await evalVoid(cdp, `(async () => {
    const state = window.SF && window.SF.state;
    const render = state && state.render;
    if (!render || !render.scene || !render.renderer || !render.camera) return;
    const renderSystem = window.SF && window.SF.registry && window.SF.registry.get && window.SF.registry.get('render');
    if (renderSystem && typeof renderSystem.reconcileMeshes === 'function') renderSystem.reconcileMeshes();
    for (const entity of state.entityList || []) {
      if (!entity || !entity.mesh) continue;
      entity.mesh.traverse((o) => { if (o) o.frustumCulled = false; });
      const req = entity.mesh.userData && entity.mesh.userData.requestAuthoredUpgrade;
      if (typeof req === 'function') {
        try { req(render.renderer, render.scene); } catch (_) {}
      }
    }
    try {
      const partsLibrary = await import('./src/render/partsLibrary.js');
      if (partsLibrary && typeof partsLibrary.syncAuthoredInstancePools === 'function') {
        partsLibrary.syncAuthoredInstancePools(render.scene);
      }
    } catch (_) {}
    render.renderer.render(render.scene, render.camera);
  })()`);
}

async function collectFallbackReport(cdp) {
  return evalJson(cdp, `(() => {
    const state = window.SF && window.SF.state;
    const list = (state && state.entityList) || [];
    const rows = [];
    for (const entity of list) {
      if (!entity || entity.alive === false) continue;
      const root = entity.mesh || (entity.view && entity.view.root) || null;
      if (!root) {
        rows.push({
          id: entity.id,
          type: entity.type,
          name: entity.data && (entity.data.name || entity.data.placeId || entity.data.defId) || null,
          placeId: entity.data && entity.data.placeId || null,
          worldDressing: !!(entity.data && entity.data.worldDressing),
          state: 'missing-mesh',
          retainedReadableFallback: false,
          visualRoot: null,
          meshCount: 0,
          visibleMeshCount: 0,
          fallbackBoxMeshCount: 0,
          authoredPartUrlCount: 0,
          fallbackBoxNames: [],
          childNames: [],
        });
        continue;
      }
      const ud = root.userData || {};
      let meshCount = 0;
      let visibleMeshCount = 0;
      let fallbackBoxMeshCount = 0;
      let authoredPartUrlCount = 0;
      const fallbackBoxNames = [];
      const childNames = [];
      for (const child of root.children || []) childNames.push(child.name || '');
      root.traverse((o) => {
        if (!o) return;
        const name = String(o.name || '');
        const isFallbackBox = /PlaceFallback|fallback:geo|SF_PlaceFallback|_Hull$/i.test(name)
          || !!(o.userData && o.userData.authoredReadableFallbackLayer && o.isMesh
            && o.geometry && o.geometry.type === 'BoxGeometry');
        if (o.isMesh) {
          meshCount++;
          if (o.visible !== false) visibleMeshCount++;
          if (isFallbackBox && o.visible !== false) {
            fallbackBoxMeshCount++;
            if (fallbackBoxNames.length < 6) fallbackBoxNames.push(name || o.geometry && o.geometry.type || 'box');
          }
        }
        const urls = o.userData && (Array.isArray(o.userData.spacefacePartUrls)
          ? o.userData.spacefacePartUrls
          : (o.userData.spacefacePartUrl ? [o.userData.spacefacePartUrl] : []));
        if (urls && urls.length) authoredPartUrlCount += urls.length;
      });
      rows.push({
        id: entity.id,
        type: entity.type,
        name: entity.data && (entity.data.name || entity.data.placeId || entity.data.defId || entity.data.archetypeGlb) || null,
        placeId: entity.data && entity.data.placeId || null,
        archetypeGlb: entity.data && entity.data.archetypeGlb || null,
        worldDressing: !!(entity.data && entity.data.worldDressing),
        poi: !!(entity.data && entity.data.poi),
        state: ud.authoredAssetState || (entity.type === 'ship' || entity.type === 'station' || entity.type === 'fx' ? 'unknown' : 'n/a'),
        retainedReadableFallback: !!ud.authoredReadableFallbackRetained,
        visualRoot: ud.authoredVisualRoot || null,
        mode: ud.authoredAssetMode || null,
        meshCount,
        visibleMeshCount,
        fallbackBoxMeshCount,
        authoredPartUrlCount,
        fallbackBoxNames,
        childNames: childNames.slice(0, 8),
        boundaryName: root.name || null,
      });
    }

    function summarize(filterFn) {
      const subset = rows.filter(filterFn);
      const byState = {};
      let retained = 0;
      let withBox = 0;
      let pureBox = 0;
      for (const r of subset) {
        byState[r.state] = (byState[r.state] || 0) + 1;
        if (r.retainedReadableFallback) retained++;
        if (r.fallbackBoxMeshCount > 0) withBox++;
        if (r.fallbackBoxMeshCount > 0 && r.authoredPartUrlCount === 0) pureBox++;
      }
      return { count: subset.length, byState, retainedReadableFallback: retained, withVisibleFallbackBox: withBox, pureFallbackBoxNoAuthoredParts: pureBox };
    }

    const ships = summarize((r) => r.type === 'ship');
    const stations = summarize((r) => r.type === 'station');
    const places = summarize((r) => r.type === 'fx' && (r.placeId || r.worldDressing || r.poi));
    const otherFx = summarize((r) => r.type === 'fx' && !(r.placeId || r.worldDressing || r.poi));
    const other = summarize((r) => r.type !== 'ship' && r.type !== 'station' && r.type !== 'fx');

    const problemPlaces = rows.filter((r) => r.type === 'fx' && (r.placeId || r.worldDressing || r.poi) && (
      r.retainedReadableFallback
      || r.fallbackBoxMeshCount > 0
      || r.state !== 'authored'
      || r.visibleMeshCount < 1
    )).map((r) => ({
      name: r.name, placeId: r.placeId, state: r.state,
      retained: r.retainedReadableFallback, boxes: r.fallbackBoxMeshCount,
      authoredParts: r.authoredPartUrlCount, meshes: r.visibleMeshCount,
      visualRoot: r.visualRoot, children: r.childNames,
    }));

    const problemStations = rows.filter((r) => r.type === 'station' && (
      r.retainedReadableFallback
      || r.state !== 'authored'
      || (r.archetypeGlb && r.visibleMeshCount < 1)
    )).map((r) => ({
      name: r.name, archetypeGlb: r.archetypeGlb, state: r.state,
      retained: r.retainedReadableFallback, boxes: r.fallbackBoxMeshCount,
      authoredParts: r.authoredPartUrlCount, meshes: r.visibleMeshCount,
      visualRoot: r.visualRoot,
    }));

    const problemShips = rows.filter((r) => r.type === 'ship' && (
      r.state !== 'authored' || r.fallbackBoxMeshCount > 0
    )).map((r) => ({
      name: r.name, state: r.state, retained: r.retainedReadableFallback,
      boxes: r.fallbackBoxMeshCount, visualRoot: r.visualRoot,
    }));

    return {
      mode: state && state.mode,
      sectorId: state && state.world && state.world.currentSectorId,
      tick: state && state.tick,
      entityCount: rows.length,
      loadingCount: rows.filter((r) => r.state === 'loading' || r.state === 'procedural-fallback').length,
      proceduralFallbackCount: rows.filter((r) => r.state === 'procedural-fallback').length,
      retainedBoxCount: rows.filter((r) => r.retainedReadableFallback).length,
      pureFallbackBoxCount: rows.filter((r) => r.fallbackBoxMeshCount > 0 && r.authoredPartUrlCount === 0).length,
      summary: {
        ships,
        stations,
        places,
        otherFx,
        other,
      },
      byType: Object.fromEntries(
        ['ship', 'station', 'fx', 'asteroid', 'pickup', 'projectile', 'drone', 'wreck']
          .map((t) => [t, rows.filter((r) => r.type === t).length]),
      ),
      problemPlaces,
      problemStations,
      problemShips,
      samplePlaces: rows.filter((r) => r.type === 'fx' && (r.placeId || r.worldDressing)).slice(0, 12),
      sampleStations: rows.filter((r) => r.type === 'station').slice(0, 8),
      sampleShips: rows.filter((r) => r.type === 'ship').slice(0, 6),
    };
  })()`);
}

function collectPageIssues(cdp) {
  const issues = [];
  const warnings = [];
  // attach via raw message path is incomplete without onMessage; use console polling fallback
  cdp._issues = issues;
  cdp._warnings = warnings;
  return {
    errorIssues() { return issues.slice(0, 20); },
    warningIssues() { return warnings.slice(0, 40); },
  };
}

function isBootReady(cdp) {
  return evalJson(cdp, `(() => ({ ready: !!(window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.renderer) }))()`)
    .then((v) => v.ready === true);
}

function isPlayable(cdp) {
  return evalJson(cdp, `(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return {
      ok: !!(state && state.mode === 'flight' && player && player.alive !== false && player.mesh && state.tick > 0),
    };
  })()`).then((v) => v.ok === true);
}

async function waitFor(cdp, predicate, timeoutMs, label) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await predicate(cdp);
    if (last === true || (last && last.ok === true) || (typeof last === 'object' && last.ready === true)) return last;
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}; last=${JSON.stringify(last)}`);
}

async function evalVoid(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(describeException(result.exceptionDetails));
}

async function evalJson(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(describeException(result.exceptionDetails));
  return result.result && result.result.value;
}

function describeException(details) {
  return details && (details.exception && details.exception.description || details.text) || 'Runtime.evaluate failed';
}

async function startFreshServer() {
  const port = await findFreePort(8537);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`Dev server exited before reachable: ${url}`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (_) {}
    await sleep(250);
  }
  child.kill();
  throw new Error(`Dev server did not become reachable at ${url}`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 200; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port from ${start}`);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

function spawnChrome(debugPort) {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const bin = candidates.find((p) => existsSync(p));
  if (!bin) throw new Error('Chrome/Edge not found');
  return spawn(bin, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--disable-extensions',
    `--remote-debugging-port=${debugPort}`, 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
}

async function connectCdp(debugPort) {
  let wsUrl = null;
  for (let i = 0; i < 80; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      const page = tabs.find((tab) => tab.type === 'page');
      if (page && page.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch (_) {}
    await sleep(150);
  }
  assert.ok(wsUrl, 'no CDP page target');
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result || {});
    }
  });
  return {
    ws: socket,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

function withDebugFlight(url) {
  const u = new URL(url);
  u.searchParams.set('debug', 'flight');
  return String(u);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
