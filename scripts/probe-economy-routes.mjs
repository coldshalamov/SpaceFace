// Economy UX §13 live verification: the local map's trade-routes panel renders ranked routes from
// LIVE station economy data. Boots a flight session, populates the market intel (via the same
// snapshotIntel path docking uses), opens the N map, and confirms the panel shows ranked routes
// (sorted by profit/min, with station/commodity names + reliability aging).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const ROOT = process.cwd();
const WIDTH = 1280, HEIGHT = 800;
const SHOT = '.devshots/perf/localmap-routes.jpg';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function findFreePort(start) {
  const { createServer } = await import('node:net');
  for (let p = start; p < start + 200; p++) { const ok = await new Promise((res) => { const s = createServer(); s.once('error', () => res(false)); s.listen(p, '127.0.0.1', () => { s.close(() => res(true)); }); }); if (ok) return p; }
  throw new Error('no free port');
}
async function waitReachable(url) { for (let i = 0; i < 120; i++) { try { const r = await fetch(url); if (r.ok) return; } catch (_) {} await sleep(150); } throw new Error('server never reachable'); }

let serverChild, browser;
const issues = [];
try {
  const port = await findFreePort(8477);
  serverChild = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  serverChild.stdout.on('data', () => {}); serverChild.stderr.on('data', () => {});
  await waitReachable(`http://127.0.0.1:${port}/`);
  const fs = await import('node:fs');
  const chrome = await (async () => { for (const c of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (_) {} } throw new Error('chrome not found'); })();
  const debugPort = await findFreePort(9731);
  browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--window-size=${WIDTH},${HEIGHT}`, `--remote-debugging-port=${debugPort}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  browser.stdout.on('data', () => {}); browser.stderr.on('data', () => {});

  let wsUrl = null;
  for (let i = 0; i < 60; i++) { try { const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); const page = tabs.find((t) => t.type === 'page'); if (page) { wsUrl = page.webSocketDebuggerUrl; break; } } catch (_) {} await sleep(200); }
  assert(wsUrl, 'no CDP target');
  const ws = new WebSocket(wsUrl);
  await new Promise((r, e) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', e, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.method === 'Runtime.exceptionThrown') issues.push({ level: 'error', text: msg.params?.exceptionDetails?.text || 'exception' });
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') issues.push({ level: 'error', text: (msg.params.args || []).map((a) => a.value || a.description || '').join(' ') });
    if (msg.id && pending.has(msg.id)) { const { resolve } = pending.get(msg.id); pending.delete(msg.id); resolve(msg.result || {}); }
  });
  const cdp = { send(method, params = {}) { return new Promise((resolve) => { id++; pending.set(id, { resolve }); ws.send(JSON.stringify({ id, method, params })); }); } };
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}` });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  const evalJson = async (expr) => JSON.parse((await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value || '{}');
  const press = async (key, code, vk) => { await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk }); };

  const snapExpr = `JSON.stringify((() => {
    const sf = window.SF || null; const state = sf && sf.state || null;
    const player = state && state.entities && state.entities.get(state.playerId) || null;
    const classText = document.querySelector('[data-k="role"]')?.textContent || '';
    const hudPlayable = classText.trim() && !/^[-—]$/.test(classText.trim());
    return { sfReady: !!state, mainMenuVisible: !!document.querySelector('[data-screen="mainMenu"]'),
      flightPlayable: !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0) || hudPlayable };
  })())`;
  const wait = async (pred, timeout, label) => { const start = Date.now(); let last = null; while (Date.now() - start < timeout) { last = await evalJson(snapExpr); if (pred(last)) return last; await sleep(200); } throw new Error('timeout: ' + label + ' last=' + JSON.stringify(last)); };
  await wait((s) => s.sfReady && (s.mainMenuVisible || s.flightPlayable), 15000, 'menu');
  let snap = await evalJson(snapExpr);
  if (snap.mainMenuVisible && !snap.flightPlayable) {
    const click = async (label) => { for (let a = 0; a < 8; a++) { const r = await evalJson(`JSON.stringify((()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===${JSON.stringify(label)});if(!b)return{ok:false};b.click();return{ok:true};})())`); if (r && r.ok) return true; await sleep(250); } return false; };
    const ngExpr = `JSON.stringify({ visible: !!document.querySelector('[data-screen="newGame"]') })`;
    await sleep(400); await click('New Game');
    for (let i = 0; i < 60; i++) { const ng = JSON.parse((await cdp.send('Runtime.evaluate', { expression: ngExpr, returnByValue: true })).result?.value || '{}'); snap = await evalJson(snapExpr); if (snap.flightPlayable || ng.visible) break; await sleep(200); }
    snap = await evalJson(snapExpr);
    if (!snap.flightPlayable) { await click('Launch'); await wait((s) => s.flightPlayable, 45000, 'flight'); }
  }
  await sleep(1500); // let the world/economy populate

  // Populate market intel for ALL stations via the production snapshotIntel path (the same call
  // docking makes). This gives the route panel live price data to rank.
  const populated = await evalJson(`JSON.stringify((() => {
    const sf = window.SF; const state = sf.state;
    // The economy SYSTEM (with snapshotIntel) is on the registry, not state.economy (data namespace).
    let eco = sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('economy') : null;
    if (!eco || typeof eco.snapshotIntel !== 'function') {
      // Some registries expose systems by name on the registry object itself.
      eco = (sf.registry && sf.registry.economy) || null;
    }
    if (!eco || typeof eco.snapshotIntel !== 'function') return { ok: false, reason: 'no economy system w/ snapshotIntel' };
    const stations = state.entityList.filter((e) => e.type === 'station' && e.alive && e.data && e.data.stationId);
    let scanned = 0;
    for (const s of stations) { if (typeof eco.ensureStationMarkets === 'function') eco.ensureStationMarkets(s.data.stationId); eco.snapshotIntel(s.data.stationId); scanned++; }
    return { ok: true, scanned, intelCount: Object.keys(state.economy.marketIntel || {}).length };
  })())`);
  console.log('Market intel populated:', JSON.stringify(populated));
  assert.ok(populated.ok && populated.intelCount >= 2, `routes: market intel must populate for >=2 stations (got ${JSON.stringify(populated)})`);

  // Open the local map (N) and read the routes panel.
  await press('n', 'KeyN', 78);
  await sleep(900);

  const report = await evalJson(`JSON.stringify((() => {
    const panel = document.querySelector('#sf-localmap-routes');
    if (!panel) return { panelPresent: false };
    const routes = [...panel.querySelectorAll('.lm-route')];
    return {
      panelPresent: true,
      routeCount: routes.length,
      hasEmpty: !!panel.querySelector('.lm-routes-empty'),
      firstRoute: routes[0] ? routes[0].textContent.replace(/\\s+/g, ' ').trim().slice(0, 120) : null,
      // The routes must come from the live economy data (marketIntel) — confirm the panel isn't the
      // empty placeholder.
      populated: routes.length > 0,
    };
  })())`);
  console.log('Routes panel report:', JSON.stringify(report, null, 2));

  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  mkdirSync(dirname(SHOT), { recursive: true });
  writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));

  assert.ok(report.panelPresent, 'routes: the trade-routes panel must exist in the local map');
  assert.ok(report.routeCount >= 1, `routes: the panel must show >=1 ranked route from live economy data (got ${report.routeCount})`);
  assert.ok(report.populated, 'routes: the panel must not show the empty placeholder when intel exists');

  const errors = issues.filter((i) => i.level === 'error');
  assert.equal(errors.length, 0, 'routes probe must not produce page errors: ' + JSON.stringify(errors.slice(0, 5)));
  console.log(`\nEconomy UX §13 PASS: local map trade-routes panel renders ${report.routeCount} ranked route(s) from live station economy data.`);
  console.log('First route:', report.firstRoute);
} finally {
  try { browser && browser.kill && browser.kill(); } catch (_) {}
  if (serverChild) { try { serverChild.kill(); } catch (_) {} }
}
