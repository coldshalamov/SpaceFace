// Live-gameplay capture driver: loads the REAL game at /, lets the sim populate the world for a few
// seconds, samples window.__THREE_GAME_DIAGNOSTICS__ for the §18 Gate 6 p95 frame-time, and captures a
// gameplay screenshot of the live scene (the full game world — sector, ships, asteroids, HUD) for §16.4.
//
// Uses Chrome's REAL GPU (no --use-gl=swiftshader) so frame-times are representative of a hardware WebGL
// stack, not software rendering. Hard watchdog kill so a hung GPU/loop can never wedge the parent shell.
//
// Run: node scripts/capture-gameplay.mjs [port]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

const argv = parseArgs(process.argv.slice(2));
const PORT = Number(argv._[0] || process.env.PORT || 8123);
const SCENARIO = argv.scenario || 'idle';
const SEED = Number(argv.seed || 12345) >>> 0;
const WARMUP_MS = Number(argv.warmup || 5000);
const DURATION_MS = Number(argv.duration || 15000);
const TARGET_MS = Number(argv.targetMs || 16.7);
const FLOOR_MS = Number(argv.floorMs || 33.3);
const STRICT = !!argv.strict;
const OUT = argv.out || `.devshots/perf/${SCENARIO}.json`;
const SHOT = argv.shot || `${SCENARIO}.jpg`;
const SHOT_PATH = argv.shotPath || `.devshots/perf/${SHOT}`;
const VIDEO_OVERRIDES = collectVideoOverrides(argv);
const HARD_KILL_MS = Number(argv.hardKillMs || Math.max(45000, WARMUP_MS + DURATION_MS + 25000));

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('No Chrome/Edge found.'); process.exit(2); }

// A tiny injected page that drives the capture: wait for the game handle, sample diagnostics over time,
// POST the report + a screenshot, then close. Injected via a bookmark-style data URL so we don't modify
// the game. We navigate the main frame to the game, and use --remote-debugging to inject — simpler: use
// Chrome's --screenshot + --virtual-time-budget, but those don't read JS state. Instead, we run an
// injector page in an iframe that posts messages. Simplest robust path: a data: page that opens the game
// and polls its own window — but cross-origin framing blocks that. So: load the game directly and use
// Chrome's --remote-debugging-port + a CDP probe. To keep this dependency-free, we instead rely on the
// game's OWN dev-shot sink by appending a query flag the game already understands (?dev=). The game has
// no gameplay-auto-capture mode, so we add a NEW minimal one here via a user-data-dir startup script.

// Pragmatic approach: launch Chrome with remote debugging, drive it over CDP with raw WebSocket from
// Node. That's the clean way to (a) eval JS in the page and (b) capture a screenshot — without a
// browser-test dependency.
const dbgPort = 9333;
const args = [
  '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--window-size=1280,800', '--hide-scrollbars',
  // REAL GPU — deliberately NOT passing swiftshader flags so frame-times reflect hardware WebGL.
  '--ignore-gpu-blocklist', '--enable-webgl',
  `--remote-debugging-port=${dbgPort}`,
  `http://localhost:${PORT}/`,
];
console.log(`[gameplay] launching ${chrome.split('/').pop()} (real GPU) -> http://localhost:${PORT}/ scenario=${SCENARIO} seed=${SEED}`);
const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d.toString(); });

const watchdog = setTimeout(() => {
  console.error(`[gameplay] hard-killing chrome after ${HARD_KILL_MS}ms`);
  try { child.kill('SIGKILL'); } catch (_) {}
}, HARD_KILL_MS);

// Drive Chrome over the DevTools Protocol (CDP): discover the page target, eval JS in it, and capture a
// screenshot — dependency-free (Node 22+ has a global WebSocket, and fetch is built in).
async function cdpCapture() {
  // Discover the page target.
  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://localhost:${dbgPort}/json`);
      const tabs = await r.json();
      const page = tabs.find((t) => t.type === 'page');
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch (_) {}
    await sleep(300);
  }
  if (!wsUrl) throw new Error('no CDP page target');
  // Node has no built-in WebSocket until v22+; v24 has global WebSocket. Use it.
  const WS = globalThis.WebSocket;
  if (!WS) throw new Error('no global WebSocket (need Node 22+)');
  const ws = new WS(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.id && pending.has(msg.id)) { const { resolve } = pending.get(msg.id); pending.delete(msg.id); resolve(msg.result); }
  });
  const send = (method, params = {}) => new Promise((resolve) => { id++; pending.set(id, { resolve }); ws.send(JSON.stringify({ id, method, params })); });

  // Wait for the game handle to exist, then START A NEW GAME (the title screen otherwise blocks
  // gameplay) by emitting game:new on the bus. Then apply the requested deterministic scenario.
  console.log('[gameplay] starting a fixed-seed new game via window.SF.bus.emit("game:new")...');
  for (let i = 0; i < 40; i++) {
    const has = await send('Runtime.evaluate', { expression: '!!(window.SF && window.SF.bus && window.SF.bus.emit)', returnByValue: true });
    if (has.result.value) break;
    await sleep(250);
  }
  await send('Runtime.evaluate', { expression: `window.SF.bus.emit("game:new", { seed: ${SEED} }); window.SF.bus.emit("ui:closeAll", {});` });
  const flightStarted = await waitForFlight(send);
  if (!flightStarted) throw new Error('game:new did not reach flight mode');
  if (Object.keys(VIDEO_OVERRIDES).length) {
    await send('Runtime.evaluate', { expression: `Object.assign(window.SF.state.settings.video, ${JSON.stringify(VIDEO_OVERRIDES)}); window.SF.bus.emit("settings:changed", { section: "video", key: null });` });
  }
  await send('Runtime.evaluate', { expression: scenarioExpression(SCENARIO), awaitPromise: false });
  console.log(`[gameplay] warmup ${WARMUP_MS}ms, capture ${DURATION_MS}ms...`);
  await sleep(WARMUP_MS);
  await send('Runtime.evaluate', {
    expression: `new Promise((resolve) => requestAnimationFrame(() => {
      if (window.__SPACEFACE_PERF__ && window.__SPACEFACE_PERF__.reset) window.__SPACEFACE_PERF__.reset();
      if (window.__THREE_GAME_DIAGNOSTICS__ && window.__THREE_GAME_DIAGNOSTICS__.reset) window.__THREE_GAME_DIAGNOSTICS__.reset();
      if (window.__SF_CAPTURE_SCENARIO__) window.__SF_CAPTURE_SCENARIO__.measuredAt = performance.now();
      resolve(true);
    }))`,
    awaitPromise: true,
  });

  const timeline = [];
  const started = Date.now();
  while (Date.now() - started < DURATION_MS) {
    timeline.push(await readRuntimeReport(send));
    await sleep(1000);
  }
  const report = await readRuntimeReport(send);
  report.timeline = timeline;

  // §16.4 scene set: capture a short sequence as the live world evolves (more entities spawn, combat/
  // mining occur over time). Each shot is a candidate scene; the runbook records which §16.4 type each
  // best represents. Captured at ~3s intervals so the world changes between frames.
  const SCENES = [`${SCENARIO}_flight`, `${SCENARIO}_t2`, `${SCENARIO}_t3`, `${SCENARIO}_t4`];
  const b64s = [];
  for (const name of SCENES) {
    const sr = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(`.devshots/${name}.jpg`, Buffer.from(sr.data, 'base64'));
    b64s.push(name);
    if (name !== SCENES[SCENES.length - 1]) await sleep(3000);
  }
  // Primary screenshot for the §16.4 "hero flight" scene (scene 1).
  const shotRes = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  const b64 = shotRes.data;

  ws.close();
  return { report, b64 };
}

let result = null;
try {
  result = await cdpCapture();
} catch (e) {
  console.error('[gameplay] CDP capture failed:', e.message);
}

clearTimeout(watchdog);
try { child.kill(); } catch (_) {}

if (!result) { console.error('[gameplay] FAILED'); process.exit(1); }

// Write the diagnostics report.
try { mkdirSync(dirname(OUT), { recursive: true }); } catch (_) {}
try { mkdirSync(dirname(SHOT_PATH), { recursive: true }); } catch (_) {}
const shotBuffer = Buffer.from(result.b64, 'base64');
const shotHash = createHash('sha256').update(shotBuffer).digest('hex');
const okShot = shotBuffer.length > 2000;
result.report.scenario = {
  name: SCENARIO,
  seed: SEED,
  port: PORT,
  warmupMs: WARMUP_MS,
  durationMs: DURATION_MS,
  videoOverrides: VIDEO_OVERRIDES,
  screenshot: SHOT_PATH,
  screenshotBytes: shotBuffer.length,
  screenshotSha256: shotHash,
};
const ft = result.report.frameMs || {};
const p95 = Number.isFinite(ft.p95) ? ft.p95 : 999;
const targetPass = p95 <= TARGET_MS;
const floorPass = p95 <= FLOOR_MS;
result.report.verdict = {
  okShot,
  targetMs: TARGET_MS,
  floorMs: FLOOR_MS,
  strict: STRICT,
  targetPass,
  floorPass,
  pass: okShot && (STRICT ? targetPass : floorPass),
};
writeFileSync(OUT, JSON.stringify(result.report, null, 2));
writeFileSync(SHOT_PATH, shotBuffer);

console.log('[gameplay] §18 Gate 6 diagnostics:');
console.log(`  frame ms — last:${ft.last && ft.last.toFixed(2)} avg:${ft.avg && ft.avg.toFixed(2)} min:${ft.min && ft.min.toFixed(2)} max:${ft.max && ft.max.toFixed(2)} p95:${ft.p95 && ft.p95.toFixed(2)}`);
console.log(`  render — calls:${result.report.render && result.report.render.calls} tris:${result.report.render && result.report.render.triangles}`);
console.log(`  memory — geo:${result.report.memory && result.report.memory.geometries} tex:${result.report.memory && result.report.memory.textures} prog:${result.report.memory && result.report.memory.programs}`);
console.log(`[gameplay] report: ${OUT}`);
console.log(`[gameplay] §16.4 screenshot: ${SHOT_PATH} ${okShot ? 'OK (' + (statSync(SHOT_PATH).size / 1024).toFixed(1) + ' KB sha256=' + shotHash.slice(0, 12) + ')' : 'MISSING'}`);

// §12.1 verdict.
console.log(`[gameplay] §12.1 verdict — target(<=${TARGET_MS}ms/60fps):${targetPass ? 'PASS' : 'FAIL'} floor(<=${FLOOR_MS}ms/30fps):${floorPass ? 'PASS' : 'FAIL'} mode:${STRICT ? 'strict-target' : 'floor'}`);
process.exit(result.report.verdict.pass ? 0 : 1);

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

function collectVideoOverrides(args) {
  const out = {};
  if (args.bloom != null) out.bloom = boolArg(args.bloom);
  if (args.shadows != null) out.shadows = boolArg(args.shadows);
  if (args.renderScale != null) out.renderScale = Number(args.renderScale);
  if (args.pixelRatioCap != null) out.pixelRatioCap = Number(args.pixelRatioCap);
  if (args.particleQuality != null) out.particleQuality = String(args.particleQuality);
  return out;
}

function boolArg(v) {
  if (v === true) return true;
  const s = String(v).toLowerCase();
  return !(s === '0' || s === 'false' || s === 'off' || s === 'no');
}

async function readRuntimeReport(send) {
  const expr = `JSON.stringify((() => {
    const diag = (window.__THREE_GAME_DIAGNOSTICS__ && window.__THREE_GAME_DIAGNOSTICS__.getReport)
      ? window.__THREE_GAME_DIAGNOSTICS__.getReport()
      : { error: "no diagnostics handle" };
    const sf = window.SF || {};
    const state = sf.state || {};
    const canvas = document.getElementById('gl-canvas');
    let gpu = null;
    try {
      const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
      const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
      gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null;
    } catch (_) {}
    diag.capture = {
      userAgent: navigator.userAgent,
      viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
      gpu,
      mode: state.mode,
      seed: state.meta && state.meta.seed,
      simTime: state.simTime,
      tick: state.tick,
      entityListLength: state.entityList ? state.entityList.length : 0,
      screenStack: state.ui && state.ui.screenStack ? state.ui.screenStack.slice() : [],
      settings: state.settings || null
    };
    return diag;
  })())`;
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return JSON.parse(res.result.value);
}

async function waitForFlight(send) {
  const expr = `new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      const sf = window.SF || {};
      const state = sf.state || {};
      if (state.mode === 'flight' && state.playerId && state.entities && state.entities.get(state.playerId)) {
        const close = () => {
          try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
          const splash = document.getElementById('cinematic-splash');
          if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
          const tutorialIntro = document.querySelector('.sf-ob-intro');
          if (tutorialIntro && tutorialIntro.parentNode) tutorialIntro.parentNode.removeChild(tutorialIntro);
          if (sf.bus && sf.bus.emit) sf.bus.emit('ui:closeAll', {});
          if (state.ui && state.ui.screenStack) state.ui.screenStack.length = 0;
        };
        close();
        setTimeout(() => { close(); resolve(true); }, 150);
        return;
      }
      if (performance.now() - start > 5000) {
        resolve(false);
        return;
      }
      setTimeout(check, 50);
    };
    check();
  })`;
  const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return !!(res && res.result && res.result.value);
}

function scenarioExpression(name) {
  const combatSpecs = JSON.stringify(buildCombatVfxSpecs());
  return `(() => {
    const sf = window.SF;
    if (!sf || !sf.state || !sf.helpers) return;
    const state = sf.state;
    const helpers = sf.helpers;
    const player = () => state.entities && state.entities.get(state.playerId);
    window.__SF_CAPTURE_SCENARIO__ = { name: ${JSON.stringify(name)}, startedAt: performance.now() };
    const p = player();
    if (!p) return;
    const spawnRock = (x, z, r = 18) => helpers.spawnEntity({
      type: 'asteroid', pos: { x, z }, radius: r, mass: 500, hull: 240, hullMax: 240,
      data: { typeId: 'ast_rock', oreHP: 240, oreHPMax: 240 }
    });
    const spawnPickup = (x, z) => helpers.spawnEntity({
      type: 'pickup', pos: { x, z }, radius: 8, mass: 1, hull: 1, hullMax: 1, ttl: 120,
      data: { itemId: 'ore_common', qty: 1 }
    });
    if (${JSON.stringify(name)} === 'boost') {
      window.__SF_CAPTURE_SCENARIO__.tick = setInterval(() => {
        state.input.moveZ = 1;
        state.input.boost = true;
      }, 16);
    } else if (${JSON.stringify(name)} === 'dense') {
      for (let i = 0; i < 180; i++) {
        const a = i * 2.399963;
        const r = 260 + (i % 18) * 42;
        spawnRock(p.pos.x + Math.cos(a) * r, p.pos.z + Math.sin(a) * r, 10 + (i % 6) * 4);
      }
    } else if (${JSON.stringify(name)} === 'combat-vfx') {
      const combatSpecs = ${combatSpecs};
      for (let i = 0; i < 24; i++) {
        const entry = combatSpecs[i % combatSpecs.length];
        const spec = entry.spec;
        spec.pos = { x: p.pos.x + entry.offset.x, z: p.pos.z + entry.offset.z };
        helpers.spawnEntity(spec);
      }
      window.__SF_CAPTURE_SCENARIO__.tick = setInterval(() => {
        state.input.fire = true;
        state.input.autoFire = true;
        sf.bus.emit('combat:damage', { targetId: state.playerId, amount: 1, pos: { x: p.pos.x + 40, z: p.pos.z } });
      }, 120);
    } else if (${JSON.stringify(name)} === 'spawn-churn') {
      let n = 0;
      window.__SF_CAPTURE_SCENARIO__.tick = setInterval(() => {
        const e = spawnRock(p.pos.x + 300 + (n % 16) * 12, p.pos.z + 240 + (n % 8) * 18, 12);
        e.ttl = 1.2;
        n++;
      }, 80);
    } else if (${JSON.stringify(name)} === 'ui-overlay') {
      sf.bus.emit('ui:pushScreen', { id: 'starmap' });
      for (let i = 0; i < 80; i++) spawnPickup(p.pos.x + i * 4, p.pos.z + 180 + (i % 8) * 12);
    } else {
      state.input.moveZ = 0;
      state.input.boost = false;
    }
  })()`;
}

function buildCombatVfxSpecs() {
  const out = [];
  const types = ['reaver_pirate', 'wasp_swarmer', 'corsair_raider'];
  for (let i = 0; i < 24; i++) {
    const a = i * 0.618;
    const r = 120 + (i % 6) * 22;
    out.push({
      offset: { x: Math.cos(a) * r, z: Math.sin(a) * r },
      spec: makeEnemySpawnSpec(types[i % types.length], 4 + (i % 3), { x: 0, z: 0 }),
    });
  }
  return out;
}
