#!/usr/bin/env node
// check-gamepad-screens.mjs — PQ-164.00 "Every screen on a pad".
//
// Walks EVERY screen in the live screen manifest (the set that actually registered on the default
// route) plus the docked station app, and drives synthetic gamepad verbs at each one:
//
//   dpad   — D-pad moves focus between the screen's controls (or focus already rests inside a
//            single-control screen). Proves the pad can navigate the screen.
//   accept — A/Cross activates the focused control: a real click lands inside the screen, the
//            stack top changes, or a confirm dialog opens. Proves the pad can act.
//   back   — B/Circle leaves the screen (pop / undock; the station exit gate's confirm is
//            committed with A, exactly like a player). Screens whose def is `locked` (gameOver,
//            crucible draft/refit/door/results) trap B BY DESIGN — the manager comment calls this
//            out ("root title / mid-transaction screens trap ESC") — so for those the contract is
//            that B is inert and the screen stays put while dpad/accept still work.
//
// One line per screen: `SCREEN <id> pad=yes|no` (failures carry the failing verbs). The bar is
// every listed screen pad=yes. Fixed seed 16400. Headless Chromium + a synthetic standard-layout
// gamepad (navigator.getGamepads is stubbed) — no physical pad, per the leaf's measure.
//
// Usage: node scripts/check-gamepad-screens.mjs [--only=id1,id2]
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SEED = 16400;
const WIDTH = 1440;
const HEIGHT = 900;

const BTN = { accept: 0, cancel: 1, tabPrev: 4, tabNext: 5, dUp: 12, dDown: 13, dLeft: 14, dRight: 15 };

const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  if (i < 0) return null;
  return new Set(String(process.argv[i + 1] || '').split(',').map((s) => s.trim()).filter(Boolean));
})();

function freePort() {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const baseUrl = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(baseUrl); if (r.status) return { child, baseUrl }; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server start timeout');
}

// ---- page helpers (evaluated inside the live game) --------------------------

async function pressPad(page, idx, holdMs = 140) {
  await page.evaluate((i) => {
    const pad = window.__sfSyntheticPad;
    if (!pad) return;
    pad.timestamp += 1;
    pad.buttons[i].pressed = true; pad.buttons[i].value = 1; pad.buttons[i].touched = true;
  }, idx);
  await page.waitForTimeout(holdMs);
  await page.evaluate((i) => {
    const pad = window.__sfSyntheticPad;
    if (!pad) return;
    pad.timestamp += 1;
    pad.buttons[i].pressed = false; pad.buttons[i].value = 0; pad.buttons[i].touched = false;
  }, idx);
}

const pageShell = () => {
  const ui = window.SF && window.SF.ctx && window.SF.ctx.registry && window.SF.ctx.registry.get('ui');
  const mgr = ui && ui.screenManager;
  return {
    mgr,
    top: mgr && mgr.top ? mgr.top() : null,
    confirmOpen: !!document.querySelector('#sf-confirm-root .sf-confirm'),
    docked: !!(window.SF && window.SF.state && window.SF.state.ui && window.SF.state.ui.docked === true),
    mode: window.SF && window.SF.state ? window.SF.state.mode : null,
  };
};

async function shell(page) {
  return page.evaluate(pageShell);
}

async function confirmDismiss(page, commit) {
  // confirm.js routes pad through handleGamepadUi: A = focused/OK, B = Cancel.
  await pressPad(page, commit ? BTN.accept : BTN.cancel);
  await page.waitForTimeout(340); // 160ms fade teardown + a beat
}

async function ensureFlightBaseline(page) {
  for (let i = 0; i < 6; i++) {
    const s = await shell(page);
    if (s.confirmOpen) { await confirmDismiss(page, true); continue; }
    if (s.docked) {
      await page.evaluate(() => { window.SF.bus.emit('dock:undocked', { source: 'pad-walk-reset' }); });
      await page.waitForTimeout(320);
      continue;
    }
    if (s.mode !== 'flight') {
      await page.evaluate((seed) => { window.SF.bus.emit('game:new', { name: 'Pad Walk', seed }); }, SEED);
      await waitFlight(page);
      continue;
    }
    if (s.top) {
      await page.evaluate(() => { window.SF.bus.emit('ui:closeAll', {}); });
      await page.waitForTimeout(200);
      continue;
    }
    return;
  }
}

async function waitFlight(page) {
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 120000 });
}

async function pushScreen(page, id) {
  await page.evaluate((screenId) => {
    window.SF.ctx.registry.get('ui').screenManager.pushScreen(screenId);
  }, id);
  try {
    await page.waitForFunction((screenId) => {
      const ui = window.SF.ctx.registry.get('ui');
      return ui && ui.screenManager && ui.screenManager.top() === screenId;
    }, id, { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

async function screenFacts(page, id) {
  return page.evaluate((screenId) => {
    const ui = window.SF.ctx.registry.get('ui');
    const mgr = ui.screenManager;
    const root = document.querySelector(`[data-screen="${screenId}"]`);
    const visible = !!(root && root.style.display !== 'none');
    const focusables = root ? Array.from(root.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter((el) => {
      if (el.disabled || el.hidden || el.inert) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      const t = el.getAttribute('tabindex'); if (t != null && Number(t) < 0) return false;
      let p = el.parentNode;
      while (p && p !== root) { if (p.style && p.style.display === 'none') return false; p = p.parentNode; }
      return true;
    }) : [];
    const active = document.activeElement;
    const def = mgr.getActiveScreenDef && mgr.getActiveScreenDef();
    return {
      top: mgr.top(),
      visible,
      focusable: focusables.length,
      activeInside: !!(root && active && root.contains(active)),
      locked: !!(mgr.locked && mgr.locked()) || !!(def && def.data && def.data.locked),
    };
  }, id);
}

// dpad: after a directional press the focus must rest inside the screen; with more than one
// control, at least one of the four directions must MOVE focus (a direction with no spatial
// neighbour is not a failure — the pad still owns the screen).
async function dpadProbe(page, id) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-sf-padwalk]').forEach((el) => el.removeAttribute('data-sf-padwalk'));
    const a = document.activeElement;
    if (a && a.setAttribute) a.setAttribute('data-sf-padwalk', '1');
  });
  let moved = false;
  for (const btn of [BTN.dDown, BTN.dRight, BTN.dUp, BTN.dLeft]) {
    await pressPad(page, btn);
    await page.waitForTimeout(130);
    const r = await page.evaluate(() => {
      const a = document.activeElement;
      const marked = document.querySelector('[data-sf-padwalk="1"]');
      return { moved: !!(a && a !== marked) };
    });
    if (r.moved) { moved = true; break; }
  }
  const f = await screenFacts(page, id);
  return { ok: f.activeInside && (moved || f.focusable <= 1), moved, inside: f.activeInside, focusable: f.focusable };
}

// accept: A must produce a real activation — a click landing inside the screen, a stack change,
// or a confirm dialog (which the walk then cancels with B, the safe default).
async function acceptProbe(page, id) {
  const before = await page.evaluate((screenId) => {
    const mgr = window.SF.ctx.registry.get('ui').screenManager;
    const root = document.querySelector(`[data-screen="${screenId}"]`);
    window.__sfPadClicks = 0;
    if (root && !root.__sfPadClickWired) {
      root.__sfPadClickWired = true;
      root.addEventListener('click', () => { window.__sfPadClicks += 1; });
    }
    return { top: mgr.top() };
  }, id);
  await pressPad(page, BTN.accept);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const mgr = window.SF.ctx.registry.get('ui').screenManager;
    return {
      top: mgr.top(),
      clicks: window.__sfPadClicks || 0,
      confirmOpen: !!document.querySelector('#sf-confirm-root .sf-confirm'),
    };
  });
  if (after.confirmOpen) await confirmDismiss(page, false);
  const ok = after.clicks > 0 || after.top !== before.top || after.confirmOpen;
  return { ok, clicks: after.clicks, moved: after.top !== before.top, confirm: after.confirmOpen };
}

// back: B leaves the screen. Mid-walk children the accept step opened are stepped back through
// first; a station-style exit confirm is committed with A (that IS the player leaving).
async function backProbe(page, id, locked) {
  for (let i = 0; i < 4; i++) {
    const now = await shell(page);
    if (now.confirmOpen) { await confirmDismiss(page, true); continue; }
    if (now.top !== id) return { ok: true, note: 'popped' };
    await pressPad(page, BTN.cancel);
    await page.waitForTimeout(300);
  }
  const end = await shell(page);
  if (end.top !== id) return { ok: true, note: 'popped' };
  if (locked) return { ok: true, note: 'locked' }; // B traps by design on root/mid-transaction screens
  return { ok: false, note: 'b-inert' };
}

async function walkScreen(page, id) {
  await ensureFlightBaseline(page);
  if (!(await pushScreen(page, id))) return { id, pad: false, detail: 'open-failed' };
  await page.waitForTimeout(450); // mount + onShow + refresh + focus settle
  const f0 = await screenFacts(page, id);
  if (!f0.visible) return { id, pad: false, detail: 'not-visible' };
  if (f0.focusable === 0) return { id, pad: false, detail: 'no-focusable' };
  const dpad = await dpadProbe(page, id);
  const accept = await acceptProbe(page, id);
  // accept may have navigated away (a clicked child or a closing action) — re-open for the back test.
  if ((await shell(page)).top !== id) {
    await ensureFlightBaseline(page);
    if (!(await pushScreen(page, id))) return { id, pad: false, detail: 'reopen-failed' };
    await page.waitForTimeout(450);
  }
  const f1 = await screenFacts(page, id);
  const back = await backProbe(page, id, f1.locked);
  const pad = dpad.ok && accept.ok && back.ok;
  const verbs = [`dpad=${dpad.ok ? 'yes' : `no(moved:${dpad.moved},in:${dpad.inside},n:${dpad.focusable})`}`,
    `accept=${accept.ok ? 'yes' : 'no'}`,
    `back=${back.ok ? (back.note === 'locked' ? 'locked' : 'yes') : 'no'}`];
  return { id, pad, detail: pad ? verbs.join(' ') : verbs.join(' '), locked: f1.locked };
}

// The station app: dock for real, then drive the rail with LB/RB, dpad into the active tab,
// activate a control, and leave with B through the exit gate.
async function walkStation(page) {
  await ensureFlightBaseline(page);
  await page.evaluate(() => {
    const st = window.SF.state;
    const station = st.entityList.find((e) => e && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    window.SF.bus.emit('dock:docked', { stationId: station.data.stationId });
  });
  try {
    await page.waitForSelector('[data-screen="station"]', { timeout: 15000 });
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-screen="station"]');
      return root && root.style.display !== 'none';
    }, null, { timeout: 8000 });
  } catch {
    return { id: 'station', pad: false, detail: 'open-failed' };
  }
  await page.waitForTimeout(700);
  const f0 = await screenFacts(page, 'station');
  if (f0.focusable === 0) return { id: 'station', pad: false, detail: 'no-focusable' };

  const activeTab = () => page.evaluate(() => {
    const root = document.querySelector('[data-screen="station"]');
    if (!root) return null;
    const tabs = Array.from(root.querySelectorAll('[role="tab"][data-nav], [role="tab"][data-tab], .st-rail [data-tab]'));
    const t = tabs.find((el) => el.classList.contains('active') || el.getAttribute('aria-selected') === 'true') || tabs[0];
    return t ? (t.getAttribute('data-tab') || t.getAttribute('data-nav') || (t.textContent || '').trim()) : null;
  });

  const tab0 = await activeTab();
  await pressPad(page, BTN.tabNext);
  await page.waitForTimeout(300);
  const tab1 = await activeTab();
  await pressPad(page, BTN.tabPrev);
  await page.waitForTimeout(300);
  const tab2 = await activeTab();
  const tabsOk = !!(tab0 && tab1 && tab2 && tab1 !== tab0 && tab2 === tab0);

  const dpad = await dpadProbe(page, 'station');
  const accept = await acceptProbe(page, 'station');
  const back = await backProbe(page, 'station', false);
  const pad = tabsOk && dpad.ok && accept.ok && back.ok;
  const verbs = [`tabs=${tabsOk ? `yes(${tab0}->${tab1}->${tab2})` : `no(${tab0}->${tab1}->${tab2})`}`,
    `dpad=${dpad.ok ? 'yes' : `no(moved:${dpad.moved},in:${dpad.inside},n:${dpad.focusable})`}`,
    `accept=${accept.ok ? 'yes' : 'no'}`,
    `back=${back.ok ? 'yes' : `no(${back.note})`}`];
  return { id: 'station', pad, detail: verbs.join(' ') };
}

let server = null;
let browser = null;
try {
  server = await startServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ok */ }
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
    const pad = {
      id: 'SpaceFace Synthetic Pad (STANDARD GAMEPAD Vendor: 1640 Product: 1640)',
      index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons,
    };
    window.__sfSyntheticPad = pad;
    const get = () => [pad];
    try { Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: get }); }
    catch { try { navigator.getGamepads = get; } catch { /* unsupported */ } }
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e).slice(0, 160)));

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 30000 });
  await page.evaluate((seed) => { window.SF.bus.emit('game:new', { name: 'Pad Walk', seed }); }, SEED);
  await waitFlight(page);
  // Every modal screen registered on this route — the live manifest, not a hardcoded list.
  await page.waitForFunction(() => {
    const ui = window.SF.ctx.registry.get('ui');
    return !!(ui && ui.screenManager && ui._registeredScreens && ui._registeredScreens.size > 0);
  }, null, { timeout: 30000 });

  let ids = await page.evaluate(() => {
    const ui = window.SF.ctx.registry.get('ui');
    const mgr = ui.screenManager;
    return Array.from(ui._registeredScreens).filter((id) => mgr.hasScreen(id));
  });
  ids = ids.filter((id) => id !== 'station').sort();
  if (ONLY) ids = ids.filter((id) => ONLY.has(id));
  console.log(`seed=${SEED} manifest=${ids.length}+station${ONLY ? ` (only: ${[...ONLY].join(',')})` : ''}`);

  const results = [];
  for (const id of ids) {
    const r = await walkScreen(page, id);
    results.push(r);
    console.log(`SCREEN ${r.id} pad=${r.pad ? 'yes' : 'no'} ${r.pad ? '' : '(' + r.detail + ')'}`);
  }
  if (!ONLY || ONLY.has('station')) {
    const r = await walkStation(page);
    results.push(r);
    console.log(`SCREEN ${r.id} pad=${r.pad ? 'yes' : 'no'} ${r.pad ? '' : '(' + r.detail + ')'}`);
  }

  const failed = results.filter((r) => !r.pad);
  console.log(`\n${results.length - failed.length}/${results.length} screens pad=yes seed=${SEED}`);
  if (pageErrors.length) console.log(`page-errors(observed, not gated): ${pageErrors.length} — ${pageErrors[0] || ''}`);
  if (failed.length) {
    for (const f of failed) console.log(`FAIL ${f.id}: ${f.detail}`);
    process.exit(1);
  }
  console.log('ok gamepad screens: every listed screen accepts pad dpad/accept/back');
  process.exit(0);
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
} finally {
  try { if (browser) await browser.close(); } catch { /* ok */ }
  try { if (server) server.child.kill(); } catch { /* ok */ }
}
