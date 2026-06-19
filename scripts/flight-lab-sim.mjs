import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import {
  resolveFlightProfile,
  stepPlayerFlight,
} from '../src/core/flightDynamics.js';
import { Masks } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { physics } from '../src/core/physics.js';

const DT = 1 / 60;

function ship(overrides = {}) {
  return {
    id: 1,
    type: 'ship',
    alive: true,
    rot: 0,
    angVel: 0,
    bank: 0,
    bankVel: 0,
    turnRate: 3,
    thrust: 130,
    drag: 1.9,
    maxSpeed: 145,
    bankFactor: 1,
    mass: 22,
    vel: { x: 0, z: 0 },
    flags: {},
    data: {},
    ...overrides,
  };
}

function state(mode = 'assisted') {
  return { settings: { controls: { flightMode: mode }, gameplay: { physicsBackend: 'custom' } } };
}

function run(s, input, frames, mode = 'assisted', dt = DT) {
  const profile = resolveFlightProfile(s, state(mode));
  for (let i = 0; i < frames; i++) stepPlayerFlight(s, input, dt, profile);
  return s;
}

function turnRelease() {
  const s = ship();
  run(s, { turnIntent: 1, moveZ: 0, moveX: 0 }, 24);
  const releaseRot = s.rot;
  run(s, { turnIntent: 0, moveZ: 0, moveX: 0 }, 36);
  assert(Math.abs(s.angVel) < 0.01, 'release should brake yaw rate');
  assert(s.rot - releaseRot < 0.12, 'release should not whip around');
  assert(Math.abs(s.bank) < 0.03, 'bank should settle after release');
  return { yawAfterRelease: s.angVel, rotDrift: s.rot - releaseRot, bank: s.bank };
}

function diagonalAttractorSweep() {
  const results = [];
  for (let i = 0; i < 12; i++) {
    const rot = (-Math.PI) + (i / 11) * Math.PI * 2;
    const s = ship({ rot, bank: 0.45, vel: { x: i % 2 ? 90 : -90, z: i % 3 ? 90 : -90 } });
    run(s, { turnIntent: 0, moveZ: 0, moveX: 0 }, 120);
    const drift = Math.abs(wrapAngle(s.rot - rot));
    results.push(drift);
    assert(drift < 0.0001, 'idle diagonal drift should not steer the nose');
  }
  return { maxRotDrift: Math.max(...results) };
}

function slalom() {
  const s = ship();
  const peaks = [];
  for (let gate = 0; gate < 6; gate++) {
    const turnIntent = gate % 2 === 0 ? 0.85 : -0.85;
    run(s, { turnIntent, moveZ: 1, moveX: 0 }, 28);
    peaks.push({ rot: s.rot, yawRate: s.angVel, bank: s.bank });
  }
  run(s, { turnIntent: 0, moveZ: 1, moveX: 0 }, 45);
  assert(peaks.some((p) => p.bank > 0.08) && peaks.some((p) => p.bank < -0.08), 'slalom should bank both directions');
  assert(Math.abs(s.angVel) < 0.02, 'slalom release should converge yaw instead of leaving spin');
  assert(Math.hypot(s.vel.x, s.vel.z) <= s.maxSpeed * 1.16, 'slalom should remain within normal speed envelope');
  return { gates: peaks.length, finalYawRate: s.angVel, finalSpeed: Math.hypot(s.vel.x, s.vel.z) };
}

function dockingApproach() {
  const s = ship({ pos: { x: -260, z: 26 } });
  const profile = resolveFlightProfile(s, state('assisted'));
  let minDist = Infinity;
  for (let frame = 0; frame < 360; frame++) {
    const targetAngle = Math.atan2(-s.pos.z, -s.pos.x);
    const err = wrapAngle(targetAngle - s.rot);
    const dist = Math.hypot(s.pos.x, s.pos.z);
    minDist = Math.min(minDist, dist);
    const speed = Math.hypot(s.vel.x, s.vel.z);
    const forward = s.vel.x * Math.cos(s.rot) + s.vel.z * Math.sin(s.rot);
    const throttle = dist > 105 ? 1 : (forward > 10 || speed > 22 ? -1 : 0);
    stepPlayerFlight(s, {
      turnIntent: clampUnit(err / 0.65),
      moveZ: throttle,
      moveX: 0,
    }, DT, profile);
    s.pos.x += s.vel.x * DT;
    s.pos.z += s.vel.z * DT;
  }
  const finalDist = Math.hypot(s.pos.x, s.pos.z);
  const finalSpeed = Math.hypot(s.vel.x, s.vel.z);
  assert(minDist < 100, 'docking approach should be able to enter a normal dock envelope');
  assert(finalDist < 100, 'docking approach should settle inside dock range');
  assert(finalSpeed < 1, 'docking approach should settle to near zero speed');
  assert(Math.abs(s.angVel) < 0.01, 'docking approach should not leave residual spin');
  return { minDist, finalDist, finalSpeed, finalYawRate: s.angVel };
}

function combatTurn() {
  const s = ship({ vel: { x: 85, z: 0 } });
  const profile = resolveFlightProfile(s, state('assisted'));
  const target = Math.PI;
  let maxBank = 0;
  for (let frame = 0; frame < 180; frame++) {
    const err = wrapAngle(target - s.rot);
    stepPlayerFlight(s, {
      turnIntent: clampUnit(err / 0.55),
      moveZ: 1,
      moveX: 0,
    }, DT, profile);
    maxBank = Math.max(maxBank, Math.abs(s.bank));
  }
  const errAtRelease = Math.abs(wrapAngle(target - s.rot));
  run(s, { turnIntent: 0, moveZ: 0, moveX: 0 }, 60);
  const finalErr = Math.abs(wrapAngle(target - s.rot));
  assert(errAtRelease < 0.02, 'combat turn should converge to a 180-degree aim reversal');
  assert(finalErr < 0.02, 'combat turn release should hold the intended heading');
  assert(Math.abs(s.angVel) < 0.01, 'combat turn release should brake residual yaw');
  assert(Math.abs(s.bank) < 0.01, 'combat turn release should settle bank');
  assert(maxBank > 0.2, 'combat turn should show a readable bank animation while turning');
  return { errAtRelease, finalErr, finalYawRate: s.angVel, finalBank: s.bank, maxBank, finalSpeed: Math.hypot(s.vel.x, s.vel.z) };
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function assistModes() {
  const lateralAfter = {};
  for (const mode of ['assisted', 'drift', 'newtonian']) {
    const s = ship({ vel: { x: 0, z: 90 } });
    run(s, { turnIntent: 0, moveZ: 0, moveX: 0 }, 60, mode);
    lateralAfter[mode] = Math.abs(s.vel.z);
  }
  assert(lateralAfter.assisted < lateralAfter.drift, 'assisted should damp more than drift');
  assert(lateralAfter.drift < lateralAfter.newtonian, 'drift should damp more than newtonian');
  assert(lateralAfter.newtonian > 60, 'newtonian should preserve most lateral inertia');
  return lateralAfter;
}

function clampUnit(v) {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

function boostCap() {
  const s = ship({ boost: { energy: 100, max: 100 } });
  run(s, { turnIntent: 0, moveZ: 1, moveX: 0, boosting: true }, 300, 'assisted');
  const speed = Math.hypot(s.vel.x, s.vel.z);
  assert(speed <= s.maxSpeed * 2.01, 'boost should respect max speed cap');
  return { speed };
}

function boostStop() {
  const s = ship({ boost: { energy: 100, max: 100 } });
  run(s, { turnIntent: 0, moveZ: 1, moveX: 0, boosting: true }, 120, 'assisted');
  const boostedSpeed = Math.hypot(s.vel.x, s.vel.z);
  run(s, { turnIntent: 0, moveZ: -1, moveX: 0 }, 100, 'assisted');
  const brakeSpeed = Math.hypot(s.vel.x, s.vel.z);
  run(s, { turnIntent: 0, moveZ: 0, moveX: 0 }, 180, 'assisted');
  const settledSpeed = Math.hypot(s.vel.x, s.vel.z);
  assert(boostedSpeed > s.maxSpeed * 0.95, 'boost-stop should start from a real boost escape speed');
  assert(brakeSpeed < boostedSpeed * 0.35, 'reverse thrust should rapidly arrest boost speed');
  assert(settledSpeed < 1, 'release after braking should settle to a near full stop');
  return { boostedSpeed, brakeSpeed, settledSpeed };
}

function lowFpsSpike() {
  const s = ship({ vel: { x: 80, z: 80 } });
  run(s, { turnIntent: 1, moveZ: 1, moveX: 0 }, 20, 'assisted', 1 / 15);
  assert(Number.isFinite(s.rot) && Number.isFinite(s.vel.x) && Number.isFinite(s.vel.z), 'low-FPS spike should stay finite');
  assert(Math.hypot(s.vel.x, s.vel.z) <= s.maxSpeed * 1.16, 'low-FPS spike should still respect safety cap');
  return { rot: s.rot, speed: Math.hypot(s.vel.x, s.vel.z) };
}

function collisionSweep() {
  const state = { entityList: [] };
  const runner = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 2,
    pos: { x: 18, z: 0 },
    prevPos: { x: -18, z: 0 },
    vel: { x: 1080, z: 0 },
    collisionMask: Masks.ASTEROID,
  };
  const asteroid = {
    id: 2,
    type: 'asteroid',
    alive: true,
    collides: true,
    radius: 5,
    pos: { x: 0, z: 0 },
    collisionMask: Masks.SHIP,
  };
  state.entityList.push(runner, asteroid);
  physics.init({ state, bus: { emit() {} } });
  physics.sweepShipStatics(1 / 30, state);

  assert(runner.pos.x < -7, 'collision sweep should stop boosted ships outside static obstacles');
  assert(runner.vel.x < 0, 'collision sweep should reverse inbound velocity after asteroid contact');
  return { contactX: runner.pos.x, velocityX: runner.vel.x, contacts: physics._diag.sweptShipContacts };
}

function perfBudget() {
  const ships = [];
  for (let i = 0; i < 240; i++) ships.push(ship({ id: i + 1, rot: i * 0.07, vel: { x: i % 17, z: i % 23 } }));
  const input = { turnIntent: 0.7, moveZ: 1, moveX: 0.25 };
  const profile = resolveFlightProfile(ships[0], state('assisted'));
  const t0 = performance.now();
  for (let frame = 0; frame < 180; frame++) {
    for (const s of ships) stepPlayerFlight(s, input, DT, profile);
  }
  const msPerTick = (performance.now() - t0) / 180;
  assert(msPerTick < 2, 'flight update budget should stay under 2ms/tick for 240 ships');
  return { ships: ships.length, msPerTick };
}

function physicsFlightPerfBudget() {
  const state = createGameState(99);
  const ships = [];
  const statics = [];
  state.mode = 'flight';
  state.entities.clear();
  state.entityList.length = 0;
  state.playerId = 1;

  for (let i = 0; i < 40; i++) {
    const e = ship({
      id: i + 1,
      alive: true,
      collides: true,
      radius: 10,
      mass: 20,
      pos: { x: -900 + (i % 10) * 120, z: -420 + Math.floor(i / 10) * 120 },
      prevPos: { x: 0, z: 0 },
      vel: { x: 15 + (i % 7), z: -10 + (i % 5) },
      collisionMask: Masks.ASTEROID | Masks.STATION | Masks.SHIP,
    });
    e.prevPos.x = e.pos.x;
    e.prevPos.z = e.pos.z;
    ships.push(e);
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }

  for (let i = 0; i < 72; i++) {
    const e = {
      id: 1000 + i,
      type: i % 9 === 0 ? 'station' : 'asteroid',
      alive: true,
      collides: true,
      radius: i % 9 === 0 ? 32 : 13,
      mass: 100000,
      pos: { x: -1000 + (i % 12) * 170, z: -540 + Math.floor(i / 12) * 180 },
      prevPos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      collisionMask: Masks.SHIP | Masks.PROJECTILE | Masks.DRONE,
      data: i % 9 === 0 ? { stationId: `perf_station_${i}`, dockRadius: 70 } : {},
    };
    e.prevPos.x = e.pos.x;
    e.prevPos.z = e.pos.z;
    statics.push(e);
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }

  physics.init({ state, bus: { emit() {} } });
  const input = { turnIntent: 0.55, moveZ: 1, moveX: 0.2 };
  const profiles = ships.map((s) => resolveFlightProfile(s, state));
  const t0 = performance.now();
  for (let frame = 0; frame < 120; frame++) {
    for (const e of state.entityList) {
      e.prevPos.x = e.pos.x;
      e.prevPos.z = e.pos.z;
    }
    for (let i = 0; i < ships.length; i++) stepPlayerFlight(ships[i], input, DT, profiles[i]);
    physics.update(DT, state);
  }
  const msPerTick = (performance.now() - t0) / 120;
  assert(msPerTick < 2, 'flight plus physics update budget should stay under 2ms/tick for the lab scenario');
  return { ships: ships.length, statics: statics.length, msPerTick };
}

async function rapierBackend() {
  const { createRapierCollisionWorld } = await import('../src/core/rapierCollisionWorld.js');
  const warnings = [];
  const originalWarn = console.warn;
  let backend = null;
  let secondBackend = null;
  console.warn = (...args) => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    [backend, secondBackend] = await Promise.all([
      createRapierCollisionWorld(),
      createRapierCollisionWorld(),
    ]);
    backend.syncFromEntities([
      { id: 1, type: 'ship', alive: true, collides: true, radius: 8, pos: { x: 0, z: 0 }, flags: { boosting: true } },
      { id: 2, type: 'asteroid', alive: true, collides: true, radius: 8, pos: { x: 10, z: 0 }, flags: {} },
    ]);
    backend.step(1 / 60);
    const diag = backend.diagnostics();
    assert.equal(diag.bodies, 2, 'Rapier backend should proxy live collidable entities');
    assert.equal(diag.colliders, 2, 'Rapier backend should create a collider per proxy body');
    assert.equal(diag.ccdBodies, 1, 'Rapier backend should enable CCD for boosted ship proxies');
    assert(diag.contacts >= 1 || diag.collisionEvents >= 1, 'Rapier backend should observe overlapping proxy contacts');
    backend.syncFromEntities([
      { id: 1, type: 'ship', alive: true, collides: true, radius: 2, pos: { x: 0, z: 0 }, flags: { boosting: false } },
      { id: 2, type: 'asteroid', alive: true, collides: true, radius: 2, pos: { x: 10, z: 0 }, flags: {} },
    ]);
    backend.step(1 / 60);
    const resized = backend.diagnostics();
    assert.equal(resized.contacts, 0, 'Rapier backend should update proxy radii when entity radii change');
    assert.equal(resized.ccdBodies, 0, 'Rapier backend should disable boosted-ship CCD when the proxy stops boosting');
    backend.syncFromEntities([
      { id: 1, type: 'ship', alive: true, collides: true, radius: 2, pos: { x: 0, z: 0 }, flags: { boosting: true } },
      { id: 2, type: 'asteroid', alive: true, collides: true, radius: 2, pos: { x: 10, z: 0 }, flags: {} },
    ]);
    backend.step(1 / 60);
    const reboosted = backend.diagnostics();
    assert.equal(reboosted.ccdBodies, 1, 'Rapier backend should re-enable CCD when a live proxy starts boosting');
    secondBackend.syncFromEntities([
      { id: 3, type: 'ship', alive: true, collides: true, radius: 4, pos: { x: 0, z: 0 }, flags: {} },
    ]);
    secondBackend.step(1 / 60);
    const concurrent = secondBackend.diagnostics();
    assert.equal(concurrent.bodies, 1, 'concurrent Rapier backend init should create independent worlds');
    assert.deepEqual(warnings, [], 'Rapier backend should initialize without console warnings');
    return { initial: diag, resized, reboosted, concurrent, warnings };
  } finally {
    console.warn = originalWarn;
    if (backend) backend.dispose();
    if (secondBackend) secondBackend.dispose();
  }
}

async function rapierBackendLifecycle() {
  const state = {
    settings: { gameplay: { physicsBackend: 'rapier' } },
    entityList: [
      { id: 1, type: 'ship', alive: true, collides: true, radius: 8, pos: { x: 0, z: 0 }, flags: { boosting: true } },
      { id: 2, type: 'asteroid', alive: true, collides: true, radius: 8, pos: { x: 10, z: 0 }, flags: {} },
    ],
  };

  physics.init({ state, bus: { emit() {} } });
  physics._syncOptionalBackend(1 / 60, state);
  const staleInit = physics._rapierInit;
  state.settings.gameplay.physicsBackend = 'custom';
  physics._syncOptionalBackend(1 / 60, state);
  await staleInit;
  const staleDisabled = { ...physics._diag };
  assert.equal(staleDisabled.backend, 'custom', 'pending Rapier init should not override a custom-backend switch');
  assert.equal(staleDisabled.rapierReady, false, 'pending Rapier init should leave readiness false after disable');
  assert.equal(physics._rapier, null, 'pending Rapier init should dispose stale worlds after disable');
  assert.equal(physics._rapierInit, null, 'pending Rapier init should not keep a stale promise after disable');

  state.settings.gameplay.physicsBackend = 'rapier';
  physics._syncOptionalBackend(1 / 60, state);
  await physics._rapierInit;
  physics._syncOptionalBackend(1 / 60, state);
  const ready = { ...physics._diag };
  assert.equal(ready.backend, 'rapier', 'Rapier lifecycle should report rapier while enabled');
  assert.equal(ready.rapierReady, true, 'Rapier lifecycle should become ready after initialization');
  assert(ready.bodies > 0, 'Rapier lifecycle should proxy live entities while enabled');
  assert.equal(ready.ccdBodies, 1, 'Rapier lifecycle diagnostics should report boosted CCD proxies');

  const firstWorld = physics._rapier;
  state.settings.gameplay.physicsBackend = 'custom';
  physics._syncOptionalBackend(1 / 60, state);
  const disabled = { ...physics._diag };
  assert.equal(disabled.backend, 'custom', 'Rapier lifecycle should report custom after disable');
  assert.equal(disabled.rapierReady, false, 'Rapier lifecycle should clear readiness after disable');
  assert.equal(disabled.bodies, 0, 'Rapier lifecycle should clear body diagnostics after disable');
  assert.equal(disabled.ccdBodies, 0, 'Rapier lifecycle should clear CCD body diagnostics after disable');
  assert.equal(physics._rapier, null, 'Rapier lifecycle should dispose the optional world after disable');
  assert.equal(physics._rapierInit, null, 'Rapier lifecycle should clear init promise after disable');

  state.settings.gameplay.physicsBackend = 'rapier';
  physics._syncOptionalBackend(1 / 60, state);
  await physics._rapierInit;
  physics._syncOptionalBackend(1 / 60, state);
  const reenabled = { ...physics._diag };
  assert.equal(reenabled.rapierReady, true, 'Rapier lifecycle should reinitialize after being disabled');
  assert(physics._rapier && physics._rapier !== firstWorld, 'Rapier lifecycle should create a fresh world after re-enable');

  state.settings.gameplay.physicsBackend = 'custom';
  physics._syncOptionalBackend(1 / 60, state);
  return { staleDisabled, ready, disabled, reenabled };
}

const report = {
  turnRelease: turnRelease(),
  diagonalAttractorSweep: diagonalAttractorSweep(),
  slalom: slalom(),
  dockingApproach: dockingApproach(),
  combatTurn: combatTurn(),
  assistModes: assistModes(),
  boostCap: boostCap(),
  boostStop: boostStop(),
  lowFpsSpike: lowFpsSpike(),
  collisionSweep: collisionSweep(),
  rapierBackend: await rapierBackend(),
  rapierBackendLifecycle: await rapierBackendLifecycle(),
  perfBudget: perfBudget(),
  physicsFlightPerfBudget: physicsFlightPerfBudget(),
};

console.log(JSON.stringify({ ok: true, report }, null, 2));
