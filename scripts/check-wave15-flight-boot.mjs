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

  // Prepare a hostile gunship with cross-velocity so the lead pip separates on screen (sep > 7).
  const setup = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
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

    hostile.team = player.team === 1 ? 2 : 1;
    if (!hostile.data) hostile.data = {};
    hostile.data.shipClass = 'gunship';
    hostile.role = 'gunship';
    hostile.data.encounter = true;
    if (!hostile.data.ai) hostile.data.ai = {};
    hostile.data.ai.hostileTeams = [player.team];
    hostile.vel = { x: 95, z: 55 };
    state.player.targetId = hostile.id;

    // Mirror scanner weak-point reveal (flag ON in browser).
    sf.bus.emit('scan:weakPoint', {
      entityId: hostile.id,
      label: 'AMMO MAGAZINE',
      hint: 'REAR',
      until: (state.simTime || 0) + 60,
    });

    return { ok: true, targetId: hostile.id, team: hostile.team, playerTeam: player.team };
  });

  assert.equal(setup.ok, true, `hostile setup failed: ${setup.reason || 'unknown'}`);
  log(`hostile targetId=${setup.targetId} team=${setup.team} playerTeam=${setup.playerTeam}`);

  // Wait for HUD render passes: lead pip .visible + weak-point line populated.
  const hudReport = await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf.state;
    const leadPip = document.querySelector('.sf-leadpip');
    const triangle = document.querySelector('.sf-target__triangle');
    const identity = document.querySelector('.sf-target__identity');
    const weakLine = document.querySelector('.sf-target__weak');
    const targetPanel = document.querySelector('.sf-target');
    const leadVisible = leadPip && leadPip.classList.contains('visible');
    const weakVisible = weakLine && getComputedStyle(weakLine).display !== 'none'
      && (weakLine.textContent || '').includes('WEAK');
    const triVisible = triangle && getComputedStyle(triangle).display === 'flex';
    const idVisible = identity && getComputedStyle(identity).display === 'block';
    if (!leadVisible || !weakVisible || !triVisible || !idVisible) return null;
    return {
      mode: state.mode,
      targetId: state.player.targetId,
      leadPipVisible: leadVisible,
      triangleDisplay: getComputedStyle(triangle).display,
      identityDisplay: getComputedStyle(identity).display,
      identityText: identity.textContent.trim(),
      weakText: weakLine.textContent.trim(),
      targetPanelVisible: targetPanel && getComputedStyle(targetPanel).display !== 'none',
    };
  }, null, { timeout: 12000 }).then((h) => h.jsonValue());

  log(`leadPip.visible=${hudReport.leadPipVisible}`);
  log(`weak line: "${hudReport.weakText}"`);
  log(`identity: "${hudReport.identityText}"`);

  assert.equal(hudReport.mode, 'flight');
  assert.equal(hudReport.leadPipVisible, true, 'lead pip must have .visible after hostile cross-velocity target');
  assert.equal(hudReport.triangleDisplay, 'flex');
  assert.equal(hudReport.identityDisplay, 'block');
  assert.match(hudReport.weakText, /WEAK.*AMMO MAGAZINE/i, 'weak-point line must show after scan:weakPoint');
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