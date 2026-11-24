#!/usr/bin/env node
// probe-runover-first-enter.mjs — DEMO-RUNOVER-1 diagnosis.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-runover-first-enter.mjs
//     [--out=dir] [--stamp=<id>] [--pressDelayMs=1000] [--watchMs=15000]
//
// Boots the real desktop build, starts a Swarm run from the title's focused door, flies badly
// until the ship dies, waits for the Run Over plate, then presses Enter (Again) ONCE with
// event-path instrumentation installed and records everything the press did or did not do:
//   - capture/bubble keydown probes at window / document / #screens / plate root, so a press
//     stopped mid-dispatch names the level it died at;
//   - click listeners on every Run Over button;
//   - a forwarding recorder on SF.bus.emit;
//   - a 200 ms timeline of mode / top screen / plate / focus / button state after each press.
// If the plate is still up after the first watch window, it re-focuses Again and presses Enter a
// second time (the stranger's press) under the same instrumentation.
//
// Read-only observer: it records and forwards, writes nothing to game state, and all input goes
// through the real keyboard. It asserts nothing; the report is the evidence.

import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { createIsolatedElectronLaunch } from './lib/electronTestIsolation.mjs';
import { provisionElectronRuntime } from './lib/electronRuntimeProvisioning.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';
import {
  answerFirstRunPrompt,
  dismissCinematicIntro,
  installFirstLightPromptHandler,
  readLoadError,
  readStartupFailure,
} from './player-truth/routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const STAMP = String(argv.stamp || new Date().toISOString().replace(/\.\d+Z$/, '').replace(/:/g, '-'));
const OUT = path.resolve(ROOT, String(argv.out || `.devshots/demo/runover-enter/${STAMP}`));
const PRESS_DELAY_MS = Number(argv.pressDelayMs || 1000);
const WATCH_MS = Number(argv.watchMs || 15000);
const SCENARIO = String(argv.scenario || 'wall'); // wall: rim death, keys held through the plate
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(`[runover-enter] ${s}`);
let app = null;
let iso = null;
let page = null;
let runtimeClosed = false;
let viewW = 1280;
let viewH = 720;
let pressAt = null;

const facts = {
  schema: 'spaceface.runoverEnterProbe.v1',
  packet: 'DEMO-RUNOVER-1',
  startedAt: new Date().toISOString(),
  stamp: STAMP,
  pressDelayMs: PRESS_DELAY_MS,
  watchMs: WATCH_MS,
  steps: [],
  presses: [],
  timeline: [],
  trace: [],
  busEvents: [],
  consoleErrors: [],
  times: {},
};
const rel = (ms = Date.now()) => (pressAt == null ? 0 : Math.round((ms - pressAt) / 100) / 10);
const step = (id, ok, detail) => {
  facts.steps.push({ id, ok: !!ok, detail: detail || null, at: Date.now(), t: rel() });
  log(`${ok ? 'ok ' : 'NO '} ${id}${detail ? ` - ${detail}` : ''}`);
};

let frameNo = 0;
async function shot(name) {
  if (!page || page.isClosed()) return null;
  frameNo += 1;
  const file = path.join(OUT, `${String(frameNo).padStart(2, '0')}-${String(name).toLowerCase().replace(/[^a-z0-9-]+/g, '-')}.png`);
  try {
    await page.screenshot({ path: file, timeout: 20_000 });
    return file;
  } catch (e) {
    log(`frame ${name} failed: ${e.message}`);
    return null;
  }
}

// ---------- scene reader (read-only) ----------
const readScene = () => page.evaluate(() => {
  const st = window.SF && window.SF.state;
  const visible = (node) => {
    if (!node || node.hidden) return false;
    const cs = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0.01
      && r.width > 1 && r.height > 1;
  };
  const sm = window.SF && window.SF.ctx && window.SF.ctx.screenManager;
  const top = sm && typeof sm.top === 'function' ? sm.top() : null;
  const me = st && st.entities ? st.entities.get(st.playerId) : null;
  const w2s = window.SF && window.SF.ctx && window.SF.ctx.helpers && window.SF.ctx.helpers.worldToScreen;
  const proj = (pos) => {
    if (!w2s || !pos) return null;
    try {
      const s = w2s(pos);
      if (!s) return null;
      return { x: Math.round(s.x), y: Math.round(s.y), onScreen: s.onScreen === true && s.behind !== true };
    } catch (_) { return null; }
  };
  let nearest = null;
  if (me && me.pos) {
    for (const e of st.entityList || []) {
      if (!e || e.alive === false || !e.pos || e.id === me.id) continue;
      const hostile = (e.team === 1 || e.team === 'hostile' || (e.data && e.data.hostile === true))
        && (e.type === 'ship' || e.type === 'drone');
      if (!hostile) continue;
      const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
      if (!nearest || d < nearest.d) nearest = { id: e.id, d: Math.round(d), screen: proj(e.pos) };
    }
  }
  const againEl = document.querySelector('.sf-runover [data-action="again"]');
  return {
    mode: st ? st.mode : null,
    phase: st && st.run ? st.run.phase : null,
    wave: st && st.run ? st.run.wave : null,
    top,
    player: me ? { alive: me.alive !== false, hull: me.hull, hullMax: me.hullMax } : null,
    nearest,
    stage: st && st.ui ? (st.ui.stageRequest && st.ui.stageRequest.scene) || null : null,
    modalOpen: document.body.classList ? document.body.classList.contains('ui-modal-open') : null,
    ui: {
      card: visible(document.querySelector('[data-pilot-cards]')),
      runOver: visible(document.querySelector('.sf-runover')),
      again: visible(againEl),
      againDisabled: againEl ? againEl.disabled === true : null,
      activeAction: document.activeElement ? (document.activeElement.dataset && document.activeElement.dataset.action) || document.activeElement.tagName : null,
      bootOverlay: visible(document.getElementById('boot-overlay')),
    },
  };
}).catch(() => null);

// ---------- keys ----------
const held = new Set();
async function keyDown(code) {
  if (held.has(code)) return;
  held.add(code);
  await page.keyboard.down(code).catch(() => {});
}
async function keyUp(code) {
  if (!held.has(code)) return;
  held.delete(code);
  await page.keyboard.up(code).catch(() => {});
}
async function releaseKeys() { for (const code of [...held]) await keyUp(code); }
let mouseLeftDown = false;
let mouseRightDown = false;
async function leftButton(on) {
  if (on && !mouseLeftDown) { mouseLeftDown = true; await page.mouse.down({ button: 'left' }).catch(() => {}); }
  else if (!on && mouseLeftDown) { mouseLeftDown = false; await page.mouse.up({ button: 'left' }).catch(() => {}); }
}
async function rightButton(on) {
  if (on && !mouseRightDown) { mouseRightDown = true; await page.mouse.down({ button: 'right' }).catch(() => {}); }
  else if (!on && mouseRightDown) { mouseRightDown = false; await page.mouse.up({ button: 'right' }).catch(() => {}); }
}
async function releaseAll() { await releaseKeys(); await leftButton(false); await rightButton(false); }
const clampPoint = (p) => ({ x: Math.max(4, Math.min(viewW - 4, p.x)), y: Math.max(4, Math.min(viewH - 4, p.y)) });
async function aimAt(point) {
  if (!point) return;
  await page.mouse.move(Math.round(point.x), Math.round(point.y), { steps: 2 }).catch(() => {});
}

// ---------- boot ----------
async function bootToTitleElectron() {
  installCspSafePlaywrightPolling(page);
  installFirstLightPromptHandler(page, (name, ok, detail) => step(name, ok, detail));
  await page.waitForLoadState('domcontentloaded', { timeout: 120_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, { timeout: 180_000 });
  const deadline = Date.now() + 180_000;
  for (;;) {
    const quote = await readLoadError(page);
    if (quote) throw new Error(quote);
    const failure = await readStartupFailure(page);
    if (failure) throw new Error(failure);
    const ready = await page.evaluate(() => {
      const el = document.querySelector('[data-screen="mainMenu"]');
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
    }).catch(() => false);
    if (ready) break;
    if (Date.now() > deadline) throw new Error('main menu did not appear within 180 s');
    await page.waitForTimeout(400);
  }
  await dismissCinematicIntro(page, (name, ok, detail) => step(name, ok, detail), { timeout: 30_000 });
  await answerFirstRunPrompt(page, (name, ok, detail) => step(name, ok, detail));
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-screen="mainMenu"] [data-action="swarm"]');
    if (!b) return false;
    return !b.disabled && b.getAttribute('aria-disabled') !== 'true' && b.getClientRects().length > 0;
  }, null, { timeout: 60_000 });
  step('title-ready', true, 'Swarm door usable on the title');
}

// ---------- the instrumented plate ----------
async function instrumentPlate() {
  return page.evaluate(() => {
    const T = window.__roTrace = [];
    const stamp = (where, phase) => (ev) => {
      try {
        const t = ev.target;
        T.push({
          at: Math.round(performance.now()),
          where,
          phase,
          type: ev.type,
          key: ev.key || null,
          code: ev.code || null,
          repeat: !!ev.repeat,
          target: t ? `${t.tagName || '?'}${t.dataset && t.dataset.action ? '.' + t.dataset.action : ''}` : 'null',
          defaultPrevented: !!ev.defaultPrevented,
        });
      } catch (e) { /* observation must never throw into the page */ }
    };
    const root = document.querySelector('[data-screen="crucibleResults"]');
    window.addEventListener('keydown', stamp('window', 'capture'), true);
    document.addEventListener('keydown', stamp('document', 'capture'), true);
    const screens = document.getElementById('screens');
    if (screens) screens.addEventListener('keydown', stamp('screens', 'capture'), true);
    if (root) root.addEventListener('keydown', stamp('plate-root', 'capture'), true);
    if (root) root.addEventListener('keydown', stamp('plate-root', 'bubble'));
    if (screens) screens.addEventListener('keydown', stamp('screens', 'bubble'));
    document.addEventListener('keydown', stamp('document', 'bubble'));
    window.addEventListener('keydown', stamp('window', 'bubble'));
    for (const b of document.querySelectorAll('.sf-runover button')) {
      b.addEventListener('click', () => {
        try {
          T.push({
            at: Math.round(performance.now()),
            where: 'click',
            phase: b.dataset.action || (b.textContent || '').trim(),
            target: b.tagName,
            disabled: b.disabled === true,
          });
        } catch (e) { /* observation must never throw into the page */ }
      });
    }
    const bus = window.SF && window.SF.bus;
    if (bus && typeof bus.emit === 'function' && !bus.__roPatched) {
      try {
        bus.__roPatched = true;
        const orig = bus.emit.bind(bus);
        window.__roEvents = [];
        bus.emit = (name, payload) => {
          try { window.__roEvents.push({ at: Math.round(performance.now()), name }); } catch (e) {}
          return orig(name, payload);
        };
      } catch (e) { /* a frozen bus just stays unrecorded */ }
    }
    return !!root;
  }).catch(() => false);
}

// ---------- one press + watch ----------
async function pressEnterAndWatch(label, refocus) {
  const focusBefore = await page.evaluate(() => document.activeElement
    ? (document.activeElement.dataset && document.activeElement.dataset.action) || document.activeElement.tagName
    : null).catch(() => null);
  if (refocus) {
    await page.evaluate(() => {
      const b = document.querySelector('.sf-runover [data-action="again"]');
      if (b && typeof b.focus === 'function') b.focus({ preventScroll: true });
    }).catch(() => {});
    await sleep(200);
  }
  const focusAtPress = await page.evaluate(() => document.activeElement
    ? (document.activeElement.dataset && document.activeElement.dataset.action) || document.activeElement.tagName
    : null).catch(() => null);
  const at = Date.now();
  await page.keyboard.press('Enter');
  const press = { label, at, t: rel(at), focusBefore, focusAtPress: refocus ? focusAtPress : focusBefore, timeline: [] };
  facts.presses.push(press);
  log(`press "${label}" (focus: ${press.focusAtPress})`);
  const deadline = at + WATCH_MS;
  let liveAt = null;
  while (Date.now() < deadline) {
    const snap = await readScene();
    if (!snap) { await sleep(200); continue; }
    press.timeline.push({
      dtMs: Date.now() - at,
      mode: snap.mode,
      phase: snap.phase,
      top: snap.top,
      runOver: !!snap.ui?.runOver,
      again: !!snap.ui?.again,
      againDisabled: snap.ui?.againDisabled,
      active: snap.ui?.activeAction,
      stage: snap.stage ?? null,
      modalOpen: snap.modalOpen ?? null,
      boot: !!snap.ui?.bootOverlay,
    });
    const live = !!(!snap.ui?.bootOverlay && !snap.top && snap.mode === 'flight' && snap.phase === 'active' && snap.player?.alive);
    if (live && liveAt == null) {
      liveAt = Date.now();
      press.liveAtMs = liveAt - at;
      step(`${label}-live`, true, `${((liveAt - at) / 1000).toFixed(1)} s after the press the new run was live`);
      await shot(`${label}-live`);
      break;
    }
    await sleep(200);
  }
  await shot(`${label}-after`);
  return liveAt != null;
}

// ---------- run ----------
async function runProbe() {
  provisionElectronRuntime({ root: ROOT });
  const { _electron: electron } = await loadPlaywright();
  if (!electron) throw new Error('this Playwright build has no _electron; cannot drive the desktop build');
  iso = createIsolatedElectronLaunch({
    root: ROOT,
    taskId: 'runover-enter',
    timeout: 180_000,
    baseEnv: {
      ...process.env,
      SPACEFACE_EVIDENCE_CONTENT_SIZE: '1280x720',
      SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1',
    },
  });
  log(`launching isolated Electron (${iso.mode})`);
  app = await electron.launch(iso.options);
  page = await app.firstWindow({ timeout: 120_000 });
  page.setDefaultTimeout(30_000);
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = String(m.text() || '');
    if (/Failed to load resource/i.test(text)) return;
    facts.consoleErrors.push({ t: rel(), at: Date.now(), text: text.slice(0, 600) });
  });
  page.on('pageerror', (e) => {
    facts.consoleErrors.push({ t: rel(), at: Date.now(), kind: 'pageerror', text: String(e?.message || e).slice(0, 600) });
  });

  await bootToTitleElectron();
  const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight })).catch(() => null);
  if (vp) { viewW = vp.w; viewH = vp.h; }
  await shot('title');

  // ONE PRESS: the Swarm door from the title.
  const focused = await page.evaluate(() => {
    const a = document.activeElement;
    return a ? (a.dataset && a.dataset.action) || null : null;
  }).catch(() => null);
  if (focused !== 'swarm') {
    await page.evaluate(() => {
      const b = document.querySelector('[data-screen="mainMenu"] [data-action="swarm"]');
      if (b && typeof b.focus === 'function') b.focus({ preventScroll: true });
    }).catch(() => {});
    await sleep(250);
  }
  pressAt = Date.now();
  facts.times.pressAt = new Date(pressAt).toISOString();
  await page.keyboard.press('Enter');
  step('swarm-press', true, 'Enter on the Swarm door');
  await shot('swarm-press');

  // Wait for live control.
  const liveDeadline = pressAt + 180_000;
  let live = false;
  while (Date.now() < liveDeadline) {
    const snap = await readScene();
    if (snap && !snap.ui?.bootOverlay && !snap.top && snap.mode === 'flight' && snap.phase === 'active' && snap.player?.alive) { live = true; break; }
    await sleep(300);
  }
  if (!live) throw new Error('live control never came after the door press');
  step('live-control', true, `${((Date.now() - pressAt) / 1000).toFixed(1)} s after the door press`);

  // Fly until the ship dies. Three scenario shapes:
  //  - fight: nose at the nearest body, thrust, never fire; release keys at death.
  //  - wall: fight-drive at the pack, then run for the room's rim and KEEP THE KEYS HELD
  //    through the plate — the state the demo probe's run was in.
  //  - fight-input: the original demo probe's own play shape — LMB fire bursts at the pack and
  //    RMB tap-throws at loose bodies — keys and mouse left wherever the death leaves them.
  let cardAt = 0;
  const liveAt = Date.now();
  const deathDeadline = Date.now() + 240_000;
  let deathAt = null;
  let wallPhase = false;
  let fireBurstOn = false;
  let nextThrowAt = Date.now() + 12_000;
  while (Date.now() < deathDeadline) {
    const snap = await readScene();
    if (!snap) { await sleep(200); continue; }
    if (snap.ui?.card && Date.now() - cardAt > 1200) {
      cardAt = Date.now();
      await releaseAll();
      await page.keyboard.press('Digit1');
      await sleep(600);
      continue;
    }
    const dead = snap.phase === 'ended' || (snap.mode === 'flight' && snap.player && snap.player.alive === false);
    if (dead && deathAt == null) {
      deathAt = Date.now();
      if (SCENARIO !== 'wall' && SCENARIO !== 'fight-input') await releaseAll();
      step('death', true, `${((deathAt - pressAt) / 1000).toFixed(1)} s after the door press`);
      await shot('death');
    }
    if (snap.ui?.runOver) break;
    if (!dead && snap.player?.alive) {
      const hostileAt = snap.nearest?.screen?.onScreen ? clampPoint(snap.nearest.screen) : null;
      if (SCENARIO === 'wall' && !wallPhase && Date.now() - liveAt > 40_000) wallPhase = true;
      const point = SCENARIO === 'wall' && wallPhase
        ? { x: viewW / 2, y: 40 }
        : (hostileAt || { x: viewW / 2, y: 40 });
      await aimAt(point);
      await keyDown('KeyW');
      if (SCENARIO === 'fight-input') {
        // Fire in bursts at whatever the nose points at, and tap the line at loose bodies the
        // way the demo probe throws: RMB down, short swing, RMB up.
        if (fireBurstOn && Date.now() % 1000 < 400) { await leftButton(false); fireBurstOn = false; }
        else if (!fireBurstOn && Date.now() % 1000 < 200 && hostileAt) { await leftButton(true); fireBurstOn = true; }
        if (Date.now() > nextThrowAt && hostileAt) {
          nextThrowAt = Date.now() + 9000;
          await rightButton(true);
          await sleep(450);
          await rightButton(false);
        }
      }
    } else if (SCENARIO !== 'wall' && SCENARIO !== 'fight-input') {
      await releaseKeys();
    }
    await sleep(180);
  }

  // Wait for the Run Over plate to settle.
  const plateDeadline = Date.now() + 30_000;
  let plateUp = false;
  while (Date.now() < plateDeadline) {
    const snap = await readScene();
    if (snap?.ui?.runOver) { plateUp = true; break; }
    await sleep(200);
  }
  if (!plateUp) throw new Error('the Run Over plate never appeared');
  step('run-over', true, 'plate visible');
  facts.runOverText = await page.evaluate(() => {
    const plate = document.querySelector('.sf-runover');
    return plate ? String(plate.innerText || '').slice(0, 600) : null;
  }).catch(() => null);
  facts.runOverButtons = await page.evaluate(() => Array.from(document.querySelectorAll('.sf-runover button'))
    .map((b) => ({ action: b.dataset.action || null, text: (b.textContent || '').trim().slice(0, 60), disabled: b.disabled === true })))
    .catch(() => []);

  const instrumented = await instrumentPlate();
  step('instrumented', instrumented, instrumented ? 'event probes installed' : 'PROBE INSTALL FAILED');

  // Let the plate settle exactly as long as the demo probe did before its press.
  await sleep(PRESS_DELAY_MS);
  await shot('plate-before-press');

  // FIRST press: exactly what a stranger does.
  const liveAfterFirst = await pressEnterAndWatch('first-enter', false);

  // If the plate swallowed it, the stranger presses again (refocusing the button first,
  // exactly like the demo probe does).
  if (!liveAfterFirst) {
    const snap = await readScene();
    if (snap?.ui?.runOver) {
      await sleep(1000);
      await pressEnterAndWatch('second-enter', true);
    } else {
      step('second-enter', false, `plate gone but no live run; mode ${snap?.mode} top ${snap?.top}`);
    }
  }

  facts.trace = await page.evaluate(() => (window.__roTrace || []).slice(0, 500)).catch(() => []);
  facts.busEvents = await page.evaluate(() => (window.__roEvents || []).filter((e) =>
    !/^toast$|^hud:firstUse$|^tutorial:say$|^onboarding:say$/.test(e.name)).slice(0, 300)).catch(() => []);
}

async function closeRuntime() {
  if (!app) return;
  const target = app;
  app = null;
  const pid = target.process()?.pid || null;
  try {
    await Promise.race([
      target.close(),
      new Promise((resolve) => setTimeout(resolve, 20_000)),
    ]);
    runtimeClosed = true;
    log('Electron closed');
  } catch (e) {
    log(`Electron close failed: ${e.message}`);
  }
  if (!runtimeClosed && pid) {
    try {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', timeout: 15_000 });
      log(`killed owned Electron pid ${pid}`);
    } catch (e) {
      log(`owned Electron kill failed: ${e.message}`);
    }
  }
}

async function main() {
  let failure = null;
  try {
    await runProbe();
  } catch (e) {
    failure = e;
    log(`FAILED ${e.stack || e.message}`);
    facts.error = String(e.message || e);
    if (page && !page.isClosed()) await shot('failure').catch(() => {});
  } finally {
    await releaseAll().catch(() => {});
    await closeRuntime().catch(() => {});
    if (iso) {
      try {
        if (runtimeClosed) iso.cleanup({ runtimeClosed: true });
        else log('isolated profile left in place: runtime close was not proven');
      } catch (e) {
        log(`profile cleanup failed: ${e.message}`);
      }
    }
    facts.finishedAt = new Date().toISOString();
    const reportPath = path.join(OUT, 'report.json');
    writeFileSync(reportPath, `${JSON.stringify(facts, null, 2)}\n`);
    log(`report ${path.relative(ROOT, reportPath)}`);
    if (facts.trace.length) {
      for (const row of facts.trace) {
        log(`trace +${(row.at / 1000).toFixed(2)}s ${row.where}/${row.phase} ${row.type || ''} ${row.key || ''}${row.repeat ? '(repeat)' : ''} target=${row.target} defaultPrevented=${row.defaultPrevented}`);
      }
    } else {
      log('trace EMPTY — the instrumented listeners saw no Enter keydown at all');
    }
    if (failure) process.exitCode = 1;
  }
}

await main();
