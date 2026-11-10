#!/usr/bin/env node
// Focused probe: reproduce the public-route hunt — accept yard writ via KeyJ, arm the same
// ui:setCourse payload the map's Track Target emits, then sample quarry/player positions to see
// whether the quarry roams away or the pursuit diverges.
// Usage: node scripts/probe-hunt-pursuit.mjs
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function findSystemBrowser() {
  const candidates = process.platform === 'win32' ? [
    process.env.SPACEFACE_BROWSER_EXE,
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ] : [
    process.env.SPACEFACE_BROWSER_EXE,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), SF_PORT: String(port), SPACEFACE_PLAYER_STORE_DIR: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const baseUrl = `http://127.0.0.1:${port}/`;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server start timeout')), 25000);
    const tryFetch = async () => {
      for (let i = 0; i < 50; i++) {
        try {
          const r = await fetch(baseUrl);
          if (r.status) { clearTimeout(t); resolve(); return; }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 200));
      }
      clearTimeout(t);
      reject(new Error('server fetch timeout'));
    };
    tryFetch();
    child.on('error', reject);
    child.on('exit', (c) => reject(new Error('server exited ' + c)));
  });
  return { child, baseUrl };
}

let server = null;
let browser = null;
try {
  server = await startServer();
  const { chromium } = await loadPlaywright();
  const executablePath = findSystemBrowser();
  browser = await chromium.launch({
    headless: false,
    ...(executablePath ? { executablePath } : {}),
    args: ['--incognito', '--no-first-run', '--no-default-browser-check', '--disable-extensions'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ok */ }
  });
  page.on('pageerror', (err) => console.log('[pageerror]', String(err && err.message || err).slice(0, 300)));

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Hunt Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 120000 });
  console.log('[probe] flight ready');

  // Accept the yard writ through the public mission log, same as the route.
  await page.keyboard.press('KeyJ');
  await page.waitForSelector('[data-screen="missionLog"]', { state: 'visible', timeout: 20000 });
  const hunterCard = page.locator('[data-screen="missionLog"] [data-testid="mission-log-career-chip"][data-career-id="hunter"]');
  await hunterCard.waitFor({ state: 'visible', timeout: 20000 });
  await hunterCard.locator('button[data-career-act="originAccept"]').click();
  await page.waitForFunction(() => (window.SF.state.missions.active || []).some(
    (m) => m?.status === 'active' && m.originContractId === 'yard_writ'
      && Array.isArray(m.targetEntityIds) && m.targetEntityIds.length === 1,
  ), null, { timeout: 30000 });
  const mission = await page.evaluate(() => {
    const state = window.SF.state;
    const m = state.missions.active.find((x) => x?.status === 'active' && x.originContractId === 'yard_writ');
    const t = m && state.entities.get(m.targetEntityIds[0]);
    return { id: m.id, targetId: t?.id ?? m.targetEntityIds[0], targetPos: t ? { x: t.pos.x, z: t.pos.z } : null };
  });
  console.log('[probe] writ accepted:', JSON.stringify(mission));
  await page.keyboard.press('Escape');

  // Arm the same course the map's Track Target emits.
  await page.evaluate((targetId) => {
    const state = window.SF.state;
    const t = state.entities.get(targetId);
    window.SF.bus.emit('ui:setCourse', {
      type: 'local',
      pos: t ? { x: t.pos.x, z: t.pos.z } : { x: 0, z: 0 },
      label: 'Rook Nine',
      reason: 'Rook Nine',
      waypointKind: 'local',
      arrivalRadius: 48,
      autopilot: true,
      targetEntityId: targetId,
    });
  }, mission.targetId);

  const t0 = Date.now();
  const deadline = t0 + 300_000;
  while (Date.now() < deadline) {
    const s = await page.evaluate((targetId) => {
      const state = window.SF.state;
      const p = state.entities.get(state.playerId);
      const t = state.entities.get(targetId);
      const ap = state.nav && state.nav.autopilot;
      return {
        simTime: Math.round((state.simTime || 0) * 10) / 10,
        sector: state.world?.currentSectorId,
        playerPos: p && p.pos ? { x: Math.round(p.pos.x), z: Math.round(p.pos.z) } : null,
        playerSpeed: p && p.vel ? Math.round(Math.hypot(p.vel.x, p.vel.z)) : null,
        playerHull: p ? Math.round(p.hull) : null,
        targetPos: t && t.pos ? { x: Math.round(t.pos.x), z: Math.round(t.pos.z) } : null,
        targetAlive: t ? t.alive !== false : null,
        targetVel: t && t.vel ? Math.round(Math.hypot(t.vel.x, t.vel.z)) : null,
        dist: (p && p.pos && t && t.pos)
          ? Math.round(Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z)) : null,
        autopilot: ap ? { active: ap.active, targetEntityId: ap.targetEntityId, label: ap.label } : null,
        locked: state.player?.targetId ?? null,
      };
    }, mission.targetId);
    console.log(`[probe] +${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(s));
    if (s.targetAlive === false) { console.log('[probe] quarry dead'); break; }
    await page.waitForTimeout(5000);
  }
} catch (err) {
  console.error('probe failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* ok */ }
  try { if (server && server.child) server.child.kill(); } catch { /* ok */ }
}
