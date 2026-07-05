#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = resolve('C:/Users/93rob/AppData/Local/Temp/grok-goal-8330956f5882/implementer');
const LOG = resolve(SCRATCH, 'station-archetype-live-probe.log');
const AUTHORING_PATH = resolve(ROOT, 'assets/ships/parts/blender/authoring.json');
const PLAYABLE_TIMEOUT_MS = 90000;

const authoring = existsSync(AUTHORING_PATH)
  ? JSON.parse(readFileSync(AUTHORING_PATH, 'utf8'))
  : { entries: {} };
const ARCHETYPE_METHOD = Object.fromEntries(
  Object.entries(authoring.entries || {}).map(([k, v]) => [k, v.method]),
);

let server = null;
let chrome = null;
let ws = null;

try {
  server = await startFreshServer();
  const debugPort = await findFreePort(9812);
  chrome = spawnChrome(debugPort);
  const cdp = await connectCdp(debugPort);
  ws = cdp.ws;

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}",
  });

  await cdp.send('Page.navigate', { url: withDebugFlight(server.baseUrl) });
  await waitFor(cdp, isBootReady, 15000, 'SpaceFace debug runtime');

  await evalVoid(cdp, `(() => {
    window.SF.bus.emit('game:new', { name: 'Station Archetype Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  })()`);
  await waitFor(cdp, isPlayable, PLAYABLE_TIMEOUT_MS, 'seeded flight session');

  const helios = await waitForStationArchetypes(cdp, 'sector_helios_prime');
  await evalVoid(cdp, `(() => {
    const world = window.SF && window.SF.registry && window.SF.registry.get('world');
    if (world && typeof world.enterSector === 'function') world.enterSector('sector_pallas_drift');
  })()`);
  await waitFor(cdp, isPlayable, PLAYABLE_TIMEOUT_MS, 'Pallas flight session');
  const pallas = await waitForStationArchetypes(cdp, 'sector_pallas_drift');
  const report = { helios, pallas };
  writeFileSync(LOG, JSON.stringify(report, null, 2));

  for (const [label, sectorReport] of Object.entries(report)) {
    assert.equal(sectorReport.mode, 'flight', `${label} mode`);
    assert.ok(sectorReport.archetypedCount >= 1, `${label}: archetyped stations`);
    assert.deepEqual(sectorReport.missingArchetype, [], `${label}: all stations carry archetypeGlb`);
    assert.ok(sectorReport.authoredCount >= 1, `${label}: GLB upgrade`);
  }
  assert.ok(helios.blenderMcpAuthored >= 1, 'Helios blender_mcp stations');
  const smuggler = pallas.stations.find((s) => s.archetypeGlb === 'place_station_blackmarket');
  assert.ok(smuggler, 'Pallas must spawn Smuggler Den blackmarket station');
  assert.equal(smuggler.state, 'authored', 'blackmarket station must load authored GLB');
  assert.ok(smuggler.authoringMethod === 'blender_mcp' || smuggler.authoringMethod === 'procedural_fallback',
    `blackmarket method=${smuggler.authoringMethod}`);

  console.log('Station archetype live probe PASS');
  console.log(JSON.stringify({
    helios: { stationCount: helios.stationCount, blenderMcpAuthored: helios.blenderMcpAuthored, distinctArchetypes: helios.distinctArchetypes },
    pallas: { stationCount: pallas.stationCount, blackmarket: smuggler, blenderMcpAuthored: pallas.blenderMcpAuthored, proceduralAuthored: pallas.proceduralAuthored },
    log: LOG,
  }, null, 2));
} finally {
  try { if (ws) ws.close(); } catch (_) {}
  try { if (chrome) chrome.kill(); } catch (_) {}
  try { if (server && server.kill) server.kill(); } catch (_) {}
}

async function waitForStationArchetypes(cdp, expectedSectorId = null) {
  let last = null;
  const started = Date.now();
  while (Date.now() - started < 45000) {
    await forceStationRender(cdp);
    last = await collectStationReport(cdp);
    const sectorOk = !expectedSectorId || last.sectorId === expectedSectorId;
    const minStations = expectedSectorId === 'sector_pallas_drift' ? 1 : 2;
    if (sectorOk && last.archetypedCount >= minStations && last.authoredCount >= 1) return last;
    await sleep(300);
  }
  throw new Error(`timeout waiting for station archetype GLB upgrade (sector=${expectedSectorId}); last=${JSON.stringify(last, null, 2)}`);
}

async function forceStationRender(cdp) {
  await evalVoid(cdp, `(async () => {
    const state = window.SF && window.SF.state;
    const render = state && state.render;
    if (!render || !render.scene || !render.renderer || !render.camera) return;
    for (const entity of state.entityList || []) {
      if (!entity || entity.type !== 'station' || !entity.mesh) continue;
      entity.mesh.traverse((o) => { if (o) o.frustumCulled = false; });
      const req = entity.mesh.userData && entity.mesh.userData.requestAuthoredUpgrade;
      if (typeof req === 'function') req(render.renderer, render.scene);
    }
    render.renderer.render(render.scene, render.camera);
  })()`);
}

async function collectStationReport(cdp) {
  const methodJson = JSON.stringify(ARCHETYPE_METHOD);
  return evalJson(cdp, `(async () => {
    const methods = ${methodJson};
    const state = window.SF && window.SF.state;
    const stations = (state && state.entityList || []).filter((e) => e && e.type === 'station' && e.alive !== false);
    const rows = stations.map((entity) => {
      const root = entity.mesh || (entity.view && entity.view.root);
      const ud = root && root.userData || {};
      let meshCount = 0;
      let partUrl = null;
      if (root) root.traverse((o) => {
        if (o && o.isMesh) meshCount++;
        const urls = o && o.userData && (o.userData.spacefacePartUrls || (o.userData.spacefacePartUrl ? [o.userData.spacefacePartUrl] : []));
        if (urls && urls.length) partUrl = urls[0];
      });
      const archetypeGlb = entity.data && entity.data.archetypeGlb;
      return {
        id: entity.id,
        name: entity.data && entity.data.name,
        archetypeGlb,
        authoringMethod: archetypeGlb ? (methods[archetypeGlb] || 'unknown') : null,
        isGate: !!(entity.data && entity.data.isGate),
        state: ud.authoredAssetState || 'unknown',
        meshCount,
        partUrl,
        boundaryName: root && root.name,
      };
    });
    const archetypes = new Set(rows.map((r) => r.archetypeGlb).filter(Boolean));
    return {
      mode: state && state.mode,
      sectorId: state && state.world && state.world.currentSectorId,
      stationCount: rows.length,
      archetypedCount: rows.filter((r) => r.archetypeGlb).length,
      authoredCount: rows.filter((r) => r.state === 'authored').length,
      blenderMcpAuthored: rows.filter((r) => r.state === 'authored' && r.authoringMethod === 'blender_mcp').length,
      proceduralAuthored: rows.filter((r) => r.state === 'authored' && r.authoringMethod === 'procedural_fallback').length,
      distinctArchetypes: archetypes.size,
      missingArchetype: rows.filter((r) => !r.archetypeGlb).map((r) => r.name),
      stations: rows,
    };
  })()`);
}

function isBootReady(cdp) {
  return evalJson(cdp, `(() => ({ ready: !!(window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.renderer) }))()`)
    .then((v) => v.ready === true);
}

function isPlayable(cdp) {
  return evalJson(cdp, `(() => ({ ok: window.SF && window.SF.state && window.SF.state.mode === 'flight' && window.SF.state.tick > 0 }))()`)
    .then((v) => v.ok === true);
}

async function waitFor(cdp, pred, timeoutMs, label) {
  let last = null;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    last = await pred(cdp);
    if (last === true || (last && last.ready !== false && last.ok !== false)) return last;
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${label}; last=${JSON.stringify(last)}`);
}

async function evalVoid(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(describeException(result.exceptionDetails));
}

async function evalJson(cdp, expression) {
  const wrapped = `Promise.resolve(${expression}).then((value) => JSON.stringify(value))`;
  const result = await cdp.send('Runtime.evaluate', {
    expression: wrapped, returnByValue: true, awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(describeException(result.exceptionDetails));
  return JSON.parse(result.result && result.result.value || '{}');
}

function describeException(details) {
  return details && (details.exception && details.exception.description || details.text) || 'Runtime.evaluate failed';
}

async function startFreshServer() {
  const port = await findFreePort(8527);
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