#!/usr/bin/env node
/**
 * W1 / M1-ROUTE — Helios terminal approach + dock envelope gate.
 *
 * Historical failure (pre flyby/capture terminal work):
 *   best ~294.777 WU, final ~324.520 WU, no dock prompt
 *   (overspeed lateral orbit outside physical dock range after belt avoidance)
 *
 * This gate fails closed on that product failure without browser injection:
 *   1. Source contract: flightV3 keeps approach-band flyby capture + no re-boost
 *   2. seed-47 Kestrel + authored Helios belt under live flightV3 + Rapier must
 *      enter AND hold the physical dock envelope (≥1.5 sim-s) and emit dock:range
 *   3. Full V3 autopilot suite (Check 0 is the same geometry)
 *
 * Complementary browser public route: npm run check:demo-opening /
 * check:m3:player-facing-public-route (Playwright New Game → map → dock).
 *
 * Usage: npm run check:m1:helios-route
 * Fence: autopilot-only product path; no input.js / thrusters / assets.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGameState } from '../src/core/gameState.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 60;
const HOLD_TICKS = 90; // 1.5 sim-s of continuous dock-range presence
const MAX_TICKS = 2400;

function makeBus() {
  const handlers = {};
  const events = [];
  return {
    events,
    on(name, fn) {
      (handlers[name] || (handlers[name] = [])).push(fn);
      return () => {};
    },
    emit(name, payload) {
      events.push({ name, payload });
      (handlers[name] || []).forEach((fn) => fn(payload));
    },
  };
}

function neutralizeGeneratedAutopilotInput(state) {
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.boost = false;
  state.input.brake = false;
  state.input.autopilot = false;
  if (state.input.actions) state.input.actions.brake = false;
}

function makeKestrelPlayer() {
  return {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    factionId: 'player',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 14,
    mass: 32,
    flags: {},
    bank: 0,
    bankFactor: 1,
    boost: {
      energy: 100, max: 100, drainRate: 5, regenRate: 18,
      dashImpulse: 0, dashCd: 3, dashCdT: 0,
    },
    physicsBody: { mass: 32, inertiaY: 26.95970695970696, radius: 14 },
    data: { role: 'starter', derived: {} },
    collides: true,
    prevPos: { x: 0, z: 0 },
    prevRot: 0,
  };
}

/** Deterministic seed-47 slice of the authored Helios starter belt (same as check-autopilot Check 0). */
function makeHeliosBelt() {
  return [
    [8, 512.52176210511, -146.0193639593829, 8.367559840902686, 534.7023936361074],
    [44, 513.2840889877223, -149.80504009402833, 10.103003617376089, 604.1201446950436],
    [29, 565.2483666605806, -184.67563491107853, 12.343275625258684, 693.7310250103474],
    [28, 570.8143800245178, -180.58854538475694, 12.90486803650856, 716.1947214603424],
    [25, 600.0798474513562, -238.76031261206515, 12.887068318203092, 715.4827327281237],
    [16, 625.3196034402945, -218.36894819977886, 12.610429167747498, 704.4171667098999],
    [17, 658.5633485060841, -213.53438439863714, 7.330031916499138, 493.2012766599655],
    [24, 666.3165655658528, -226.96045656136732, 13.423339577391744, 736.9335830956697],
    [11, 675.9838496401424, -217.14981330829744, 12.478578509762883, 699.1431403905153],
    [18, 679.0438427051621, -255.91518657562818, 11.190595895051956, 647.6238358020782],
    [22, 690.024135678615, -242.5061921510127, 9.552236685529351, 582.089467421174],
    [20, 721.9997257477593, -231.08845170147356, 12.477446053177118, 699.0978421270847],
    [33, 723.333344687083, -252.30734558704538, 10.75633093714714, 630.2532374858856],
    [32, 734.4516295317034, -195.94116117222936, 7.712364956736565, 508.4945982694626],
    [10, 759.7333276989908, -298.29508668134423, 13.34228645823896, 733.6914583295584],
    [14, 753.0429721051537, -318.8989555431299, 11.509959502145648, 660.3983800858259],
    [31, 782.361784370081, -384.97401946323714, 8.177172522991896, 527.0869009196758],
    [37, 875.0378433811643, -386.71677750939625, 11.002711994573474, 640.108479782939],
    [34, 937.7154537329609, -319.4816352876163, 12.77204997651279, 710.8819990605116],
    [7, 939.8619772562213, -295.06696864660256, 10.195844253525138, 607.8337701410055],
  ].map(([id, x, z, radius, mass]) => ({
    id,
    type: 'asteroid',
    alive: true,
    collides: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius,
    mass,
  }));
}

async function runHeliosTerminalHoldScenario() {
  const state = createGameState(0x47a);
  const player = makeKestrelPlayer();
  const station = {
    id: 2,
    type: 'station',
    alive: true,
    collides: true,
    pos: { x: 1280, z: -420 },
    vel: { x: 0, z: 0 },
    radius: 42,
    mass: 1e6,
    data: { stationId: 'station_helios', dockRadius: 90, name: 'Helios Station' },
  };
  const belt = makeHeliosBelt();
  state.mode = 'flight';
  state.playerId = player.id;
  state.world.currentSector = {};
  state.entities.clear();
  state.entityList.length = 0;
  for (const entity of [player, station, ...belt]) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
  }
  state.nav.autopilot = {
    active: true,
    target: { x: station.pos.x, z: station.pos.z },
    targetEntityId: station.id,
    label: 'Helios Station',
    arrivalRadius: 90,
    initialDistance: Math.hypot(1280, -420),
    status: 'armed',
  };
  state.input = {
    moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false, fire: false, aimAngle: 0,
    actions: { autopursuit: false, brake: false },
  };
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';

  const bus = makeBus();
  const flightSystem = Object.create(flightV3);
  const physicsSystem = Object.create(physics);
  flightSystem.init({ state, bus, helpers: {} });
  physicsSystem.init({ state, bus, helpers: {} });
  const ready = await physicsSystem.prepareBackend(state, { reset: true });
  assert.equal(ready, true, 'Helios terminal hold fixture must use production Rapier authority');

  const dockRange = ((station.data.dockRadius || station.radius) + player.radius) * 1.5;
  let closestDistance = Infinity;
  let completionTick = null;
  let holdTicks = 0;
  let maxHoldTicks = 0;
  let firstDockRangeEvent = null;
  bus.on('dock:range', (payload) => {
    if (payload && payload.inRange && payload.stationId === 'station_helios' && !firstDockRangeEvent) {
      firstDockRangeEvent = {
        stationId: payload.stationId,
        tick: state.tick,
        simTime: state.simTime,
      };
    }
  });

  try {
    for (let tick = 0; tick < MAX_TICKS; tick++) {
      state.tick = tick;
      state.simTime = tick * DT;
      neutralizeGeneratedAutopilotInput(state);
      flightSystem.update(DT, state);
      physicsSystem.update(DT, state);
      const distance = Math.hypot(station.pos.x - player.pos.x, station.pos.z - player.pos.z);
      closestDistance = Math.min(closestDistance, distance);
      if (distance <= dockRange) {
        holdTicks += 1;
        maxHoldTicks = Math.max(maxHoldTicks, holdTicks);
        if (completionTick == null) completionTick = tick;
      } else {
        holdTicks = 0;
      }
      if (maxHoldTicks >= HOLD_TICKS) break;
    }
  } finally {
    physicsSystem._disableSg02DynamicAuthority();
  }

  return {
    dockRange,
    closestDistance,
    completionTick,
    maxHoldTicks,
    firstDockRangeEvent,
    final: {
      distance: Math.hypot(station.pos.x - player.pos.x, station.pos.z - player.pos.z),
      pos: { x: player.pos.x, z: player.pos.z },
      speed: Math.hypot(player.vel.x, player.vel.z),
      status: state.nav.autopilot.status,
      active: state.nav.autopilot.active,
    },
  };
}

console.log('--- M1 HELIOS ROUTE ---');

// 1) Product source contract (flyby / approach-band terminal capture)
{
  const flightSrc = readFileSync(resolve(ROOT, 'src/systems/flightV3.js'), 'utf8');
  assert.match(flightSrc, /flybyOrbit/, 'flightV3 must keep lateral/away flyby capture braking');
  assert.match(flightSrc, /approachBand/, 'flightV3 must define approach-band terminal capture');
  assert.match(
    flightSrc,
    /dist > Math\.max\(arrivalRadius \* 5, approachBand/,
    'flightV3 must not re-boost inside the approach band after avoidance',
  );
  assert.doesNotMatch(
    flightSrc,
    /from\s+['"].*input\.js['"]/,
    'M1 Helios product fix must not couple flightV3 to input.js',
  );
  console.log('Check A PASSED: terminal flyby capture + approach-band boost fence present in flightV3.');
}

// 2) Focused production geometry: enter and HOLD dock envelope; dock:range must fire
{
  const result = await runHeliosTerminalHoldScenario();
  assert.notEqual(
    result.completionTick,
    null,
    `seed-47 course must enter Helios dock envelope (historical miss ~294 WU): ${JSON.stringify(result)}`,
  );
  assert.ok(
    result.closestDistance <= result.dockRange,
    `closest must be inside dock range ${result.dockRange}, got ${result.closestDistance}`,
  );
  // Guard the historical ~294 orbit: best must be well inside dock, not a 300 WU flyby.
  assert.ok(
    result.closestDistance < 200,
    `terminal approach must close well inside 200 WU (historical best ~294): ${result.closestDistance}`,
  );
  assert.ok(
    result.maxHoldTicks >= HOLD_TICKS,
    `dock envelope must be held ≥${HOLD_TICKS} ticks (~1.5s), got ${result.maxHoldTicks}: ${JSON.stringify(result)}`,
  );
  assert.ok(
    result.firstDockRangeEvent,
    `physics must emit dock:range inRange for station_helios (dock prompt condition): ${JSON.stringify(result)}`,
  );
  assert.equal(result.firstDockRangeEvent.stationId, 'station_helios');
  console.log('Check B PASSED: seed-47 Kestrel holds Helios dock envelope + dock:range.', {
    dockRange: result.dockRange,
    closestDistance: result.closestDistance,
    completionTick: result.completionTick,
    maxHoldTicks: result.maxHoldTicks,
    firstDockRangeEvent: result.firstDockRangeEvent,
    final: result.final,
  });
}

// 3) Full V3 autopilot suite (includes Check 0 Helios geometry + avoidance lifecycle)
{
  const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts/check-autopilot-v3.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    timeout: 180_000,
  });
  const out = `${result.stdout || ''}${result.stderr || ''}`;
  process.stdout.write(result.stdout || '');
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, `check:autopilot failed:\n${out.slice(-2000)}`);
  assert.match(out, /Check 0 PASSED/, 'Helios terminal Check 0 must pass');
  assert.match(out, /ALL V3 AUTOPILOT CHECKS PASSED/, 'full autopilot suite must stay green');
  console.log('Check C PASSED: full V3 autopilot suite green (Helios Check 0 included).');
}

console.log('check:m1:helios-route OK — Helios terminal approach + dock prompt conditions green');
