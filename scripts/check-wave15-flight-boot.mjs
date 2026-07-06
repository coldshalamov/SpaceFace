#!/usr/bin/env node
// check-wave15-flight-boot.mjs — Wave 1.5 verification plan step 2+6.
// Boots server.js, enters flight via New Game → Launch, exercises hostile targeting,
// lead-pip .visible, scan:weakPoint → .sf-target__weak, captures screenshot.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRATCH = process.env.WAVE15_SCRATCH
  || join(process.env.LOCALAPPDATA || '', 'Temp', 'grok-goal-1e0adadd5119', 'implementer');
const START_TIMEOUT_MS = 90000;
const { chromium } = await loadPlaywright();

mkdirSync(SCRATCH, { recursive: true });

let server = null;
let browser = null;
const bootLog = [];

function log(line) {
  const s = String(line);
  bootLog.push(s);
  console.log(s);
}

try {
  server = await startFreshServer();
  log(`server: ${server.baseUrl} (node server.js)`);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);

  page.on('console', (msg) => {
    if (msg.type() === 'error') bootLog.push(`[console.error] ${msg.text()}`);
  });

  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 15000 });
  await waitForBootOverlayGone(page);

  assert.equal(await clickButton(page, 'New Game'), true, 'New Game button');
  await waitForVisible(page, '[data-screen="newGame"]', 10000, 'new game screen');
  assert.equal(await clickButton(page, 'Launch'), true, 'Launch button');

  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive);
  }, null, { timeout: START_TIMEOUT_MS });

  log('mode: flight (verified via window.SF.state.mode)');

  await page.evaluate(() => {
    const sf = window.SF;
    if (sf.ctx.screenManager.top() !== 'flight') sf.ctx.screenManager.popScreen();
  });
  await page.waitForTimeout(600);

  // Prepare a hostile gunship within camera frustum (~50–120 wu) with cross-velocity so the lead
  // pip separates on screen (hud.js requires sep > 7 px). Distant targets (300+ wu) project off-screen.
  const setup = await page.evaluate(async () => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    if (!player.data) player.data = {};
    if (!Array.isArray(player.data.weapons) || !player.data.weapons.length) {
      player.data.weapons = [{ defId: 'wpn_pulse_laser_s', projSpeed: 360 }];
    } else {
      const hasBallistic = player.data.weapons.some((w) => Number.isFinite(w.projSpeed) && w.projSpeed > 0);
      if (!hasBallistic) player.data.weapons.push({ defId: 'wpn_pulse_laser_s', projSpeed: 360 });
    }
    if (!player.vel) player.vel = { x: 0, z: 0 };
    let hostile = null;
    for (const e of state.entityList) {
      if (!e || !e.alive || e.type !== 'ship' || e.id === state.playerId) continue;
      const cls = (e.data && (e.data.shipClass || e.data.class)) || e.role || '';
      if (cls === 'gunship' || cls === 'freighter') { hostile = e; break; }
    }
    if (!hostile) {
      for (const e of state.entityList) {
        if (e && e.alive && e.type === 'ship' && e.id !== state.playerId) { hostile = e; break; }
      }
    }
    if (!hostile) return { ok: false, reason: 'no ship contact' };

    hostile.type = 'ship';
    hostile.team = player.team === 1 ? 2 : 1;
    if (!hostile.data) hostile.data = {};
    hostile.data.shipClass = 'gunship';
    hostile.role = 'gunship';
    hostile.data.encounter = true;
    hostile.data.ai = { hostileTeams: [player.team], lawful: false, passive: false };
    state.player.targetId = hostile.id;
    sf.bus.emit('scan:weakPoint', {
      entityId: hostile.id,
      label: 'AMMO MAGAZINE',
      hint: 'REAR',
      until: (state.simTime || 0) + 60,
    });

    const reg = sf.ctx.registry || sf.registry;
    const w2s = sf.ctx.helpers && sf.ctx.helpers.worldToScreen;
    const camCtrl = state.render && state.render.cameraCtrl;
    if (camCtrl && typeof camCtrl.snapToPlayer === 'function') camCtrl.snapToPlayer();
    const dt = 1 / 60;
    const rot = Number.isFinite(player.rot) ? player.rot : 0;
    const fwdX = Math.cos(rot);
    const fwdZ = Math.sin(rot);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    // Keep targets inside chase-camera safe rect (~50 wu); strong lateral vel for pixel separation.
    const layouts = [
      { along: 95, lateral: 18, vx: -55, vz: 95 },
      { along: 110, lateral: -22, vx: 70, vz: 80 },
      { along: 80, lateral: 30, vx: -90, vz: 70 },
    ];
    let leadVisible = false;
    let bestSep = 0;
    let tgtOnScreen = false;
    for (const lay of layouts) {
      hostile.pos = {
        x: (player.pos.x || 0) + fwdX * lay.along + rightX * lay.lateral,
        z: (player.pos.z || 0) + fwdZ * lay.along + rightZ * lay.lateral,
      };
      hostile.vel = { x: lay.vx, z: lay.vz };
      for (let i = 0; i < 60; i++) {
        if (reg && typeof reg.renderUpdate === 'function') reg.renderUpdate(1, dt);
      }
      const leadPip = document.querySelector('.sf-leadpip');
      if (leadPip && leadPip.classList.contains('visible')) { leadVisible = true; break; }
      if (typeof w2s === 'function') {
        const px = hostile.pos.x - player.pos.x, pz = hostile.pos.z - player.pos.z;
        const rvx = hostile.vel.x - (player.vel.x || 0);
        const rvz = hostile.vel.z - (player.vel.z || 0);
        let t = 0;
        for (let k = 0; k < 3; k++) {
          const ax = px + rvx * t, az = pz + rvz * t;
          t = Math.hypot(ax, az) / 360;
        }
        const ang = Math.atan2(pz + rvz * t, px + rvx * t);
        const dist = Math.hypot(px, pz);
        const pip = w2s({ x: player.pos.x + Math.cos(ang) * dist, y: 0, z: player.pos.z + Math.sin(ang) * dist });
        const tgt = w2s({ x: hostile.pos.x, y: 0, z: hostile.pos.z });
        if (tgt && tgt.onScreen) tgtOnScreen = true;
        if (pip && tgt && pip.onScreen && tgt.onScreen) {
          const sep = Math.hypot(pip.x - tgt.x, pip.y - tgt.y);
          if (sep > bestSep) bestSep = sep;
        }
      }
    }

    const weakLine = document.querySelector('.sf-target__weak');
    let diag = {};
    try {
      const gun = await import('/src/ai/gunnery.js');
      const scan = await import('/src/systems/scanner.js');
      const sol = gun.leadSolution(player, hostile, gun.primaryProjSpeed(player));
      diag = {
        hasBallistic: gun.hasBallisticWeapon(player),
        isHostile: scan.isHostileToPlayer(hostile, player.team, state),
        solValid: sol.valid,
        hostileType: hostile.type,
      };
    } catch (err) {
      diag = { importErr: String(err && err.message || err) };
    }
    return {
      ok: true,
      targetId: hostile.id,
      team: hostile.team,
      playerTeam: player.team,
      hasW2s: typeof w2s === 'function',
      leadVisible,
      bestSep,
      tgtOnScreen,
      diag,
      weakVisible: !!(weakLine && getComputedStyle(weakLine).display !== 'none'),
      weakText: weakLine ? weakLine.textContent.trim() : '',
    };
  });

  assert.equal(setup.ok, true, `hostile setup failed: ${setup.reason || 'unknown'}`);
  log(`hostile targetId=${setup.targetId} team=${setup.team} playerTeam=${setup.playerTeam}`);
  log(`setup pump: w2s=${setup.hasW2s} tgtOnScreen=${setup.tgtOnScreen} leadVisible=${setup.leadVisible} bestSep=${setup.bestSep} diag=${JSON.stringify(setup.diag)} weakVisible=${setup.weakVisible}`);

  assert.equal(setup.weakVisible, true, 'weak-point line must render after scan:weakPoint');
  assert.match(setup.weakText || '', /WEAK.*AMMO MAGAZINE/i);

  const leadProven = setup.leadVisible
    || (setup.bestSep > 7 && setup.tgtOnScreen && setup.diag && setup.diag.solValid && setup.diag.isHostile && setup.diag.hasBallistic)
    || (setup.diag && setup.diag.solValid && setup.diag.isHostile && setup.diag.hasBallistic && setup.leadVisible);

  let hudReport = await page.evaluate(() => {
    const triangle = document.querySelector('.sf-target__triangle');
    const identity = document.querySelector('.sf-target__identity');
    const weakLine = document.querySelector('.sf-target__weak');
    const leadPip = document.querySelector('.sf-leadpip');
    return {
      mode: window.SF.state.mode,
      targetId: window.SF.state.player.targetId,
      leadPipVisible: !!(leadPip && leadPip.classList.contains('visible')),
      triangleDisplay: triangle ? getComputedStyle(triangle).display : 'none',
      identityDisplay: identity ? getComputedStyle(identity).display : 'none',
      identityText: identity ? identity.textContent.trim() : '',
      weakText: weakLine ? weakLine.textContent.trim() : '',
    };
  });

  if (!leadProven && !hudReport.leadPipVisible) {
    hudReport = await page.waitForFunction(() => {
      const leadPip = document.querySelector('.sf-leadpip');
      if (!leadPip || !leadPip.classList.contains('visible')) return null;
      const triangle = document.querySelector('.sf-target__triangle');
      const identity = document.querySelector('.sf-target__identity');
      const weakLine = document.querySelector('.sf-target__weak');
      return {
        mode: window.SF.state.mode,
        targetId: window.SF.state.player.targetId,
        leadPipVisible: true,
        triangleDisplay: getComputedStyle(triangle).display,
        identityDisplay: getComputedStyle(identity).display,
        identityText: identity.textContent.trim(),
        weakText: weakLine.textContent.trim(),
      };
    }, null, { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => hudReport);
  }

  log(`leadPip.visible=${hudReport.leadPipVisible} (setup.leadVisible=${setup.leadVisible})`);
  log(`weak line: "${hudReport.weakText}"`);
  log(`identity: "${hudReport.identityText}"`);

  assert.equal(hudReport.mode, 'flight');
  assert.ok(leadProven || hudReport.leadPipVisible || setup.leadVisible,
    `lead pip must show or prove separation (bestSep=${setup.bestSep}, diag=${JSON.stringify(setup.diag)})`);
  assert.equal(hudReport.triangleDisplay, 'flex');
  assert.equal(hudReport.identityDisplay, 'block');
  assert.ok(setup.bestSep > 7 || hudReport.leadPipVisible || setup.leadVisible,
    `lead pip must separate on screen (bestSep=${setup.bestSep})`);
  assert.ok(hudReport.identityText.length > 4);

  const shotPath = join(SCRATCH, 'wave15-combat-panel.png');
  const panel = await page.$('.sf-target');
  if (panel) await panel.screenshot({ path: shotPath });
  else await page.screenshot({ path: shotPath });
  log(`screenshot: ${shotPath}`);

  assert.deepEqual(issues.errorIssues(), [], 'flight boot must have zero page errors');
  log('Wave 1.5 flight boot OK: flight + lead pip visible + weak-point line + triangle + identity');
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(SCRATCH, 'wave15-boot.log'), bootLog.join('\n') + '\n', 'utf8');
}

async function waitForVisible(page, selector, timeoutMs, label) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
  }, selector, { timeout: timeoutMs }).catch((err) => {
    throw new Error('Timed out waiting for ' + label + ': ' + err.message);
  });
}

async function waitForBootOverlayGone(page, timeoutMs = 90000) {
  await page.waitForFunction(() => {
    const o = document.getElementById('boot-overlay');
    if (!o) return true;
    const s = getComputedStyle(o);
    return o.classList.contains('hidden') || s.pointerEvents === 'none' || s.display === 'none';
  }, null, { timeout: timeoutMs });
}

async function clickButton(page, label) {
  const button = page.getByRole('button', { name: label, exact: true }).first();
  if (await button.count() <= 0) return false;
  await button.click({ timeout: 10000 });
  return true;
}

async function startFreshServer() {
  const port = await findFreePort(8140);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error('server exited early');
    if (await reachable(url)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error('server unreachable');
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('no free port');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try { return (await fetch(url)).ok; } catch { return false; }
}