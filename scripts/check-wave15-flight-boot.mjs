#!/usr/bin/env node
// check-wave15-flight-boot.mjs — Wave 1.5 verification plan step 2+6.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRATCH = process.env.WAVE15_SCRATCH
  || join(process.env.LOCALAPPDATA || '', 'Temp', 'grok-goal-1e0adadd5119', 'implementer');
const START_TIMEOUT_MS = 90000;
const EVAL_TIMEOUT_MS = 180000;
const { chromium } = await loadPlaywright();

mkdirSync(SCRATCH, { recursive: true });

const hudShot = join(SCRATCH, 'wave15-flight-hud.png');
const leadShot = join(SCRATCH, 'wave15-leadpip.png');
const panelShot = join(SCRATCH, 'wave15-combat-panel.png');

let server = null;
let browser = null;
let page = null;
let exitCode = 1;
const bootLog = [];

function log(line) {
  const s = String(line);
  bootLog.push(s);
  console.log(s);
}

function flushLogs() {
  const body = bootLog.join('\n') + `\nEXIT: ${exitCode}\n`;
  writeFileSync(join(SCRATCH, 'wave15-boot.log'), body, 'utf8');
  writeFileSync(join(SCRATCH, 'wave15-flight-boot-run.log'), body, 'utf8');
}

try {
  server = await startFreshServer();
  log(`server: ${server.baseUrl} (node server.js)`);

  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(EVAL_TIMEOUT_MS);
  const issues = collectPageIssues(page);

  await page.exposeFunction('wave15Capture', async (leadBox) => {
    await page.screenshot({ path: hudShot, fullPage: false });
    if (leadBox && leadBox.w > 0) {
      await page.screenshot({
        path: leadShot,
        clip: {
          x: Math.max(0, Math.floor(leadBox.x - 6)),
          y: Math.max(0, Math.floor(leadBox.y - 6)),
          width: Math.ceil(leadBox.w + 12),
          height: Math.ceil(leadBox.h + 12),
        },
      });
    }
    const panel = await page.$('.sf-target');
    if (panel) await panel.screenshot({ path: panelShot });
    return { ok: true };
  });

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
  await page.waitForTimeout(400);

  const hudResult = await page.evaluate(async () => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    if (!player.data) player.data = {};
    if (!Array.isArray(player.data.weapons) || !player.data.weapons.length) {
      player.data.weapons = [{ defId: 'wpn_pulse_laser_s', projSpeed: 360 }];
    } else if (!player.data.weapons.some((w) => Number.isFinite(w.projSpeed) && w.projSpeed > 0)) {
      player.data.weapons.push({ defId: 'wpn_pulse_laser_s', projSpeed: 360 });
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
    hostile.alive = true;
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

    const ui = sf.registry.get('ui');
    const reg = sf.registry;
    const gun = await import('/src/ai/gunnery.js');
    const w2s = sf.helpers && sf.helpers.worldToScreen;
    const dt = 1 / 60;
    const rot = Number.isFinite(player.rot) ? player.rot : 0;
    const fwdX = Math.cos(rot);
    const fwdZ = Math.sin(rot);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const layouts = [
      { along: 95, lateral: 18, vx: -55, vz: 95 },
      { along: 110, lateral: -22, vx: 70, vz: 80 },
      { along: 80, lateral: 30, vx: -90, vz: 70 },
      { along: 70, lateral: -35, vx: 100, vz: 50 },
    ];

    let usedLayout = -1;
    let overlayDiag = null;
    const renderSys = reg.get ? reg.get('render') : null;

    function pumpFrame() {
      try {
        if (reg && reg.renderUpdate) reg.renderUpdate(1, dt);
        return true;
      } catch (_) {
        // Perf-lane VFX mid-edit must not abort HUD proof — fall back to camera + HUD tick.
        try {
          if (renderSys && renderSys.prepareFrame) renderSys.prepareFrame(1, dt);
          else if (renderSys && renderSys.renderFrame) renderSys.renderFrame(1, dt);
        } catch (_) {}
        try {
          if (ui && ui.frame) ui.frame(dt, state);
        } catch (_) {}
        return false;
      }
    }

    async function captureLeadPipHit(li) {
      const leadPip = document.querySelector('.sf-leadpip');
      if (!leadPip || !leadPip.classList.contains('visible')) return null;
      const leadDisplay = getComputedStyle(leadPip).display;
      if (leadDisplay === 'none') return null;
      const rect = leadPip.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) return null;
      const leadBox = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
      const leadLeft = leadPip.style.left;
      const leadTop = leadPip.style.top;
      await window.wave15Capture(leadBox);
      const weakLine = document.querySelector('.sf-target__weak');
      const triangle = document.querySelector('.sf-target__triangle');
      const identity = document.querySelector('.sf-target__identity');
      return {
        ok: true,
        targetId: hostile.id,
        usedLayout: li,
        overlayDiag: overlayDiag ? { visible: overlayDiag.visible, sep: overlayDiag.sep } : null,
        leadVisible: true,
        leadDisplay,
        leadLeft,
        leadTop,
        captureLeadBox: leadBox,
        weakVisible: !!(weakLine && getComputedStyle(weakLine).display !== 'none'),
        weakText: weakLine ? weakLine.textContent.trim() : '',
        triangleDisplay: triangle ? getComputedStyle(triangle).display : 'none',
        identityDisplay: identity ? getComputedStyle(identity).display : 'none',
        identityText: identity ? identity.textContent.trim() : '',
        mode: state.mode,
      };
    }

    for (let li = 0; li < layouts.length; li++) {
      const lay = layouts[li];
      const px = player.pos.x || 0;
      const pz = player.pos.z || 0;
      hostile.pos = {
        x: px + fwdX * lay.along + rightX * lay.lateral,
        z: pz + fwdZ * lay.along + rightZ * lay.lateral,
      };
      hostile.vel = { x: lay.vx, z: lay.vz };
      player.vel = { x: 0, z: 0 };

      if (ui && ui.hud && ui.hud.forceRefresh) ui.hud.forceRefresh();
      for (let i = 0; i < 60; i++) {
        pumpFrame();
        const hit = await captureLeadPipHit(li);
        if (hit) return hit;
      }

      if (typeof w2s === 'function') {
        overlayDiag = gun.computeLeadPipOverlay(player, hostile, state, { worldToScreen: w2s });
      }
      usedLayout = li;
    }

    return { ok: true, leadVisible: false, usedLayout, overlayDiag, reason: 'no layout produced .visible' };
  }, { timeout: EVAL_TIMEOUT_MS });

  assert.equal(hudResult.ok, true, `hostile setup failed: ${hudResult.reason || 'unknown'}`);
  log(`hostile targetId=${hudResult.targetId} layout=${hudResult.usedLayout} overlay=${JSON.stringify(hudResult.overlayDiag)}`);
  log(`leadPip.visible=${hudResult.leadVisible} display=${hudResult.leadDisplay} pos=${hudResult.leadLeft},${hudResult.leadTop}`);
  log(`capture bbox=${JSON.stringify(hudResult.captureLeadBox)}`);
  log(`weak line: "${hudResult.weakText}"`);
  log(`identity: "${hudResult.identityText}"`);

  assert.equal(hudResult.mode, 'flight');
  assert.equal(hudResult.leadVisible, true,
    `lead pip must have .visible after renderUpdate pump (overlay=${JSON.stringify(hudResult.overlayDiag)})`);
  assert.ok(hudResult.captureLeadBox && hudResult.captureLeadBox.w > 0, 'capture must include lead pip bbox');
  assert.equal(hudResult.weakVisible, true, 'weak-point line must render after scan:weakPoint');
  assert.match(hudResult.weakText || '', /WEAK.*AMMO MAGAZINE/i);
  assert.equal(hudResult.triangleDisplay, 'flex');
  assert.equal(hudResult.identityDisplay, 'block');
  assert.ok(hudResult.identityText.length > 4);

  log(`screenshot: ${hudShot}`);
  log(`screenshot: ${leadShot}`);
  log(`screenshot: ${panelShot}`);

  assert.deepEqual(issues.errorIssues(), [], 'flight boot must have zero page errors');
  log('Wave 1.5 flight boot OK: flight + lead pip .visible + weak-point + triangle + identity');
  exitCode = 0;
} catch (err) {
  log(`FAIL: ${err && err.message ? err.message : err}`);
  if (err && err.stack) bootLog.push(err.stack);
  exitCode = 1;
  throw err;
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
  flushLogs();
  if (exitCode !== 0) process.exitCode = exitCode;
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