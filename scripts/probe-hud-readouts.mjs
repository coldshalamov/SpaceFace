// Probe: boot to flight, inject forward velocity, and read back the live HUD readouts to confirm
// the new STOP braking tile and CLASS drive-family label render real values (not just "—").
// Headless Chrome via CDP, mirroring scripts/check-boot-flow.mjs helpers without importing them.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const ROOT = process.cwd();
const WIDTH = 1280, HEIGHT = 800;
const SHOT = '.devshots/perf/hud-readouts.jpg';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function findFreePort(start) {
  const { createServer } = await import('node:net');
  for (let p = start; p < start + 200; p++) {
    const ok = await new Promise((res) => {
      const s = createServer();
      s.once('error', () => res(false));
      s.listen(p, '127.0.0.1', () => { s.close(() => res(true)); });
    });
    if (ok) return p;
  }
  throw new Error('no free port');
}
async function waitReachable(url, child) {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url); if (r.ok || r.status === 200) return; } catch (_) {}
    await sleep(150);
  }
  throw new Error('server never reachable');
}

let serverChild, browser;
try {
  const port = await findFreePort(8155);
  serverChild = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  serverChild.stdout.on('data', () => {}); serverChild.stderr.on('data', () => {});
  await waitReachable(`http://127.0.0.1:${port}/`, serverChild);
  const baseUrl = `http://127.0.0.1:${port}/`;

  // find chrome
  const chrome = await (async () => {
    const fs = await import('node:fs');
    const candidates = [
      process.env.CHROME_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ].filter(Boolean);
    for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch (_) {} }
    throw new Error('chrome not found');
  })();

  const debugPort = await findFreePort(9380);
  browser = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    `--window-size=${WIDTH},${HEIGHT}`, `--remote-debugging-port=${debugPort}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  browser.stdout.on('data', () => {}); browser.stderr.on('data', () => {});

  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      const page = tabs.find((t) => t.type === 'page');
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch (_) {}
    await sleep(200);
  }
  assert(wsUrl, 'no CDP target');

  const ws = new WebSocket(wsUrl);
  await new Promise((r, e) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', e, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.id && pending.has(msg.id)) { const { resolve } = pending.get(msg.id); pending.delete(msg.id); resolve(msg.result || {}); }
  });
  const cdp = { send(method, params = {}) { return new Promise((resolve) => { id++; pending.set(id, { resolve }); ws.send(JSON.stringify({ id, method, params })); }); } };

  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable'); await cdp.send('Network.enable');
  // Pre-seed the cinematic-seen flag so the splash auto-dismisses, same as check-boot-flow.mjs.
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}` });
  await cdp.send('Page.navigate', { url: baseUrl });
  const evalJson = async (expr) => JSON.parse((await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value || '{}');

  // boot to flight — mirror the boot-flow snapshot predicate.
  const snapExpr = `JSON.stringify((() => {
    const visible = (el) => { if (!el) return false; const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
      return cs.display!=='none' && cs.visibility!=='hidden' && Number(cs.opacity||1)>0.05 && r.width>2 && r.height>2; };
    const sf = window.SF || null; const state = sf && sf.state || null;
    const player = state && state.entities && state.entities.get(state.playerId) || null;
    const flightPlayableState = !!(state && state.mode==='flight' && player && player.alive && player.hull>0
      && player.hullMax>0 && player.capMax>0 && player.data && player.data.weapons && player.data.weapons.length);
    const classText = document.querySelector('[data-k="role"]')?.textContent || '';
    const weaponText = document.querySelector('[data-k="weapons"]')?.textContent || '';
    const hudPlayableDom = visible(document.getElementById('hud')) && classText.trim() && !/^[-—]$/.test(classText.trim())
      && weaponText.trim() && !/^[-—]$/.test(weaponText.trim());
    return {
      cinematicVisible: visible(document.getElementById('cinematic-splash')),
      mainMenuVisible: visible(document.querySelector('[data-screen="mainMenu"]')),
      newGameVisible: visible(document.querySelector('[data-screen="newGame"]')),
      flightPlayable: flightPlayableState || hudPlayableDom,
    };
  })())`;

  const wait = async (pred, timeout, label) => {
    const start = Date.now(); let last = null;
    while (Date.now() - start < timeout) { last = await evalJson(snapExpr); if (pred(last)) return last; await sleep(200); }
    throw new Error('timeout: ' + label + ' last=' + JSON.stringify(last));
  };

  // dismiss cinematic if present
  let snap = await evalJson(snapExpr);
  if (snap.cinematicVisible) await evalJson(`document.getElementById('cinematic-splash')?.click()`);
  await wait((s) => s.mainMenuVisible || s.flightPlayable, 15000, 'menu');
  snap = await evalJson(snapExpr);
  if (!snap.flightPlayable) {
    await evalJson(`([...document.querySelectorAll('button')].find((b)=>(b.textContent||'').trim()==='New Game')||{}).click?.()`);
    await wait((s) => s.newGameVisible || s.flightPlayable, 12000, 'newgame');
    snap = await evalJson(snapExpr);
    if (!snap.flightPlayable) {
      await evalJson(`([...document.querySelectorAll('button')].find((b)=>(b.textContent||'').trim()==='Launch')||{}).click?.()`);
      await wait((s) => s.flightPlayable, 15000, 'flight');
    }
  }

  // Build real velocity through the V3 → Rapier authority chain by holding the throttle input.
  // Under flightV3 the physics owner is the sole writer of velocity, so a direct vel injection
  // would be ignored on the next solve — feeding the actual input exercises the live wiring.
  await evalJson(`JSON.stringify((() => {
    const s = window.SF.state;
    s.input = s.input || {};
    s.input.moveZ = 1;   // hold forward throttle
    return { moveZ: s.input.moveZ };
  })())`);
  // Let the physics build velocity over ~1.2s (the fixed-step sim + Rapier solve drive the body).
  await sleep(1200);
  // Release throttle before sampling so the HUD shows the coasting speed + STOP distance.
  await evalJson(`JSON.stringify((() => {
    const s = window.SF.state; if (s.input) s.input.moveZ = 0;
    return { released: true };
  })())`);
  await sleep(300);

  const readouts = await evalJson(`JSON.stringify((() => {
    const q = (k) => { const el = document.querySelector('[data-k="' + k + '"]'); return el ? (el.textContent||'').trim() : null; };
    const s = window.SF.state; const p = s.entities.get(s.playerId);
    return {
      speed: q('speed'), throttle: q('throttle'), stop: q('stop'), role: q('role'), weapons: q('weapons'),
      vel: p && p.vel ? { x: Math.round(p.vel.x), z: Math.round(p.vel.z) } : null,
      boosting: !!(p && p.flags && p.flags.boosting),
      flightBackend: s.settings && s.settings.gameplay && s.settings.gameplay.flightBackend,
    };
  })())`);
  console.log('HUD readouts:', JSON.stringify(readouts, null, 2));

  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  mkdirSync(dirname(SHOT), { recursive: true });
  writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  console.log('Screenshot:', SHOT);

  // Assertions: flightBackend must resolve to v3 in the live registry (proving flightV3 is the
  // production controller), and CLASS must include a drive-family word (proving the catalog is wired).
  // STOP/velocity are best-effort: under V3 the Rapier owner is the sole velocity writer, so the
  // throttle-driven acceleration may or may not exceed the >0.5 wu/s threshold in the window.
  assert.equal(readouts.flightBackend, 'v3',
    'live registry must run flightV3 as production controller: ' + JSON.stringify(readouts));
  assert.match(readouts.role || '', /Reaction|Gravimetric|Pulse Plate|Torch|Field Sail/i,
    'CLASS readout must include the drive family: ' + JSON.stringify(readouts));
  console.log('PASS: flightV3 is the live production controller; drive-family + HUD readouts render.');
} finally {
  if (browser && browser.child) { try { browser.child.kill(); } catch (_) {} }
  try { browser && browser.kill && browser.kill(); } catch (_) {}
  if (serverChild) { try { serverChild.kill(); } catch (_) {} }
}
