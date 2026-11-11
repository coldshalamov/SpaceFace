// G18-03 — the missing feedback packet.
// 1. A light kill (ship mass <= 32 t reads through the light tier) emits one camera beat of the
//    stated size — about 2 world units along the kill direction — in a Swarm AND an Adventure
//    state. It used to get nothing.
// 2. A heavy kill keeps today's authored beat (zoom kiss + hold) and is not doubled.
// 3. A real slingshot release emits its ~3 wu pull in the throw direction in Swarm — the S6
//    survival gate is gone. Unearned releases stay silent.
// 4. Reduced motion emits none of the moving beats.
// 5. The starter ship's boost top speed is 2.0x its governed cruise.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import {
  applyMasslineReleaseCameraCue,
  createChaseCamera,
} from '../src/render/camera.js';
import { feel } from '../src/render/feel.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';

const DT = 1 / 60;
const PLAYER_ID = 'player';

function playerEntity() {
  return {
    id: PLAYER_ID, type: 'ship', alive: true, isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 40,
    hull: 100, hullMax: 100, flags: {}, data: {},
  };
}

function flightState({ swarm = false, motionReduce = false } = {}) {
  const player = playerEntity();
  const state = {
    mode: 'flight', tick: 0, simTime: 0, playerId: PLAYER_ID,
    entities: new Map([[PLAYER_ID, player]]), entityList: [player],
    player: { heat: 0, tether: null },
    settings: { video: { fov: 50, motionReduce } },
    camera: { zoom: 144, tilt: 60, lookAhead: 18, lerp: 6, trauma: 0 },
    input: { aimWorld: null },
    render: {},
    ui: { screenStack: [] },
  };
  if (swarm) state.run = { kind: 'survival', phase: 'live', ruleset: SWARM_RULESET };
  return { state, player };
}

// Same headless feel harness the fragment storm tests use: init, listeners, and the frame loop
// run for real; only the DOM/canvas seams are stubbed.
function feelHost(state) {
  const bus = createBus();
  const host = Object.create(feel);
  host._injectStyle = () => {};
  host._mountVignette = () => {};
  host._ensureVignette = () => null;
  host._ensureHullCrit = () => null;
  host._updateSpeedLines = () => {};
  host.init({ state, bus, timeEffects: createTimeEffects(state) });
  return { bus, host };
}

function rig(opts = {}) {
  const { state } = flightState(opts);
  const cam = createChaseCamera(state, { innerWidth: 1280, innerHeight: 720 });
  state.render.cameraCtrl = cam;
  const { bus, host } = feelHost(state);
  cam.snapToPlayer();
  for (let i = 0; i < 30; i += 1) cam.follow(DT);
  return { state, cam, bus, host };
}

// Integrate the shared kick envelope and report the peak displacement it carried plus the
// direction that peak pointed — the "size and line" of a camera beat.
function settleKick(state, cam, frames = 60) {
  let peak = 0;
  let dir = { x: 0, z: 0 };
  for (let i = 0; i < frames; i += 1) {
    cam.follow(DT);
    const k = state.camera.kickOffset;
    const mag = Math.hypot(k.x, k.z);
    if (mag > peak) {
      peak = mag;
      dir = { x: k.x / mag, z: k.z / mag };
    }
  }
  const k = state.camera.kickOffset;
  return { peak, dir, tail: Math.hypot(k.x, k.z) };
}

function assertDirection(dir, x, z, label) {
  const dot = dir.x * x + dir.z * z;
  assert.ok(dot > 0.98, `${label}: beat must point along (${x},${z}), got dir (${dir.x.toFixed(3)},${dir.z.toFixed(3)})`);
}

for (const door of ['adventure', 'swarm']) {
  test(`G18-03: a light kill emits one ~2 wu directed beat in ${door}`, () => {
    const { state, cam, bus } = rig({ swarm: door === 'swarm' });
    bus.emit('entity:killed', {
      id: 'w1', killerId: PLAYER_ID, type: 'ship', mass: 16,
      pos: { x: 60, z: 0 }, victimClass: 'wasp',
      presentation: { direction: { x: 0.6, z: 0.8 } },
    });
    const log = cam.killBeatLog();
    assert.equal(log.length, 1, 'a light kill emits exactly one camera beat');
    assert.equal(log[0].tier, 'light');
    assert.equal(log[0].kick, true, 'the light beat is the directed nudge');
    assert.equal(log[0].zoom, false, 'the light beat is not the zoom kiss');
    const { peak, dir, tail } = settleKick(state, cam);
    assert.ok(peak >= 1.5 && peak <= 2.05,
      `light kill nudge ≈ 2 wu, got peak ${peak.toFixed(2)} wu`);
    assertDirection(dir, 0.6, 0.8, door);
    assert.ok(tail < peak * 0.5, 'the nudge settles after the beat');
  });
}

test('G18-03: a heavy kill keeps the authored zoom beat and is not doubled', () => {
  const { state, cam, bus } = rig();
  bus.emit('entity:killed', {
    id: 'h1', killerId: PLAYER_ID, type: 'ship', mass: 240,
    pos: { x: 60, z: 0 }, victimClass: 'frigate',
    presentation: { direction: { x: 1, z: 0 } },
  });
  const log = cam.killBeatLog();
  assert.equal(log.length, 1, 'the heavy kill emits exactly one camera beat');
  assert.equal(log[0].tier, 'heavy');
  assert.equal(log[0].zoom, true, 'the heavy tier keeps its zoom kiss');
  assert.equal(log[0].kick, false, 'the heavy tier keeps NO directed kick — not doubled');
  let sawZoom = false;
  for (let i = 0; i < 30; i += 1) {
    cam.follow(DT);
    if (cam.zoomDiagnostics().pushZoom < 0) sawZoom = true;
  }
  assert.ok(sawZoom, 'the heavy kiss still tightens the frame');
  const k = state.camera.kickOffset;
  assert.ok(Math.hypot(k.x, k.z) < 0.05,
    'the heavy beat must not gain a translational kick on top of its zoom');
});

for (const door of ['adventure', 'swarm']) {
  test(`G18-03: a real slingshot release pulls ~3 wu along the throw in ${door}`, () => {
    const { state, cam } = rig({ swarm: door === 'swarm' });
    const exitAngle = Math.PI / 3;
    const receipt = applyMasslineReleaseCameraCue(cam, state, {
      source: 'massline', physicsEarned: true, bonusDv: 200,
      exitAngle, releaseId: 'r1',
    });
    assert.equal(receipt.physicsEarned, true);
    assert.equal(receipt.pullWu, 3, `${door}: release receipt carries the pull`);
    const { peak, dir } = settleKick(state, cam);
    assert.ok(peak >= 2.3 && peak <= 3.05,
      `${door}: release pull ≈ 3 wu, got peak ${peak.toFixed(2)} wu`);
    assertDirection(dir, Math.cos(exitAngle), Math.sin(exitAngle), door);
  });
}

test('G18-03: an unearned release stays silent', () => {
  const { state, cam } = rig();
  const receipt = applyMasslineReleaseCameraCue(cam, state, {
    source: 'massline', physicsEarned: false, bonusDv: 200,
    exitAngle: 0, releaseId: 'r2',
  });
  assert.equal(receipt.pullWu, 0);
  assert.equal(receipt.zoomFactor, 0);
  const { peak } = settleKick(state, cam);
  assert.ok(peak < 0.05, 'an unearned release must not move the frame');
});

test('G18-03: reduced motion emits none of the moving beats', () => {
  const { state, cam, bus } = rig({ motionReduce: true });
  bus.emit('entity:killed', {
    id: 'w1', killerId: PLAYER_ID, type: 'ship', mass: 16,
    pos: { x: 60, z: 0 }, victimClass: 'wasp',
    presentation: { direction: { x: 1, z: 0 } },
  });
  assert.equal(cam.killBeatLog().length, 0, 'reduced motion: no light beat at all');
  const receipt = applyMasslineReleaseCameraCue(cam, state, {
    source: 'massline', physicsEarned: true, bonusDv: 200,
    exitAngle: Math.PI / 3, releaseId: 'r3',
  });
  assert.equal(receipt.pullWu, 0, 'reduced motion: no release pull');
  assert.equal(receipt.zoomFactor, 0, 'reduced motion: no release zoom');
  const { peak } = settleKick(state, cam);
  assert.ok(peak < 0.05, 'reduced motion: the frame never moves');
});

test('G18-03: the starter boost top speed is 2.0x its governed cruise', () => {
  const kestrel = SHIPS.find((s) => s.id === 'ship_kestrel');
  assert.ok(kestrel, 'starter ship exists');
  const profile = resolvePropulsionProfile(
    { id: 'p', type: 'ship', data: { defId: 'ship_kestrel', derived: getDerivedStats('ship_kestrel', [], null) } },
    { runtime: { features: PRODUCTION_FEATURES } },
  );
  const cruise = profile.combatSpeed;
  const boostTop = cruise * (Number.isFinite(profile.boostSpeedMult) ? profile.boostSpeedMult : 1);
  const ratio = boostTop / cruise;
  assert.ok(Math.abs(ratio - 2.0) <= 0.05,
    `starter boost/cruise ratio ${ratio.toFixed(3)} must land at 2.0 ± 0.05`);
});
