// Live-gameplay capture driver: loads the REAL game at /, lets the sim populate the world for a few
// seconds, samples window.__THREE_GAME_DIAGNOSTICS__ for the §18 Gate 6 p95 frame-time, and captures a
// gameplay screenshot of the live scene (the full game world — sector, ships, asteroids, HUD) for §16.4.
//
// Uses Chrome's REAL GPU (no --use-gl=swiftshader) so frame-times are representative of a hardware WebGL
// stack, not software rendering. Hard watchdog kill so a hung GPU/loop can never wedge the parent shell.
//
// Run: node scripts/capture-gameplay.mjs [port]
import { spawn } from 'node:child_process';
import { existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.argv[2] || process.env.PORT || 8123);
const REPORT = '.devshots/gameplay_diagnostics.json';
const SHOT = 'gameplay_flight.jpg';
const SHOT_PATH = `.devshots/${SHOT}`;
const SETTLE_MS = 11000;      // new-game boot + sector spawn + diagnostics ~3s ring accumulation
const HARD_KILL_MS = 30000;

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
console.log(`[gameplay] launching ${chrome.split('/').pop()} (real GPU) -> http://localhost:${PORT}/`);
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
  // gameplay) by emitting game:new on the bus. Then let the sector populate + diagnostics accumulate.
  console.log('[gameplay] starting a new game via window.SF.bus.emit("game:new")...');
  for (let i = 0; i < 40; i++) {
    const has = await send('Runtime.evaluate', { expression: '!!(window.SF && window.SF.bus && window.SF.bus.emit)', returnByValue: true });
    if (has.result.value) break;
    await sleep(250);
  }
  await send('Runtime.evaluate', { expression: 'window.SF.bus.emit("game:new", {})' });
  console.log(`[gameplay] waiting ${SETTLE_MS}ms for the game world to populate...`);
  await sleep(SETTLE_MS);

  // Read the diagnostics report.
  const diagRes = await send('Runtime.evaluate', { expression: 'JSON.stringify((window.__THREE_GAME_DIAGNOSTICS__&&window.__THREE_GAME_DIAGNOSTICS__.getReport)?window.__THREE_GAME_DIAGNOSTICS__.getReport():{error:"no diagnostics handle"})', returnByValue: true });
  const report = JSON.parse(diagRes.result.value);

  // §16.4 scene set: capture a short sequence as the live world evolves (more entities spawn, combat/
  // mining occur over time). Each shot is a candidate scene; the runbook records which §16.4 type each
  // best represents. Captured at ~3s intervals so the world changes between frames.
  const SCENES = ['gameplay_flight', 'gameplay_t2', 'gameplay_t3', 'gameplay_t4'];
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
try { mkdirSync(dirname(REPORT), { recursive: true }); } catch (_) {}
writeFileSync(REPORT, JSON.stringify(result.report, null, 2));
writeFileSync(SHOT_PATH, Buffer.from(result.b64, 'base64'));

const ft = result.report.frameMs || {};
console.log('[gameplay] §18 Gate 6 diagnostics:');
console.log(`  frame ms — last:${ft.last && ft.last.toFixed(2)} avg:${ft.avg && ft.avg.toFixed(2)} min:${ft.min && ft.min.toFixed(2)} max:${ft.max && ft.max.toFixed(2)} p95:${ft.p95 && ft.p95.toFixed(2)}`);
console.log(`  render — calls:${result.report.render && result.report.render.calls} tris:${result.report.render && result.report.render.triangles}`);
console.log(`  memory — geo:${result.report.memory && result.report.memory.geometries} tex:${result.report.memory && result.report.memory.textures} prog:${result.report.memory && result.report.memory.programs}`);
const okShot = existsSync(SHOT_PATH) && statSync(SHOT_PATH).size > 2000;
console.log(`[gameplay] §16.4 screenshot: ${SHOT} ${okShot ? 'OK (' + (statSync(SHOT_PATH).size / 1024).toFixed(1) + ' KB)' : 'MISSING'}`);

// §12.1 verdict.
const p95 = ft.p95 || 999;
const targetPass = p95 <= 16.7;
const floorPass = p95 <= 33.3;
console.log(`[gameplay] §12.1 verdict — target(<=16.7ms/60fps):${targetPass ? 'PASS' : 'FAIL'} floor(<=33.3ms/30fps):${floorPass ? 'PASS' : 'FAIL'}`);
process.exit(okShot ? 0 : 1);
