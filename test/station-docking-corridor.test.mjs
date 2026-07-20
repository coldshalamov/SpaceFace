// Contract tests for the truthful exterior docking corridor (PQ-008 / SF-08 → F18).
//
// What these tests defend:
//   - corridor/capture/berth volume math and the speed/heading gates that classify a ship into
//     approach → corridor → capture → berthed;
//   - the bounded PD capture assist contract (STEP 7): never exceeds maxAccel, force → 0 at the
//     berth, no assist outside the capture volume, player input always blends;
//   - trajectory determinism: same start conditions → byte-identical trajectory hash;
//   - the system seam itself: the assist reaches the physics membrane as an ADDITIVE queued
//     impulse (the pilot's own control command is never overwritten), and the sim-side proxy
//     diagnostics are published for the debug overlay without touching renderer-lease paths.
//
// All geometry numbers are pinned literals measured against the live module. Any deliberate
// corridor retuning must update the pins deliberately.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  COLLISION_PROXY_MANIFESTS,
  computeCaptureAssist,
  corridorStateFor,
  resolveBerthWorld,
  resolveCorridorAxisWorld,
} from '../src/data/collisionProxyManifests.js';
import { dockingCorridor } from '../src/systems/dockingCorridor.js';
import { consumePhysicsCommand, writePhysicsControl } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const HELIOS = COLLISION_PROXY_MANIFESTS.helios_trade_hub;
const DEG = Math.PI / 180;
const EPS = 1e-9;
const MAX_ACCEL = HELIOS.docking.assist.maxAccel; // 26

/** Live-style Helios fixture: origin, rot 0, stamped bearing 135°, R = dockRadius = 90. */
function heliosStation(id = 'st1', pos = { x: 0, z: 0 }) {
  return {
    id,
    type: 'station',
    alive: true,
    pos: { ...pos },
    rot: 0,
    radius: 42,
    data: {
      stationId: 'station_helios',
      dockRadius: 90,
      collisionProxy: 'helios_trade_hub',
      corridorBearingDeg: 135,
    },
  };
}

const AXIS = resolveCorridorAxisWorld(heliosStation(), HELIOS); // outbound unit vector (-√½, +√½)

/** Point in the corridor frame: `along` wu outbound on the axis, `lat` wu signed cross-track. */
function framePos(along, lat = 0) {
  return { x: AXIS.x * along + -AXIS.z * lat, z: AXIS.z * along + AXIS.x * lat };
}

/** Velocity in the corridor frame: `alongSpeed` positive = outbound, `latSpeed` cross-track. */
function frameVel(alongSpeed, latSpeed = 0) {
  return {
    x: AXIS.x * alongSpeed + -AXIS.z * latSpeed,
    z: AXIS.z * alongSpeed + AXIS.x * latSpeed,
  };
}

function classify(along, lat, vel) {
  return corridorStateFor(HELIOS, heliosStation(), framePos(along, lat), vel);
}

// ---------------------------------------------------------------------------------------------
// corridor / capture / berth volume math
// ---------------------------------------------------------------------------------------------

test('corridor volume: inside the mouth lane classifies corridor, outside does not', () => {
  // At rest just outside the capture lane (along 117, mouth gate is 121.5): geometric corridor.
  const inLane = classify(117, 0, { x: 0, z: 0 });
  assert.equal(inLane.phase, 'corridor');
  assert.equal(inLane.inCorridor, true);
  assert.equal(inLane.inCapture, false);

  // Beyond the mouth radius (1.35R = 121.5 wu): approach.
  assert.equal(classify(122, 0, { x: 0, z: 0 }).phase, 'approach');

  // Lateral gate: 50 wu off-axis exceeds the corridor half-width at along 90 (max(37.8, 36.4)).
  const offAxis = classify(90, 50, { x: 0, z: 0 });
  assert.equal(offAxis.phase, 'approach');
  assert.equal(offAxis.inCorridor, false);

  // On the axis but behind the station (negative along): never a corridor.
  assert.equal(classify(-60, 0, { x: 0, z: 0 }).inCorridor, false);
});

test('capture volume: the lane and the berth hug classify capture', () => {
  const lane = classify(99, 0, { x: 0, z: 0 });
  assert.equal(lane.phase, 'capture');
  assert.equal(lane.inCapture, true);

  // Hugging the berth off-lane (distToBerth within the near-berth radius) is still capture.
  const berth = resolveBerthWorld(heliosStation(), HELIOS);
  const nearBerth = corridorStateFor(HELIOS, heliosStation(), { x: berth.x + 10, z: berth.z }, { x: 0, z: 0 });
  assert.equal(nearBerth.inCapture, true);

  // At the berth, slow: berthed.
  const berthed = corridorStateFor(HELIOS, heliosStation(), { x: berth.x, z: berth.z }, { x: 0, z: 0 });
  assert.equal(berthed.phase, 'berthed');
  assert.equal(berthed.berthed, true);
  assert.equal(berthed.distToBerth, 0);

  // At the berth but still moving faster than the berth gate (12): not berthed.
  const hot = corridorStateFor(HELIOS, heliosStation(), { x: berth.x, z: berth.z }, frameVel(-13));
  assert.equal(hot.berthed, false);
});

// ---------------------------------------------------------------------------------------------
// speed and heading gates
// ---------------------------------------------------------------------------------------------

test('speed gates: corridor admits ≤55, capture admits ≤26, berth admits ≤12', () => {
  // 60 wu/s inbound inside the geometric corridor: too fast for the corridor gate.
  const hotCorridor = classify(117, 0, frameVel(-60));
  assert.equal(hotCorridor.phase, 'approach');

  // 30 wu/s inbound inside the capture lane: geometrically in capture, gated down to corridor.
  const hotCapture = classify(99, 0, frameVel(-30));
  assert.equal(hotCapture.phase, 'corridor');
  assert.equal(hotCapture.inCapture, true, 'geometric membership is independent of the speed gate');

  // At the gates exactly: 26 inbound in the lane is capture; 55 inbound in the corridor is corridor.
  assert.equal(classify(99, 0, frameVel(-26)).phase, 'capture');
  assert.equal(classify(117, 0, frameVel(-55)).phase, 'corridor');
});

test('heading gate: outbound and tangential motion are rejected, near-stationary is always ok', () => {
  // Outbound at 20 wu/s in the lane: heading opposes the inbound direction.
  const outbound = classify(99, 0, frameVel(20));
  assert.equal(outbound.headingOk, false);
  assert.equal(outbound.phase, 'approach');

  // Pure tangential drift (90° off inbound): no inbound component to rescue the heading.
  assert.equal(classify(99, 0, frameVel(0, 20)).headingOk, false);

  // A stopped ship has no heading to be wrong: speed < 8 is always heading-ok.
  assert.equal(classify(99, 0, { x: 0, z: 0 }).headingOk, true);
  assert.equal(classify(99, 0, frameVel(5)).phase, 'capture', 'a creeping ship is not heading-penalized');

  // Heading tolerance edge: within 42° of inbound passes; beyond the drift allowance fails.
  const rotate = (deg) => {
    const a = deg * DEG;
    const inbound = { x: -AXIS.x, z: -AXIS.z };
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: (inbound.x * c - inbound.z * s) * 20, z: (inbound.x * s + inbound.z * c) * 20 };
  };
  assert.equal(classify(99, 0, rotate(41.9)).headingOk, true, 'inside the declared heading gate');
  assert.equal(classify(99, 0, rotate(70)).headingOk, true, 'inbound component dominates drift');
  assert.equal(classify(99, 0, rotate(80)).headingOk, false, 'outside the drift allowance');
});

// ---------------------------------------------------------------------------------------------
// bounded PD capture assist
// ---------------------------------------------------------------------------------------------

test('assist is bounded by maxAccel across the whole capture lane', () => {
  const station = heliosStation();
  for (let along = 60; along <= 108; along += 4) {
    const assist = computeCaptureAssist(HELIOS, station, framePos(along, 0), frameVel(-8), 0);
    assert.ok(assist, `assist owed at along ${along}`);
    const mag = Math.hypot(assist.x, assist.z);
    assert.ok(mag <= MAX_ACCEL + EPS, `along ${along}: |a| ${mag} exceeds maxAccel ${MAX_ACCEL}`);
  }
  // Far edge of the lane at rest: the raw PD demand (0.9 × 43.2 = 38.9) must clamp to exactly max.
  const clamped = computeCaptureAssist(HELIOS, station, framePos(108, 0), { x: 0, z: 0 }, 0);
  assert.ok(Math.abs(Math.hypot(clamped.x, clamped.z) - MAX_ACCEL) < EPS, 'clamped to the bound');
});

test('assist force → 0 at the berth and points at the berth elsewhere', () => {
  const station = heliosStation();
  const berth = resolveBerthWorld(station, HELIOS);
  const atBerth = computeCaptureAssist(HELIOS, station, { x: berth.x, z: berth.z }, { x: 0, z: 0 }, 0);
  assert.equal(atBerth.x, 0);
  assert.equal(atBerth.z, 0);
  assert.equal(atBerth.phase, 'berthed');

  // Magnitude grows with berth distance (PD proportional term, below the clamp).
  const d2 = computeCaptureAssist(HELIOS, station, { x: berth.x + 2, z: berth.z }, { x: 0, z: 0 }, 0);
  const d10 = computeCaptureAssist(HELIOS, station, { x: berth.x + 10, z: berth.z }, { x: 0, z: 0 }, 0);
  const d20 = computeCaptureAssist(HELIOS, station, { x: berth.x + 20, z: berth.z }, { x: 0, z: 0 }, 0);
  assert.ok(Math.abs(Math.hypot(d2.x, d2.z) - 1.8) < EPS, 'kp × 2 wu');
  const m2 = Math.hypot(d2.x, d2.z);
  const m10 = Math.hypot(d10.x, d10.z);
  const m20 = Math.hypot(d20.x, d20.z);
  assert.ok(m2 < m10 && m10 < m20, 'assist grows monotonically with berth distance below the clamp');

  // Direction: the assist vector points toward the berth (positive projection on the error).
  const from = framePos(100, 5);
  const assist = computeCaptureAssist(HELIOS, station, from, { x: 0, z: 0 }, 0);
  const dot = assist.x * (berth.x - from.x) + assist.z * (berth.z - from.z);
  assert.ok(dot > 0, 'assist pulls toward the berth');
});

test('no assist outside the capture volume or past a failed gate', () => {
  const station = heliosStation();
  // Outside capture (along 117, at rest): geometric corridor, no assist.
  assert.equal(computeCaptureAssist(HELIOS, station, framePos(117, 0), { x: 0, z: 0 }, 0), null);
  // Too fast for the capture gate.
  assert.equal(computeCaptureAssist(HELIOS, station, framePos(99, 0), frameVel(-27), 0), null);
  // Heading gate failed (outbound 20).
  assert.equal(computeCaptureAssist(HELIOS, station, framePos(99, 0), frameVel(20), 0), null);
  // A manifest with no docking block owes nothing, ever.
  assert.equal(computeCaptureAssist({}, station, framePos(99, 0), { x: 0, z: 0 }, 0), null);
});

test('player-input blend: assist fades by inputMag × inputBlend and is never negative', () => {
  const station = heliosStation();
  const pos = framePos(100, 0);
  const zero = computeCaptureAssist(HELIOS, station, pos, { x: 0, z: 0 }, 0);
  const full = computeCaptureAssist(HELIOS, station, pos, { x: 0, z: 0 }, 1);
  const m0 = Math.hypot(zero.x, zero.z);
  const m1 = Math.hypot(full.x, full.z);
  assert.ok(Math.abs(m1 / m0 - 0.25) < EPS, 'inputBlend 0.75 leaves exactly 25% at full input');
  const half = computeCaptureAssist(HELIOS, station, pos, { x: 0, z: 0 }, 0.5);
  assert.ok(Math.abs(Math.hypot(half.x, half.z) / m0 - 0.625) < EPS);
  // Out-of-range input magnitudes clamp, never invert the blend.
  const over = computeCaptureAssist(HELIOS, station, pos, { x: 0, z: 0 }, 5);
  assert.deepEqual(over, full);
  const under = computeCaptureAssist(HELIOS, station, pos, { x: 0, z: 0 }, -1);
  assert.deepEqual(under, zero);
  // The blend is a scalar fade: direction is preserved exactly.
  assert.ok(Math.abs(full.x * zero.z - full.z * zero.x) < EPS, 'blend never rotates the assist');
});

// ---------------------------------------------------------------------------------------------
// trajectory determinism
// ---------------------------------------------------------------------------------------------

function flyCaptureTrajectory(startAlong, inboundSpeed, steps = 1200) {
  const station = heliosStation();
  const berth = resolveBerthWorld(station, HELIOS);
  const pos = framePos(startAlong, 0);
  const vel = frameVel(-inboundSpeed, 0);
  const dt = 1 / 60;
  const samples = [];
  let maxAccel = 0;
  let assistSteps = 0;
  for (let i = 0; i < steps; i += 1) {
    const assist = computeCaptureAssist(HELIOS, station, pos, vel, 0);
    if (assist) {
      assistSteps += 1;
      const mag = Math.hypot(assist.x, assist.z);
      if (mag > maxAccel) maxAccel = mag;
      vel.x += assist.x * dt;
      vel.z += assist.z * dt;
    }
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    samples.push(pos.x, pos.z, vel.x, vel.z);
  }
  const hash = createHash('sha256').update(JSON.stringify(samples)).digest('hex');
  return {
    hash,
    maxAccel,
    assistSteps,
    distToBerth: Math.hypot(pos.x - berth.x, pos.z - berth.z),
    speed: Math.hypot(vel.x, vel.z),
  };
}

test('capture trajectory is deterministic, bounded, and converges onto the berth', () => {
  const a = flyCaptureTrajectory(118, 20);
  const b = flyCaptureTrajectory(118, 20);
  assert.equal(a.hash, b.hash, 'same start conditions → byte-identical trajectory hash');
  assert.deepEqual(a, b);

  assert.ok(a.assistSteps > 0, 'the assist actually engaged during the run');
  assert.ok(a.maxAccel <= MAX_ACCEL + EPS, `peak accel ${a.maxAccel} respects the bound`);
  assert.ok(a.distToBerth < 0.5, `converged to the berth (${a.distToBerth} wu)`);
  assert.ok(a.speed < 2, `settled below the berth speed gate (${a.speed} wu/s)`);

  // Guard the guard: a 1 mm start offset must produce a different hash.
  const perturbed = flyCaptureTrajectory(118.001, 20);
  assert.notEqual(perturbed.hash, a.hash, 'the hash can actually distinguish trajectories');
});

// ---------------------------------------------------------------------------------------------
// system seam: update(), physics-membrane impulse, diagnostics publication
// ---------------------------------------------------------------------------------------------

function makeFlightState({ playerPos, playerVel, input = {}, station = heliosStation() }) {
  const player = {
    id: 'player',
    type: 'ship',
    alive: true,
    pos: { ...playerPos },
    vel: { ...playerVel },
    radius: 14,
    physicsBody: { mass: 10 },
  };
  const entities = new Map([[player.id, player], [station.id, station]]);
  const state = {
    mode: 'flight',
    playerId: player.id,
    entities,
    entityIndex: { stations: [station] },
    entityList: [player, station],
    input,
    ui: {},
  };
  return { state, player, station };
}

test('system update publishes the capture readout and queues an additive membrane impulse', () => {
  dockingCorridor.init({ bus: null });
  const dt = 1 / 60;
  const { state, player, station } = makeFlightState({
    playerPos: framePos(100, 0),
    playerVel: { x: 0, z: 0 },
  });
  // The pilot's own control command is on the membrane BEFORE the assist runs.
  writePhysicsControl(player, { mode: 'thrust', force: { x: 3, y: 0, z: -2 }, source: 'flightV3' });

  dockingCorridor.update(dt, state);

  const readout = state.dockingCorridor;
  assert.equal(readout.phase, 'capture');
  assert.equal(readout.stationId, 'station_helios');
  assert.equal(readout.proxyId, 'helios_trade_hub');
  assert.ok(readout.assist, 'assist was applied this tick');

  const expected = computeCaptureAssist(HELIOS, station, framePos(100, 0), { x: 0, z: 0 }, 0);
  assert.ok(Math.abs(readout.assist.ax - expected.x) < EPS);
  assert.ok(Math.abs(readout.assist.az - expected.z) < EPS);

  const command = consumePhysicsCommand(player);
  assert.ok(command, 'a command reached the physics membrane');
  // The pilot's control was NOT overwritten — the assist arrived as an additive impulse.
  assert.deepEqual(command.control.force, { x: 3, y: 0, z: -2 });
  assert.equal(command.impulses.length, 1);
  const impulse = command.impulses[0];
  assert.ok(Math.abs(impulse.x - expected.x * 10 * dt) < EPS, 'impulse = assist × mass × dt');
  assert.ok(Math.abs(impulse.z - expected.z * 10 * dt) < EPS);
  assert.equal(impulse.y, 0);

  consumePhysicsCommand(player); // clean the membrane for other tests
});

test('system update preserves the input blend through the membrane', () => {
  dockingCorridor.init({ bus: null });
  const dt = 1 / 60;
  const { state, player, station } = makeFlightState({
    playerPos: framePos(100, 0),
    playerVel: { x: 0, z: 0 },
    input: { moveZ: 1 },
  });
  dockingCorridor.update(dt, state);
  const unblended = computeCaptureAssist(HELIOS, station, framePos(100, 0), { x: 0, z: 0 }, 0);
  const command = consumePhysicsCommand(player);
  const impulse = command.impulses[0];
  assert.ok(Math.abs(Math.hypot(impulse.x, impulse.z) - Math.hypot(unblended.x, unblended.z) * 0.25 * 10 * dt) < 1e-8);
});

test('system update owes nothing outside the corridor, when docked, or for legacy stations', () => {
  const dt = 1 / 60;

  // Far outside the corridor: approach phase, no impulse.
  dockingCorridor.init({ bus: null });
  const outside = makeFlightState({ playerPos: framePos(300, 0), playerVel: { x: 0, z: 0 } });
  dockingCorridor.update(dt, outside.state);
  assert.equal(outside.state.dockingCorridor.phase, 'approach');
  assert.equal(outside.state.dockingCorridor.assist, null);
  assert.equal(consumePhysicsCommand(outside.player), null);

  // Docked: the system stands down entirely.
  dockingCorridor.init({ bus: null });
  const docked = makeFlightState({ playerPos: framePos(100, 0), playerVel: { x: 0, z: 0 } });
  docked.state.ui.docked = true;
  dockingCorridor.update(dt, docked.state);
  assert.equal(docked.state.dockingCorridor.phase, 'none');
  assert.equal(consumePhysicsCommand(docked.player), null);

  // Legacy station (no declared manifest): skipped, legacy radius docking untouched.
  dockingCorridor.init({ bus: null });
  const legacyStation = heliosStation();
  legacyStation.data = { stationId: 'station_legacy', dockRadius: 90 };
  const legacy = makeFlightState({
    playerPos: framePos(100, 0),
    playerVel: { x: 0, z: 0 },
    station: legacyStation,
  });
  dockingCorridor.update(dt, legacy.state);
  assert.equal(legacy.state.dockingCorridor.phase, 'none');
  assert.equal(legacy.state.dockingCorridor.stationId, null);
  assert.deepEqual(legacy.state.physicsRuntime.collisionProxies, []);
  assert.equal(consumePhysicsCommand(legacy.player), null);
});

test('the nearest manifest station wins when several are in range', () => {
  dockingCorridor.init({ bus: null });
  const near = heliosStation('st-near');
  const far = heliosStation('st-far', { x: 5000, z: 5000 });
  const { state } = makeFlightState({ playerPos: framePos(100, 0), playerVel: { x: 0, z: 0 }, station: near });
  state.entityIndex.stations.push(far);
  state.entityList.push(far);
  state.entities.set(far.id, far);
  dockingCorridor.update(1 / 60, state);
  assert.equal(state.dockingCorridor.stationId, 'station_helios');
  assert.equal(state.physicsRuntime.collisionProxies.length, 2, 'diagnostics cover every manifest station');
});

test('proxy diagnostics publish frozen world geometry on the physicsRuntime surface (debug seam)', () => {
  dockingCorridor.init({ bus: null });
  const { state, station } = makeFlightState({
    playerPos: framePos(100, 0),
    playerVel: { x: 0, z: 0 },
  });
  dockingCorridor.update(1 / 60, state);

  const proxies = state.physicsRuntime.collisionProxies;
  assert.equal(proxies.length, 1);
  const entry = proxies[0];
  assert.ok(Object.isFrozen(entry), 'published geometry is frozen');
  assert.ok(Object.isFrozen(entry.primitives));
  assert.equal(entry.entityId, station.id);
  assert.equal(entry.stationId, 'station_helios');
  assert.equal(entry.proxyId, 'helios_trade_hub');
  assert.deepEqual(entry.flags, {
    collides: true,
    renderable: false,
    targetable: false,
    radarVisible: false,
  });
  assert.equal(entry.corridorBearingDeg, 135);
  assert.equal(entry.primitives.length, 23, 'same expanded set the physics authority registers');
  assert.ok(Math.abs(entry.corridor.mouthRadius - 121.5) < EPS);
  assert.ok(Math.abs(entry.corridor.captureOuterRadius - 108) < EPS);
  assert.ok(Math.abs(entry.corridor.captureHalfWidth - 37.8) < EPS);
  assert.equal(entry.corridor.speedGate, 55);
  assert.equal(entry.corridor.captureSpeedGate, 26);
  assert.equal(entry.corridor.headingGateDeg, 42);
  const berth = resolveBerthWorld(station, HELIOS);
  assert.ok(Math.abs(entry.berth.x - berth.x) < EPS);
  assert.ok(Math.abs(entry.berth.z - berth.z) < EPS);

  // The geometry cache is stable: an unchanged station republishes the identical frozen record.
  dockingCorridor.update(1 / 60, state);
  assert.equal(state.physicsRuntime.collisionProxies[0], entry, 'no per-frame geometry rebuild');
});

test('system update is deterministic across identical fresh states', () => {
  const run = () => {
    dockingCorridor.init({ bus: null });
    const { state } = makeFlightState({
      playerPos: framePos(100, 0),
      playerVel: frameVel(-10, 2),
    });
    dockingCorridor.update(1 / 60, state);
    return state.dockingCorridor;
  };
  assert.deepEqual(run(), run());
});

// ---------------------------------------------------------------------------------------------
// regression: the REAL SG-02 authority (compound proxies registered) must settle the ship at the
// berth — a pure-math trajectory cannot see the ship coasting ballistically into the core deck
// when the assist disengages early (the phase-gate regression this guards).
// ---------------------------------------------------------------------------------------------

async function flyRealAuthorityTrajectory() {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const station = heliosStation();
    const player = {
      id: 'player', type: 'ship', alive: true, collides: true, flags: {},
      pos: framePos(105), vel: frameVel(-12), rot: 0, angVel: 0, radius: 14, mass: 32, data: {},
    };
    const state = {
      mode: 'flight', playerId: player.id,
      entities: new Map([[player.id, player], [station.id, station]]),
      entityIndex: { stations: [station] }, entityList: [player, station], input: {}, ui: {},
    };
    dockingCorridor.init({ bus: null });
    owner.syncFromEntities([station, player]);
    const berth = resolveBerthWorld(station, HELIOS);
    const series = [];
    let maxDeltaV = 0;
    for (let tick = 0; tick < 900; tick++) {
      const prevVx = player.vel.x;
      const prevVz = player.vel.z;
      dockingCorridor.update(1 / 60, state);
      owner.step(1 / 60);
      const dv = Math.hypot(player.vel.x - prevVx, player.vel.z - prevVz);
      if (dv > maxDeltaV) maxDeltaV = dv;
      series.push([round6(player.pos.x), round6(player.pos.z), round6(player.vel.x), round6(player.vel.z)]);
    }
    return {
      hash: createHash('sha256').update(JSON.stringify(series)).digest('hex'),
      maxDeltaV,
      distToBerth: Math.hypot(player.pos.x - berth.x, player.pos.z - berth.z),
      speed: Math.hypot(player.vel.x, player.vel.z),
      phase: state.dockingCorridor.phase,
    };
  } finally {
    owner.dispose();
  }
}

test('real authority: capture settles at the berth with bounded per-tick velocity change', async () => {
  const run = await flyRealAuthorityTrajectory();
  assert.ok(run.distToBerth < HELIOS.docking.berth.dockRadius,
    `settled within the berth dock radius (${run.distToBerth.toFixed(2)} wu)`);
  assert.ok(run.speed < HELIOS.docking.berth.speedGate,
    `settled under the berth speed gate (${run.speed.toFixed(2)} wu/s)`);
  // The coast-into-core regression guard: per-tick Δv must never exceed the bounded assist — a
  // solver contact spike here means the assist let the ship coast into the station silhouette.
  assert.ok(run.maxDeltaV <= MAX_ACCEL / 60 + EPS,
    `per-tick Δv ${run.maxDeltaV} exceeds the bounded assist ${MAX_ACCEL / 60} (ricochet/yank/contact)`);
  assert.equal(run.phase, 'berthed', 'the corridor resolves to berthed');
});

test('real authority: identical timeline produces an identical trajectory hash, twice', async () => {
  const first = await flyRealAuthorityTrajectory();
  const second = await flyRealAuthorityTrajectory();
  assert.equal(first.hash, second.hash, 'same start conditions → byte-identical trajectory hash');
});

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}
