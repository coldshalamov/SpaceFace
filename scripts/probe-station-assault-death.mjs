#!/usr/bin/env node
// Focused probe: new game → public flight → fire on Coalition HQ inside its lawful
// protection volume (which overlaps the Customs Corridor ambient patrol pocket) →
// CONTROL incident → sustained lawful hits → WANTED/BOUNTY → responders + patrols
// + warrant hunter → ordinary-combat death.
// Verifies the death leg used by check-m3-player-facing-public-route.mjs without the
// 7-minute Hunter preamble. Usage: node scripts/probe-station-assault-death.mjs
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TARGET_STATION = 'station_coalition';
const TARGET_LABEL = 'Coalition HQ';

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

const OBSERVE = `(() => {
  const state = window.SF && window.SF.state;
  if (!state || !state.entities) return { err: 'no state' };
  const player = state.entities.get(state.playerId);
  let station = null;
  for (const e of state.entities.values()) {
    if (e && e.type === 'station' && e.alive !== false
      && (e.data?.stationId === '${TARGET_STATION}' || e.stationId === '${TARGET_STATION}')) { station = e; break; }
  }
  let shooters = 0;
  const shooterList = [];
  for (const e of state.entities.values()) {
    const ai = e && e.data && e.data.ai;
    const combat = e && e.data && e.data.combat;
    const intent = e && e.data && e.data.intent;
    if (e && e.alive !== false && e.type === 'ship' && e.id !== state.playerId
      && (combat && combat.targetId === state.playerId
        || intent && intent.targetId === state.playerId
        || ai && ai.securityTargetId === state.playerId)) {
      shooters++;
      shooterList.push({
        id: e.id, hull: Math.round(e.hull || 0),
        motive: ai && ai.motive, trigger: ai && ai.engagementTrigger,
        fire: intent ? !!intent.fire : null,
        dist: player && e.pos ? Math.round(Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z)) : null,
      });
    }
  }
  return {
    tick: state.tick,
    simTime: Math.round(state.simTime || 0),
    mode: state.mode,
    playerAlive: player && player.alive !== false && Number(player.hull || 0) > 0,
    shield: player ? Math.round(player.shield || 0) : null,
    hull: player ? Math.round(player.hull || 0) : null,
    speed: player && player.vel ? Math.round(Math.hypot(player.vel.x, player.vel.z)) : null,
    heat: state.player ? Number((state.player.heat || 0).toFixed(3)) : null,
    stationId: station && station.id,
    stationDist: player && station ? Math.round(Math.hypot(station.pos.x - player.pos.x, station.pos.z - player.pos.z)) : null,
    incidents: (window.__PROBE_LAW__ || []),
    stationHits: (window.__PROBE_HITS__ || []).filter((h) => station && String(h.targetId) === String(station.id)).length,
    outgoingHits: (window.__PROBE_HITS__ || []).length,
    playerHits: (window.__PROBE_IN__ || []).length,
    inputFire: state.input ? !!state.input.fire : null,
    shooters,
    shooterList,
    autopilot: state.nav && state.nav.autopilot ? { active: state.nav.autopilot.active, label: state.nav.autopilot.label } : null,
    gameOver: !!document.querySelector('[data-screen="gameOver"]')
      && !document.querySelector('[data-screen="gameOver"]').hidden,
  };
})()`;

// Aim at the station bearing — the deterministic death route's posture. Firing at the
// station keeps player_assault lastDamageAt fresh WITHOUT shredding responders: aiming at
// lawful ships instead lets the player's return fire rout the response past its morale
// retreat fraction before the exchange can kill.
function aimAtLawful(stationId) {
  const state = window.SF.state;
  const player = state.entities.get(state.playerId);
  const project = window.SF.helpers && window.SF.helpers.worldToScreen;
  const canvas = document.getElementById('gl-canvas');
  if (!player || !project || !canvas) return null;
  const target = (() => {
    for (const e of state.entities.values()) {
      if (e && e.type === 'station' && e.alive !== false
        && (e.data?.stationId === stationId || e.stationId === stationId)) return e;
    }
    return null;
  })();
  if (!target) return null;
  const dx = target.pos.x - player.pos.x;
  const dz = target.pos.z - player.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  for (const leg of [dist, Math.min(260, dist * 0.6), Math.min(180, dist * 0.4), Math.min(120, dist * 0.25), Math.min(60, dist * 0.1), Math.min(30, dist * 0.05)]) {
    const out = project({ x: player.pos.x + (dx / dist) * leg, y: 0, z: player.pos.z + (dz / dist) * leg });
    if (!out || out.onScreen !== true) continue;
    const top = document.elementFromPoint(out.x, out.y);
    if (top === canvas || canvas.contains(top)) return { x: out.x, y: out.y, leg, targetId: target.id, targetType: target.type, targetDist: Math.round(dist) };
  }
  return null;
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
    window.SF.bus.emit('game:new', { name: 'Assault Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 120000 });
  console.log('[probe] flight reached');

  await page.evaluate(() => {
    window.__PROBE_HITS__ = [];
    window.__PROBE_IN__ = [];
    window.__PROBE_LAW__ = [];
    window.SF.bus.on('combat:damage', (p) => {
      if (p && p.attackerId === window.SF.state.playerId) window.__PROBE_HITS__.push({ targetId: p.targetId, applied: p.applied });
      if (p && p.targetId === window.SF.state.playerId) window.__PROBE_IN__.push({ attackerId: p.attackerId, applied: p.applied });
    });
    for (const ev of ['law:incidentOpened', 'law:dispatchStarted', 'law:distressRaised']) {
      window.SF.bus.on(ev, (p) => window.__PROBE_LAW__.push({ event: ev, cause: p && p.cause, status: p && p.status }));
    }
  });

  const start = await page.evaluate(OBSERVE);
  console.log('[probe] start:', JSON.stringify(start));

  // Public flight computer to the target station.
  if (!start.stationId) throw new Error(`no ${TARGET_STATION} entity found`);
  await page.evaluate(({ stationId, label }) => {
    const station = window.SF.state.entities.get(stationId);
    window.SF.bus.emit('ui:setCourse', {
      type: 'station',
      pos: { x: station.pos.x, z: station.pos.z },
      targetEntityId: stationId,
      label,
      waypointKind: 'nav',
      arrivalRadius: 90,
      autopilot: true,
    });
  }, { stationId: start.stationId, label: TARGET_LABEL });
  const arriveDeadline = Date.now() + 300000;
  let arrived = false;
  while (Date.now() < arriveDeadline) {
    const snap = await page.evaluate(OBSERVE);
    if (snap.stationDist != null && snap.stationDist < 450) { arrived = true; break; }
    console.log('[probe] approaching:', JSON.stringify({ dist: snap.stationDist, speed: snap.speed, autopilot: snap.autopilot }));
    await page.waitForTimeout(3000);
  }
  if (!arrived) throw new Error(`autopilot never brought the player inside 450 WU of ${TARGET_LABEL}`);
  console.log('[probe] arrived inside 450 WU');

  // Public brake.
  await page.keyboard.down('Digit0');
  await page.waitForFunction(() => {
    const st = window.SF.state;
    const p = st.entities.get(st.playerId);
    return p && p.vel && Math.hypot(p.vel.x || 0, p.vel.z || 0) < 20;
  }, null, { timeout: 30000 });
  console.log('[probe] braked:', JSON.stringify(await page.evaluate(OBSERVE)));

  // Cursor aim at the nearest lawful ship (or the station bearing), then hold LMB for
  // the whole watch: sustained lawful hits raise heat → WANTED → BOUNTY → more shooters.
  const aim = await page.evaluate(aimAtLawful, TARGET_STATION);
  console.log('[probe] aim point:', JSON.stringify(aim));
  if (!aim) throw new Error('no canvas-clear aim point on a lawful target');
  await page.mouse.move(Math.round(aim.x), Math.round(aim.y));
  await page.mouse.down();

  const deadline = Date.now() + 720000;
  let over = false;
  let lastReaim = 0;
  let lastAuthDump = 0;
  while (Date.now() < deadline) {
    const snap = await page.evaluate(OBSERVE);
    console.log('[probe]', JSON.stringify(snap));
    if (snap.gameOver) { over = true; break; }
    // Re-aim at the nearest lawful target every ~2s like a player tracking it.
    if (Date.now() - lastReaim > 2000 && snap.playerAlive) {
      lastReaim = Date.now();
      const re = await page.evaluate(aimAtLawful, TARGET_STATION);
      if (re) await page.mouse.move(Math.round(re.x), Math.round(re.y));
    }
    if (Date.now() - lastAuthDump > 15000 && snap.shooterList.length > 0) {
      lastAuthDump = Date.now();
      const auth = await page.evaluate(async () => {
        window.__SF_PUBLISH_SG02_TELEMETRY__ = true;
        const state = window.SF.state;
        const player = state.entities.get(state.playerId);
        const mod = await import('/src/ai/engagementAuthority.js');
        const phys = await import('/src/core/physicsAuthority.js');
        const flight = await import('/src/core/flightDynamics.js');
        const portsDiag = (() => { try {
          const sys = window.SF.registry && window.SF.registry.get('aiPorts');
          return sys && typeof sys.inspect === 'function' ? sys.inspect() : null;
        } catch (err) { return { err: String(err && err.message || err) }; } })();
        const out = [{ aiPortsDiag: portsDiag }];
        for (const e of state.entities.values()) {
          const ai = e && e.data && e.data.ai;
          const combat = e && e.data && e.data.combat;
          if (!e || e.alive === false || e.type !== 'ship' || e.id === state.playerId) continue;
          if (!(combat && combat.targetId === state.playerId)
            && !(ai && ai.securityTargetId === state.playerId)) continue;
          let maneuverState = null;
          const decision = window.SF.helpers && window.SF.helpers.inspectAI
            ? (() => { try {
                const env = window.SF.helpers.inspectAI({ entityId: e.id });
                const raw = env && env.result ? env.result : env;
                const m = raw && raw.maneuver;
                if (m) {
                  const req = m.lastRequest || {};
                  maneuverState = {
                    stationaryTicks: m.stationaryTicks,
                    lastKind: m.lastKind,
                    req: {
                      kind: req.kind, reason: req.reason,
                      forward: req.forceLocal && req.forceLocal.forward,
                      right: req.forceLocal && req.forceLocal.right,
                      torqueYaw: req.torqueYaw,
                      brake: req.brake, boost: req.boost,
                    },
                  };
                }
                const sq = raw && raw.squads;
                if (sq) maneuverState = Object.assign(maneuverState || {}, { squads: sq });
                const d = raw && raw.lastResult && Array.isArray(raw.lastResult.decisions)
                  && raw.lastResult.decisions.find((x) => x && x.entityId === e.id);
                return d ? { objective: d.objective && d.objective.reason || d.objectiveKind || null,
                  doctrine: d.combatDoctrine || null, action: d.action || null } : null;
              } catch (err) { return { err: String(err && err.message || err) }; } })()
            : null;
          const bearing = Math.atan2(player.pos.z - e.pos.z, player.pos.x - e.pos.x);
          const tele = phys.readPhysicsTelemetry(e);
          const fp = flight.resolveFlightProfile(e, state);
          const sensorFrame = (() => { try {
            const frame = window.SF.helpers && window.SF.helpers.aiSensors
              && window.SF.helpers.aiSensors.liveFrameFor(e.id, state.tick);
            return frame && Array.isArray(frame.contacts)
              ? frame.contacts.filter((c) => c && c.kind === 'ship')
                .map((c) => ({ id: c.id, hostile: c.hostile === true, conf: Math.round((c.confidence || 0) * 100) / 100 }))
              : null;
          } catch (err) { return { err: String(err && err.message || err) }; } })();
          out.push({
            flightProfile: fp && {
              mainAccel: fp.mainAccel, strafeAccel: fp.strafeAccel,
              angularAccel: fp.angularAccel, inertia: fp.inertia,
              mass: fp.mass, maxSpeed: fp.maxSpeed, linearDrag: fp.linearDrag,
              flightClass: fp.flightClass,
            },
            phys: e.physicsBody && {
              dynamic: e.physicsBody.dynamic, mass: e.physicsBody.mass,
              radius: e.physicsBody.radius, thrusters: (e.physicsBody.thrusters || []).length,
            },
            collides: e.collides, simTier: e.activity && e.activity.simTier,
            passive: ai && ai.passive, spawnCtx: ai && ai.spawnContext,
            id: e.id,
            pos: { x: Math.round(e.pos.x), z: Math.round(e.pos.z) },
            spd: Math.round(Math.hypot(e.vel ? e.vel.x : 0, e.vel ? e.vel.z : 0) * 10) / 10,
            rot: Math.round((e.rot || 0) * 100) / 100,
            bearing: Math.round(bearing * 100) / 100,
            dist: Math.round(Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z)),
            tele: tele && {
              bodyHandle: tele.bodyHandle, dynamic: tele.dynamic, mass: tele.mass,
              inertiaY: tele.inertiaY, mode: tele.mode,
              force: tele.force, torque: tele.torque,
              linAccel: tele.linearAcceleration, angAccelY: tele.angularAccelerationY,
              authority: tele.authority,
            },
            maneuverState,
            motive: ai && ai.motive, trigger: ai && ai.engagementTrigger,
            activity: ai && ai.activity && { kind: ai.activity.kind, reason: ai.activity.reason, targetId: ai.activity.targetId, startedTick: ai.activity.startedTick },
            securityTargetId: ai && ai.securityTargetId,
            combatTargetId: combat && combat.targetId,
            entityActivity: e.activity && { kind: e.activity.kind, reason: e.activity.reason, targetId: e.activity.targetId },
            sensorFrame,
            doctrineId: ai && ai.combatDoctrineId,
            strike: mod.authorizeAIEngagement({ state, self: e, target: player, objectiveReason: 'combat_doctrine:interceptor_flyby:strike' }),
            decision,
          });
        }
        return out;
      });
      console.log('[probe] auth:', JSON.stringify(auth));
    }
    await page.waitForTimeout(2000);
  }
  await page.keyboard.up('Digit0').catch(() => {});
  await page.mouse.up().catch(() => {});
  console.log(over ? '[probe] GAME OVER reached' : '[probe] TIMEOUT — no game over');
  if (over) {
    const receipt = await page.evaluate(() => {
      const root = document.querySelector('[data-screen="gameOver"]');
      return {
        text: String(root && root.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 600),
        defeat: window.SF.state.combat && window.SF.state.combat.lastPlayerDefeat || null,
      };
    });
    console.log('[probe] receipt:', JSON.stringify(receipt));
  }
} catch (err) {
  console.error('[probe] FAILED:', err && err.stack || err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.child.kill('SIGTERM');
}
