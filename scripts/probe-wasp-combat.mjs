#!/usr/bin/env node
// Focused probe: new game → accept hunter origin → sample the Rook Nine wasp's live AI
// stack inspect + firing intent every ~2s. Answers why the authored quarry never fires.
// Usage: node scripts/probe-wasp-combat.mjs
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SAMPLE_MS = 2000;
const SAMPLES = 120;

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

const sampleWasp = `(() => {
  const state = window.SF && window.SF.state;
  if (!state || !state.entities) return { err: 'no state' };
  const player = state.entities.get(state.playerId);
  let wasp = null;
  for (const e of state.entities.values()) {
    const ai = e && e.data && e.data.ai;
    if (ai && ai.zoneId === 'mission_helios_yard_perimeter') { wasp = e; break; }
  }
  if (!wasp) {
    const names = [];
    for (const e of state.entities.values()) {
      if (e && e.type === 'ship' && e.id !== state.playerId) {
        names.push({ id: e.id, name: e.data && (e.data.displayName || e.data.name) || null, zone: e.data && e.data.ai && e.data.ai.zoneId });
      }
    }
    return { err: 'no wasp', ships: names.slice(0, 12) };
  }
  const ai = wasp.data && wasp.data.ai || {};
  let inspect = null;
  try {
    const env = window.SF.helpers && window.SF.helpers.inspectAI
      ? window.SF.helpers.inspectAI({ entityId: wasp.id }) : null;
    const raw = env && env.result ? env.result : env;
    const dec = raw && raw.lastResult && Array.isArray(raw.lastResult.decisions)
      ? raw.lastResult.decisions.find((d) => d && d.entityId === wasp.id) || null : null;
    const contacts = raw && raw.perception && Array.isArray(raw.perception.contacts)
      ? raw.perception.contacts.map((c) => ({
          id: c.id, kind: c.kind, hostile: c.hostile, visible: c.visible,
          conf: +(Number(c.confidence) || 0).toFixed(2), alive: c.alive,
        })) : null;
    inspect = raw ? {
      doctrine: raw.combatDoctrine ? {
        phase: raw.combatDoctrine.phase, fireWindow: raw.combatDoctrine.fireWindow,
        targetId: raw.combatDoctrine.targetId, cycle: raw.combatDoctrine.cycle,
        phaseStartedTick: raw.combatDoctrine.phaseStartedTick,
      } : null,
      squads: raw.squads && typeof raw.squads === 'object' && !Array.isArray(raw.squads)
        ? Object.keys(raw.squads) : raw.squads || null,
      contacts,
      decision: dec ? {
        objKind: dec.directive && dec.directive.objective && dec.directive.objective.kind,
        objReason: dec.directive && dec.directive.objective && dec.directive.objective.reason,
        objTarget: dec.directive && dec.directive.objective && dec.directive.objective.targetId,
        actionId: dec.action && dec.action.actionId,
        maneuverKind: dec.maneuver && dec.maneuver.kind,
        doctrinePhase: dec.combatDoctrine && dec.combatDoctrine.phase,
        doctrineFireWindow: dec.combatDoctrine && dec.combatDoctrine.fireWindow,
      } : null,
    } : null;
  } catch (e) { inspect = { err: String(e && e.message || e) }; }
  return {
    tick: state.tick,
    wasp: {
      id: wasp.id, alive: wasp.alive !== false, hull: wasp.hull, shield: wasp.shield,
      pos: wasp.pos ? { x: Math.round(wasp.pos.x), z: Math.round(wasp.pos.z) } : null,
      dist: player && wasp.pos ? Math.round(Math.hypot(wasp.pos.x - player.pos.x, wasp.pos.z - player.pos.z)) : null,
      intent: wasp.data && wasp.data.intent || null,
      activity: ai.activity ? { kind: ai.activity.kind, reason: ai.activity.reason, targetId: ai.activity.targetId } : null,
      roe: ai.roe, passive: ai.passive ?? null,
      simTier: wasp.activity && wasp.activity.simTier || null,
    },
    inspect,
    attachments: Object.values(state.combat && state.combat.attachments && state.combat.attachments.byId || {})
      .map((a) => ({
        id: a.id, state: a.state, defId: a.defId,
        ownerId: a.ownerId, targetId: a.targetId,
        controlMode: a.controlMode || null, actionInstanceId: a.actionInstanceId || null,
        createdTick: a.createdTick,
        ownerName: state.entities.get(a.ownerId) && (state.entities.get(a.ownerId).data?.displayName || state.entities.get(a.ownerId).type),
        targetName: state.entities.get(a.targetId) && (state.entities.get(a.targetId).data?.displayName || state.entities.get(a.targetId).type),
      })),
    playerId: state.playerId,
    playerShield: player ? player.shield : null,
    playerHull: player ? player.hull : null,
    playerSpeed: player && player.vel ? Math.round(Math.hypot(player.vel.x, player.vel.z)) : null,
    playerPos: player && player.pos ? { x: Math.round(player.pos.x), z: Math.round(player.pos.z) } : null,
    flightMode: state.flight && state.flight.mode || null,
    autopilot: state.nav && state.nav.autopilot ? {
      active: state.nav.autopilot.active,
      targetEntityId: state.nav.autopilot.targetEntityId,
      label: state.nav.autopilot.label,
    } : null,
    hits: (window.__PROBE_HITS__ || []).length,
    lastHit: (window.__PROBE_HITS__ || []).at(-1) || null,
    playerDead: !!(player && player.alive === false),
    gameOver: !!document.querySelector('[data-screen="gameOver"]'),
  };
})()`;

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
    window.SF.bus.emit('game:new', { name: 'Wasp Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 120000 });
  console.log('[probe] flight reached');

  // Accept the hunter origin through the public mission-log path (KeyJ + career chip).
  await page.keyboard.press('KeyJ');
  await page.waitForSelector('[data-screen="missionLog"]', { state: 'visible', timeout: 20000 });
  const hunterCard = page.locator('[data-screen="missionLog"] [data-testid="mission-log-career-chip"][data-career-id="hunter"]');
  await hunterCard.waitFor({ state: 'visible', timeout: 20000 });
  await hunterCard.locator('button[data-career-act="originAccept"]').click();
  await page.waitForTimeout(800);
  const mission = await page.evaluate(() => {
    const m = (window.SF.state.missions.active || []).find((item) => item.originContractId === 'yard_writ');
    return m ? { id: m.id, targetId: m.storyTarget && m.storyTarget.id } : null;
  });
  console.log('[probe] mission accepted:', JSON.stringify(mission));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Arm the public flight-computer path to the wasp (same ui:setCourse the map button emits),
  // so the player closes into its sensor range while the probe samples the AI wiring.
  await page.evaluate(() => {
    const state = window.SF.state;
    let wasp = null;
    for (const e of state.entities.values()) {
      if (e && e.data && e.data.ai && e.data.ai.zoneId === 'mission_helios_yard_perimeter') { wasp = e; break; }
    }
    if (wasp) {
      window.SF.bus.emit('ui:setCourse', {
        type: 'ship', pos: { x: wasp.pos.x, z: wasp.pos.z },
        targetEntityId: wasp.id, label: 'Rook Nine', waypointKind: 'local',
        arrivalRadius: 120, autopilot: true,
      });
    }
  });
  console.log('[probe] autopilot armed to wasp');

  // Mirror the route's combat posture exactly: lock the wasp, arm autofire, leave the
  // flight computer armed (the route never disarms it), then yield with the dedicated
  // Digit0 brake — not Space, which is the Massline key and would latch the player tether.
  await page.evaluate(() => {
    const state = window.SF.state;
    let wasp = null;
    for (const e of state.entities.values()) {
      if (e && e.data && e.data.ai && e.data.ai.zoneId === 'mission_helios_yard_perimeter') { wasp = e; break; }
    }
    if (wasp && state.player) state.player.targetId = wasp.id;
    if (state.input) state.input.autoFire = true;
  });
  // Register a damage observer before engagement so every real hit is logged with its
  // applied amount and layer — this is the empirical TTK record the route depends on.
  await page.evaluate(() => {
    window.__PROBE_HITS__ = [];
    window.SF.bus.on('combat:damage', (p) => {
      if (p && p.targetId === window.SF.state.playerId) {
        window.__PROBE_HITS__.push({
          tick: window.SF.state.tick, applied: p.applied, kind: p.kind || p.damageType || null,
          dominantLayer: p.dominantLayer || null, sourceId: p.sourceId ?? p.attackerId ?? null,
          impulseApplied: p.impulseApplied ?? null,
        });
      }
    });
  });
  // Mirror the route: the brake posture starts on the FIRST natural hit, not on a distance
  // guess — the quarry is a maneuvering flyby hull and may not close to a fixed radius first.
  const engaged = await page.waitForFunction(() => (window.__PROBE_HITS__ || []).length > 0,
    null, { timeout: 150000 }).then(() => true).catch(() => false);
  console.log('[probe] first natural hit observed:', engaged);
  // Hold the dedicated Digit0 brake for the whole engagement — the exact route posture.
  await page.keyboard.down('Digit0');
  console.log('[probe] brake held — sampling the engagement');

  for (let i = 0; i < SAMPLES; i++) {
    const snap = await page.evaluate(sampleWasp);
    console.log(`[sample ${i}]`, JSON.stringify(snap));
    if (snap && snap.err === 'no wasp' && i > 10) break;
    if (snap && snap.gameOver) { console.log('[probe] gameOver reached'); break; }
    await page.waitForTimeout(SAMPLE_MS);
  }
  const hits = await page.evaluate(() => window.__PROBE_HITS__ || []);
  console.log('[probe] hit log:', JSON.stringify(hits.slice(-24)));
  await page.keyboard.up('Digit0').catch(() => {});
} catch (err) {
  console.error('probe failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* ok */ }
  try { if (server && server.child) server.child.kill(); } catch { /* ok */ }
}
