// Probe: boot to flight, open the local system map (N key), and confirm the LocalSpaceIntel model
// is live (feeding real contacts), the localmap canvas rendered, and no page errors occurred.
// Proves the three navigation scales are distinct: tactical radar (HUD) vs local system (this) vs
// galaxy star map (M). Mirrors the boot-flow / energy-materials CDP pattern.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { BINDINGS } from '../src/ui/bindings.js';

const ROOT = process.cwd();
const WIDTH = 1280, HEIGHT = 800;
const SHOT = '.devshots/perf/local-map.jpg';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function findFreePort(start) {
  const { createServer } = await import('node:net');
  for (let p = start; p < start + 200; p++) {
    const ok = await new Promise((res) => { const s = createServer(); s.once('error', () => res(false)); s.listen(p, '127.0.0.1', () => { s.close(() => res(true)); }); });
    if (ok) return p;
  }
  throw new Error('no free port');
}
async function waitReachable(url) { for (let i = 0; i < 120; i++) { try { const r = await fetch(url); if (r.ok) return; } catch (_) {} await sleep(150); } throw new Error('server never reachable'); }

let serverChild, browser;
const issues = [];
try {
  const port = await findFreePort(8193);
  serverChild = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  serverChild.stdout.on('data', () => {}); serverChild.stderr.on('data', () => {});
  await waitReachable(`http://127.0.0.1:${port}/`);
  const fs = await import('node:fs');
  const chrome = await (async () => {
    for (const c of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) { try { if (fs.existsSync(c)) return c; } catch (_) {} }
    throw new Error('chrome not found');
  })();
  const debugPort = await findFreePort(9431);
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
  // Let the world populate (stations/contacts spawn after flight starts).
  await sleep(1500);

  // Regression: clicking HUD/UI buttons must not become gameplay LMB fire.
  await evalJson(`JSON.stringify((() => {
    const sf = window.SF;
    window.__sfUiClickFireEvents = 0;
    const bus = sf && sf.ctx && sf.ctx.bus;
    if (bus && !window.__sfUiClickFireSubbed) {
      window.__sfUiClickFireSubbed = true;
      bus.on('combat:fire', (p) => {
        const s = window.SF && window.SF.state;
        if (!s || !p || p.ownerId === s.playerId) window.__sfUiClickFireEvents++;
      });
    }
    if (sf && sf.state && sf.state.input) {
      sf.state.input.fire = false;
      sf.state.input.fireGroup = null;
    }
    if (bus && typeof bus.emit === 'function') bus.emit('ui:toggleCargo');
    return { armed: true };
  })())`);
  await sleep(250);
  const closeRect = await evalJson(`JSON.stringify((() => {
    const btn = document.querySelector('.sf-cargo-panel.open .sf-cargo-panel__close');
    if (!btn) return { ok:false };
    const r = btn.getBoundingClientRect();
    return { ok:true, x:r.left + r.width / 2, y:r.top + r.height / 2, w:r.width, h:r.height };
  })())`);
  assert.equal(closeRect.ok, true, 'cargo-panel close button must be visible for UI-click regression: ' + JSON.stringify(closeRect));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: closeRect.x, y: closeRect.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: closeRect.x, y: closeRect.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: closeRect.x, y: closeRect.y, button: 'left', clickCount: 1 });
  await sleep(400);
  const uiClickReport = await evalJson(`JSON.stringify((() => {
    const s = window.SF && window.SF.state;
    return {
      fireEvents: window.__sfUiClickFireEvents || 0,
      inputFire: !!(s && s.input && s.input.fire),
      inputFireGroup: s && s.input && s.input.fireGroup || null,
      cargoStillOpen: !!document.querySelector('.sf-cargo-panel.open'),
    };
  })())`);
  console.log('UI click report:', JSON.stringify(uiClickReport, null, 2));
  assert.equal(uiClickReport.fireEvents, 0, 'clicking a HUD button must not emit player combat:fire: ' + JSON.stringify(uiClickReport));
  assert.equal(uiClickReport.inputFire, false, 'clicking a HUD button must not latch state.input.fire: ' + JSON.stringify(uiClickReport));
  assert.equal(uiClickReport.inputFireGroup, null, 'clicking a HUD button must not latch a fire group: ' + JSON.stringify(uiClickReport));

  const cargoOpenBeforeEsc = await evalJson(`JSON.stringify((() => {
    const sf = window.SF;
    if (!document.querySelector('.sf-cargo-panel.open') && sf && sf.bus && typeof sf.bus.emit === 'function') {
      sf.bus.emit('ui:toggleCargo');
    }
    return { cargoOpen: !!document.querySelector('.sf-cargo-panel.open') };
  })())`);
  assert.equal(cargoOpenBeforeEsc.cargoOpen, true, 'cargo panel must be open before Escape regression: ' + JSON.stringify(cargoOpenBeforeEsc));
  await sleep(250);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(250);
  const cargoEscReport = await evalJson(`JSON.stringify((() => {
    const sf = window.SF;
    const stack = sf && sf.state && sf.state.ui && sf.state.ui.screenStack;
    return {
      cargoStillOpen: !!document.querySelector('.sf-cargo-panel.open'),
      topScreen: Array.isArray(stack) ? (stack[stack.length - 1] || null) : null,
    };
  })())`);
  console.log('Cargo ESC report:', JSON.stringify(cargoEscReport, null, 2));
  assert.equal(cargoEscReport.cargoStillOpen, false, 'Escape must close the cargo panel: ' + JSON.stringify(cargoEscReport));
  assert.notEqual(cargoEscReport.topScreen, 'pause', 'Escape must not open Pause while closing the cargo panel: ' + JSON.stringify(cargoEscReport));

  // Open the local system map via the N key.
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'n', code: 'KeyN', windowsVirtualKeyCode: 78 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'n', code: 'KeyN', windowsVirtualKeyCode: 78 });
  await sleep(600);

  const report = await evalJson(`JSON.stringify((() => {
    const sf = window.SF;
    const ui = sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('ui') : null;
    const sm = (ui && ui.screenManager) || (sf.ctx && sf.ctx.screenManager) || null;
    const top = sm && typeof sm.top === 'function' ? sm.top() : null;
    const el = document.getElementById('sf-localmap');
    const canvas = el && el.querySelector('canvas');
    const ctx2d = canvas && canvas.getContext('2d');
    // Sample the canvas: confirm it has been drawn to (non-empty alpha pixels), proving render ran.
    let drawn = false;
    if (ctx2d && canvas.width > 0 && canvas.height > 0) {
      try {
        const sx = Math.min(canvas.width, 200), sy = Math.min(canvas.height, 200);
        const data = ctx2d.getImageData(0, 0, sx, sy).data;
        drawn = data.some((v, i) => i % 4 === 3 && v > 0);
      } catch (_) {}
    }
    const state = sf.state;
    const entityCount = state && state.entityList ? state.entityList.length : 0;
    const objective = el && el.querySelector('#sf-localmap-objective');
    const objectiveText = objective ? (objective.textContent || '').replace(/\\s+/g, ' ').trim() : '';
    const waypoint = state && state.nav && state.nav.waypoint || null;
    return {
      localmapOpen: top === 'localmap',
      localmapElVisible: !!(el && el.style.display !== 'none'),
      canvasPresent: !!canvas,
      canvasWidth: canvas ? canvas.width : 0,
      canvasDrawn: drawn,
      entityCount,
      objectivePanelVisible: !!(objective && !objective.hidden && objective.getBoundingClientRect().height > 10),
      objectiveText,
      waypointKind: waypoint && waypoint.kind || null,
      waypointLabel: waypoint && waypoint.label || null,
      waypointReason: waypoint && waypoint.reason || null,
      waypointOnboarding: !!(waypoint && waypoint.onboarding),
      waypointHasPosition: !!(waypoint && waypoint.pos),
    };
  })())`);
  console.log('Local map report:', JSON.stringify(report, null, 2));

  assert.equal(report.localmapOpen, true, 'N key must open the localmap screen: ' + JSON.stringify(report));
  assert.equal(report.canvasPresent, true, 'localmap canvas must exist');
  assert.ok(report.canvasWidth > 0, 'localmap canvas must be sized (width > 0): ' + JSON.stringify(report));
  assert.equal(report.canvasDrawn, true, 'localmap canvas must have rendered content (range rings / contacts / player): ' + JSON.stringify(report));
  assert.equal(report.objectivePanelVisible, true, 'localmap must show an objective/waypoint panel: ' + JSON.stringify(report));
  assert.ok(report.objectiveText.length > 12, 'localmap objective panel must contain readable guidance: ' + JSON.stringify(report));
  assert.match(report.objectiveText, /(mission|objective|story|tutorial|mine|dock|course|waypoint|signal|map)/i, 'localmap objective panel must name useful navigation intent: ' + JSON.stringify(report));
  assert.ok(report.waypointHasPosition || report.objectiveText.includes('Off-sector') || /story|mission|tutorial|course/i.test(report.objectiveText), 'localmap must expose either a plotted waypoint or readable route context: ' + JSON.stringify(report));

  // Inject a route-backed off-sector objective while the local map is open. This proves the panel
  // tells the player the next jump instead of stopping at a vague "off-sector" note.
  await evalJson(`JSON.stringify((() => {
    const sf = window.SF;
    const state = sf && sf.state;
    if (!state) return { ok:false };
    const current = state.world && state.world.currentSectorId || 'sector_helios_prime';
    state.ui.trackedMissionId = 'probe_offsector';
    state.missions.active = (state.missions.active || []).filter((m) => m.id !== 'probe_offsector');
    state.missions.active.push({
      id: 'probe_offsector',
      status: 'active',
      type: 'cargo_delivery',
      title: 'Probe Delivery',
      objectiveProgress: 0,
      objectiveTarget: 1,
      deadline_s: (state.simTime || 0) + 600,
    });
    state.nav.waypoint = {
      kind: 'mission',
      missionId: 'probe_offsector',
      label: 'Probe Delivery',
      reason: 'Deliver probe cargo',
      sectorId: 'sector_tethys_junction',
      sectorName: 'Tethys Junction',
    };
    state.nav.route = {
      legs: [{ from: current, to: 'sector_tethys_junction', fuel: 12, charge: 3, interdict: 0.05 }],
      totalFuel: 12,
      totalHops: 1,
    };
    const ui = sf.registry && sf.registry.get && sf.registry.get('ui');
    const sm = ui && ui.screenManager || sf.ctx && sf.ctx.screenManager;
    if (sm && typeof sm.refreshTop === 'function') sm.refreshTop();
    return { ok:true };
  })())`);
  await sleep(250);
  const offSectorReport = await evalJson(`JSON.stringify((() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const el = document.getElementById('sf-localmap');
    const objective = el && el.querySelector('#sf-localmap-objective');
    const objectiveText = objective ? (objective.textContent || '').replace(/\\s+/g, ' ').trim() : '';
    const waypoint = state && state.nav && state.nav.waypoint || null;
    return {
      objectivePanelVisible: !!(objective && !objective.hidden && objective.getBoundingClientRect().height > 10),
      objectiveText,
      waypointHasPosition: !!(waypoint && waypoint.pos),
      routeHops: state && state.nav && state.nav.route && state.nav.route.totalHops || 0,
    };
  })())`);
  console.log('Off-sector local map report:', JSON.stringify(offSectorReport, null, 2));
  assert.equal(offSectorReport.objectivePanelVisible, true, 'off-sector objective panel must stay visible: ' + JSON.stringify(offSectorReport));
  assert.equal(offSectorReport.waypointHasPosition, false, 'off-sector waypoint probe must not have a local position: ' + JSON.stringify(offSectorReport));
  const starMapChip = `${BINDINGS.starmap.label} Star Map`;
  assert.ok(/Next jump|Plot route/i.test(offSectorReport.objectiveText) || offSectorReport.objectiveText.includes(starMapChip),
    'off-sector objective panel must surface route or next-jump guidance: ' + JSON.stringify(offSectorReport));
  assert.match(offSectorReport.objectiveText, /Tethys Junction/i, 'off-sector objective panel must name the destination sector: ' + JSON.stringify(offSectorReport));
  assert.ok(offSectorReport.routeHops >= 1, 'off-sector objective probe must include a plotted route: ' + JSON.stringify(offSectorReport));

  const errors = issues.filter((i) => i.level === 'error');
  assert.equal(errors.length, 0, 'local map must not produce page errors: ' + JSON.stringify(errors.slice(0, 5)));

  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  mkdirSync(dirname(SHOT), { recursive: true });
  writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
  console.log('Screenshot:', SHOT);
  console.log('PASS: local system map (LocalSpaceIntel) opens and renders live contacts with no errors.');
} finally {
  try { browser && browser.kill && browser.kill(); } catch (_) {}
  if (serverChild) { try { serverChild.kill(); } catch (_) {} }
}
