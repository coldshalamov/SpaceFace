#!/usr/bin/env node
// probe-first-swarm-minute.mjs — the first minute of a Swarm run, played the way a stranger plays it.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-first-swarm-minute.mjs
//     [--out=dir] [--stamp=<id>]
//
// The real desktop build (isolated Electron profile) opens at the title in an inactive window that
// never takes focus. One press on the focused Swarm door (its PLAY) starts round 1. Then the probe
// thrusts and turns in bursts, aims the mouse at the nearest hostile, fires in bursts, and ropes a
// loose rock and throws it at the pack (at least three tries). The first level-up card is left up
// 1.5 s before 1 is pressed. The ship is then allowed to die; Run Over is captured, Enter (Again) is
// pressed, and round 1 is captured again.
//
// It writes a frame every 2 s plus one at each beat (`NN-<beat>.png`), one labelled contact.png, and
// report.json with the press->hostile times, throws attempted/latched/released, every line of text
// that appeared with its first time, fps and world speed per 10 s, and console errors. It asserts
// nothing about the game: open the frames and judge.
//
// Read-only observer: window.SF is used to pick aim points and read the run; the probe never writes
// game state. All input goes through the real keyboard and mouse.

import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { createIsolatedElectronLaunch, buildIsolatedElectronEnv } from './lib/electronTestIsolation.mjs';
import launchProtocol from './lib/electronLaunchProtocol.cjs';
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
const OUT = path.resolve(ROOT, String(argv.out || `.devshots/demo/swarm-minute/${STAMP}`));
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(`[swarm-minute] ${s}`);
const t0 = Date.now();
let pressAt = null;
let app = null;
let iso = null;
let page = null;
let runtimeClosed = false;

const facts = {
  schema: 'spaceface.swarmMinuteProbe.v1',
  packet: 'DEMO-SWARM-PROBE-1',
  startedAt: new Date(t0).toISOString(),
  stamp: STAMP,
  steps: [],
  beats: [],
  frames: [],
  throws: { attempted: 0, latched: 0, released: 0, rows: [] },
  cards: [],
  drafts: [],
  textLines: [],
  samples10s: [],
  consoleErrors: [],
  events: [],
  times: {},
  // DEMO-LOAD-1: where the press -> live-control seconds go. samples rides the pump cadence;
  // final is read once before the runtime closes (cook ledger, boot timeline, journal).
  loading: { profile: null, samples: [], final: null },
};

const rel = (ms = Date.now()) => (pressAt == null ? 0 : Math.round((ms - pressAt) / 100) / 10);
const step = (id, ok, detail) => {
  facts.steps.push({ id, ok, detail: detail || null, at: Date.now(), t: rel() });
  log(`${ok ? 'ok ' : 'NO '} ${id}${detail ? ` - ${detail}` : ''}`);
};
const beat = (name, detail) => {
  facts.beats.push({ name, detail: detail || null, at: Date.now(), t: rel() });
  log(`beat ${name}${detail ? ` - ${detail}` : ''}`);
};

// ---------- frames ----------
let frameNo = 0;
const slug = (s) => String(s || 'frame').toLowerCase().replace(/[^a-z0-9+.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

async function shot(name) {
  if (!page || page.isClosed()) return null;
  frameNo += 1;
  const file = path.join(OUT, `${String(frameNo).padStart(2, '0')}-${slug(name)}.png`);
  const at = Date.now();
  try {
    await page.screenshot({ path: file, timeout: 20_000 });
    facts.frames.push({ file, name: slug(name), beat: name, t: rel(at), at });
    log(`frame ${path.relative(ROOT, file)} @ ${rel(at).toFixed(1)}s`);
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
  const pipEl = document.querySelector('.sf-leadpip.visible');
  let leadPip = null;
  if (pipEl) {
    const r = pipEl.getBoundingClientRect();
    if (r.width > 2 && r.height > 2) {
      leadPip = {
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
        blocked: pipEl.getAttribute('data-denial') === 'blocked',
      };
    }
  }
  const ui = {
    card: visible(document.querySelector('[data-pilot-cards]')),
    draft: top === 'crucibleDraft' || visible(document.querySelector('[data-screen="crucibleDraft"]')),
    runOver: visible(document.querySelector('.sf-runover')),
    again: visible(document.querySelector('[data-action="again"]')),
    bootOverlay: visible(document.getElementById('boot-overlay')),
    top,
    leadPip,
  };
  if (!st) return { ready: false, ui };
  const me = st.entities && st.entities.get(st.playerId);
  const w2s = window.SF.ctx && window.SF.ctx.helpers && window.SF.ctx.helpers.worldToScreen;
  const proj = (pos) => {
    if (!w2s || !pos) return null;
    try {
      const s = w2s(pos);
      if (!s) return null;
      return { x: Math.round(s.x), y: Math.round(s.y), onScreen: s.onScreen === true && s.behind !== true };
    } catch (_) { return null; }
  };
  const snapshot = {
    ready: true,
    mode: st.mode || null,
    phase: st.run ? st.run.phase : null,
    outcome: st.run ? st.run.outcome || null : null,
    wave: st.run ? st.run.wave : null,
    level: st.run ? st.run.level : null,
    xp: st.run ? st.run.xp : null,
    credits: st.run ? st.run.credits : null,
    banked: st.run && st.run.pilot ? (st.run.pilot.banked || 0) : 0,
    offer: st.run && st.run.pilot && st.run.pilot.offer && Array.isArray(st.run.pilot.offer.cards)
      ? st.run.pilot.offer.cards.slice(0, 3) : null,
    simTime: Number.isFinite(st.simTime) ? st.simTime : null,
    scheme: st.settings?.gameplay?.controlScheme || st.settings?.controls?.controlScheme || null,
    player: null,
    tether: null,
    hostiles: null,
    loose: null,
    targetId: st.player && st.player.targetId != null ? st.player.targetId : null,
    acquisition: st.masslineAcquisition ? {
      targetId: st.masslineAcquisition.selected?.targetId ?? null,
      targetType: st.masslineAcquisition.selected?.targetType ?? null,
      reason: st.masslineAcquisition.reason || null,
      alternatives: (st.masslineAcquisition.alternatives || []).slice(0, 3).map((a) => a && a.targetId).filter((v) => v != null),
      validUntil: st.masslineAcquisition.validUntil ?? null,
      publishedAt: st.masslineAcquisition.publishedAt ?? null,
    } : null,
    ui,
  };
  if (!me || !me.pos) return snapshot;
  snapshot.player = {
    id: me.id,
    x: +me.pos.x.toFixed(2),
    z: +me.pos.z.toFixed(2),
    rot: Number.isFinite(me.rot) ? me.rot : 0,
    alive: me.alive !== false,
    hull: Number.isFinite(me.hull) ? me.hull : null,
    hullMax: Number.isFinite(me.hullMax) ? me.hullMax : null,
    shield: Number.isFinite(me.shield) ? me.shield : null,
    shieldMax: Number.isFinite(me.shieldMax) ? me.shieldMax : null,
    speed: Math.hypot(me.vel?.x || 0, me.vel?.z || 0),
  };
  const tether = st.player && st.player.tether;
  snapshot.tether = tether ? {
    active: !!tether.active,
    phase: tether.phase || null,
    count: tether.count || 0,
    targetId: tether.targetId ?? null,
    attachmentId: tether.attachmentId ?? null,
  } : null;
  let hostileCount = 0;
  let hostileVisible = 0;
  let nearestHostile = null;
  let nearestVisibleHostile = null;
  let nearestLoose = null;
  let nearestVisibleLoose = null;
  let nearestThrowable = null;
  let nearestVisibleThrowable = null;
  let nearestObstacle = null;
  let nearestVisibleObstacle = null;
  for (const e of st.entityList || []) {
    if (!e || e.alive === false || !e.pos || e.id === me.id) continue;
    const dx = e.pos.x - me.pos.x;
    const dz = e.pos.z - me.pos.z;
    const d = Math.hypot(dx, dz);
    const screen = proj(e.pos);
    const hostile = (e.team === 1 || e.team === 'hostile' || e.data?.hostile === true)
      && (e.type === 'ship' || e.type === 'drone');
    if (hostile) {
      hostileCount += 1;
      if (screen && screen.onScreen) hostileVisible += 1;
      const row = {
        id: e.id, type: e.type, d: Math.round(d), wx: e.pos.x, wz: e.pos.z,
        vx: e.vel?.x || 0, vz: e.vel?.z || 0, radius: Math.round(e.radius || 0),
        screen, name: e.data?.defId || e.name || null,
      };
      if (!nearestHostile || d < nearestHostile.d) nearestHostile = row;
      if (screen && screen.onScreen && (!nearestVisibleHostile || d < nearestVisibleHostile.d)) nearestVisibleHostile = row;
    }
    if (e.type === 'asteroid' || e.type === 'wreck' || e.type === 'payload') {
      const row = {
        id: e.id, type: e.type, d: Math.round(d), wx: e.pos.x, wz: e.pos.z,
        vx: e.vel?.x || 0, vz: e.vel?.z || 0, radius: Math.round(e.radius || 0),
        screen, mass: Math.round(e.mass || 0), throwable: e.data?.throwable === true || e.data?.isChunk === true,
        name: e.data?.defId || e.name || null,
      };
      if (!nearestLoose || d < nearestLoose.d) nearestLoose = row;
      if (screen && screen.onScreen && (!nearestVisibleLoose || d < nearestVisibleLoose.d)) nearestVisibleLoose = row;
      if (row.throwable) {
        if (!nearestThrowable || d < nearestThrowable.d) nearestThrowable = row;
        if (screen && screen.onScreen && (!nearestVisibleThrowable || d < nearestVisibleThrowable.d)) nearestVisibleThrowable = row;
      }
    }
    const obstacle = e.collides !== false
      && e.type !== 'ship' && e.type !== 'drone' && e.type !== 'projectile' && e.type !== 'fx'
      && e.type !== 'pickup' && e.type !== 'beacon';
    if (obstacle) {
      const row = {
        id: e.id, type: e.type, d: Math.round(d), wx: e.pos.x, wz: e.pos.z,
        radius: Math.round(e.radius || 0), screen, name: e.data?.defId || e.name || null,
      };
      if (!nearestObstacle || d < nearestObstacle.d) nearestObstacle = row;
      if (screen && screen.onScreen && (!nearestVisibleObstacle || d < nearestVisibleObstacle.d)) nearestVisibleObstacle = row;
    }
  }
  snapshot.hostiles = { count: hostileCount, visibleCount: hostileVisible, nearest: nearestHostile, nearestVisible: nearestVisibleHostile };
  snapshot.loose = {
    nearest: nearestLoose, nearestVisible: nearestVisibleLoose,
    nearestThrowable, nearestVisibleThrowable,
  };
  snapshot.obstacle = { nearest: nearestObstacle, nearestVisible: nearestVisibleObstacle };
  return snapshot;
}).catch((e) => ({ ready: false, error: String(e.message || e), ui: {} }));

// ---------- observers ----------
async function installObservers() {
  await page.evaluate(() => {
    const host = window.__swarmMinute = window.__swarmMinute || { seen: new Map(), events: [], frames: 0, raf: false };
    const bus = window.SF && window.SF.bus;
    if (bus && typeof bus.on === 'function' && !host.eventsBound) {
      host.eventsBound = true;
      const names = [
        'tether:latched', 'tether:released', 'tether:broken', 'tether:thrown', 'tether:latchDenied',
        'massline:throw', 'massline:releaseValidated', 'massline:releaseWindow', 'massline:releaseCancelled',
        'massline:selfSling', 'massline:flailOffer', 'player:death', 'run:levelUp', 'level:up', 'xp:levelUp',
        'run:waveCleared', 'run:roundCleared', 'survival:waveCleared', 'run:ended', 'toast', 'hud:firstUse',
        'tutorial:say', 'onboarding:say', 'ui:pushScreen', 'game:loadingProgress', 'game:new',
      ];
      for (const name of names) {
        try {
          bus.on(name, (payload) => {
            const p = payload && typeof payload === 'object' ? payload : {};
            host.events.push({
              name,
              at: Math.round(performance.now()),
              text: p.text || p.line || p.message || p.title || p.reason || p.verbId || null,
              targetId: p.targetId ?? null,
              payloadId: p.payloadId ?? null,
              open: p.open ?? null,
              mode: p.mode ?? null,
              reason: p.reason ?? null,
              id: p.id || null,
              wave: p.wave ?? null,
              level: p.level ?? null,
              progress: p.progress ?? null,
              ceiling: p.ceiling ?? null,
              label: p.label || null,
              detail: p.detail || null,
            });
          });
        } catch (_) { /* the bus is optional during boot */ }
      }
    }
    if (!host.raf) {
      host.raf = true;
      const loop = () => { host.frames += 1; requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  });
}

const sampleWords = () => page.evaluate(() => {
  const host = window.__swarmMinute;
  if (!host) return [];
  const out = [];
  const lines = String(document.body.innerText || '').split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s && s.length > 1 && s.length < 220);
  const now = performance.now();
  for (const line of lines) {
    if (host.seen.has(line)) continue;
    host.seen.set(line, now);
    out.push({ line, at: now });
  }
  return out;
}).catch(() => []);

const takeRafFrames = () => page.evaluate(() => {
  const host = window.__swarmMinute;
  if (!host) return 0;
  const n = host.frames;
  host.frames = 0;
  return n;
}).catch(() => 0);

// ---------- DEMO-LOAD-1 loading telemetry (read-only) ----------
// One row per observed change while the shell is up: stage id + the words and percent the player
// reads, plus the renderer's own cook-step tail so each stall names its wait.
const readLoadingSample = () => page.evaluate(() => {
  const st = window.SF && window.SF.state;
  const overlay = document.getElementById('boot-overlay');
  const visible = (node) => {
    if (!node || node.hidden) return false;
    const cs = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0.01
      && r.width > 1 && r.height > 1;
  };
  if (!visible(overlay)) return { active: false };
  const render = st && st.render;
  const ledger = Array.isArray(render?.openingCookLedger) ? render.openingCookLedger : [];
  const last = ledger.length ? ledger[ledger.length - 1] : null;
  const phase = render?.openingFirstPicturePhase || null;
  return {
    active: true,
    mode: st?.mode || null,
    stageId: overlay.dataset?.loadingStage || null,
    label: (document.querySelector('[data-loading-label]')?.textContent || '').trim() || null,
    detail: (document.querySelector('[data-loading-detail]')?.textContent || '').trim() || null,
    pct: (document.querySelector('[data-loading-pct]')?.textContent || '').trim() || null,
    cookPhase: phase ? { stage: phase.stage || null, outcome: phase.outcome || null } : null,
    cookLast: last ? { step: last.step, ms: last.ms, outcome: last.outcome, t: last.t } : null,
    cookRows: ledger.length,
    pendingAdmissions: typeof render?.pendingPipelineAdmissions === 'function'
      ? (Number(render.pendingPipelineAdmissions()) || 0) : null,
  };
}).catch(() => ({ active: false }));

let lastLoadingSampleAt = 0;
let lastLoadingKey = '';
async function sampleLoading(now = Date.now()) {
  if (now - lastLoadingSampleAt < 400) return;
  lastLoadingSampleAt = now;
  const s = await readLoadingSample();
  if (!s || s.active !== true) return;
  const key = `${s.stageId}|${s.label}|${s.detail}|${s.pct}|${s.cookPhase?.stage}|${s.cookPhase?.outcome}|${s.cookRows}|${s.pendingAdmissions}`;
  if (key === lastLoadingKey) return;
  lastLoadingKey = key;
  facts.loading.samples.push({ t: rel(now), at: now, ...s });
}

async function captureLoadingFinal(tag) {
  const final = await page.evaluate(() => {
    const st = window.SF && window.SF.state;
    const render = st && st.render;
    const safe = (fn) => { try { return fn(); } catch (_) { return null; } };
    const timeline = safe(() => window.__SF_BOOT_TIMELINE__ && typeof window.__SF_BOOT_TIMELINE__.table === 'function'
      ? window.__SF_BOOT_TIMELINE__.table() : null);
    const journal = safe(() => window.__SF_STARTUP__ && typeof window.__SF_STARTUP__.snapshot === 'function'
      ? window.__SF_STARTUP__.snapshot() : null);
    const ledger = safe(() => Array.isArray(render?.openingCookLedger) ? render.openingCookLedger : null);
    return {
      timeline, journal, cookLedger: ledger,
      firstPicturePhase: safe(() => render?.openingFirstPicturePhase) || null,
      requiredPackageAdmission: safe(() => render?.requiredPackageAdmission) || null,
      firstPlayableFrameAt: Number.isFinite(render?.firstPlayableFrameAt) ? render.firstPlayableFrameAt : null,
      veilLiftReason: render?.veilLiftReason || null,
      programs: render?.renderer?.info?.programs?.length ?? null,
      geometries: render?.renderer?.info?.memory?.geometries ?? null,
      textures: render?.renderer?.info?.memory?.textures ?? null,
    };
  }).catch(() => null);
  if (!final) return;
  if (!facts.loading.final) facts.loading.final = {};
  facts.loading.final[tag] = final;
}

const readDiag = () => page.evaluate(() => {
  const d = window.SF && typeof window.SF.simLaneDiag === 'function' ? window.SF.simLaneDiag() : null;
  if (!d) return null;
  const pose = d.poseTable || {};
  return {
    lane: d.lane || null,
    clockOwner: d.clockOwner || null,
    workerClockMode: d.workerClockMode || null,
    replyAgeMs: d.msSinceLastAppliedReply ?? null,
    workerApplyMs: d.workerApplyMs ?? null,
    readModelEntities: d.readModelEntities ?? null,
    error: d.error || null,
    pose: {
      mode: pose.mode || null,
      simTime: pose.simTime ?? null,
      workerWallMs: pose.workerWallMs ?? null,
      ageMs: pose.ageMs ?? null,
      tick: pose.tick ?? null,
    },
  };
}).catch(() => null);

const readScreenText = (selector) => page.evaluate((sel) => {
  const node = document.querySelector(sel);
  if (!node) return null;
  return String(node.innerText || '').replace(/\n{2,}/g, '\n').trim().slice(0, 3000);
}, selector).catch(() => null);

const readVisibleButtons = () => page.evaluate(() => {
  const visible = (el) => {
    if (!el || el.hidden) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0.01
      && r.width > 1 && r.height > 1;
  };
  return [...document.querySelectorAll('#screens button')].filter(visible).map((b) => ({
    text: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    action: b.dataset?.action || null,
    disabled: !!b.disabled || b.getAttribute('aria-disabled') === 'true',
  })).slice(0, 40);
}).catch(() => []);

// ---------- input ----------
const held = new Set();
let mouseLeftDown = false;
let mouseRightDown = false;

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
async function releaseKeys() {
  for (const code of [...held]) await keyUp(code);
}
async function leftButton(on) {
  if (on && !mouseLeftDown) { mouseLeftDown = true; await page.mouse.down({ button: 'left' }).catch(() => {}); }
  else if (!on && mouseLeftDown) { mouseLeftDown = false; await page.mouse.up({ button: 'left' }).catch(() => {}); }
}
async function rightButton(on) {
  if (on && !mouseRightDown) { mouseRightDown = true; await page.mouse.down({ button: 'right' }).catch(() => {}); }
  else if (!on && mouseRightDown) { mouseRightDown = false; await page.mouse.up({ button: 'right' }).catch(() => {}); }
}
async function releaseAll() {
  await releaseKeys();
  await leftButton(false);
  await rightButton(false);
}
async function aimAt(point) {
  if (!point) return;
  await page.mouse.move(Math.round(point.x), Math.round(point.y), { steps: 2 }).catch(() => {});
}

// ---------- timing pump ----------
let nextPeriodicAt = Date.now() + 2000;
let nextWordsAt = 0;
let wordCount = 0;

async function pump() {
  const snap = await readScene();
  const now = Date.now();
  await sampleLoading(now);
  if (now >= nextWordsAt) {
    nextWordsAt = now + 500;
    const rows = await sampleWords();
    for (const r of rows) {
      if (wordCount >= 2500) break;
      facts.textLines.push({ t: rel(now), at: now, line: r.line });
      wordCount += 1;
    }
  }
  if (now >= nextPeriodicAt) {
    nextPeriodicAt = now + 2000;
    const secs = Math.max(0, Math.round((now - (pressAt || now)) / 1000));
    await shot(`s${String(secs).padStart(3, '0')}`);
  }
  return snap;
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

async function focusSwarmDoor() {
  const focused = await page.evaluate(() => {
    const a = document.activeElement;
    return { action: a?.dataset?.action || null, tag: a?.tagName || null };
  });
  if (focused.action === 'swarm') return { method: 'enter', focused: true };
  // Keep it one press: focus the door the title itself makes primary, then press Enter.
  await page.evaluate(() => {
    const b = document.querySelector('[data-screen="mainMenu"] [data-action="swarm"]');
    if (b && typeof b.focus === 'function') b.focus({ preventScroll: true });
  }).catch(() => {});
  await sleep(250);
  const again = await page.evaluate(() => document.activeElement?.dataset?.action || null);
  return { method: again === 'swarm' ? 'enter' : 'click', focused: again === 'swarm' };
}

// ---------- draft / cards ----------
let lastCardHandledAt = 0;
let lastDraftHandledAt = 0;

const clickButtonByText = async (match) => {
  const box = await page.evaluate((source) => {
    const re = new RegExp(source, 'i');
    const visible = (el) => {
      if (!el || el.hidden) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0.01
        && r.width > 1 && r.height > 1;
    };
    const b = [...document.querySelectorAll('#screens button')]
      .find((x) => visible(x) && re.test((x.textContent || '').replace(/\s+/g, ' ').trim()));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) };
  }, match).catch(() => null);
  if (!box) return null;
  await page.mouse.click(box.x, box.y);
  return box.text;
};

async function takeCard(label) {
  await releaseAll();
  lastCardHandledAt = Date.now();
  const faces = await readScreenText('[data-pilot-cards]');
  const snap = await readScene();
  facts.cards.push({ t: rel(), label, faces, offer: snap.offer, banked: snap.banked, level: snap.level });
  beat('level-card', `level ${snap.level} · banked ${snap.banked} · ${(faces || '').replace(/\n+/g, ' / ').slice(0, 160)}`);
  step('level-card', true, `level ${snap.level} · banked ${snap.banked} · ${(faces || '').replace(/\n+/g, ' / ').slice(0, 200)}`);
  await sleep(1500); // keep the hand on screen so the still is the card, then take it
  await shot(`${label}-card`);
  for (let i = 0; i < 4; i += 1) {
    const still = await page.evaluate(() => {
      const el = document.querySelector('[data-pilot-cards]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && getComputedStyle(el).display !== 'none';
    }).catch(() => false);
    if (!still) break;
    await page.keyboard.press('Digit1');
    await sleep(700);
  }
  const after = await readScene();
  if (after.ui?.card) {
    // A hand that refuses the digit must not hold the whole probe: send it away, as Esc does.
    await page.keyboard.press('Escape');
    await sleep(400);
    step('level-card', false, 'the hand stayed up after 1; dismissed with Esc (pick stays banked)');
  } else {
    step('level-card-taken', true, 'card closed with 1');
  }
  await shot(`${label}-card-taken`);
}

async function handleDraft(label) {
  await releaseAll();
  lastDraftHandledAt = Date.now();
  const snap = await readScene();
  // The pilot breath is pushed over the draft by the HUD. Give it its beat before Launch.
  if (snap.banked > 0 && snap.offer) {
    for (let i = 0; i < 20; i += 1) {
      const s = await readScene();
      if (s.ui.card) return 'card-first';
      await sleep(200);
    }
  }
  const text = await readScreenText('[data-screen="crucibleDraft"]');
  const buttons = await readVisibleButtons();
  facts.drafts.push({ t: rel(), label, text, buttons, wave: snap.wave, phase: snap.phase });
  step('draft', true, `round ${snap.wave} cleared? phase ${snap.phase} · buttons ${buttons.map((b) => b.text).slice(0, 6).join(' | ')}`);
  await shot(`${label}-draft`);
  const clicked = await clickButtonByText('^(Launch|Continue|Next|Take the win|Keep going)\\b')
    || await clickButtonByText('\\b(Launch|Continue)\\b');
  if (!clicked) {
    await page.keyboard.press('Enter');
    await sleep(500);
  }
  await sleep(700);
  await shot(`${label}-draft-launch`);
  step('draft-launch', true, clicked ? `clicked "${clicked}"` : 'pressed Enter');
  return 'launched';
}

// ---------- flight control ----------
let rngState = 0x51a7c0de;
const rnd = () => {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 4294967296;
};
const between = (a, b) => a + (b - a) * rnd();

function bearingTo(player, target) {
  if (!player || !target || !Number.isFinite(target.wx) || !Number.isFinite(target.wz)) return null;
  return Math.atan2(target.wz - player.z, target.wx - player.x);
}
function angleError(player, target) {
  const bearing = bearingTo(player, target);
  if (bearing == null) return null;
  let err = bearing - (player.rot || 0);
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  return err;
}

let turnDir = 'KeyD';
let turnUntil = 0;
let fireUntil = 0;
let fireOn = false;
let lastAimAt = 0;
let home = null;
let viewW = 1284;
let viewH = 724;

const clampPoint = (p) => ({
  x: Math.min(viewW - 26, Math.max(26, Number(p?.x) || viewW / 2)),
  y: Math.min(viewH - 26, Math.max(26, Number(p?.y) || viewH / 2)),
});
const mirrorFromCenter = (p) => clampPoint({ x: viewW - (Number(p?.x) || viewW / 2), y: viewH - (Number(p?.y) || viewH / 2) });

async function driveFlight(snap) {
  if (!snap.player || !snap.player.alive) return;
  const now = Date.now();
  // Default profiles fly helm-assist: the nose follows the cursor and A/D strafe. The pilot
  // scheme (A/D yaw, mouse aims independently) is still supported if a save asks for it.
  const helm = !(snap.scheme === 'pilot' || snap.scheme === 'classic');
  const hostile = snap.hostiles?.nearestVisible || null;
  const anyHostile = snap.hostiles?.nearest || null;
  const nearestSolid = snap.obstacle?.nearestVisible || snap.obstacle?.nearest || snap.loose?.nearestVisible || snap.loose?.nearest || null;
  const errHostile = anyHostile ? angleError(snap.player, anyHostile) : null;
  const errSolid = nearestSolid ? angleError(snap.player, nearestSolid) : null;
  const solidRange = 115 + Math.min(150, (nearestSolid?.radius || 0) * 2.1);
  const solidClose = !!(nearestSolid && nearestSolid.d < solidRange);
  const hostileClose = !!(anyHostile && anyHostile.d < (helm ? 200 : 210));
  const seekMode = seekLooseUntil > now && !!(snap.loose?.nearestThrowable || snap.loose?.nearest);
  const seekTarget = seekMode ? (snap.loose.nearestThrowable || snap.loose.nearest) : null;

  if (helm) {
    // Point the nose at the hull (or the game's lead pip), and veer the nose away when
    // something is close enough to ram. The ship flies where the cursor points.
    let aimPoint = null;
    if (seekTarget?.screen) aimPoint = seekTarget.screen;
    else if (hostile?.screen) {
      aimPoint = hostile.screen;
      const pip = snap.ui?.leadPip;
      if (pip && !pip.blocked && Math.hypot(pip.x - hostile.screen.x, pip.y - hostile.screen.y) < 170) aimPoint = pip;
    } else if (anyHostile?.screen) aimPoint = anyHostile.screen;
    if (hostileClose && anyHostile?.screen) {
      aimPoint = mirrorFromCenter(anyHostile.screen);
      if (Math.abs(aimPoint.x - viewW / 2) < 50 && Math.abs(aimPoint.y - viewH / 2) < 50) {
        aimPoint = clampPoint({ x: viewW / 2 + (turnDir === 'KeyD' ? 260 : -260), y: viewH / 2 });
      }
    } else if (solidClose && nearestSolid?.screen) {
      aimPoint = mirrorFromCenter(nearestSolid.screen);
    }
    if (aimPoint && now - lastAimAt >= 120) {
      lastAimAt = now;
      await aimAt(clampPoint(aimPoint));
    }
  } else if (hostile && hostile.screen) {
    let point = hostile.screen;
    const pip = snap.ui?.leadPip;
    if (pip && !pip.blocked && Math.hypot(pip.x - hostile.screen.x, pip.y - hostile.screen.y) < 170) point = pip;
    if (now - lastAimAt >= 140) {
      lastAimAt = now;
      await aimAt(point);
    }
  } else if (anyHostile?.screen && now - lastAimAt >= 260) {
    lastAimAt = now;
    await aimAt(anyHostile.screen);
  }

  let danger = false;
  let wantThrust = true;
  let wantBrake = false;

  if (helm) {
    // Hold one strafe key at a time: a sideways drift keeps the ship moving without pushing it
    // down its own gun line.
    if (now >= turnUntil) {
      turnDir = turnDir === 'KeyD' ? 'KeyA' : 'KeyD';
      turnUntil = now + between(2600, 4400);
    }
    await keyDown(turnDir);
    await keyUp(turnDir === 'KeyD' ? 'KeyA' : 'KeyD');

    if (hostileClose) {
      danger = true;
      wantThrust = !!(anyHostile && anyHostile.d < 130); // nose is pointed away: leave
      wantBrake = !wantThrust && (snap.player.speed || 0) > 20;
    } else if (solidClose) {
      danger = true;
      wantThrust = false;
      wantBrake = !!(nearestSolid && nearestSolid.d < 120);
    } else if (seekMode) {
      wantThrust = !seekTarget || seekTarget.d > 130;
    } else if (hostile || anyHostile) {
      const d = (hostile || anyHostile).d;
      wantThrust = d > 330;
      wantBrake = d < 150 && (snap.player.speed || 0) > 30;
    }
  } else {
    // Pilot scheme: A/D yaw, so steer with the keys and keep the nose off anything close.
    let seekClose = false;
    if (hostileClose) {
      turnDir = errHostile > 0 ? 'KeyA' : 'KeyD';
      danger = true;
    } else if (solidClose) {
      turnDir = errSolid > 0 ? 'KeyA' : 'KeyD';
      danger = true;
    } else if (seekMode) {
      const errLoose = angleError(snap.player, seekTarget);
      if (errLoose != null) turnDir = errLoose > 0 ? 'KeyD' : 'KeyA';
      seekClose = !!(seekTarget && seekTarget.d < 120);
    } else if (!hostile && anyHostile && anyHostile.d > 260) {
      if (errHostile != null && Math.abs(errHostile) > 0.2) turnDir = errHostile > 0 ? 'KeyD' : 'KeyA';
    } else if (home) {
      const homeD = Math.hypot(snap.player.x - home.x, snap.player.z - home.z);
      if (homeD > 280) {
        const errHome = angleError(snap.player, { wx: home.x, wz: home.z });
        if (errHome != null) turnDir = errHome > 0 ? 'KeyD' : 'KeyA';
      } else if (now >= turnUntil) {
        turnDir = turnDir === 'KeyD' ? 'KeyA' : 'KeyD';
        turnUntil = now + between(2600, 4400);
      }
    } else if (now >= turnUntil) {
      turnDir = turnDir === 'KeyD' ? 'KeyA' : 'KeyD';
      turnUntil = now + between(2600, 4400);
    }
    await keyDown(turnDir);
    await keyUp(turnDir === 'KeyD' ? 'KeyA' : 'KeyD');
    await keyUp('KeyS');
    if (danger || seekClose) {
      wantThrust = false;
      wantBrake = !!((anyHostile && anyHostile.d < 95) || (nearestSolid && nearestSolid.d < 85) || seekClose);
    }
  }

  if (wantThrust) await keyDown('KeyW'); else await keyUp('KeyW');
  if (wantBrake) await keyDown('KeyS'); else await keyUp('KeyS');

  // Fire in bursts whenever a hostile is on screen and the nose is not pointed away to flee.
  if (now >= fireUntil) {
    fireOn = !fireOn;
    fireUntil = now + (fireOn ? between(700, 1300) : between(320, 700));
  }
  await leftButton(fireOn && !!hostile && !(danger && helm));
}

// ---------- throw state machine ----------
const THROW_REACH = 340;
let nextThrowAtSim = null;
let throwIndex = 0;
let seekLooseUntil = 0;

function pickLooseTarget(snap) {
  const candidates = [
    snap.loose?.nearestVisible, snap.loose?.nearest,
    snap.loose?.nearestVisibleThrowable, snap.loose?.nearestThrowable,
  ].filter(Boolean);
  // A rock without `throwable`/`isChunk` can ride the line but can never arm a throw (the
  // game's own isThrowArmPayload gate): aiming at one is a wasted attempt.
  const throwableOnly = candidates.filter((c) => c.throwable === true || c.type === 'payload');
  const inReach = throwableOnly.filter((c) => c.screen && c.screen.onScreen && c.d >= 18 && c.d <= THROW_REACH);
  const score = (row) => (row.throwable === true ? 0 : 120)
    + (row.type === 'asteroid' ? 0 : 12)
    - Math.min(70, row.radius || 0) * 0.35
    + Math.abs(row.d - 165) * 0.12;
  inReach.sort((a, b) => score(a) - score(b));
  if (inReach.length) return inReach[0];
  return null;
}

async function startThrow(snap, chosen = null) {
  let target = chosen || pickLooseTarget(snap);
  if (!target) return null;
  seekLooseUntil = 0;
  throwIndex += 1;
  const pageNow = await page.evaluate(() => performance.now()).catch(() => 0);
  const row = {
    index: throwIndex, t: rel(), target: `${target.type}#${target.id}`, targetId: target.id ?? null,
    d: target.d ?? null, radius: target.radius ?? null,
    phase: 'aim', latched: false, released: false, events: [], startedPageAt: pageNow,
  };
  facts.throws.rows.push(row);
  facts.throws.attempted += 1;
  await leftButton(false);
  await rightButton(false);
  await releaseKeys();
  await aimAt(target.screen);
  await sleep(420);
  let pre = await readScene();
  // The game's own massline preview is the authority on what a press would grab under this
  // cursor. Use it when it names a reachable body; that is exactly the highlight a player sees.
  const acqId = pre.acquisition?.targetId;
  const acqType = pre.acquisition?.targetType || null;
  row.acquisition = { targetId: acqId ?? null, type: acqType, reason: pre.acquisition?.reason ?? null };
  const swappable = !acqType || acqType === 'ship' || acqType === 'drone'
    || acqType === 'asteroid' || acqType === 'wreck' || acqType === 'payload';
  if (acqId != null && !swappable) {
    row.phase = 'blocked';
    step(`throw-${throwIndex}`, false, `the line would take a ${acqType || 'body'} — waiting for a clear rock`);
    await releaseAll();
    return { row, phase: 'done' };
  }
  if (acqId != null) {
    let acqRow = findTargetRow(pre, acqId);
    if (!acqRow?.screen) acqRow = await projectEntity(acqId) || acqRow;
    // The preview can also name a body that rides the line but can never be thrown (a rock
    // without the throwable flag, a civilian hull). Pressing there latches a dead end.
    if (acqRow || (acqType === 'asteroid' || acqType === 'wreck' || acqType === 'ship' || acqType === 'drone')) {
      const armable = await entityArmable(acqId);
      if (armable === false) {
        row.phase = 'blocked';
        step(`throw-${throwIndex}`, false, `the line would take ${acqType || 'a body'}#${acqId} — it rides but never throws`);
        await releaseAll();
        return { row, phase: 'done' };
      }
    }
    if (acqRow) {
      target = acqRow;
      row.target = `${target.type}#${target.id}`;
      row.targetId = target.id;
      row.d = target.d;
      row.radius = target.radius;
      if (target.screen) {
        await aimAt(target.screen);
        await sleep(180);
        pre = await readScene();
        row.acquisition2 = { targetId: pre.acquisition?.targetId ?? null, reason: pre.acquisition?.reason ?? null };
      }
    }
  } else {
    // No preview: nudge the cursor a hair and let the next tick resolve the body under it.
    await aimAt({ x: target.screen.x + 2, y: target.screen.y + 2 });
    await sleep(220);
    pre = await readScene();
    row.acquisition2 = { targetId: pre.acquisition?.targetId ?? null, reason: pre.acquisition?.reason ?? null };
  }
  if (!target.screen) {
    row.phase = 'no-screen';
    step(`throw-${throwIndex}`, false, `${row.target} has no screen point`);
    return { ...{ row }, phase: 'done' };
  }
  const aim = await canvasAimPoint(target.screen);
  row.clickPoint = { x: Math.round(aim.point.x), y: Math.round(aim.point.y) };
  row.clickElement = aim.hit;
  row.clickNudgePct = aim.moved;
  if (!aim.hit?.canvas) {
    // A press that lands on a HUD element is eaten before the canvas — and can even fire the
    // control under it. A player would re-aim first; skip the attempt instead of clicking blind.
    row.phase = 'blocked';
    step(`throw-${throwIndex}`, false, `${row.target} sits under ${aim.hit?.tag || 'a HUD element'} — no canvas to press`);
    await releaseAll();
    return { row, phase: 'done' };
  }
  if (aim.moved) {
    await aimAt(aim.point);
    await sleep(160);
    pre = await readScene();
    row.acquisition3 = { targetId: pre.acquisition?.targetId ?? null, reason: pre.acquisition?.reason ?? null };
  }
  const gate = await readScene();
  if (gate.ui?.card || gate.ui?.draft) {
    row.phase = 'interrupted';
    step(`throw-${throwIndex}`, false, 'a level card or draft opened before the press');
    await releaseAll();
    return { row, phase: 'done' };
  }
  await rightButton(true);
  await sleep(90);
  await rightButton(false); // the press that grabs is a click; the next press arms the throw
  row.phase = 'latch';
  return { row, phase: 'latch', until: Date.now() + 2400, retryAt: Date.now() + 900, retried: false };
}

function findTargetRow(snap, id) {
  if (!snap || id == null) return null;
  const rows = [
    snap.loose?.nearestVisible, snap.loose?.nearest,
    snap.loose?.nearestVisibleThrowable, snap.loose?.nearestThrowable,
    snap.hostiles?.nearestVisible, snap.hostiles?.nearest,
  ];
  return rows.find((r) => r && r.id === id) || null;
}

const readTetherEvents = (since) => page.evaluate((from) => (window.__swarmMinute?.events || [])
  .filter((e) => e.at >= from && /^(tether|massline):/.test(e.name))
  .map((e) => ({ name: e.name, at: e.at, targetId: e.targetId ?? null, payloadId: e.payloadId ?? null,
    open: e.open ?? null, mode: e.mode ?? null, reason: e.reason ?? null, text: e.text ?? null })), since).catch(() => []);

const projectEntity = (id) => page.evaluate((entityId) => {
  const st = window.SF && window.SF.state;
  const e = st && st.entities && st.entities.get(entityId);
  const w2s = window.SF?.ctx?.helpers?.worldToScreen;
  if (!e || !e.pos || !w2s) return null;
  let s = null;
  try { s = w2s(e.pos); } catch (_) { return null; }
  if (!s || !s.onScreen || s.behind) return null;
  const p = st.entities.get(st.playerId);
  return {
    id: e.id, type: e.type,
    d: p && p.pos ? Math.round(Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z)) : null,
    wx: e.pos.x, wz: e.pos.z, radius: Math.round(e.radius || 0),
    screen: { x: Math.round(s.x), y: Math.round(s.y), onScreen: true },
  };
}, id).catch(() => null);

// Mirror of the sim's isThrowArmPayload: what a press while latched can actually throw.
// Ships/drones count only when they fight the player (the hostile-team check the game runs).
const entityArmable = (id) => page.evaluate((entityId) => {
  const st = window.SF?.state;
  const e = st?.entities?.get(entityId);
  if (!e) return null;
  if (e.type === 'payload') return true;
  if (e.type === 'ship' || e.type === 'drone') {
    const me = st.entities.get(st.playerId);
    if (e.team != null && me?.team != null) return e.team !== me.team;
    return e.data?.hostile === true;
  }
  if (e.type === 'asteroid' || e.type === 'wreck') return e.data?.throwable === true || e.data?.isChunk === true;
  return false;
}, id).catch(() => null);

const elementAt = (point) => page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  return {
    tag: el?.tagName || null,
    id: el?.id || null,
    cls: typeof el?.className === 'string' ? el.className.slice(0, 60) : null,
    canvas: !!el && el.tagName === 'CANVAS',
  };
}, { x: point.x, y: point.y }).catch(() => ({ tag: null, canvas: false }));

// The flight adapter drops a mouse press whose target is a HUD control (off-canvas). Move the
// aim a little toward the screen centre — still on the body's acquisition disc — until the press
// lands on the canvas, as a player's pointer would.
async function canvasAimPoint(point) {
  const first = await elementAt(point);
  if (first.canvas) return { point, hit: first, moved: 0 };
  for (const t of [0.12, 0.25, 0.4, 0.58, 0.75]) {
    const p = { x: point.x + (viewW / 2 - point.x) * t, y: point.y + (viewH / 2 - point.y) * t };
    const hit = await elementAt(p);
    if (hit.canvas) return { point: p, hit, moved: Math.round(t * 100) };
  }
  return { point, hit: first, moved: null };
}

async function tickThrow(state, snap) {
  if (!state || state.phase === 'done' || state.phase === 'no-target') return state;
  const now = Date.now();
  const row = state.row;
  if (snap.ui?.card || snap.ui?.draft) {
    await releaseAll();
    row.phase = 'interrupted';
    step(`throw-${throwIndex}`, false, 'a level card or draft opened during the throw');
    return { ...state, phase: 'done' };
  }
  const helm = !(snap.scheme === 'pilot' || snap.scheme === 'classic');

  // The worker lane's mirrored state can lag the real attachment; the replayed bus events are
  // the truth the HUD uses, so latch/throw detection reads them first.
  const events = await readTetherEvents((row.startedPageAt || 0) - 200);
  if (events.length) row.events = events.slice(-10);
  const latchEv = events.find((e) => e.name === 'tether:latched');
  const payloadIds = new Set([row.latchedTargetId, row.targetId].filter((v) => v != null));
  const thrown = row.latched && events.find((e) => e.name === 'massline:throw'
    && (e.payloadId == null || payloadIds.has(e.payloadId)));

  // A real throw is good news in any phase — including a cut that flung the payload before the
  // tap landed. Claim it before anything else so a trailing event is never read as a break.
  if (thrown && !row.released) {
    row.released = true;
    row.phase = 'released';
    row.throwMode = thrown.mode || null;
    facts.throws.released += 1;
    const hostile = snap.hostiles?.nearestVisible;
    beat(`throw-${throwIndex}-release`, `payload ${thrown.payloadId}${thrown.mode ? ` (${thrown.mode})` : ''}${hostile ? ` toward ${hostile.type}#${hostile.id} at ${hostile.d} m` : ''}`);
    await shot(`throw-${throwIndex}-release`);
    await sleep(520);
    await shot(`throw-${throwIndex}-release-plus`);
    row.releasePlusCaptured = true;
    await releaseAll();
    step(`throw-${throwIndex}`, true, `latched ${row.latched} · released ${row.released} · ${(row.events || []).map((e) => e.name).join(',') || 'no event'}`);
    return { ...state, phase: 'done' };
  }

  if (row.latched && !row.released) {
    // The throw's own cut reports tether:broken a tick before massline:throw, so a bare break is
    // not a verdict yet — give the throw event a beat to trail in before calling the line lost.
    const broke = events.find((e) => e.name === 'tether:broken'
      && (e.targetId == null || payloadIds.has(e.targetId)));
    if (broke) {
      if (!state.brokeAt) { state.brokeAt = now; return state; }
      if (now - state.brokeAt < 700) return state;
      row.phase = 'broke';
      row.brokeReason = broke.text || broke.reason || null;
      await releaseAll();
      const armNote = row.latchedBody && row.latchedBody.armable === false
        ? ` — the line took a ${row.latchedBody.type} that cannot be thrown, so the press was a cut` : '';
      step(`throw-${throwIndex}`, false, `the line broke (${broke.text || broke.reason || 'reason not reported'})${armNote}`);
      return { ...state, phase: 'done' };
    }
  }

  if (!row.latched) {
    if (latchEv) {
      row.latched = true;
      row.latchedTargetId = latchEv.targetId;
      row.latchPageAt = latchEv.at;
      facts.throws.latched += 1;
      // What the line actually took, and whether it can arm a throw at all — the acquisition
      // preview can shift under a moving cursor, so record the truth the sim attached.
      row.latchedBody = await page.evaluate((id) => {
        const e = window.SF?.state?.entities?.get(id);
        if (!e) return null;
        return { type: e.type, armable: e.type === 'payload'
          || e.type === 'ship' || e.type === 'drone'
          || ((e.type === 'asteroid' || e.type === 'wreck') && (e.data?.throwable === true || e.data?.isChunk === true)) };
      }, latchEv.targetId).catch(() => null);
      beat(`throw-${throwIndex}-latch`, `${row.target} at ${row.d} m${latchEv.targetId !== row.targetId ? ` (the line took ${latchEv.targetId}${row.latchedBody ? `, a ${row.latchedBody.type}` : ''})` : ''}`);
      await shot(`throw-${throwIndex}-latch`);
      if (!helm) await keyDown('KeyW');
      else await keyUp('KeyW');
      await keyDown(rnd() < 0.5 ? 'KeyA' : 'KeyD');
      // The throw in the shipped 'snap' assist is a TAP on the lit cue — the press edge is what
      // throws, and a press with no window near still throws 'snap-manual'. Holding the button
      // does nothing here, so swing first and tap when the window opens (or when it never does).
      state.phase = 'swing';
      state.until = now + 3800;
      return state;
    }
    if (state.phase !== 'latch') return state;
    if (now > state.until) {
      row.phase = 'no-latch';
      await releaseAll();
      const denial = events.filter((e) => e.name === 'tether:latchDenied')
        .map((e) => e.text || e.reason).filter(Boolean).slice(-1)[0] || null;
      step(`throw-${throwIndex}`, false, `latch did not take on ${row.target}${denial ? ` (${denial})` : ''}`);
      return { ...state, phase: 'done' };
    }
    if (!state.retried && now > state.retryAt) {
      // A moving hull can slide out from under the cursor between the aim and the click. Re-aim
      // at where it is now and press again once.
      state.retried = true;
      const current = findTargetRow(snap, row.targetId);
      if (current?.screen) {
        await aimAt(current.screen);
        await sleep(120);
        await rightButton(true);
        await sleep(90);
        await rightButton(false);
      }
      state.until = now + 1600;
    }
    return state;
  }

  if (state.phase === 'swing') {
    // The lit cue: releaseWindow fires on open AND close, so only an open:true edge counts.
    const openEv = events.find((e) => e.name === 'massline:releaseWindow'
      && e.open !== false && (e.payloadId == null || payloadIds.has(e.payloadId))
      && e.at >= (row.latchPageAt || 0) - 60);
    if (openEv) row.releaseWindowAt = openEv.at;
    if (openEv || now > state.until) {
      const hostile = snap.hostiles?.nearestVisible || snap.hostiles?.nearest;
      if (hostile?.screen) await aimAt(clampPoint(hostile.screen));
      // The tap must land in the throw grammar, not the latch grammar: the input layer reads
      // the mirrored tether, which can trail the bus event by a frame or two.
      if (!snap.tether?.active && !state.waitedMirror) { state.waitedMirror = true; await sleep(260); }
      await sleep(90);
      await rightButton(true);
      await sleep(90);
      await rightButton(false);
      row.tapAt = rel();
      state.phase = 'await-throw';
      state.until = now + 1400;
    }
    return state;
  }
  if (state.phase === 'await-throw') {
    if (now > state.until) {
      // The tap found no throw. Hold the button now: under the authored 'arm' assist the hold is
      // what auto-throws on the next solution, and a press edge that arrived early still counts.
      await rightButton(true);
      state.phase = 'hold';
      state.until = now + 4500;
    }
    return state;
  }
  if (state.phase === 'hold') {
    if (now > state.until) {
      row.phase = 'release-refused';
      await releaseAll();
      step(`throw-${throwIndex}`, false, `latched ${row.target} but no press threw it (${(row.events || []).map((e) => e.name).join(',') || 'no event'})`);
      return { ...state, phase: 'done' };
    }
    return state;
  }
  if (state.phase === 'after') {
    if (now > state.until) {
      await releaseAll();
      await shot(`throw-${throwIndex}-release-plus`);
      step(`throw-${throwIndex}`, row.released, `latched ${row.latched} · released ${row.released} · ${(row.events || []).map((e) => e.name).join(',') || 'no event'}`);
      return { ...state, phase: 'done' };
    }
    return state;
  }
  return state;
}

// ---------- dying ----------
async function deathInput(snap, elapsedMs, now) {
  if (!snap.player || !snap.player.alive) return;
  const helm = !(snap.scheme === 'pilot' || snap.scheme === 'classic');
  const target = snap.hostiles?.nearest || snap.obstacle?.nearest || snap.loose?.nearest;
  if (helm) {
    // No dodging any more: point the nose at the nearest body and go. With nothing left to hit,
    // run for the frame edge (the room's wall) and let the hull take it.
    const point = target?.screen ? clampPoint(target.screen) : { x: viewW / 2, y: 40 };
    if (now % 300 < 150) await aimAt(point);
    await keyUp('KeyA');
    await keyUp('KeyD');
    await keyUp('KeyS');
    await keyDown('KeyW');
    return;
  }
  if (!target) { await releaseKeys(); return; }
  const err = angleError(snap.player, target);
  if (err != null && Math.abs(err) > 0.12) {
    if (err > 0) { await keyUp('KeyA'); await keyDown('KeyD'); }
    else { await keyUp('KeyD'); await keyDown('KeyA'); }
  } else {
    await keyUp('KeyA');
    await keyUp('KeyD');
  }
  await keyDown('KeyW');
  if (target.screen && now % 400 < 120) await aimAt(clampPoint(target.screen));
}

// ---------- run ----------
async function runProbe() {
  provisionElectronRuntime({ root: ROOT });
  const { _electron: electron } = await loadPlaywright();
  if (!electron) throw new Error('this Playwright build has no _electron; cannot drive the desktop build');
  const profileArg = argv.profile ? String(argv.profile) : '';
  const baseEnv = {
    ...process.env,
    SPACEFACE_EVIDENCE_CONTENT_SIZE: '1280x720',
    SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1',
  };
  if (profileArg) {
    // DEMO-LOAD-1 warm column: a persistent profile keeps Chromium's GPU/shader disk cache
    // between launches, so a second run on the same name measures the warm path. The dir must
    // still satisfy the evidence-profile naming contract (probe-*-<6 alnum> under the temp root).
    const root = launchProtocol.electronEvidenceProfileRoot(os.tmpdir());
    mkdirSync(root, { recursive: true });
    const safe = profileArg.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'warm';
    let h = 2166136261;
    for (const c of `swarm-minute-${safe}`) { h = (h ^ c.charCodeAt(0)) * 16777619; h >>>= 0; }
    const dir = path.join(root, `probe-swarm-minute-${safe}-${h.toString(36).padStart(6, '0').slice(-6)}`);
    mkdirSync(dir, { recursive: true });
    const userDataDir = path.resolve(dir);
    iso = {
      options: { args: ['.'], cwd: ROOT, timeout: 180_000, env: buildIsolatedElectronEnv({ baseEnv, userDataDir }) },
      mode: 'isolated-evidence',
      persistent: true,
      userDataDir,
      // The cache is the point: never delete the dir, but still require owned-runtime shutdown
      // before this probe reports success downstream (runtimeClosed is checked by main()).
      cleanup({ runtimeClosed: closed }) { if (!closed) throw new Error('owned runtime shutdown was not proven'); return true; },
    };
    facts.loading.profile = `persistent:${path.basename(userDataDir)}`;
  } else {
    iso = createIsolatedElectronLaunch({ root: ROOT, taskId: 'swarm-minute', timeout: 180_000, baseEnv });
    facts.loading.profile = 'cold:ephemeral';
  }
  log(`launching isolated Electron (${iso.mode}${iso.persistent ? ` persistent:${iso.userDataDir}` : ''})`);
  app = await electron.launch(iso.options);
  page = await app.firstWindow({ timeout: 120_000 });
  page.setDefaultTimeout(30_000);
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = String(m.text() || '');
    if (/Failed to load resource/i.test(text)) return;
    facts.consoleErrors.push({ t: rel(), at: Date.now(), kind: 'console', text: text.slice(0, 600) });
  });
  page.on('pageerror', (e) => {
    facts.consoleErrors.push({ t: rel(), at: Date.now(), kind: 'pageerror', text: String(e?.message || e).slice(0, 600) });
  });

  await bootToTitleElectron();
  facts.build = await page.evaluate(() => ({
    url: location.href,
    userAgent: navigator.userAgent,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    gpu: (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
        const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
        return gl ? { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null } : null;
      } catch (_) { return null; }
    })(),
  })).catch(() => null);
  if (facts.build?.viewport?.width) viewW = facts.build.viewport.width;
  if (facts.build?.viewport?.height) viewH = facts.build.viewport.height;
  await installObservers();
  await shot('title');

  // ONE PRESS: the Swarm door (its PLAY) from the title.
  const focus = await focusSwarmDoor();
  pressAt = Date.now();
  facts.times.pressAt = new Date(pressAt).toISOString();
  facts.times.titlePressMethod = focus.method;
  if (focus.method === 'enter') {
    await page.keyboard.press('Enter');
  } else {
    const box = await page.evaluate(() => {
      const b = document.querySelector('[data-screen="mainMenu"] [data-action="swarm"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!box) throw new Error('the Swarm door has no box on screen');
    await page.mouse.click(box.x, box.y);
  }
  beat('swarm-press', focus.method === 'enter' ? 'Enter on the focused Swarm door' : 'mouse click on the Swarm door');
  step('swarm-press', true, `one press (${focus.method}) from the title`);
  await sleep(250);
  await shot('swarm-press');

  // ---- 10 s sampling: fps (rAF), main-thread world speed, worker-pose world speed ----
  let sampleWallStart = Date.now();
  let sampleSimStart = null;
  let lastDiag = null;
  const sample10s = async () => {
    const wallNow = Date.now();
    const wallS = (wallNow - sampleWallStart) / 1000;
    const current = await readScene();
    const simNow = current.simTime;
    const frames = await takeRafFrames();
    const diag = await readDiag();
    const row = {
      t: rel(wallNow),
      wallS: Math.round(wallS * 10) / 10,
      fps: wallS > 0 ? Math.round((frames / wallS) * 10) / 10 : null,
      rafFrames: frames,
      simTime: simNow,
      worldSpeed: Number.isFinite(simNow) && Number.isFinite(sampleSimStart) && wallS > 0
        ? Math.round(((simNow - sampleSimStart) / wallS) * 1000) / 1000 : null,
      workerWorldSpeed: (() => {
        const p = diag && diag.pose;
        const q = lastDiag && lastDiag.pose;
        if (!p || !q || !Number.isFinite(p.simTime) || !Number.isFinite(q.simTime)
          || !Number.isFinite(p.workerWallMs) || !Number.isFinite(q.workerWallMs)) return null;
        const dw = (p.workerWallMs - q.workerWallMs) / 1000;
        return dw > 0 ? Math.round(((p.simTime - q.simTime) / dw) * 1000) / 1000 : null;
      })(),
      wave: current.wave,
      phase: current.phase,
      mode: current.mode,
      top: current.ui?.top ?? null,
      scheme: current.scheme,
      level: current.level,
      banked: current.banked,
      hostiles: current.hostiles?.count ?? null,
      hull: current.player?.hull ?? null,
      shield: current.player?.shield ?? null,
      lane: diag,
    };
    lastDiag = diag;
    facts.samples10s.push(row);
    sampleWallStart = wallNow;
    sampleSimStart = simNow;
    log(`10s sample: fps ${row.fps} · world ${row.worldSpeed}× · worker ${row.workerWorldSpeed}× · wave ${row.wave} · level ${row.level}`);
  };
  let lastSampleAt = Date.now();
  const maybeSample = async () => {
    if (Date.now() - lastSampleAt < 10_000) return;
    lastSampleAt = Date.now();
    await sample10s();
  };

  // Press -> the first live arena frame, and the first hostile a player can actually see in it.
  // The Crucible's preparation screen can sit over a fully loaded world while `run.phase` is
  // already `active`, so a hostile projected on screen there is not yet a hostile the player sees.
  let snap = null;
  let firstHostile = null;
  let roundActiveAt = null;
  let controlAt = null;
  let roundStartedAt = null;
  let handledOpeningDraft = false;
  const waitDeadline = Date.now() + 180_000;
  while (Date.now() < waitDeadline) {
    snap = await pump();
    if (snap.ui?.card && Date.now() - lastCardHandledAt > 1200) { await takeCard('opening-card'); continue; }
    if (snap.ui?.draft && !handledOpeningDraft && Date.now() - lastDraftHandledAt > 4000) {
      const outcome = await handleDraft('round1');
      handledOpeningDraft = true;
      if (outcome === 'card-first') continue;
    }
    if (snap.phase === 'active' && !roundActiveAt) {
      roundActiveAt = Date.now();
      facts.times.pressToRoundActiveS = Math.round((roundActiveAt - pressAt) / 100) / 10;
      step('round-phase-active', true, `wave ${snap.wave} active ${facts.times.pressToRoundActiveS.toFixed(1)} s after the press`);
    }
    const live = !!(!snap.ui?.bootOverlay && !snap.ui?.top && snap.phase === 'active' && snap.player && snap.player.alive);
    if (live && !controlAt) {
      controlAt = Date.now();
      roundStartedAt = snap.simTime;
      home = { x: snap.player.x, z: snap.player.z };
      facts.times.pressToLiveControlS = Math.round((controlAt - pressAt) / 100) / 10;
      beat('round-start', `wave ${snap.wave} live in the arena`);
      step('round-live', true, `${facts.times.pressToLiveControlS.toFixed(1)} s after the press (loading gone, no screen up) · scheme ${snap.scheme || '?'} · shield ${Math.round(snap.player.shield ?? -1)}/${Math.round(snap.player.shieldMax ?? -1)} hull ${Math.round(snap.player.hull ?? -1)}/${Math.round(snap.player.hullMax ?? -1)}`);
      await shot('round-start');
      await captureLoadingFinal('firstLaunch');
      break;
    }
    if (snap.ui?.runOver || snap.phase === 'ended') break;
    await maybeSample();
    await sleep(120);
  }
  if (!controlAt) throw new Error('the live arena never took control within 180 s');
  if (!Number.isFinite(roundStartedAt)) roundStartedAt = snap.simTime;

  // About 60 s of world time, then allow the ship to die. If the round is about to clear, give it a
  // short extension so the first level-up card (the packet's beat) is seen rather than missed.
  const PLAY_TARGET_S = 60;
  const PLAY_EXTEND_S = 105;
  const playStartSim = roundStartedAt;
  nextThrowAtSim = playStartSim + 3;
  let throwState = null;
  let playEnded = null;
  sampleWallStart = Date.now();
  sampleSimStart = playStartSim;

  while (true) {
    snap = await pump();
    if (!firstHostile && !snap.ui?.bootOverlay && !snap.ui?.top && snap.hostiles && snap.hostiles.visibleCount > 0) {
      firstHostile = { at: Date.now(), ...snap.hostiles.nearestVisible, count: snap.hostiles.visibleCount };
      facts.times.pressToFirstHostileS = Math.round((firstHostile.at - pressAt) / 100) / 10;
      beat('first-hostile', `${firstHostile.type}#${firstHostile.id} at ${firstHostile.d} m (${firstHostile.count} live)`);
      step('first-hostile', true, `${facts.times.pressToFirstHostileS.toFixed(1)} s after the press`);
      await shot('first-hostile');
    }
    if (snap.ui?.card && Date.now() - lastCardHandledAt > 1200) {
      await takeCard(`card-${facts.cards.length + 1}`);
      continue;
    }
    if (snap.ui?.draft && Date.now() - lastDraftHandledAt > 4000) {
      const outcome = await handleDraft(`wave-${snap.wave}`);
      if (outcome === 'card-first') continue;
    }
    if (snap.ui?.runOver || snap.phase === 'ended' || (snap.mode === 'flight' && snap.player?.alive === false)) {
      playEnded = 'run-over';
      break;
    }
    const simElapsed = Number.isFinite(snap.simTime) ? snap.simTime - playStartSim : 0;
    const cardSeen = facts.cards.length > 0;
    if (simElapsed >= PLAY_TARGET_S) {
      const hostilesLeft = snap.hostiles?.count ?? 0;
      const mayClearSoon = !cardSeen && hostilesLeft > 0 && hostilesLeft <= 6 && simElapsed < PLAY_EXTEND_S;
      if (!mayClearSoon) { playEnded = 'time'; break; }
    }
    await maybeSample();
    // Throws are the point: keep a short queue of real attempts in the opening minute. When no
    // loose body is on screen, spend a few seconds turning to the nearest one first. Never open a
    // new attempt while one is live — its releaseAll would fire the throw the old row is
    // waiting on, and the old row would be left hanging.
    const throwLive = throwState && throwState.phase !== 'done' && throwState.phase !== 'no-target';
    if (!throwLive && facts.throws.attempted < 9 && Number.isFinite(simElapsed) && simElapsed >= (nextThrowAtSim - playStartSim)) {
      const target = pickLooseTarget(snap);
      if (target) {
        throwState = await startThrow(snap, target);
        nextThrowAtSim = playStartSim + simElapsed + 6;
        continue;
      }
      seekLooseUntil = Date.now() + 6000;
      nextThrowAtSim = playStartSim + simElapsed + 2;
    }
    if (throwLive) {
      throwState = await tickThrow(throwState, snap);
      await sleep(80);
      continue;
    }
    await driveFlight(snap);
    await sleep(90);
  }
  await releaseAll();
  step('play', true, `${playEnded === 'time' ? '60 s of world time played' : 'the run ended during play'} · sim ${Math.round((snap.simTime || 0) - playStartSim)} s · throws ${facts.throws.attempted}/${facts.throws.latched}/${facts.throws.released}`);
  facts.times.playWorldS = Number.isFinite(snap.simTime) && Number.isFinite(playStartSim) ? Math.round((snap.simTime - playStartSim) * 10) / 10 : null;
  await shot('play-end');

  // Death and Run Over. Stop dodging; alternate drifting and flying into the nearest body.
  let deathSeen = false;
  let deathAt = null;
  let runOverAt = null;
  const deathDeadline = Date.now() + 90_000;
  while (Date.now() < deathDeadline) {
    snap = await pump();
    if (snap.ui?.card && Date.now() - lastCardHandledAt > 1200) { await takeCard('death-card'); continue; }
    if (snap.ui?.draft && Date.now() - lastDraftHandledAt > 4000) {
      const outcome = await handleDraft('death-draft');
      if (outcome === 'card-first') continue;
    }
    const deadNow = snap.phase === 'ended' || (snap.mode === 'flight' && snap.player && snap.player.alive === false);
    if (!deathSeen && deadNow) {
      deathSeen = true;
      deathAt = Date.now();
      facts.times.playToDeathS = Math.round((deathAt - pressAt) / 100) / 10;
      beat('death', snap.player ? `hull ${snap.player.hull}/${snap.player.hullMax}` : 'player body gone');
      step('death', true, `${facts.times.playToDeathS.toFixed(1)} s after the press`);
      await shot('death');
    }
    if (snap.ui?.runOver || (snap.ui?.again && snap.phase === 'ended')) {
      runOverAt = Date.now();
      break;
    }
    if (deathSeen && Date.now() - deathAt > 45_000) break;
    await maybeSample();
    await deathInput(snap, Date.now() - (deathAt || Date.now()), Date.now());
    await sleep(100);
  }
  await releaseAll();
  if (!runOverAt) {
    const last = await readScene();
    if (last.ui?.runOver) runOverAt = Date.now();
  }
  if (!runOverAt) {
    step('run-over', false, 'Run Over did not appear; death was not reached');
    facts.times.againPressToFirstHostileS = null;
    await sample10s().catch(() => {});
    facts.events = await page.evaluate(() => (window.__swarmMinute?.events || []).slice(-500)).catch(() => []);
    return;
  }
  await sleep(800);
  facts.runOverText = await readScreenText('.sf-runover');
  facts.runOverButtons = await readVisibleButtons();
  beat('run-over', `after ${Math.round((runOverAt - pressAt) / 100) / 10} s`);
  step('run-over', true, 'Run Over plate visible');
  await shot('run-over');

  // Again under Enter. The plate focuses Again; if anything else took focus, put it back first so
  // the press is the button the player sees (the plate answers Enter only for Again or the root).
  const againFocus = await page.evaluate(() => document.activeElement?.dataset?.action || null);
  if (againFocus !== 'again') {
    await page.evaluate(() => {
      const b = document.querySelector('.sf-runover [data-action="again"]');
      if (b && typeof b.focus === 'function') b.focus({ preventScroll: true });
    }).catch(() => {});
    await sleep(200);
  }
  const againAt = Date.now();
  facts.times.againPressAtS = rel(againAt);
  await page.keyboard.press('Enter');
  step('again-press', true, `Enter on Run Over (Again)${againFocus !== 'again' ? ' after focusing the button' : ''}`);
  await sleep(300);
  await shot('again-press');
  // The result plate closes a beat after the press. Do not read that stale plate as the new run.
  for (let i = 0; i < 25; i += 1) {
    const s = await readScene();
    if (!s.ui?.runOver) break;
    await sleep(200);
  }
  sampleWallStart = Date.now();
  sampleSimStart = null;
  lastSampleAt = Date.now();

  // Enter -> the first live arena frame of the new round 1, and its first hostile.
  let againFirstHostile = null;
  let againRoundAt = null;
  let againDraftHandled = false;
  let againRepresses = 0;
  let againLastRepressAt = 0;
  let againEndedEarly = null;
  const againWatchStart = Date.now();
  const againDeadline = againWatchStart + 180_000;
  let lastAgainSnap = null;
  while (Date.now() < againDeadline) {
    snap = await pump();
    lastAgainSnap = snap;
    if (snap.ui?.card && Date.now() - lastCardHandledAt > 1200) { await takeCard('again-card'); continue; }
    if (snap.ui?.draft && !againDraftHandled && Date.now() - lastDraftHandledAt > 4000) {
      const outcome = await handleDraft('again-round1');
      againDraftHandled = true;
      if (outcome === 'card-first') continue;
    }
    const liveAgain = !!(!snap.ui?.bootOverlay && !snap.ui?.top && snap.phase === 'active' && snap.player && snap.player.alive);
    if (liveAgain && !againRoundAt) {
      againRoundAt = Date.now();
      facts.times.againPressToLiveControlS = Math.round((againRoundAt - againAt) / 100) / 10;
      beat('again-round-start', `wave ${snap.wave} live in the arena`);
      step('again-round-live', true, `${facts.times.againPressToLiveControlS.toFixed(1)} s after Enter (world ready)`);
      // The new run resets the sim clock; do not divide the new world by the old window.
      sampleWallStart = Date.now();
      sampleSimStart = snap.simTime;
      lastDiag = null;
      lastSampleAt = Date.now();
      await shot('again-round-start');
    }
    if (!againFirstHostile && liveAgain && snap.hostiles && snap.hostiles.visibleCount > 0) {
      againFirstHostile = { at: Date.now(), ...snap.hostiles.nearestVisible };
      facts.times.againPressToFirstHostileS = Math.round((againFirstHostile.at - againAt) / 100) / 10;
      beat('again-first-hostile', `${againFirstHostile.type}#${againFirstHostile.id} at ${againFirstHostile.d} m`);
      step('again-first-hostile', true, `${facts.times.againPressToFirstHostileS.toFixed(1)} s after Enter`);
      await shot('again-first-hostile');
      break;
    }
    if (againRoundAt && (snap.ui?.runOver || snap.phase === 'ended')) {
      againEndedEarly = 'the new run ended before a hostile was seen';
      break;
    }
    if (!againRoundAt) {
      // The Enter press may have been eaten (focus lost) or landed on a different door. A
      // stranger who sees the plate still up presses Enter again; a stranger staring at the
      // main menu knows the press went somewhere else. Both beat 180 s of blind waiting.
      if (snap.ui?.runOver && againRepresses < 2 && Date.now() - againAt > 6000
        && Date.now() - againLastRepressAt > 7000) {
        againRepresses += 1;
        await page.evaluate(() => {
          const b = document.querySelector('.sf-runover [data-action="again"]');
          if (b && typeof b.focus === 'function') b.focus({ preventScroll: true });
        }).catch(() => {});
        await sleep(200);
        const stillAt = Date.now();
        await page.keyboard.press('Enter');
        againLastRepressAt = Date.now();
        step('again-repress', true, `Run Over plate still up ${Math.round((stillAt - againAt) / 100) / 10} s after the first Enter — pressed Again again`);
        continue;
      }
      const topName = snap.ui?.top ? String(snap.ui.top) : '';
      if (topName && !snap.ui?.runOver && /menu|hangar|option|setting|pause/i.test(topName)) {
        againEndedEarly = `the press opened ${topName} instead of Again`;
        break;
      }
    }
    if (liveAgain) await driveFlight(snap);
    await maybeSample();
    await sleep(120);
  }
  if (!againFirstHostile) {
    const s = lastAgainSnap || {};
    const watchedS = Math.round((Date.now() - againWatchStart) / 100) / 10;
    step('again-first-hostile', false,
      `watched ${watchedS.toFixed(1)} s of 180 s after Enter${againEndedEarly ? ` — ${againEndedEarly}` : ''} — last: phase ${s.phase} · mode ${s.mode} · top ${s.ui?.top || 'none'} · runOver ${!!s.ui?.runOver} · player ${s.player ? (s.player.alive ? 'alive' : 'dead') : 'none'} · hostiles ${s.hostiles?.count ?? '?'} (${s.hostiles?.visibleCount ?? 0} on screen)${againRoundAt ? '' : ' · live control never resumed'}`);
  }
  if (facts.times.againPressToFirstHostileS == null) facts.times.againPressToFirstHostileS = null;
  await releaseAll();
  await sample10s().catch(() => {});
  await captureLoadingFinal('again');
  facts.events = await page.evaluate(() => (window.__swarmMinute?.events || []).slice(-500)).catch(() => []);
}

// ---------- contact sheet ----------
function xml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function buildContactSheet() {
  const frames = facts.frames.filter((f) => f.file);
  if (!frames.length) return null;
  let cols = frames.length > 40 ? 5 : 4;
  let tileW = Math.floor(2880 / cols);
  let tileH = Math.round(tileW * 9 / 16);
  for (;;) {
    const rows = Math.ceil(frames.length / cols);
    if (rows * (tileH + 22) <= 15_000 || cols >= 8) break;
    cols += 1;
    tileW = Math.floor(2880 / cols);
    tileH = Math.round(tileW * 9 / 16);
  }
  const labelH = 22;
  const tiles = [];
  for (const f of frames) {
    const label = `${f.t >= 0 ? '+' : ''}${f.t.toFixed(1)}s ${f.beat}`;
    const svg = Buffer.from(
      `<svg width="${tileW}" height="${labelH}" xmlns="http://www.w3.org/2000/svg">`
      + `<rect width="${tileW}" height="${labelH}" fill="#0c1014"/>`
      + `<text x="6" y="15" font-family="monospace" font-size="13" fill="#e6edf5">${xml(label)}</text></svg>`,
    );
    try {
      const tile = await sharp(f.file).resize(tileW, tileH, { fit: 'fill' })
        .extend({ bottom: labelH, background: '#0c1014' })
        .composite([{ input: svg, top: tileH, left: 0 }])
        .png().toBuffer();
      tiles.push(tile);
    } catch (e) {
      log(`sheet tile failed for ${path.basename(f.file)}: ${e.message}`);
    }
  }
  if (!tiles.length) return null;
  const rows = Math.ceil(tiles.length / cols);
  const width = cols * tileW;
  const height = rows * (tileH + labelH);
  const file = path.join(OUT, 'contact.png');
  await sharp({ create: { width, height, channels: 3, background: '#05080b' } })
    .composite(tiles.map((input, i) => ({
      input,
      left: (i % cols) * tileW,
      top: Math.floor(i / cols) * (tileH + labelH),
    })))
    .png().toFile(file);
  log(`contact sheet ${path.relative(ROOT, file)} (${width}x${height}, ${tiles.length} frames)`);
  return file;
}

// ---------- close ----------
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
    // The close did not resolve: this probe owns the process and must not leave Electron running.
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
    await captureLoadingFinal('exit');
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
    let contact = null;
    try {
      contact = await buildContactSheet();
    } catch (e) {
      log(`contact sheet failed: ${e.message}`);
      facts.sheetError = String(e.message || e);
    }
    facts.contactSheet = contact ? path.relative(ROOT, contact) : null;
    facts.textLines.sort((a, b) => a.at - b.at);
    facts.beats.sort((a, b) => a.at - b.at);
    facts.frames.sort((a, b) => a.at - b.at);
    const reportPath = path.join(OUT, 'report.json');
    writeFileSync(reportPath, `${JSON.stringify(facts, null, 2)}\n`);
    const txt = facts.textLines.map((w) => `${w.t.toFixed(1)}s\t${w.line}`).join('\n');
    writeFileSync(path.join(OUT, 'text-lines.txt'), `${txt}\n`);
    log(`report ${path.relative(ROOT, reportPath)}`);
    log(`contact ${facts.contactSheet || 'none'}`);
    if (failure) process.exitCode = 1;
  }
}

await main();
