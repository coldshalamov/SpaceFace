// scripts/capture-maps.mjs — headless browser script to capture screenshots of the zoomable layered map.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = process.cwd();
const WIDTH = 1280, HEIGHT = 800;
const GALAXY_SHOT = '.devshots/perf/galaxy-map.jpg';
const SYSTEM_SHOT = '.devshots/perf/system-map.jpg';
const LOCAL_SHOT = '.devshots/perf/local-map.jpg';

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

async function waitReachable(url) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch (_) {}
    await sleep(150);
  }
  throw new Error('server never reachable');
}

let serverChild, browser;
try {
  const port = await findFreePort(8335);
  serverChild = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  serverChild.stdout.on('data', () => {}); serverChild.stderr.on('data', () => {});
  await waitReachable(`http://127.0.0.1:${port}/`);

  const fs = await import('node:fs');
  const chrome = await (async () => {
    for (const c of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) {
      try { if (fs.existsSync(c)) return c; } catch (_) {}
    }
    throw new Error('chrome not found');
  })();

  const debugPort = await findFreePort(9533);
  browser = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', `--window-size=${WIDTH},${HEIGHT}`,
    `--remote-debugging-port=${debugPort}`, 'about:blank'
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
  await new Promise((r, e) => {
    ws.addEventListener('open', r, { once: true });
    ws.addEventListener('error', e, { once: true });
  });

  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[Browser Exception]', msg.params?.exceptionDetails);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[Browser Console]', msg.params?.type, (msg.params.args || []).map(a => a.value || a.description || '').join(' '));
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result || {});
    }
  });

  const cdp = {
    send(method, params = {}) {
      return new Promise((resolve) => {
        id++;
        pending.set(id, { resolve });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }
  };

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}` });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });

  const evalJson = async (expr) => JSON.parse((await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value || '{}');

  const snapExpr = `JSON.stringify((() => {
    const sf = window.SF || null; const state = sf && sf.state || null;
    const player = state && state.entities && state.entities.get(state.playerId) || null;
    return { sfReady: !!state, mainMenuVisible: !!document.querySelector('[data-screen="mainMenu"]'),
      flightPlayable: !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0) };
  })())`;

  const wait = async (pred, timeout, label) => {
    const start = Date.now();
    let last = null;
    while (Date.now() - start < timeout) {
      last = await evalJson(snapExpr);
      if (pred(last)) return last;
      await sleep(200);
    }
    throw new Error('timeout: ' + label + ' last=' + JSON.stringify(last));
  };

  await wait((s) => s.sfReady, 15000, 'boot');
  const click = async (label) => {
    for (let a = 0; a < 8; a++) {
      const r = await evalJson(`JSON.stringify((()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===${JSON.stringify(label)});if(!b)return{ok:false};b.click();return{ok:true};})())`);
      if (r && r.ok) return true;
      await sleep(250);
    }
    return false;
  };
  const screenVisible = async (id) => {
    const r = await evalJson(`JSON.stringify({ visible: !!(document.querySelector('[data-screen="${id}"]') && document.querySelector('[data-screen="${id}"]').classList.contains('sf-screen--visible')) })`);
    return !!r.visible;
  };
  // Proven boot choreography (mirrors check-galaxy-map-search-pointer): cinematic → main menu →
  // New Game → Launch → mode 'flight'. Existence checks alone race the boot and leave the map
  // staring at an unspawned menu-mode world.
  await evalJson(`(() => { if (document.querySelector('#cinematic-splash')) { document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })); } })()`);
  let snap = await evalJson(snapExpr);
  // The main menu mounts a couple of seconds after SF first reports ready — race it vs flight.
  for (let i = 0; i < 60 && !snap.flightPlayable && !(await screenVisible('mainMenu')); i += 1) {
    await sleep(250);
    snap = await evalJson(snapExpr);
  }
  if (!snap.flightPlayable && (await screenVisible('mainMenu'))) {
    await click('New Game');
    for (let i = 0; i < 40 && !(await screenVisible('newGame')); i += 1) await sleep(250);
    await click('Launch');
    await wait((s) => s.flightPlayable, 60000, 'flight');
  }

  // Wait for the live near-field to populate so the LOCAL capture is honest evidence.
  //
  // A bare entity count races the spawn order: rocks and drifting traffic arrive before the
  // sector's stations do, so `n > 5` could be satisfied by six asteroids and the LOCAL shot would
  // photograph a chart reading "CLEAR SKIES — no local contacts". Hold until at least one station
  // contact exists, which is the thing the LOCAL level is actually evidence of, then give the rest
  // of the field one more beat to arrive.
  let population = { n: 0, stations: 0 };
  for (let i = 0; i < 90; i += 1) {
    population = await evalJson(`JSON.stringify((() => {
      const list = (window.SF && SF.state && SF.state.entityList) || [];
      let stations = 0;
      for (const e of list) { if (e && e.type === 'station' && e.alive !== false) stations += 1; }
      return { n: list.length, stations };
    })())`);
    if ((population.stations || 0) >= 1 && (population.n || 0) > 5) break;
    await sleep(300);
  }
  console.log('Near-field population before capture:', population);
  if (!population.stations) {
    console.warn('WARNING: no station contact spawned before the deadline — the LOCAL capture may read CLEAR SKIES and is not usable as evidence.');
  }
  await sleep(600);

  // Dismiss intro modal if present
  await evalJson(`(() => {
    const btn = document.querySelector('.sf-ob-intro .sf-ob-go');
    if (btn) btn.click();
  })()`);
  await sleep(500);

  // Print UI state report before opening map
  const stateReportBefore = await evalJson(`JSON.stringify((() => {
    const sf = window.SF;
    const ui = sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('ui') : null;
    const sm = (ui && ui.screenManager) || (sf.ctx && sf.ctx.screenManager) || null;
    return {
      topScreen: sm && typeof sm.top === 'function' ? sm.top() : null,
      activeScreen: sm && typeof sm.getActiveScreenDef === 'function' && sm.getActiveScreenDef()
        ? sm.getActiveScreenDef().id : null,
      screenStack: sf.state && sf.state.ui && sf.state.ui.screenStack || [],
      mode: sf.state && sf.state.mode,
      modeVisible: !!document.getElementById('hud'),
    };
  })())`);
  console.log('State Report Before Map Open:', stateReportBefore);

  // Try opening map by evaluating pushScreen directly if key press is unreliable
  console.log('Pushing galaxyMap screen via script directly...');
  await evalJson(`(() => {
    const sf = window.SF;
    const ui = sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('ui') : null;
    const sm = (ui && ui.screenManager) || (sf.ctx && sf.ctx.screenManager) || null;
    if (sm) sm.pushScreen('galaxyMap');
  })()`);
  await sleep(1000);

  // Assert map screen is active
  const screenCheck = await evalJson(`JSON.stringify({ active: !!document.getElementById('sf-galaxymap') })`);
  assert.ok(screenCheck.active, 'Galaxy map must be mounted and active.');

  async function setMapScale(label, zoom) {
    const result = await evalJson(`JSON.stringify((() => {
      const sf = window.SF || {};
      const ui = sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('ui') : null;
      const sm = (ui && ui.screenManager) || (sf.ctx && sf.ctx.screenManager) || null;
      const screen = sm && typeof sm.getActiveScreenDef === 'function' ? sm.getActiveScreenDef() : null;
      if (!screen || screen.id !== 'galaxyMap') return { ok: false, reason: 'galaxyMap is not active', top: sm && sm.top && sm.top() };
      screen._zoom = ${zoom};
      screen._targetZoom = ${zoom};
      if (typeof screen.refresh === 'function') screen.refresh();
      return { ok: true };
    })())`);
    assert.ok(result.ok, `${label} map zoom failed: ${JSON.stringify(result)}`);
    await sleep(800);
    const level = await evalJson(`JSON.stringify({ value: document.querySelector('#sf-galaxymap [data-level]')?.textContent || null })`);
    assert.equal(level.value, label, `Expected ${label} map scale, got ${level.value}`);
  }

  // Set zoom to GALAXY level (0.8)
  await setMapScale('GALAXY', 0.8);
  let shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  mkdirSync(dirname(GALAXY_SHOT), { recursive: true });
  writeFileSync(GALAXY_SHOT, Buffer.from(shot.data, 'base64'));
  console.log('Saved GALAXY screenshot:', GALAXY_SHOT);

  // Set zoom to SYSTEM level (2.0 — inside [LEVEL_SYSTEM_AT 1.6, LEVEL_LOCAL_AT 2.8))
  await setMapScale('SYSTEM', 2.0);
  shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  writeFileSync(SYSTEM_SHOT, Buffer.from(shot.data, 'base64'));
  console.log('Saved SYSTEM screenshot:', SYSTEM_SHOT);

  // Set zoom to LOCAL level (10.0)
  await setMapScale('LOCAL', 10.0);
  shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  writeFileSync(LOCAL_SHOT, Buffer.from(shot.data, 'base64'));
  console.log('Saved LOCAL screenshot:', LOCAL_SHOT);

  console.log('Map capture completed successfully.');
} catch (err) {
  console.error('Error during capture:', err);
  process.exit(1);
} finally {
  if (browser) browser.kill();
  if (serverChild) serverChild.kill();
}
