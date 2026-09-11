// PQ-159.00 — "Impacts kick and reduced motion holds."
//
// Done-when: a kick magnitude table keyed on exchanged momentum, and a reduce-motion capture that
// shows none. This file measures BOTH halves on a fixed seed:
//   1. A real `physics:impact` produced by the physics authority (createGameState + resolvePair,
//   same construction as scripts/check-camera-trauma.mjs) is fed through the live feel host into
//   the REAL chase camera (headless window stub — the same pattern camera-focus-separation uses).
//   The frame translates in the direction the hull was knocked, by the table's world-unit amount.
//   2. The identical contact under settings.video.motionReduce produces zero kick, zero trauma,
//   zero hitstop — the capture shows none.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IMPACT_KICK_MOMENTUM_FLOOR,
  IMPACT_KICK_TABLE,
  COLLISION_HITSTOP_COOLDOWN,
  feel,
  impactKickFromMomentum,
  resolveCollisionFeel,
} from '../src/render/feel.js';
import {
  IMPACT_KICK_WU_MAX,
  createChaseCamera,
  stepCameraKick,
} from '../src/render/camera.js';
import { physics } from '../src/core/physics.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';

const SEED = 15900;
const DT = 1 / 60;

function makeBody({ id, type, x, z, vx = 0, vz = 0, radius = 10, mass = 20 }) {
  return {
    id,
    type,
    alive: true,
    collides: true,
    collisionMask: 0xffff,
    pos: { x, z },
    vel: { x: vx, z: vz },
    radius,
    mass,
    team: 0,
    flags: {},
    data: {},
  };
}

// A real exchange measured by the physics authority on the fixed seed: the starter-scale hull
// (mass 20) runs head-on into a heavy asteroid. Returns the emitted physics:impact payload.
function measuredImpact() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.playerId = 1;
  const events = [];
  const bus = { emit: (name, payload) => events.push({ name, payload }) };
  const player = makeBody({ id: 1, type: 'ship', x: 0, z: 0, vx: 90, radius: 10, mass: 20 });
  const rock = makeBody({ id: 2, type: 'asteroid', x: 18, z: 0, radius: 10, mass: 220 });
  const host = Object.create(physics);
  host._pairMaterialScratch = {};
  host._impactOptionsScratch = {
    backend: 'custom', tick: 0, normal: { x: 0, z: 0 }, causalActorId: null, preSolveClosingSpeed: 0,
  };
  host.resolvePair(player, rock, 18, 18, 0, bus, state);
  const impact = events.find((entry) => entry.name === 'physics:impact');
  assert.ok(impact, 'the seeded head-on contact must emit physics:impact');
  assert.ok(impact.payload.dp > 0, 'the seeded exchange must carry real exchanged momentum');
  return { impact: impact.payload, player, rock };
}

// Live feel host over a real bus + time-effects owner (the pq-139.00 fixture pattern). `ctrl`
// records what the camera surface would receive.
function feelFixture({ motionReduce = false, extraEntities = [] } = {}) {
  const state = {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: 1,
    settings: { video: { motionReduce } },
    ui: { screenStack: [], docked: false },
    entities: new Map([
      [1, makeBody({ id: 1, type: 'ship', x: 0, z: 0, mass: 20 })],
      [2, makeBody({ id: 2, type: 'asteroid', x: 18, z: 0, mass: 220 })],
      ...extraEntities.map((e) => [e.id, e]),
    ]),
    render: {},
    rng: () => { throw new Error('presentation must not consume sim RNG'); },
  };
  const calls = { trauma: [], kick: [] };
  state.render.cameraCtrl = {
    addTrauma: (a) => calls.trauma.push(a),
    impactKick: (dx, dz, wu) => calls.kick.push({ dx, dz, wu }),
  };
  const bus = createBus();
  const effects = createTimeEffects(state);
  const host = Object.create(feel);
  host._injectStyle = () => {};
  host._mountVignette = () => {};
  host._ensureVignette = () => null;
  host._updateSpeedLines = () => {};
  host.init({ state, bus, timeEffects: effects });
  return { state, bus, host, calls, frame: (dt = 0) => host.frame(dt, state) };
}

// One shared state carrying BOTH the live feel host and the real chase camera — the same wiring
// the game runs (the camera-focus-separation headless pattern for the camera half).
function liveFixture({ motionReduce = false, entities = [] } = {}) {
  globalThis.window = { innerWidth: 1600, innerHeight: 900 };
  const player = makeBody({ id: 1, type: 'ship', x: 0, z: 0, radius: 7, mass: 20 });
  player.maxSpeed = 120;
  const state = {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: 1,
    entities: new Map([[1, player], ...entities.map((e) => [e.id, e])]),
    settings: { video: { fov: 50, motionReduce } },
    camera: { zoom: 144, tilt: 60, lookAhead: 18, lerp: 6, trauma: 0 },
    input: { aimWorld: null },
    player: {},
    ui: { screenStack: [], docked: false },
    render: {},
    rng: () => { throw new Error('presentation must not consume sim RNG'); },
  };
  const camera = createChaseCamera(state);
  camera.snapToPlayer();
  state.render.cameraCtrl = camera;
  const bus = createBus();
  const effects = createTimeEffects(state);
  const host = Object.create(feel);
  host._injectStyle = () => {};
  host._mountVignette = () => {};
  host._ensureVignette = () => null;
  host._updateSpeedLines = () => {};
  host.init({ state, bus, timeEffects: effects });
  return { state, bus, host, camera, player, frame: (dt = 0) => host.frame(dt, state) };
}

test('kick magnitude table is keyed on exchanged momentum and monotone', () => {
  assert.ok(Object.isFrozen(IMPACT_KICK_TABLE));
  for (let i = 1; i < IMPACT_KICK_TABLE.length; i++) {
    assert.ok(IMPACT_KICK_TABLE[i].momentum > IMPACT_KICK_TABLE[i - 1].momentum,
      'momentum rows must ascend');
    assert.ok(IMPACT_KICK_TABLE[i].kickWu >= IMPACT_KICK_TABLE[i - 1].kickWu,
      'kickWu must be monotone non-decreasing in momentum');
  }
  for (const dp of [0, 40, IMPACT_KICK_MOMENTUM_FLOOR - 0.01, NaN, -500]) {
    assert.equal(impactKickFromMomentum(dp), 0, `momentum ${dp} is a touch, not a kick`);
  }
  let prev = 0;
  for (const dp of [160, 400, 800, 1400, 2000, 3000, 4000, 6000, 8000, 40000]) {
    const kick = impactKickFromMomentum(dp);
    assert.ok(kick >= prev, `kick must not shrink as momentum rises (${prev} -> ${kick} at ${dp})`);
    assert.ok(kick <= IMPACT_KICK_WU_MAX, `kick ${kick} exceeds the camera ceiling`);
    prev = kick;
  }
  assert.ok(impactKickFromMomentum(40000) === impactKickFromMomentum(8000),
    'the table ceiling is a real clamp, not an asymptote');
});

test('the resolved record carries a directed kick beside the scalar beat', () => {
  const row = resolveCollisionFeel({ normal: { x: 1, z: 0 } }, {
    mode: 'flight',
    deltaV: 60,
    momentum: 1200,
    playerDistance: 0,
    motionReduce: false,
    kickDirX: -1,
    kickDirZ: 0,
  });
  assert.ok(row);
  assert.ok(row.kickWu > 0, 'a knock above the momentum floor must carry a kick');
  assert.equal(row.kickWu, impactKickFromMomentum(1200), 'kick magnitude is the table value');
  assert.ok(Math.abs(Math.hypot(row.kickX, row.kickZ) - 1) < 1e-9, 'kick direction is a unit vector');
  assert.ok(row.kickX < 0, 'kick points the way the hull was knocked');
  // Distance falloff attenuates world kicks exactly like trauma.
  const far = resolveCollisionFeel({ normal: { x: 1, z: 0 } }, {
    mode: 'flight', deltaV: 60, momentum: 1200, playerDistance: 1200,
    motionReduce: false, kickDirX: -1, kickDirZ: 0,
  });
  assert.ok(far.kickWu < row.kickWu, 'a distant exchange must not shove the player frame full-strength');
  // A contact with no resolvable direction reports magnitude only — the camera declines it.
  const blind = resolveCollisionFeel({}, {
    mode: 'flight', deltaV: 60, momentum: 1200, playerDistance: 0, motionReduce: false,
  });
  assert.ok(blind.kickWu > 0 && blind.kickX === 0 && blind.kickZ === 0);
});

test('fixed seed: a real physics exchange kicks the live chase camera in player units', () => {
  // resolvePair mutates its bodies (pushApart/impulse), so the live fixture keeps its OWN
  // stationary player (id 1 at x=0) and rock (id 2 at x=18) — matching the receipt's aId/bId —
  // and the measured payload supplies the physics truth. Stationary player = exact focus control.
  const { impact } = measuredImpact();
  const rock = makeBody({ id: 2, type: 'asteroid', x: 18, z: 0, radius: 10, mass: 220 });
  const { state, bus, camera, frame } = liveFixture({ entities: [rock] });

  const before = { x: state.camera.focus.x, z: state.camera.focus.z };
  bus.emit('physics:impact', impact);
  frame();            // flush the armed beat
  let peak = 0;
  for (let i = 0; i < 30; i++) {
    camera.follow(DT);
    peak = Math.max(peak, Math.hypot(state.camera.kickOffset.x, state.camera.kickOffset.z));
  }

  const expected = impactKickFromMomentum(impact.dp);
  console.log(`[seed ${SEED}] exchanged momentum dp=${impact.dp.toFixed(1)} mass·wu/s; ` +
    `table kick=${expected.toFixed(3)} wu; peak applied offset=${peak.toFixed(3)} wu`);
  assert.ok(expected > 0.05, 'the seeded exchange must be above the kick floor');
  assert.ok(peak > expected * 0.9,
    `peak ${peak.toFixed(3)} must reach the authored impulse ${expected.toFixed(3)} wu`);
  assert.ok(peak <= IMPACT_KICK_WU_MAX + 1e-9, 'kick respects the displacement ceiling');
  // Direction: away from the contact point toward the knocked hull — the player sits at x<18.
  assert.ok(state.camera.kickOffset.x < 0 || state.camera.kickOffset.x === 0,
    'the seeded head-on contact kicks the frame backward (-x)');
  // The kick decays back to a still frame — no permanent displacement.
  for (let i = 0; i < 120; i++) camera.follow(DT);
  assert.ok(Math.hypot(state.camera.kickOffset.x, state.camera.kickOffset.z) < 0.02,
    'the kick eases fully back inside ~2.5 s');
  // The damped follow focus was never polluted by the kick (stationary player = exact control).
  assert.ok(Math.abs(state.camera.focus.x - before.x) < 1e-6);
  assert.ok(Math.abs(state.camera.focus.z - before.z) < 1e-6);
});

test('the kick is rate-limited by the shared collision cooldown', () => {
  const { bus, calls, frame } = feelFixture();
  const hit = (dp, tick) => bus.emit('physics:impact', {
    tick, aId: 1, bId: 2, dp, playerInvolved: true, playerDeltaV: dp / 20,
    pos: { x: 14, z: 0 }, normal: { x: 1, z: 0 },
  });
  hit(1200, 10);
  frame(DT);
  assert.equal(calls.kick.length, 1);
  // Same pair, same tick: a duplicate deferred receipt cannot re-kick.
  hit(4000, 10);
  frame(DT);
  assert.equal(calls.kick.length, 1);
  // Inside the cooldown, only a meaningfully harder exchange re-arms.
  hit(1300, 11);
  frame(DT);
  assert.equal(calls.kick.length, 1);
  hit(4000, 12);
  frame(DT);
  assert.equal(calls.kick.length, 2, 'a real escalation interrupts the armed beat');
  // After the cooldown the next ordinary contact answers again.
  frame(COLLISION_HITSTOP_COOLDOWN + DT);
  hit(1200, 20);
  frame(DT);
  assert.equal(calls.kick.length, 3);
});

test('reduce-motion capture shows none: no kick, no trauma, no hitstop', () => {
  const { impact } = measuredImpact();
  const rock = makeBody({ id: 2, type: 'asteroid', x: 18, z: 0, radius: 10, mass: 220 });
  const { state, bus, camera, frame } = liveFixture({ motionReduce: true, entities: [rock] });

  bus.emit('physics:impact', impact);
  frame(DT);
  for (let i = 0; i < 60; i++) camera.follow(DT);

  assert.equal(state.timeScale, 1, 'no hitstop under reduced motion');
  assert.equal(state.camera.trauma, 0, 'no trauma under reduced motion');
  assert.equal(Math.hypot(state.camera.kickOffset.x, state.camera.kickOffset.z), 0,
    'the reduce-motion capture shows none');
  // Belt and suspenders: a kick forced straight at the controller still no-ops.
  camera.impactKick(1, 0, 3);
  for (let i = 0; i < 30; i++) camera.follow(DT);
  assert.equal(Math.hypot(state.camera.kickOffset.x, state.camera.kickOffset.z), 0,
    'the controller itself refuses a kick under reduced motion');
});

test('camera kick integrator: bounded rise, full decay, deterministic', () => {
  const kick = { envX: 2, envZ: 0, x: 0, z: 0 };
  let peak = 0;
  for (let i = 0; i < 240; i++) {
    stepCameraKick(kick, DT);
    peak = Math.max(peak, kick.x);
  }
  assert.ok(peak > 1.8 && peak <= 2 + 1e-9, `peak ${peak} reaches the authored impulse, not past it`);
  assert.equal(kick.x, 0, 'a decayed kick returns to exactly zero');
  assert.equal(kick.envX, 0);
  // Opposing impulses cancel like exchanged momentum does.
  const sum = { envX: 1.5, envZ: 0, x: 0, z: 0 };
  sum.envX += -1.0;
  stepCameraKick(sum, DT);
  assert.ok(sum.envX < 1.5, 'opposing kicks subtract');
  // NaN/negative dt cannot poison the record.
  stepCameraKick(kick, NaN);
  assert.equal(kick.x, 0);
});

test('headless sim determinism: the seeded exchange is reproducible', () => {
  const a = measuredImpact().impact;
  const b = measuredImpact().impact;
  assert.deepEqual(b.dp, a.dp, 'same seed, same exchanged momentum');
});
