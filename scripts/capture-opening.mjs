#!/usr/bin/env node
// CAPTURE-FIRST-HALF-HOUR: one command that plays the opening of a mode the way a player does,
// and writes a folder of evidence a stranger's verdict can be read from.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/capture-opening.mjs \
//     --mode=adventure|swarm [--minutes=N] [--out=<dir>] [--seed=<n>]
//
// Boots the real game through public controls (routes.mjs), plays with trusted keyboard/mouse
// input only (never writes game state), and records frames/, trace.json, words.json,
// findings.json, summary.md and sheet.png under --out. Saves run in a disposable store, so the
// owner's real saves are never touched. No browser or server is left running on failure.

import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { launchChromium, keepHeadedWindowNormal, installSessionSignalGuard } from './player-truth/browser.mjs';
import { startBenchServer } from './lib/benchServer.mjs';
import { bootToMenu, adventureToFlight, crucibleToArmory, waitForPreparationLaunch,
  armoryLaunchWord, clickText, waitBootOverlayGone, waitUntilFlight, readLaunchedRunSeed, T } from './player-truth/routes.mjs';
import { simNow, fightBeat, cruiseBeat, noteKey } from './player-truth/driver.mjs';
import { awaitRoundHandoff } from './player-truth/run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- args ----------
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const MODE = String(argv.mode || 'adventure');
if (!['adventure', 'swarm'].includes(MODE)) throw new Error('--mode must be adventure or swarm');
const MINUTES = Number(argv.minutes ?? (MODE === 'adventure' ? 12 : 8));
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.resolve(String(argv.out || `.devshots/capture/${MODE}-${STAMP}`));
const SEED = argv.seed != null ? Number(argv.seed) : 4242;
// Swarm only: `quick` is the ordinary route (the title's Swarm door starts round 1); `door` walks
// the optional setup screen (Customize Swarm -> ship -> armory -> launch).
const SWARM_ROUTE = String(argv['swarm-route'] || 'quick');
mkdirSync(path.join(OUT, 'frames'), { recursive: true });

// ---------- banned-words guard ----------
// The packet points at scripts/check-plain-words.mjs, which does not exist yet (COPY-SWEEP was to
// create it). This is that packet's rule 1 + rule 2 list, word-boundary, case-insensitive.
const BANNED_WORDS = [
  'crucible', 'massline', 'mass seed', 'gyre', 'repulsor', 'aftermath', 'field response',
  'ignition', 'flare', 'nova', 'converged on', 'unknown weapon', '? unknown', 'stale',
  'too heavy', 'pressure %', 'cr/min', 'headroom', 'cap load', 'research points', 'bay screen',
  'station wire', 'banked into the hangar', 'ship fix', 'hdg', 'a verb every hour',
  'dev — sandbox', 'dev - sandbox',
  // power names and common words the sweep bans anyway; flagged but read by a human
  'well', 'seed', 'field', 'mixed', 'terrain',
];
const BANNED_RES = BANNED_WORDS.map((w) => ({
  word: w,
  re: new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i'),
}));
const BANNED_EXTRA = [
  { word: 'direct +N', re: /\bdirect\s*\+\s*\d+/i },
  { word: 'unit u/wu/u-s/k u', re: /\b(wu|u\/s|k u|u)\b/i },
];
const BAD_TOKENS = ['undefined', 'NaN', 'unbound', '${'];
function bannedHit(text) {
  for (const { word, re } of [...BANNED_RES, ...BANNED_EXTRA]) if (re.test(text)) return word;
  return null;
}
function badTokenHit(text) {
  for (const tok of BAD_TOKENS) if (text.includes(tok)) return tok;
  return null;
}

// ---------- run record ----------
const frames = [];        // {file, t, label, sim, step}
const trace = [];         // one row per sampled second
const words = new Map();  // text -> {text, step, t, frame}
const findings = [];      // mechanical stranger-trip findings
const steps = [];         // {id, ok, detail, startS, elapsedS}
const seenStandin = new Set();
const seenFindingKey = new Set();
let currentStep = 'boot';
let frameN = 0;
let lastFrameFile = null;
let pressesAtPlay = null;
let pressesNow = 0;
let menuReadyMs = null;
let flightReadyMs = null;
let navT0 = null;
let runSeed = null;
let page = null;
let browser = null;
let server = null;
let stopWindowTimer = null;
let sampleTimer = null;
let sessionOver = false;

const relOut = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const readPresses = () => page.evaluate(() => window.__cap?.presses || 0).catch(() => pressesNow);
const mmss = (t) => {
  const s = Math.max(0, Math.round(t / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}-${String(s % 60).padStart(2, '0')}`;
};

function addFinding(f) {
  const key = `${f.kind}|${f.key ?? ''}|${f.step ?? ''}|${f.text ?? ''}`;
  if (seenFindingKey.has(key)) return;
  seenFindingKey.add(key);
  findings.push({ t: Math.round(f.t ?? (navT0 ? Date.now() - navT0 : 0)), step: f.step ?? currentStep, frame: f.frame ?? lastFrameFile, ...f });
}

async function shoot(label, { boundary = true } = {}) {
  if (!page || page.isClosed()) return null;
  const t = Date.now() - navT0;
  let name = `${mmss(t)}-${String(label).replace(/[^a-z0-9-]+/gi, '_')}.png`;
  if (frames.some((f) => f.name === name)) name = name.replace(/\.png$/, `-${++frameN}.png`);
  const file = path.join(OUT, 'frames', name);
  try { await page.screenshot({ path: file }); } catch { return null; }
  const sim = await simNow(page).catch(() => null);
  frames.push({ name, file, t, sim, label, step: currentStep });
  lastFrameFile = `frames/${name}`;
  return lastFrameFile;
}

// ---------- per-second collection ----------
let collecting = false;
async function collectOnce() {
  if (collecting || !page || page.isClosed()) return;
  collecting = true;
  try { return await collectOnceInner(); } finally { collecting = false; }
}
async function collectOnceInner() {
  const d = await page.evaluate(() => {
    const c = window.__cap || {};
    return {
      samples: (c.samples || []).splice(0),
      freezes: (c.freezes || []).splice(0),
      worst: (c.worst || []).slice(0, 40),
      presses: c.presses || 0,
    };
  }).catch(() => null);
  if (!d) return;
  pressesNow = d.presses;
  for (const row of d.samples) {
    row.step = currentStep;
    trace.push(row);
    if (row.fps != null && row.fps < 30) {
      addFinding({ kind: 'low-fps', key: `s${row.t}`, text: `${row.fps} fps`, t: row.t });
    }
    for (const s of row.standIns?.list || []) {
      if (s.ageS > 3 && !seenStandin.has(s.id)) {
        seenStandin.add(s.id);
        addFinding({ kind: 'standin', key: String(s.id), t: row.t,
          text: `stand-in ${s.def || s.id} on screen ${s.ageS}s${s.d != null ? ` at ${s.d}m` : ''}` });
      }
    }
    if (row.freezeLane === true) {
      addFinding({ kind: 'freeze', key: `lane${row.t}`, t: row.t, text: 'worker lane freezeActive' });
    }
  }
  for (const f of d.freezes) {
    addFinding({ kind: 'freeze', key: `still${Math.round(f.t)}`, t: f.t,
      text: `no entity moved for ${Math.round(f.ms)}ms while frames ran` });
  }
  // word walk: every distinct visible text item, once a second
  const visible = await page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = null;
    while ((node = walker.nextNode()) && out.length < 500) {
      const text = String(node.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (text.length < 2 || text.length > 400) continue;
      const el = node.parentElement;
      if (!el) continue;
      const vis = typeof el.checkVisibility === 'function'
        ? el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: false })
        : !!el.offsetParent;
      if (!vis) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility !== 'visible' || Number(cs.opacity) < 0.05) continue;
      out.push(text.slice(0, 240));
    }
    return out;
  }).catch(() => []);
  for (const text of visible) {
    if (!words.has(text)) {
      words.set(text, { text, step: currentStep, t: Date.now() - navT0, frame: lastFrameFile });
      const banned = bannedHit(text);
      if (banned) addFinding({ kind: 'banned-word', key: `w${words.size}`, text: `"${text.slice(0, 140)}" matches banned "${banned}"` });
      const tok = badTokenHit(text);
      if (tok) addFinding({ kind: 'bad-token', key: `t${words.size}`, text: `"${text.slice(0, 140)}" contains "${tok}"` });
    }
  }
  // worst frame-time shots: take a frame when a gap enters the current top ten, max ten
  const done = worstShotDone;
  const top = d.worst.slice().sort((a, b) => b.ms - a.ms).slice(0, 10);
  for (const cand of top) {
    if (done.has(cand.t) || worstShots.length >= 10) continue;
    done.add(cand.t);
    const f = await shoot(`worst-${Math.round(cand.ms)}ms`, { boundary: false });
    if (f) worstShots.push({ t: cand.t, ms: cand.ms, file: f });
    break; // one screenshot per second bounds the cost
  }
}
const worstShotDone = new Set();
const worstShots = [];

// ---------- step runner ----------
async function runStep(id, fn) {
  currentStep = id;
  const start = Date.now();
  const rec = { id, ok: true, detail: '', startS: (start - navT0) / 1000 };
  await shoot(id);
  try {
    rec.detail = String(await fn() ?? '');
  } catch (error) {
    rec.ok = false;
    rec.detail = String(error?.message || error).slice(0, 300);
    const frame = await shoot(`${id}-fail`, { boundary: false });
    addFinding({ kind: 'step', key: id, text: `step "${id}" failed: ${rec.detail}`, frame });
  }
  rec.elapsedS = (Date.now() - start) / 1000;
  steps.push(rec);
  console.log(`[capture] ${rec.ok ? 'ok  ' : 'FAIL'} ${id} ${rec.elapsedS.toFixed(1)}s${rec.detail ? ` — ${rec.detail}` : ''}`);
}

const deadlineHit = (deadline) => Date.now() > deadline;

// ---------- shared readers (observer only) ----------
const readNav = () => page.evaluate(async () => {
  const st = window.SF?.state;
  const me = st?.entities?.get(st.playerId) || st?.entityList?.find((e) => e.id === st.playerId);
  if (!st || !me?.pos) return null;
  const { resolveWaypointPresentationPosition } = await import('/src/ui/navigationWaypoint.js');
  const w = st.nav?.waypoint;
  const pos = w ? resolveWaypointPresentationPosition(st, w) : null;
  const dx = pos ? pos.x - me.pos.x : 0; const dz = pos ? pos.z - me.pos.z : 0;
  let rel = pos ? Math.atan2(dz, dx) - me.rot : 0;
  while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
  return { label: w?.label || null, d: pos ? Math.hypot(dx, dz) : null, rel, pos };
}).catch(() => null);

const nearestEntity = (types, excludeIds = null) => page.evaluate(({ want, skip }) => {
  const st = window.SF?.state;
  const me = st?.entities?.get(st.playerId) || st?.entityList?.find((e) => e.id === st.playerId);
  if (!st || !me?.pos) return null;
  let best = null; let bd = Infinity;
  for (const e of st.entityList || []) {
    if (!e || e.id === me.id || (skip && skip.includes(e.id)) || e.alive === false || !e.pos) continue;
    if (!want.includes(e.type)) continue;
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) return null;
  let rel = Math.atan2(best.pos.z - me.pos.z, best.pos.x - me.pos.x) - me.rot;
  while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
  const scr = window.SF.ctx?.helpers?.worldToScreen?.(best.pos) || null;
  return { id: best.id, type: best.type, d: bd, rel, pos: { x: best.pos.x, z: best.pos.z }, screen: scr };
}, { want: types, skip: excludeIds ? [...excludeIds] : null }).catch(() => null);

// Nearest hostile within `within` metres, or null. Observer only.
const readHostile = (within = 900) => page.evaluate((limit) => {
  const st = window.SF?.state;
  const me = st?.entities?.get(st.playerId);
  if (!st || !me?.pos) return null;
  let best = null; let bd = limit;
  for (const e of st.entityList || []) {
    if (!e || e.alive === false || e.id === me.id || !e.pos) continue;
    if (e.type !== 'ship' && e.type !== 'drone') continue;
    const d = e.data || {};
    const hostile = d.runRole === 'enemy' || d.runRole === 'hostile'
      || !!(d.ai && (d.ai.huntPlayer || d.ai.forcePlayerTarget))
      || (e.team !== me.team && e.team !== 0 && e.team !== 2);
    if (!hostile) continue;
    const dist = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (dist < bd) { bd = dist; best = { id: e.id, d: dist }; }
  }
  return best;
}, within).catch(() => null);

const readFlight = () => page.evaluate(() => {
  const st = window.SF?.state;
  const me = st?.entities?.get(st?.playerId);
  return {
    mode: st?.mode, top: window.SF?.ctx?.screenManager?.top?.() ?? null,
    docked: !!st?.ui?.docked, dockInRange: !!st?.ui?.dockInRange,
    speed: me?.vel ? Math.hypot(me.vel.x || 0, me.vel.z || 0) : 0,
    alive: me ? me.alive !== false : false,
    hull: me?.hullMax ? me.hull / me.hullMax : null,
    cargo: st?.player?.cargo ? { used: st.player.cargo.usedVolume, items: Object.keys(st.player.cargo.items || {}).length } : null,
    savedAt: st?.meta?.lastSavedAt ?? null,
    run: st?.run ? { phase: st.run.phase, wave: st.run.wave } : null,
  };
}).catch(() => null);

// A stranger steers the way the active scheme says: in Standard (the default since R17) the nose
// follows the mouse, so the bot puts the cursor out ahead toward the target; in Pilot/Classic
// A/D turn the hull.
async function turnToward(rel) {
  const aimPoint = await page.evaluate((r) => {
    const st = window.SF?.ctx?.state;
    if ((st?.settings?.gameplay?.controlScheme || 'helm-assist') !== 'helm-assist') return null;
    const me = st?.entities?.get?.(st.playerId);
    if (!me?.pos) return null;
    const a = (me.rot || 0) + r;
    const p = window.SF.ctx?.helpers?.worldToScreen?.({ x: me.pos.x + Math.cos(a) * 260, y: 0, z: me.pos.z + Math.sin(a) * 260 });
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
  }, rel).catch(() => null);
  if (aimPoint) { await page.mouse.move(Math.round(aimPoint.x), Math.round(aimPoint.y), { steps: 2 }); return; }
  if (!(Math.abs(rel) > 0.12)) return;
  const code = rel > 0 ? 'KeyD' : 'KeyA';
  noteKey(page, code);
  await page.keyboard.press(code, { delay: Math.min(90, Math.abs(rel) / 4.5 * 1000) });
}

async function steerTo(readFn, { within = 200, budgetMs = 90000, deadline, done = null } = {}) {
  const t0 = Date.now();
  await page.keyboard.down('KeyW');
  try {
    while (Date.now() - t0 < budgetMs && !deadlineHit(deadline)) {
      const s = await readFn();
      if (!s) return { ok: false, why: 'target lost' };
      if (done && done(s)) return { ok: true, s };
      if (!done && s.d != null && s.d <= within) return { ok: true, s };
      if (Number.isFinite(s.rel)) await turnToward(s.rel);
      await page.waitForTimeout(220);
    }
    return { ok: false, why: deadlineHit(deadline) ? 'session time limit' : 'steer timeout' };
  } finally {
    for (const k of ['KeyW', 'KeyA', 'KeyD', 'KeyS']) await page.keyboard.up(k).catch(() => {});
  }
}

async function aimAt(screen) {
  if (!screen || screen.onScreen !== true || screen.behind) return false;
  await page.mouse.move(Math.round(screen.x), Math.round(screen.y), { steps: 2 });
  return true;
}

async function tetherCode() {
  return page.evaluate(async () => {
    const { resolveActionCodes } = await import('/src/systems/input.js');
    const codes = resolveActionCodes(window.SF.state, 'tether') || [];
    return codes.find((c) => !/^mouse/i.test(c)) || codes[0] || 'Space';
  }).catch(() => 'Space');
}

// ---------- adventure steps ----------
async function stepLook(deadline) {
  const left = Math.min(20000, deadline - Date.now());
  if (left > 0) await sleep(left);
  return `watched ${(left / 1000).toFixed(0)}s with no input`;
}

async function stepFlyToObjective(deadline) {
  const r = await steerTo(readNav, { within: 220, budgetMs: 120000, deadline });
  const nav = await readNav();
  if (!r.ok && !(nav && nav.d != null && nav.d < 400)) throw new Error(`could not reach objective${nav?.label ? ` "${nav.label}"` : ''}: ${r.why}`);
  return `reached ${nav?.label || 'objective'} at ${nav?.d != null ? Math.round(nav.d) : '?'}m`;
}

// Bring the nearest rock onto the gameplay canvas, then aim at its painted position.
// A W-held approach can overshoot and slide the rock back off-screen — retry the approach.
async function aimNearestRock(deadline, { within = 220, excludeIds = null } = {}) {
  const read = () => nearestEntity(['asteroid', 'wreck'], excludeIds);
  let rock = await read();
  if (!rock) return null;
  for (let pass = 0; pass < 3; pass++) {
    if (rock.screen && rock.screen.onScreen === true && !rock.screen.behind && rock.d < 600) {
      return { ...rock, aimed: await aimAt(rock.screen) };
    }
    await steerTo(read, {
      within, budgetMs: 45000, deadline,
      done: (s) => s.screen && s.screen.onScreen === true && !s.screen.behind && s.d < 450,
    });
    // bleed approach speed so the rock does not slide past while we point the mouse
    const f = await readFlight();
    if (f && f.speed > 40) { noteKey(page, 'KeyS'); await page.keyboard.press('KeyS', { delay: 500 }); }
    rock = await read();
  }
  if (!rock || !rock.screen || rock.screen.onScreen !== true || rock.screen.behind) return rock ? { ...rock, aimed: false } : null;
  return { ...rock, aimed: await aimAt(rock.screen) };
}

async function stepPowersOnRock(deadline) {
  const rock = await aimNearestRock(deadline);
  if (!rock) throw new Error('no rock on the field to aim powers at');
  if (!rock.aimed) throw new Error(`rock at ${Math.round(rock.d)}m never reached the gameplay canvas`);
  const fired = [];
  for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']) {
    // keep the aim on the rock as it drifts
    const fresh = await nearestEntity(['asteroid', 'wreck']);
    if (fresh?.screen?.onScreen) await aimAt(fresh.screen);
    noteKey(page, code);
    await page.keyboard.press(code);
    fired.push(code.slice(-1));
    await page.waitForTimeout(1100);
  }
  return `aimed at ${rock.type} ${Math.round(rock.d)}m, pressed powers ${fired.join(',')}`;
}

async function stepLineLatchThrow(deadline) {
  const code = await tetherCode();
  const rock = await aimNearestRock(deadline, { within: 420 });
  if (!rock) throw new Error('no rock to latch');
  if (!rock.aimed) throw new Error(`rock at ${Math.round(rock.d)}m never reached the gameplay canvas`);
  // Latch: the ordinary Line verb is RMB at the aim (F is its keyboard seat). Watch the real
  // attach state (player.tether / combat.attachments.byId), not a DOM count.
  let cx = Math.round(rock.screen.x); let cy = Math.round(rock.screen.y);
  for (const attempt of ['mouse', 'key']) {
    const fresh = await nearestEntity(['asteroid', 'wreck']);
    if (fresh?.screen?.onScreen && !fresh.screen.behind) {
      cx = Math.round(fresh.screen.x); cy = Math.round(fresh.screen.y);
    }
    await page.mouse.move(cx, cy, { steps: 2 });
    if (attempt === 'mouse') await page.mouse.click(cx, cy, { button: 'right' });
    else { noteKey(page, code); await page.keyboard.press(code); }
    const attached = await page.waitForFunction(() => {
      const st = window.SF?.state;
      const t = st?.player?.tether;
      const byId = st?.combat?.attachments?.byId;
      const n = byId ? (byId.size ?? Object.keys(byId).length) : 0;
      if (t && (t.count > 0 || t.phase === 'latched' || t.phase === 'thrown' || t.phase === 'carry')) return true;
      if (n > 0) return true;
      for (const sel of ['.orr-cluster__payload', '#sf-tetherstat']) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent && getComputedStyle(el).visibility === 'visible') return true;
      }
      return false;
    }, null, { timeout: 7000 }).then(() => true, () => false);
    if (attached) break;
    if (attempt === 'key') throw new Error(`Line never latched onto the rock (RMB/${code})`);
  }
  // Throw: hold the Line into line control, fling the aim, release.
  await page.mouse.move(cx, cy, { steps: 2 });
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(250);
  await page.mouse.move(cx + 260, cy - 80, { steps: 8 });
  await page.waitForTimeout(320);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(600);
  return `latched and threw rock ${Math.round(rock.d)}m with the Line (RMB/${code})`;
}

// Open the context wheel on Q and set a latch slice's on/off. The latch truth the wheel's own
// lamps read is state.input.wheelLatches[action] — observe it; click the slice face only when
// it disagrees with what we want.
async function toggleWheel(action, wantOn, { waitVisible = true } = {}) {
  const latchState = () => page.evaluate((a) => !!(window.SF?.state?.input?.wheelLatches?.[a]), action)
    .catch(() => null);
  if (!waitVisible) {
    const cur = await latchState();
    if (cur !== null && cur === wantOn) return true;
  }
  const wheel = page.locator('#sf-context-wheel');
  const face = page.locator(`#sf-context-wheel [data-action="${action}"] .sf-cwheel__face`);
  for (let attempt = 0; attempt < 2; attempt++) {
    await wheel.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    noteKey(page, 'KeyQ');
    await page.keyboard.down('KeyQ');
    try {
      try { await face.waitFor({ state: 'visible', timeout: 4500 }); }
      catch (error) { if (attempt === 0) continue; throw error; }
      const on = (await latchState()) === true;
      if (on !== wantOn) {
        const box = await face.boundingBox();
        if (!box) throw new Error(`${action} slice had no box`);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(120);
      return (await latchState()) === wantOn;
    } finally { await page.keyboard.up('KeyQ'); }
  }
  throw new Error(`context wheel did not open for ${action}`);
}

const toggleMine = (page, wantOn) => toggleWheel('aimedMine', wantOn);

// The beam's own truth: the rock the mining system locked, or null while it scans.
const readMiningLock = () => page.evaluate(() => {
  const st = window.SF?.state;
  return st?.player?.miningTargetId ?? null;
}).catch(() => null);

async function stepMine(deadline) {
  const have = await readFlight();
  const before = have?.cargo?.used ?? 0;
  if (before > 0) return `hold already carried ${Math.round(before)}u³`;
  await toggleMine(page, true);
  const t0 = Date.now();
  let picked = false; let lockedNote = null;
  const deadRocks = new Set();
  try {
    while (Date.now() - t0 < 75000 && !deadlineHit(deadline)) {
      const rock = await aimNearestRock(deadline, { excludeIds: deadRocks });
      if (!rock) break;
      if (!rock.aimed) {
        // never got a rock onto the canvas — close the range and try again
        await steerTo(() => nearestEntity(['asteroid'], deadRocks), { within: 200, budgetMs: 20000, deadline });
        continue;
      }
      if (!picked) {
        // a deliberate RMB pick names the rock to the beam (worldObjectTargetId), exactly the
        // gesture a player makes; a Line latch on the same rock counts as a target too.
        await page.mouse.click(Math.round(rock.screen.x), Math.round(rock.screen.y), { button: 'right' });
        picked = true;
      }
      // wait for the beam's own lock, then for the hold to gain ore
      const lockWait = Date.now();
      let lockedId = null; let lockedAt = null;
      while (Date.now() - lockWait < 24000 && !deadlineHit(deadline)) {
        const lock = await readMiningLock();
        if (lock != null) { lockedId = lock; lockedAt = lockedAt ?? Date.now(); lockedNote = `beam locked ${lock}`; }
        const now = await readFlight();
        if ((now?.cargo?.used ?? 0) > before) {
          return `mined until hold carried ${Math.round(now.cargo.used)}u³`;
        }
        // a lock that yields nothing for ~10s is a dud rock (mined out / not ore) — drop it
        if (lockedId != null && Date.now() - lockedAt > 10000) {
          deadRocks.add(lockedId); picked = false; lockedNote = `lock ${lockedId} gave no ore`;
          break;
        }
        // no lock at all for ~8s — pick again on the next pass
        if (lockedId == null && Date.now() - lockWait > 8000) break;
        // keep the aim on the drifting rock while the beam works
        const fresh = await nearestEntity(['asteroid', 'wreck'], deadRocks);
        if (fresh?.screen?.onScreen && !fresh.screen.behind) await aimAt(fresh.screen);
        await page.waitForTimeout(1200);
      }
      // beam never bit or a dud — pick/aim a different rock next pass, then steer closer
      picked = false;
      await steerTo(() => nearestEntity(['asteroid'], deadRocks), { within: 160, budgetMs: 20000, deadline });
    }
    const now = await readFlight();
    if ((now?.cargo?.used ?? 0) > before) return `mined until hold carried ${Math.round(now.cargo.used)}u³`;
    throw new Error(`mined ${Math.round((Date.now() - t0) / 1000)}s (${lockedNote || 'beam never locked a rock'}) — hold still empty`);
  } finally {
    await toggleMine(page, false).catch(() => {});
  }
}

// Nearest DOCKABLE station (data.stationId, not a gate) plus the corridor/berth geometry the
// real dock:range gate uses — resolved through the same public manifest math as core physics.
// Returns the mouth point (the on-axis entry a pilot flies to first), the berth anchor, the
// corridor phase the game's own classifier computes, speed and the live prompt. Observer only.
const readStation = () => page.evaluate(async () => {
  const st = window.SF?.state;
  const me = st?.entities?.get(st?.playerId);
  if (!st || !me?.pos) return null;
  const { resolveCollisionProxyManifest, resolveDockAnchor, resolveCorridorAxisWorld,
    corridorStateFor, proxyScaleFor } = await import('/src/data/collisionProxyManifests.js');
  let best = null; let bd = Infinity;
  for (const e of st.entityList || []) {
    if (!e || e.alive === false || e.type !== 'station' || !e.pos) continue;
    const data = e.data || {};
    if (data.isGate || !data.stationId) continue;
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) return null;
  const speed = me.vel ? Math.hypot(me.vel.x || 0, me.vel.z || 0) : 0;
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const to = (p) => {
    const dx = p.x - me.pos.x; const dz = p.z - me.pos.z;
    return { d: Math.hypot(dx, dz), rel: wrap(Math.atan2(dz, dx) - (me.rot ?? me.yaw ?? 0)) };
  };
  const out = {
    speed, centerD: bd, name: best.data?.name || best.data?.stationName || best.data?.stationId || 'station',
    inRange: !!st.ui?.dockInRange, docked: !!st.ui?.docked,
    radius: ((best.data?.dockRadius || best.radius || 80) + (me.radius || 0)) * 1.5,
    gate: 55, kind: 'radius', phase: null,
  };
  const manifest = resolveCollisionProxyManifest(best);
  if (manifest && manifest.docking) {
    const anchor = resolveDockAnchor(best, manifest, me);
    const axis = resolveCorridorAxisWorld(best, manifest);
    const scale = proxyScaleFor(best, manifest);
    const mouthR = (manifest.docking.corridor?.mouthRadius ?? 1.35) * scale;
    const mouth = { x: best.pos.x + axis.x * mouthR * 1.15, z: best.pos.z + axis.z * mouthR * 1.15 };
    const corridor = corridorStateFor(manifest, best, me.pos, me.vel);
    Object.assign(out, {
      kind: anchor?.kind || 'berth', gate: anchor?.speedGate ?? 12, radius: anchor?.dockRadius ?? 20,
      captureGate: manifest.docking.capture?.speedGate ?? 26,
      corridorGate: manifest.docking.corridor?.speedGate ?? 55,
      phase: corridor?.phase || null, inCorridor: corridor?.inCorridor === true,
      inCapture: corridor?.inCapture === true, headingOk: corridor?.headingOk !== false,
      mouth, mouthD: to(mouth).d, mouthRel: to(mouth).rel,
      berth: anchor ? { x: anchor.x, z: anchor.z } : null,
      berthD: anchor ? to(anchor).d : bd, berthRel: anchor ? to(anchor).rel : to(best.pos).rel,
      centerRel: to(best.pos).rel,
    });
  } else {
    const c = to(best.pos);
    Object.assign(out, { berthD: c.d, berthRel: c.rel, centerRel: c.rel, d: c.d });
  }
  return out;
}).catch(() => null);

async function stepDock(deadline) {
  // Dock the way the station is built: line up on the corridor mouth, ride the lane inbound
  // under the capture gate, then let the deck's own capture assist park the hull — the public
  // dock prompt lives inside the berth radius at ≤ the berth speed gate, and E takes it.
  const t0 = Date.now();
  const held = new Set();
  const hold = async (code, want) => {
    if (want && !held.has(code)) { noteKey(page, code); await page.keyboard.down(code); held.add(code); }
    else if (!want && held.has(code)) { await page.keyboard.up(code).catch(() => {}); held.delete(code); }
  };
  const tryDock = async () => {
    noteKey(page, 'KeyE');
    await page.keyboard.press('KeyE');
    return page.waitForFunction(() => !!window.SF?.state?.ui?.docked
      || window.SF?.ctx?.screenManager?.top?.() === 'station', null, { timeout: 6000 })
      .then(() => true, () => false);
  };
  try {
    while (Date.now() - t0 < 150000 && !deadlineHit(deadline)) {
      const s = await readStation();
      if (!s) { await hold('KeyW', false); await hold('KeyS', false); await sleep(400); continue; }
      if (s.docked) return 'docked';
      if (s.inRange || (s.berthD != null && s.berthD <= s.radius * 1.5 && s.speed <= s.gate)) {
        await hold('KeyW', false); await hold('KeyS', false);
        if (s.inRange) {
          if (await tryDock()) return `docked on E at ${s.name}`;
          throw new Error('pressed E with the dock prompt live — station screen never opened');
        }
        // in the pocket and slow but the prompt has not lit yet — a player taps E and waits
        noteKey(page, 'KeyE');
        await page.keyboard.press('KeyE');
        await sleep(500);
        continue;
      }
      const inLane = s.inCorridor || s.inCapture || s.phase === 'corridor' || s.phase === 'capture' || s.phase === 'berthed';
      // Overspeed a player fixes with the wheel's Full Stop latch — reverse thrust alone
      // cannot bleed a burn/cruise approach. Latch it on whenever we are well over target.
      const nearGate = inLane ? (s.captureGate ?? 20) : Math.min(160, Math.max(12, (s.mouthD ?? s.d ?? 400) * 0.12));
      const needHardBrake = s.speed > Math.max(30, nearGate * 1.4);
      const brakingNow = await page.evaluate(() => !!(window.SF?.state?.input?.wheelLatches?.brake)).catch(() => false);
      if (needHardBrake !== brakingNow) {
        await hold('KeyW', false); await hold('KeyS', false);
        await toggleWheel('brake', needHardBrake).catch(() => {});
      }
      if (needHardBrake) { await sleep(300); continue; }
      if (inLane) {
        // ride the lane: nose to the berth, speed under the capture gate — the PD assist
        // does the rest; extra thrust past the gate only fights it
        if (Number.isFinite(s.berthRel) && Math.abs(s.berthRel) > 0.15) {
          await turnToward(s.berthRel);
        }
        const cap = s.captureGate ?? 20;
        await hold('KeyS', s.speed > cap * 0.9);
        await hold('KeyW', s.berthD > s.radius * 2.5 && s.speed < cap * 0.5);
      } else {
        // outside the mouth: point at the on-axis entry and keep speed under the corridor gate
        const rel = s.mouthRel ?? s.centerRel;
        if (Number.isFinite(rel) && Math.abs(rel) > 0.12) {
          await turnToward(rel);
        }
        // far-field cruise is fast — a player holds W; shed speed only near the mouth
        await hold('KeyS', s.speed > nearGate);
        await hold('KeyW', s.speed <= nearGate);
      }
      if (Math.round((Date.now() - t0) / 5000) !== Math.round((Date.now() - t0 - 250) / 5000)) {
        const extra = await page.evaluate(() => ({
          travel: window.SF?.state?.player?.travelDrive?.state || null,
          brakeLatch: !!window.SF?.state?.input?.wheelLatches?.brake,
        })).catch(() => ({}));
        console.log(`[dock] phase=${s.phase || 'radius'} mouth ${s.mouthD?.toFixed(0) ?? '-'}m berth ${s.berthD?.toFixed(0) ?? s.d?.toFixed(0) ?? '-'}m v${s.speed.toFixed(0)}${s.inCorridor ? ' inCorridor' : ''}${s.inCapture ? ' inCapture' : ''}${extra.travel ? ` travel=${extra.travel}` : ''}${extra.brakeLatch ? ' FULLSTOP' : ''}`);
      }
      await sleep(250);
    }
    const last = await readStation();
    throw new Error(`never reached dock range at the nearest station (phase ${last?.phase || '?'} berth ${last?.berthD?.toFixed(0) ?? '?'}m v${last?.speed?.toFixed(0) ?? '?'} · ${deadlineHit(deadline) ? 'session limit' : 'steer timeout'})`);
  } finally {
    for (const c of [...held]) await page.keyboard.up(c).catch(() => {});
  }
}

async function stationNav(id, waitS = 1200) {
  const tile = page.locator(`[data-nav="${id}"]`).first();
  if (!await tile.isVisible().catch(() => false)) return `door ${id}: no rail control`;
  await tile.click();
  await page.waitForTimeout(waitS);
  const head = await page.evaluate(() => {
    const h = document.querySelector('#screens .k-title, #screens h1, #screens h2');
    return h ? h.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : null;
  }).catch(() => null);
  return `door ${id}: ${head || 'opened'}`;
}

async function clickFirstVisible(page, selectors) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false) && await el.isEnabled().catch(() => false)) {
      const text = await el.textContent().catch(() => '');
      await el.click();
      return text.replace(/\s+/g, ' ').trim().slice(0, 80);
    }
  }
  return null;
}

async function stepStation() {
  // The hub mounts after ui.docked latches — wait for the door rail to exist first.
  const railUp = await page.waitForSelector('[data-nav]', { timeout: 15000 }).then(() => true, () => false);
  if (!railUp) throw new Error('station door rail never appeared after docking');
  const notes = [];
  const doors = ['market', 'shipworks', 'industry', 'contracts', 'factions', 'bar', 'ledger'];
  for (const d of doors) notes.push(await stationNav(d));
  const opened = notes.filter((n) => !n.includes('no rail control')).length;
  if (!opened) throw new Error('never inside the station — no door to open');
  // sell the ore: Market → Sell view → a held row → the Sell commit
  await stationNav('market');
  let sold = null;
  const sellMode = await clickFirstVisible(page, ['#screens [data-mode="sell"]', '#screens button:has-text("Sell")']);
  if (sellMode) {
    await page.waitForTimeout(600);
    const row = await clickFirstVisible(page, ['#screens .sx-mkt-row:not(.is-empty)', '#screens [data-cmdty]', '#screens .sx-row']);
    if (row) {
      await page.waitForTimeout(500);
      sold = await clickFirstVisible(page, ['#screens .sx-trade__go--sell', '#screens button:has-text("Sell")']);
    }
  }
  notes.push(sold ? `sold ore ("${sold}")` : 'sell: no working Sell control found');
  // buy one thing
  let bought = null;
  const buyMode = await clickFirstVisible(page, ['#screens [data-mode="buy"]', '#screens button:has-text("Buy")']);
  if (buyMode) {
    await page.waitForTimeout(600);
    const row = await clickFirstVisible(page, ['#screens .sx-mkt-row:not(.is-empty)', '#screens [data-cmdty]', '#screens .sx-row']);
    if (row) {
      await page.waitForTimeout(500);
      bought = await clickFirstVisible(page, ['#screens .sx-trade__go--buy', '#screens button:has-text("Buy")']);
    }
  }
  notes.push(bought ? `bought ("${bought}")` : 'buy: no working Buy control found');
  // take one job
  await stationNav('contracts');
  let job = await clickFirstVisible(page, ['#screens .sx-ct-commit[data-accept]', '#screens button:has-text("Accept")', '#screens [data-accept]']);
  if (!job) {
    await clickFirstVisible(page, ['#screens .sx-job', '#screens .sx-ct-job', '#screens .sx-row']);
    await page.waitForTimeout(500);
    job = await clickFirstVisible(page, ['#screens .sx-ct-commit[data-accept]', '#screens button:has-text("Accept")', '#screens [data-accept]']);
  }
  notes.push(job ? `took job ("${job}")` : 'job: no Accept control found');
  return notes.join(' · ');
}

async function stepUndock() {
  // Only press Esc while actually docked — in plain flight Esc is the pause key.
  const docked = await page.evaluate(() => !!window.SF?.state?.ui?.docked).catch(() => false);
  if (!docked) throw new Error('never docked — no station to leave');
  // Ordinary exit: Esc asks for departure → the check pop's primary button undocks.
  noteKey(page, 'Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  const alreadyOut = await page.evaluate(() => window.SF?.state?.mode === 'flight' && !window.SF?.state?.ui?.docked).catch(() => false);
  if (!alreadyOut) {
    const launched = page.locator('[data-pop-launch]').first();
    if (await launched.isVisible().catch(() => false)) {
      await launched.click();
    } else {
      // no check needed or a different exit: try the concourse undock control
      const alt = await clickFirstVisible(page, ['[data-act="undock"]', '#screens button:has-text("Undock")', '#screens button:has-text("Launch")']);
      if (!alt) throw new Error('no undock control on Esc or the concourse');
    }
  }
  const out = await page.waitForFunction(() => window.SF?.state?.mode === 'flight' && !window.SF?.state?.ui?.docked,
    null, { timeout: 20000 }).then(() => true, () => false);
  if (!out) throw new Error('undock control clicked but the ship never left the station');
  return 'undocked through the departure check';
}

// A stray modal (e.g. pause left up by an earlier failed step) must not silently poison
// later steps — a player would just Esc back to flight. One recovery press, then proceed.
async function ensureFlightHud() {
  const f = await readFlight();
  if (f && (f.mode === 'paused' || (f.top && f.top !== 'hud' && f.top !== null && f.top !== 'station'))) {
    noteKey(page, 'Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
  }
}

async function stepFlyToJob(deadline) {
  await ensureFlightHud();
  const t0 = Date.now();
  while (Date.now() - t0 < 60000 && !deadlineHit(deadline)) {
    const nav = await readNav();
    const hostile = await readHostile(900);
    if (hostile) return `met a hostile on the way at ${((Date.now() - t0) / 1000).toFixed(0)}s`;
    if (nav && nav.d != null && nav.d < 250) return `reached the job marker "${nav.label || 'job'}"`;
    if (nav && Number.isFinite(nav.rel) && Math.abs(nav.rel) > 0.12) {
      await turnToward(nav.rel);
    }
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW').catch(() => {});
  }
  return 'flew toward the job for 60s';
}

async function stepFight(deadline) {
  await ensureFlightHud();
  let beat = 0;
  const t0 = Date.now();
  let powers = 0;
  let shots = 0;
  while (Date.now() - t0 < 75000 && !deadlineHit(deadline)) {
    const f = await readFlight();
    if (!f || f.mode !== 'flight' || f.alive === false) break;
    if (beat === 1 || beat === 4) {
      const code = powers === 0 ? 'Digit1' : 'Digit2';
      noteKey(page, code);
      await page.keyboard.press(code);
      powers++;
    }
    await fightBeat(page, beat++);
    shots++;
    if (beat > 6 && shots > 4 && !(await readHostile(900))) break;
  }
  if (beat === 0) throw new Error('never got into flight to fight');
  return `fought ${beat} beats, used ${powers} powers`;
}

async function stepMap() {
  noteKey(page, 'KeyM');
  await page.keyboard.press('KeyM');
  const open = await page.waitForFunction(() => {
    const t = window.SF?.ctx?.screenManager?.top?.();
    return t === 'galaxyMap' || t === 'localmap' || t === 'starmap';
  }, null, { timeout: 8000 }).then(() => true, () => false);
  if (!open) throw new Error('M opened no map screen');
  await page.waitForTimeout(1500);
  noteKey(page, 'Escape');
  await page.keyboard.press('Escape');
  return 'opened the map with M';
}

async function stepPauseSave() {
  noteKey(page, 'Escape');
  await page.keyboard.press('Escape');
  const open = await page.waitForFunction(() => window.SF?.ctx?.screenManager?.top?.() === 'pause',
    null, { timeout: 8000 }).then(() => true, () => false);
  if (!open) throw new Error('Esc opened no pause menu');
  const before = (await readFlight())?.savedAt ?? null;
  noteKey(page, 'F5');
  await page.keyboard.press('F5');
  const saved = await page.waitForFunction((was) => {
    const at = window.SF?.state?.meta?.lastSavedAt;
    return at != null && at !== was;
  }, before, { timeout: 10000 }).then(() => true, () => false);
  if (!saved) throw new Error('F5 in pause never recorded a save');
  noteKey(page, 'Escape');
  await page.keyboard.press('Escape');
  return 'paused, quick-saved on F5, resumed';
}

// ---------- swarm ----------
const readPhase = () => page.evaluate(() => {
  const st = window.SF?.state;
  return st ? { sim: st.simTime, mode: st.mode, ph: st.run?.phase ?? null, w: st.run?.wave ?? null,
    top: window.SF?.ctx?.screenManager?.top?.() ?? null,
    alive: !!st.entityList?.find((e) => e.id === st.playerId && e.alive !== false) } : null;
}).catch(() => null);

async function visitSwarmShop() {
  const open = page.getByRole('button', { name: 'Fortify the field', exact: true });
  if (!await open.isVisible().catch(() => false)) return null;
  await open.click();
  await page.waitForTimeout(1200);
  const back = page.getByRole('button', { name: 'Return to armory', exact: true });
  if (await back.isVisible().catch(() => false)) await back.click();
  return 'visited the between-round shop';
}

async function takeFirstUpgrade() {
  // Armory shelf: first available offer card, then its own fit/buy action.
  const card = page.locator('#screens .sf-cru-card:visible:not(.is-unavail)').first();
  if (!await card.isVisible().catch(() => false)) return null;
  const name = (await card.textContent().catch(() => '') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  await card.click();
  await page.waitForTimeout(500);
  const act = await clickFirstVisible(page, [
    '#screens button:has-text("Fit")', '#screens button:has-text("Buy")',
    '#screens button:has-text("Take")', '#screens button:has-text("Install")',
  ]);
  return act ? `took first upgrade "${name}" ("${act}")` : null;
}

// ---------- report ----------
async function buildSheet() {
  const TILE_W = 400; const TILE_H = 225; const LABEL = 18; const COLS = 6; const TARGET = 24;
  const picks = [];
  const boundary = frames.filter((f) => steps.some((s) => s.id === f.label || f.label.startsWith(`${s.id}`)));
  const chosen = new Set();
  for (const f of boundary) { picks.push(f); chosen.add(f.name); }
  const rest = frames.filter((f) => !chosen.has(f.name));
  const need = Math.max(0, TARGET - picks.length);
  for (let i = 0; i < need && rest.length; i++) {
    const f = rest[Math.floor(i * rest.length / need)];
    picks.push(f); chosen.add(f.name);
  }
  picks.sort((a, b) => a.t - b.t);
  const tiles = [];
  for (const f of picks.slice(0, TARGET)) {
    const svg = `<svg width="${TILE_W}" height="${TILE_H + LABEL}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${TILE_H}" width="${TILE_W}" height="${LABEL}" fill="#101418"/>
      <text x="6" y="${TILE_H + 13}" font-family="monospace" font-size="12" fill="#dfe6ee">${String(f.name).replace(/\.png$/, '').replace(/[&<>]/g, ' ')}</text></svg>`;
    tiles.push(await sharp(f.file).resize(TILE_W, TILE_H, { fit: 'fill' })
      .extend({ bottom: LABEL, background: '#101418' })
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer());
  }
  const rows = Math.ceil(tiles.length / COLS) || 1;
  const W = COLS * TILE_W; const H = rows * (TILE_H + LABEL);
  const file = path.join(OUT, 'sheet.png');
  await sharp({ create: { width: W, height: H, channels: 3, background: '#0a0d10' } })
    .composite(tiles.map((buf, i) => ({ input: buf, left: (i % COLS) * TILE_W, top: Math.floor(i / COLS) * (TILE_H + LABEL) })))
    .png().toFile(file);
  return file;
}

function writeReport() {
  writeFileSync(path.join(OUT, 'trace.json'), JSON.stringify({
    mode: MODE, seed: SEED, runSeed, generatedAt: new Date().toISOString(),
    samplesPerSecond: true, rows: trace,
  }, null, 1));
  writeFileSync(path.join(OUT, 'words.json'), JSON.stringify([...words.values()], null, 1));
  writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 1));
}

function writeSummary(sheetFile) {
  const under30 = trace.filter((r) => r.fps != null && r.fps < 30);
  const fpsRows = trace.filter((r) => r.fps != null);
  const avgFps = fpsRows.length ? fpsRows.reduce((a, r) => a + r.fps, 0) / fpsRows.length : 0;
  const minFps = fpsRows.length ? Math.min(...fpsRows.map((r) => r.fps)) : null;
  const freezes = findings.filter((f) => f.kind === 'freeze');
  const byKind = {};
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  const lines = [
    `# Opening capture — ${MODE}`,
    ``,
    `seed ${SEED}${runSeed != null && runSeed !== SEED ? ` (run seed ${runSeed})` : ''} · ${new Date().toISOString().slice(0, 19)} · ${MINUTES} min budget`,
    ``,
    `- Time to first control: ${menuReadyMs != null ? (menuReadyMs / 1000).toFixed(1) + 's' : '?'} (title menu)${flightReadyMs != null ? ` · flight ready ${(flightReadyMs / 1000).toFixed(1)}s` : ''}`,
    `- Presses from title to play: ${pressesAtPlay ?? '?'}`,
    `- Session sampled: ${trace.length}s · avg fps ${avgFps.toFixed(0)} · min ${minFps ?? '?'} · seconds under 30 fps: ${under30.length}`,
    `- Freezes (no positions moving >0.35s while frames ran): ${freezes.length}${freezes.length ? ` — worst ${Math.max(...freezes.map((f) => f.ms || 0))}ms` : ''}`,
    `- Words seen: ${words.size} distinct · Findings: ${findings.length}${Object.keys(byKind).length ? ` (${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')})` : ''}`,
    `- Contact sheet: sheet.png · frames: frames/ (${frames.length})`,
    ``,
    `## Steps`,
    ``,
    `| step | result | at | took | note |`,
    `|---|---|---|---|---|`,
    ...steps.map((s) => `| ${s.id} | ${s.ok ? 'pass' : '**FAIL**'} | ${s.startS.toFixed(0)}s | ${s.elapsedS.toFixed(0)}s | ${s.detail.replace(/\|/g, '/')} |`),
    ``,
    `## Findings`,
    ``,
    ...(findings.length
      ? findings.slice(0, 60).map((f) => `- \`${f.kind}\` ${f.step ? `[${f.step}] ` : ''}${f.text || ''}${f.frame ? ` · ${f.frame}` : ''}`)
      : ['- none']),
    ``,
    sheetFile ? `![contact sheet](sheet.png)` : '',
  ];
  writeFileSync(path.join(OUT, 'summary.md'), lines.join('\n'));
  return lines.join('\n');
}

// ---------- page instrumentation ----------
const INIT_SCRIPT = `(() => {
  const cap = window.__cap = { presses: 0, keys: [], raf: 0, lastT: 0, maxGap: 0, worst: [],
    freezes: [], stillSince: null, stillFlagged: null, sig: null, samples: [] };
  window.addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    cap.presses++;
    if (cap.keys.length < 240) cap.keys.push({ c: e.code, t: performance.now() });
  }, true);
  window.addEventListener('pointerdown', (e) => { if (e.isTrusted) cap.presses++; }, true);
  const raf = (t) => {
    cap.raf++;
    if (cap.lastT) {
      const gap = t - cap.lastT;
      if (gap > cap.maxGap) cap.maxGap = gap;
      if (gap > 50) {
        cap.worst.push({ ms: Math.round(gap * 10) / 10, t });
        if (cap.worst.length > 48) { cap.worst.sort((a, b) => b.ms - a.ms); cap.worst.length = 48; }
      }
    }
    cap.lastT = t;
    const SF = window.SF; const st = SF && SF.state;
    const top = SF && SF.ctx && SF.ctx.screenManager && SF.ctx.screenManager.top ? SF.ctx.screenManager.top() : null;
    const live = st && st.mode === 'flight' && (top == null || top === 'hud');
    if (live && st.entityList) {
      // Two freeze signals: the sim clock itself not advancing, and (while it advances) no
      // sampled position changing — the first is a lane stall, the second a dead world.
      let sig = 0; let n = 0;
      for (const e of st.entityList) {
        if (e && e.alive !== false && e.pos) {
          sig += ((e.pos.x * 4 | 0) * 31 + (e.pos.z * 4 | 0) * 17 + n * 7) % 1000003;
          if (++n >= 48) break;
        }
      }
      const simMoving = cap.lastSim !== st.simTime;
      cap.lastSim = st.simTime;
      if (!simMoving || (cap.sig !== null && sig === cap.sig)) {
        if (cap.stillSince == null) cap.stillSince = t;
        else if (t - cap.stillSince > 350 && cap.stillFlagged !== cap.stillSince) {
          cap.stillFlagged = cap.stillSince;
          cap.freezes.push({ t: Math.round(t), ms: Math.round(t - cap.stillSince), simStall: !simMoving });
        }
      } else { cap.stillSince = null; }
      cap.sig = sig;
    } else { cap.stillSince = null; }
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
})()`;

async function installSampler() {
  await page.evaluate(() => {
    const cap = window.__cap; const t0 = performance.now();
    cap.sampleT0 = t0;
    let last = { t: t0, raf: cap.raf, sim: window.SF?.state?.simTime || 0 };
    cap.sampler = setInterval(() => {
      const t = performance.now();
      const st = window.SF?.state;
      const dt = Math.max(1, t - last.t);
      const row = { t: Math.round(t - t0), mode: st?.mode || null };
      row.fps = Math.round((cap.raf - last.raf) * 1000 / dt * 10) / 10;
      row.worstMs = Math.round((cap.maxGap || 0) * 10) / 10; cap.maxGap = 0;
      row.simTime = +(st?.simTime || 0).toFixed(2);
      row.simSpeed = +(((st?.simTime || 0) - last.sim) * 1000 / dt).toFixed(3);
      row.top = window.SF?.ctx?.screenManager?.top?.() ?? null;
      try {
        const g = window.SF?.simLaneDiag?.();
        const w = g?.workerLastReplyWork;
        row.workerStepMs = w ? Math.round((w.stepsMs ?? w.workMs ?? 0) * 10) / 10 : null;
        row.replyAgeMs = g?.msSinceLastAppliedReply ?? null;
        row.freezeLane = g?.freezeActive === true;
      } catch { /* lane diag optional */ }
      if (st) {
        const me = st.entities?.get(st.playerId) || st.entityList?.find((e) => e.id === st.playerId);
        const kinds = {}; let shipsNear = 0;
        for (const e of st.entityList || []) {
          if (!e) continue;
          const k = e.type || '?';
          kinds[k] = (kinds[k] || 0) + 1;
          if (me?.pos && e !== me && e.alive !== false && (e.type === 'ship' || e.type === 'drone') && e.pos
            && Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z) < 1000) shipsNear++;
        }
        row.kinds = kinds;
        row.shipsNear1k = shipsNear;
        const c = st.render?.streamingCensus;
        if (c) row.standIns = { onScreen: c.onScreenStandIns || 0,
          list: (c.standIns || []).map((s) => ({ id: s.id, def: s.def, ageS: s.ageS, d: s.d })) };
        row.run = st.run ? { phase: st.run.phase, wave: st.run.wave } : null;
        row.waypoint = st.nav?.waypoint?.label || null;
        row.docked = !!st.ui?.docked;
        row.pos = me?.pos ? [Math.round(me.pos.x), Math.round(me.pos.z)] : null;
      }
      last = { t, raf: cap.raf, sim: st?.simTime || 0 };
      cap.samples.push(row);
    }, 1000);
  });
}

// ---------- sessions ----------
async function adventureSession(deadline) {
  await runStep('look', () => stepLook(deadline));
  await runStep('objective', () => stepFlyToObjective(deadline));
  await runStep('powers', () => stepPowersOnRock(deadline));
  await runStep('line', () => stepLineLatchThrow(deadline));
  await runStep('mine', () => stepMine(deadline));
  await runStep('dock', () => stepDock(deadline));
  await runStep('station', () => stepStation(deadline));
  await runStep('undock', () => stepUndock(deadline));
  await runStep('job', () => stepFlyToJob(deadline));
  await runStep('fight', () => stepFight(deadline));
  await runStep('map', () => stepMap(deadline));
  await runStep('pause-save', () => stepPauseSave(deadline));
  // spend the rest of the budget playing on the ordinary route
  currentStep = 'play-on';
  let beat = 0;
  while (!deadlineHit(deadline)) {
    const f = await readFlight();
    if (!f || f.mode !== 'flight' || f.alive === false) { await sleep(600); continue; }
    if (f.top && !['hud', null].includes(f.top)) { await sleep(600); continue; }
    const hostile = await readHostile(900);
    if (hostile) await fightBeat(page, beat++);
    else await cruiseBeat(page, beat++);
  }
}

async function swarmSession(deadline) {
  currentStep = 'title-to-round1';
  await shoot('title');
  const pressesStart = await readPresses();
  if (SWARM_ROUTE === 'door') {
    await crucibleToArmory(page, { ruleset: 'swarm', seed: SEED }, () => {});
    await waitForPreparationLaunch(page, {});
    const word = await armoryLaunchWord(page);
    await clickText(page, word || 'Launch round 1');
  } else {
    await page.locator('[data-screen="mainMenu"] [data-action="swarm"]').first().click({ timeout: T(60000) });
  }
  await waitUntilFlight(page, { timeout: T(600000), active: true });
  await waitBootOverlayGone(page);
  runSeed = await readLaunchedRunSeed(page).catch(() => null);
  pressesAtPlay = (await readPresses()) - pressesStart;
  flightReadyMs = Date.now() - navT0;
  steps.push({ id: 'title-to-round1', ok: true, detail: `${pressesAtPlay} presses (${SWARM_ROUTE} route)`, startS: 0, elapsedS: flightReadyMs / 1000 });
  let beat = 0; let round = 1;
  const tether = await tetherCode();
  while (!deadlineHit(deadline)) {
    const ph = await readPhase();
    if (!ph) { await sleep(500); continue; }
    if (ph.ph === 'ended' || ph.ph === 'victory') break;
    if (ph.top === 'pilotCards') {
      // The level-up cards stand between rounds until a card is taken (they never close alone).
      const id = `cards-${ph.w}`;
      if (!steps.some((s) => s.id === id)) {
        steps.push({ id, ok: true, detail: 'took card 1', startS: (Date.now() - navT0) / 1000, elapsedS: 0 });
        await shoot(id);
      }
      noteKey(page, 'Digit1'); await page.keyboard.press('Digit1'); await page.waitForTimeout(700);
      continue;
    }
    if (ph.ph === 'active' && ph.mode === 'flight') {
      currentStep = `round-${ph.w}`;
      if (!steps.some((s) => s.id === currentStep)) {
        steps.push({ id: currentStep, ok: true, detail: '', startS: (Date.now() - navT0) / 1000, elapsedS: 0 });
        await shoot(currentStep);
      }
      await fightBeat(page, beat++);
      // once per round: every power and the Line, aimed at what fightBeat already steered at
      const rec = steps.find((s) => s.id === currentStep);
      if (rec && !rec.detail.includes('powers')) {
        for (const d of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']) {
          noteKey(page, d); await page.keyboard.press(d); await page.waitForTimeout(900);
        }
        if (/^Mouse|^mouse/.test(tether)) await page.mouse.click(800, 450, { button: 'right' });
        else { noteKey(page, tether); await page.keyboard.press(tether); }
        rec.detail = `guns + powers 1-5 + the Line (${tether})`;
      }
      continue;
    }
    if (ph.ph === 'draft' || ph.ph === 'cleanup' || ph.ph === 'refit') {
      currentStep = `between-${ph.w}`;
      if (!steps.some((s) => s.id === currentStep)) {
        steps.push({ id: currentStep, ok: true, detail: '', startS: (Date.now() - navT0) / 1000, elapsedS: 0 });
        await shoot(currentStep);
      }
      const up = await takeFirstUpgrade();
      const shop = await visitSwarmShop();
      // Short waits: the level-up cards can rise mid-handoff and are answered at the loop's top.
      const next = await awaitRoundHandoff(page, { previousWave: ph.w, timeoutMs: Math.min(8000, deadline - Date.now()) }).catch(() => null);
      if (!next) continue;
      if (next.kind === 'cap') break;
      if (next.kind === 'terminal') break;
      if (next.kind === 'active') { round = next.wave; continue; }
      continue;
    }
    await sleep(600);
  }
  currentStep = 'results';
  await page.waitForTimeout(2500);
  await shoot('results');
  const end = await readPhase();
  steps.push({ id: 'results', ok: end?.ph === 'ended' || end?.ph === 'victory',
    detail: `phase ${end?.ph || '?'} · wave ${end?.w ?? '?'} · ${end?.alive ? 'alive' : 'dead'}`,
    startS: (Date.now() - navT0) / 1000, elapsedS: 0 });
}

// ---------- main ----------
async function main() {
  installSessionSignalGuard(process);
  server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  ({ browser } = await launchChromium(chromium, {
    headless: false,
    args: ['--window-size=1680,960', '--mute-audio', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  }));
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  stopWindowTimer = await keepHeadedWindowNormal(page, { headed: true });
  page.on('pageerror', (e) => addFinding({ kind: 'page-error', key: String(e.message || e).slice(0, 80), text: String(e.stack || e.message).slice(0, 400) }));
  page.on('console', (m) => {
    if (m.type() === 'error') addFinding({ kind: 'console-error', key: m.text().slice(0, 80), text: m.text().slice(0, 400) });
  });
  await page.addInitScript(INIT_SCRIPT);
  const stepLog = (name, ok, detail) => console.log(`[route] ${ok ? 'ok ' : 'NO '} ${name}${detail ? ` - ${detail}` : ''}`);
  navT0 = Date.now();
  await bootToMenu(page, server.baseUrl, stepLog);
  menuReadyMs = Date.now() - navT0;
  await installSampler();
  // 10 s cadence frames + per-second collection run beside the scripted session
  let lastCadence = 0;
  sampleTimer = setInterval(async () => {
    if (sessionOver) return;
    await collectOnce();
    if (Date.now() - navT0 - lastCadence >= 10000) {
      lastCadence = Date.now() - navT0;
      await shoot(currentStep);
    }
  }, 1000);

  const flightDeadline = () => navT0 + menuReadyMs + MINUTES * 60000;

  if (MODE === 'adventure') {
    currentStep = 'title-to-launch';
    await shoot('title');
    const pressesStart = await readPresses();
    const info = await adventureToFlight(page, stepLog, { seed: SEED });
    runSeed = info.runSeed;
    pressesAtPlay = (await readPresses()) - pressesStart;
    flightReadyMs = Date.now() - navT0;
    steps.push({ id: 'title-to-launch', ok: true,
      detail: `${pressesAtPlay} presses · seed ${runSeed}`, startS: 0, elapsedS: flightReadyMs / 1000 });
    await adventureSession(flightDeadline());
  } else {
    await swarmSession(flightDeadline());
  }
  sessionOver = true;
  await collectOnce();
  await shoot('end');
}

main().then(async () => {
  sessionOver = true;
  writeReport();
  const sheet = await buildSheet().catch((e) => { console.error('sheet failed:', e.message); return null; });
  writeSummary(sheet);
  console.log(`[capture] wrote ${relOut(OUT)}`);
  console.log(`[capture] findings ${findings.length} · words ${words.size} · frames ${frames.length}`);
  process.exitCode = 0;
}).catch(async (err) => {
  sessionOver = true;
  console.error('[capture] harness failure:', err);
  addFinding({ kind: 'harness', text: String(err?.message || err).slice(0, 300) });
  try { writeReport(); } catch { /* output dir may not exist */ }
  try { writeSummary(null); } catch { /* ignore */ }
  process.exitCode = 1;
}).finally(async () => {
  sessionOver = true;
  if (sampleTimer) clearInterval(sampleTimer);
  if (stopWindowTimer) await stopWindowTimer().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
});
