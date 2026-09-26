#!/usr/bin/env node
// Focused diagnostic: boot → accept the Yard Perimeter Writ → wait for Rook Nine → dump, per poll,
// the exact cycleTarget gate verdict for the live mark (type membership, hostility, presentation
// admission, distance) plus a few real Tab presses. Names which gate a warranted quarry fails
// without replaying the ~10 min public-route preamble. It performs ONE deliberate sim write —
// parking the player ~64 WU from the mark — which the header comment in the acceptance check
// forbids for the route itself but is this probe's entire purpose. Runs headless; the headed
// route's admission drain may differ, so use it to name the failing gate, not to time it.
// Usage: node scripts/probe-hunt-lock-gates.mjs
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

const GATE_DUMP = `(async () => {
  const [{ isHostileToPlayer }, { presentationAllowsTargetLock }, { verbAcceptsType }, { indexedShipLikeScan }] = await Promise.all([
    import('/src/systems/scanner.js'),
    import('/src/core/presentationAdmission.js'),
    import('/src/data/interactionDescriptorCatalog.js'),
    import('/src/world/livingWorldViews.js'),
  ]);
  const state = window.SF.state;
  const player = state.entities.get(state.playerId);
  const mission = (state.missions?.active || [])
    .find((m) => m?.originCareer === 'hunter' && m?.originContractId === 'yard_writ');
  const quarry = mission && mission.targetEntityIds && mission.targetEntityIds[0] != null
    ? state.entities.get(mission.targetEntityIds[0]) : null;
  const index = state.entityIndex;
  const verdict = (e) => {
    if (!e || !e.pos || !player || !player.pos) return null;
    const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    const ai = e.data && e.data.ai;
    return {
      id: e.id, type: e.type, team: e.team, dist: Math.round(d),
      name: e.data?.name || e.data?.callsign || null,
      acceptsType: verbAcceptsType('target', e.type),
      hostile: isHostileToPlayer(e, player.team, state),
      lockOk: presentationAllowsTargetLock(e, state),
      admission: e.presentationAdmission ?? null,
      passive: ai?.passive ?? null,
      lawful: ai?.lawful ?? null,
      hostileTeams: ai?.hostileTeams ?? null,
      spawnContext: ai?.spawnContext ?? null,
      combatTargetId: e.data?.combat?.targetId ?? null,
      missionId: e.data?.missionId || e.data?.missionTag || null,
      inIndex: !!(index && index.__spacefaceEntityIndexV1 && index.ready === true
        && Array.isArray(index.shipLike) && index.shipLike.includes(e)),
      indexReady: !!(index && index.__spacefaceEntityIndexV1 && index.ready === true),
    };
  };
  const ships = indexedShipLikeScan(state);
  const cookLane = typeof state.render?.sampleOpeningCookLane === 'function'
    ? state.render.sampleOpeningCookLane() : null;
  return {
    simTime: Math.round((state.simTime || 0) * 10) / 10,
    // Without a render scene presentationAllowsTargetLock returns true unconditionally — a
    // GL-less run would report lockOk:true and mask the very gate under investigation.
    hasScene: !!state.render?.scene,
    cookLane,
    missionFound: !!mission, missionId: mission?.id || null,
    targetEntityIds: mission?.targetEntityIds || null,
    indexReady: !!(index && index.__spacefaceEntityIndexV1 && index.ready === true),
    shipLikeCount: Array.isArray(ships) ? ships.length : -1,
    playerTargetId: state.player?.targetId ?? null,
    playerPos: player?.pos ? { x: Math.round(player.pos.x), z: Math.round(player.pos.z) } : null,
    quarry: quarry ? verdict(quarry) : null,
    nearShips: (Array.isArray(ships) ? ships : [])
      .map(verdict).filter((v) => v && v.dist <= 5200).slice(0, 12),
  };
})()`;

let server = null;
let browser = null;
try {
  server = await startServer();
  const { chromium } = await loadPlaywright();
  const executablePath = findSystemBrowser();
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--incognito', '--no-first-run', '--no-default-browser-check', '--disable-extensions'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ok */ }
  });
  page.on('pageerror', (err) => console.log('[pageerror]', String(err && err.message || err).slice(0, 300)));

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Lock Gate Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 300000 });
  console.log('[probe] flight reached');

  await page.keyboard.press('KeyJ');
  await page.waitForSelector('[data-screen="missionLog"]', { state: 'visible', timeout: 20000 });
  const hunterCard = page.locator('[data-screen="missionLog"] [data-testid="mission-log-career-chip"][data-career-id="hunter"]');
  await hunterCard.waitFor({ state: 'visible', timeout: 20000 });
  await hunterCard.locator('button[data-career-act="originAccept"]').click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-screen="missionLog"]', { state: 'hidden', timeout: 10000 });

  // Recreate the check's conditions: park the player within point-blank range of the mark, then
  // measure how many sim-seconds the presentation admission actually takes to resolve there.
  await page.evaluate(() => {
    const state = window.SF.state;
    const mission = (state.missions?.active || [])
      .find((m) => m?.originCareer === 'hunter' && m?.originContractId === 'yard_writ');
    const quarry = mission && state.entities.get(mission.targetEntityIds[0]);
    const player = state.entities.get(state.playerId);
    if (quarry && player && quarry.pos) {
      player.pos.x = quarry.pos.x + 55;
      player.pos.z = quarry.pos.z + 30;
      if (player.vel) { player.vel.x = 0; player.vel.z = 0; }
    }
  });
  console.log('[probe] player parked ~64 WU from the mark');
  // Poll the gate verdict every ~5s wall, logging admission transitions + cook-lane counters so a
  // stalled admission queue is distinguishable from a merely slow one on a contended host.
  const seen = new Map();
  const drainMs = Number(process.env.SPACEFACE_LOCK_GATE_DRAIN_MS) || 150_000;
  const drainStart = Date.now();
  while (Date.now() - drainStart < drainMs) {
    const dump = await page.evaluate(GATE_DUMP);
    const now = [];
    for (const v of [dump.quarry, ...(dump.nearShips || [])].filter(Boolean)) {
      const key = `${v.id}`;
      if (seen.get(key) !== v.admission) {
        console.log(`[probe] transition sim=${dump.simTime} id=${key} ${seen.get(key) ?? '∅'} -> ${v.admission} name=${v.name ?? '?'}`);
        seen.set(key, v.admission);
      }
      if (v.admission === 'pending') now.push(`${v.id}:${v.dist}`);
    }
    console.log(`[probe] sim=${dump.simTime} pending=${now.length} [${now.join(',')}] cook=${JSON.stringify(dump.cookLane)} quarry=${JSON.stringify(dump.quarry)}`);
    if (dump.quarry && dump.quarry.lockOk && dump.quarry.hostile && dump.quarry.acceptsType) break;
    if (now.length === 0) break;
    await page.waitForTimeout(5000);
  }
  for (let i = 0; i < 6; i++) {
    await page.locator('#gl-canvas').focus().catch(() => {});
    await page.keyboard.press('Tab');
    await page.waitForTimeout(600);
    const after = await page.evaluate(`(() => ({
      targetId: window.SF.state.player?.targetId ?? null,
      targetName: (() => { const t = window.SF.state.entities.get(window.SF.state.player?.targetId); return t?.data?.name || t?.data?.callsign || t?.type || null; })(),
    }))()`);
    console.log(`[probe] tab${i}:`, JSON.stringify(after));
    if (after.targetId != null) break;
  }
  const finalDump = await page.evaluate(GATE_DUMP);
  console.log('[probe] final:', JSON.stringify(finalDump));
} catch (err) {
  console.error('probe failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* ok */ }
  try { if (server && server.child) server.child.kill(); } catch { /* ok */ }
}
