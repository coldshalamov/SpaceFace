// AC-12 — the pickup stream inhales into the hull.
//
// Proves the four halves of the outcome on the live route: a deterministic nearest-first capture
// ripple in sim, a pooled curved intake stream in presentation that terminates on the real hull
// surface, a bounded collection pitch ladder in audio with a distinct credit voice, and unchanged
// cargo/credit acceptance underneath all of it.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { mining } from '../src/systems/mining.js';
import { audio } from '../src/audio/audioSystem.js';
import { vfx } from '../src/render/vfx.js';
import { MAGNET_RANGE } from '../src/systems/pickupAttraction.js';
import { CREDIT_CHIP_KIND } from '../src/data/killRewards.js';
import {
  CAPTURE_WAVE_SPACING_S,
  PICKUP_CHAIN_PITCH_STEPS,
  PICKUP_CHAIN_RESET_S,
  PICKUP_CHAIN_SEMITONE,
  PICKUP_CHAIN_SOFT_CAP,
  advancePickupChain,
  captureActivatedAt,
  captureChainInfo,
  createCaptureWave,
  createPickupChain,
  hullIntakePoint,
  isCaptureActive,
  isCreditChipGrantReason,
  pruneCaptureWave,
  resetCaptureWave,
  scheduleCaptureCandidates,
} from '../src/systems/pickupCaptureWave.js';

const DT = 1 / 60;
const PICKUP_STREAM_CAP = 24;

// ---------------------------------------------------------------------------
// Capture schedule — deterministic, nearest-first, never re-sorted
// ---------------------------------------------------------------------------

function candidates(entries) {
  return entries.map(([id, distance]) => ({ id, distance }));
}

test('capture activates nearest-first at a fixed 40 ms ripple spacing', () => {
  const wave = createCaptureWave();
  // Deliberately unsorted, with an exact distance tie between 7 and 3.
  const assigned = scheduleCaptureCandidates(
    wave,
    candidates([[5, 180], [2, 40], [7, 90], [9, 260], [3, 90]]),
    10,
  );
  assert.equal(assigned, 5);
  assert.equal(captureActivatedAt(wave, 2), 10);
  // Ties break on stable pickup id, so an equidistant pair cannot swap between ticks.
  assert.equal(captureActivatedAt(wave, 3), 10 + CAPTURE_WAVE_SPACING_S);
  assert.equal(captureActivatedAt(wave, 7), 10 + CAPTURE_WAVE_SPACING_S * 2);
  assert.equal(captureActivatedAt(wave, 5), 10 + CAPTURE_WAVE_SPACING_S * 3);
  assert.equal(captureActivatedAt(wave, 9), 10 + CAPTURE_WAVE_SPACING_S * 4);
  assert.equal(CAPTURE_WAVE_SPACING_S, 0.04);
});

test('a live ripple is never re-sorted: a nearer late arrival appends behind the tail', () => {
  const wave = createCaptureWave();
  scheduleCaptureCandidates(wave, candidates([[1, 300], [2, 320]]), 0);
  const beforeA = captureActivatedAt(wave, 1);
  const beforeB = captureActivatedAt(wave, 2);

  // Two ticks later a much nearer drop enters the band. Re-sorting the live wave here would
  // reshuffle both existing slots and destroy the rolling read.
  scheduleCaptureCandidates(wave, candidates([[3, 10]]), 2 * DT);
  assert.equal(captureActivatedAt(wave, 1), beforeA);
  assert.equal(captureActivatedAt(wave, 2), beforeB);
  assert.equal(captureActivatedAt(wave, 3), beforeB + CAPTURE_WAVE_SPACING_S);
  // One continuous stream, not two overlapping ripples.
  assert.equal(captureChainInfo(wave, 3).chainIndex, 2);
  assert.equal(captureChainInfo(wave, 1).chainCount, 3);
});

test('an isolated drop after the tail has elapsed captures immediately in a fresh chain', () => {
  const wave = createCaptureWave();
  scheduleCaptureCandidates(wave, candidates([[1, 50], [2, 60]]), 0);
  const firstChain = captureChainInfo(wave, 1).chainId;
  assert.equal(captureActivatedAt(wave, 2), CAPTURE_WAVE_SPACING_S);

  scheduleCaptureCandidates(wave, candidates([[3, 400]]), 5);
  assert.equal(captureActivatedAt(wave, 3), 5, 'a lone drop must not wait out a dead schedule');
  assert.equal(captureChainInfo(wave, 3).chainIndex, 0);
  assert.notEqual(captureChainInfo(wave, 3).chainId, firstChain);
});

test('a 24-drop cloud streams over ~1 s and a 40-drop cloud over ~1.6 s', () => {
  for (const [count, expected] of [[24, 0.92], [40, 1.56]]) {
    const wave = createCaptureWave();
    const cloud = [];
    for (let i = 0; i < count; i++) cloud.push([i + 1, 60 + i * 7]);
    scheduleCaptureCandidates(wave, candidates(cloud), 0);
    const first = captureActivatedAt(wave, 1);
    const last = captureActivatedAt(wave, count);
    assert.equal(first, 0, 'the nearest drop of a burst homes on the tick it is claimed');
    assert.ok(Math.abs((last - first) - expected) < 1e-9,
      `${count} drops must ripple over ${expected}s (got ${(last - first).toFixed(3)}s)`);
    assert.ok(last - first >= 0.9 && last - first <= 1.6,
      'the cloud spread stays inside the authored 1–1.6 s inhale window');
  }
});

test('capture activation is a sim-time threshold, and cleanup is deterministic', () => {
  const wave = createCaptureWave();
  scheduleCaptureCandidates(wave, candidates([[1, 10], [2, 20], [3, 30]]), 0);
  assert.equal(isCaptureActive(wave, 1, 0), true);
  assert.equal(isCaptureActive(wave, 2, 0), false);
  assert.equal(isCaptureActive(wave, 2, 0.039), false);
  assert.equal(isCaptureActive(wave, 2, 0.04), true);
  assert.equal(isCaptureActive(wave, 99, 10), false, 'an unscheduled id is never captured');

  const live = new Set([2]);
  assert.equal(pruneCaptureWave(wave, (id) => live.has(id)), 2);
  assert.equal(wave.entries.size, 1);
  assert.equal(captureActivatedAt(wave, 1), null);
  assert.equal(captureActivatedAt(wave, 2), 0.04, 'a surviving drop keeps the slot it was given');

  resetCaptureWave(wave);
  assert.equal(wave.entries.size, 0);
  assert.equal(wave.chainSizes.size, 0);
  // A reset wave schedules from the new sim time rather than a stale tail.
  scheduleCaptureCandidates(wave, candidates([[4, 10]]), 3);
  assert.equal(captureActivatedAt(wave, 4), 3);
});

// ---------------------------------------------------------------------------
// Hull intake geometry
// ---------------------------------------------------------------------------

test('intake lands on the nearest hull surface point, never the ship center', () => {
  const collector = { pos: { x: 100, z: -40 }, radius: 12, rot: 0 };
  const intake = hullIntakePoint(collector, 100 + 30, -40 + 40); // 3-4-5 at distance 50
  assert.ok(Math.abs(intake.x - (100 + 12 * 0.6)) < 1e-9);
  assert.ok(Math.abs(intake.z - (-40 + 12 * 0.8)) < 1e-9);
  assert.ok(Math.abs(Math.hypot(intake.x - 100, intake.z + 40) - 12) < 1e-9,
    'the intake point sits exactly on the hull radius');

  // Approaching from the other side resolves to the opposite surface point, not the same one.
  const behind = hullIntakePoint(collector, 100 - 30, -40 - 40);
  assert.ok(Math.abs(behind.x - (100 - 12 * 0.6)) < 1e-9);
  assert.ok(Math.abs(behind.z - (-40 - 12 * 0.8)) < 1e-9);
});

test('a drop resolved on the hull origin still gets a real, deterministic surface point', () => {
  const collector = { pos: { x: 0, z: 0 }, radius: 9, rot: Math.PI / 2 };
  const a = hullIntakePoint(collector, 0, 0);
  const b = hullIntakePoint(collector, 0, 0);
  assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z));
  assert.ok(Math.abs(Math.hypot(a.x, a.z) - 9) < 1e-9, 'degenerate input still lands on the hull');
  assert.deepEqual(a, b, 'the fallback is deterministic, not sampled');
  assert.ok(Math.abs(a.z - 9) < 1e-9, 'the fallback follows the collector facing');
});

test('the intake writes into a caller-owned scratch instead of allocating', () => {
  const scratch = { x: 0, z: 0 };
  const out = hullIntakePoint({ pos: { x: 0, z: 0 }, radius: 5 }, 10, 0, scratch);
  assert.equal(out, scratch);
  assert.equal(scratch.x, 5);
});

// ---------------------------------------------------------------------------
// Live mining route
// ---------------------------------------------------------------------------

function makeState({ cloud = [], playerVel = { x: 0, z: 0 }, capVolume = 400 } = {}) {
  const player = {
    id: 1,
    alive: true,
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: playerVel.x, z: playerVel.z },
    radius: 8,
    rot: 0,
    flags: {},
  };
  const pickups = cloud.map((spec, i) => ({
    id: 100 + i,
    alive: true,
    type: 'pickup',
    pos: { x: spec.x, z: spec.z },
    vel: { x: spec.vx || 0, z: spec.vz || 0 },
    radius: 2.2,
    mass: 0.1,
    collides: true,
    data: spec.data || { kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: 1 },
  }));
  const entities = new Map([[player.id, player]]);
  for (const p of pickups) entities.set(p.id, p);
  const state = {
    playerId: player.id,
    entities,
    entityList: [player, ...pickups],
    entityIndex: { __spacefaceEntityIndexV1: true, ready: true, pickups },
    player: {
      magnetRange: 0,
      miningBeam: { tierId: 'beam_mk1' },
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume },
      credits: 0,
    },
    mode: 'flight',
    input: { fireGroup: 0 },
    simTime: 0,
    rng: () => 0.5,
  };
  const collected = [];
  const grants = [];
  const listeners = Object.create(null);
  const bus = {
    on(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
      return () => {};
    },
    emit(type, payload) {
      if (type === 'pickup:collected') collected.push(payload);
      if (type === 'economy:grantCredits') grants.push(payload);
      for (const fn of listeners[type] || []) fn(payload);
    },
  };
  mining.init({ state, bus, helpers: {}, registry: { get: () => null } });
  return { state, player, pickups, collected, grants, bus };
}

// Physics is a separate owner; these fixtures integrate the velocity mining writes so a homing
// drop actually travels and arrives, instead of hovering while only its velocity changes.
function integrate(state) {
  for (const e of state.entityList) {
    if (!e.alive || e.type !== 'pickup' || !e.vel) continue;
    e.pos.x += e.vel.x * DT;
    e.pos.z += e.vel.z * DT;
  }
}

function tick(state, steps = 1) {
  for (let i = 0; i < steps; i++) {
    mining.update(DT, state);
    integrate(state);
    state.simTime += DT;
  }
}

test('before its slot opens a queued drop keeps its authored ejection drift untouched', () => {
  const cloud = [];
  for (let i = 0; i < 6; i++) cloud.push({ x: 60 + i * 30, z: 0, vx: 0, vz: 44 });
  const { state, pickups } = makeState({ cloud });

  mining.update(DT, state);
  const wave = state.miningRuntime.captureWave;
  assert.equal(wave.entries.size, 6);
  // Nearest is claimed on this very tick; the rest are still coasting on their eject impulse.
  assert.ok(pickups[0].vel.x < 0, 'the nearest drop joins the vacuum immediately');
  for (let i = 1; i < 6; i++) {
    assert.deepEqual(
      pickups[i].vel,
      { x: 0, z: 44 },
      `queued drop ${i} must keep its authored drift, not just avoid being collected`,
    );
    assert.equal(isCaptureActive(wave, pickups[i].id, state.simTime), false);
  }
});

test('the ripple rolls outward: each drop joins the vacuum on its own 40 ms slot', () => {
  const cloud = [];
  for (let i = 0; i < 6; i++) cloud.push({ x: 200 + i * 30, z: 0 });
  const { state, pickups } = makeState({ cloud });
  const joinedAt = new Array(6).fill(null);

  for (let step = 0; step < 30; step++) {
    mining.update(DT, state);
    for (let i = 0; i < 6; i++) {
      if (joinedAt[i] == null && pickups[i].vel.x !== 0) joinedAt[i] = state.simTime;
    }
    state.simTime += DT;
  }

  for (let i = 0; i < 6; i++) assert.ok(joinedAt[i] != null, `drop ${i} never captured`);
  for (let i = 1; i < 6; i++) {
    assert.ok(joinedAt[i] > joinedAt[i - 1],
      `drop ${i} must capture strictly after drop ${i - 1} (${joinedAt[i]} vs ${joinedAt[i - 1]})`);
  }
  assert.ok(joinedAt[5] - joinedAt[0] >= CAPTURE_WAVE_SPACING_S * 5 - 1e-9,
    'the whole burst must not snap into one frame');
});

test('a 24-drop cloud inhales over about a second instead of one frame', () => {
  const cloud = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const r = 120 + (i % 5) * 12;
    cloud.push({ x: Math.cos(angle) * r, z: Math.sin(angle) * r });
  }
  const { state, collected } = makeState({ cloud });
  let firstAt = null;
  let lastAt = null;
  for (let step = 0; step < 900 && collected.length < 24; step++) {
    const before = collected.length;
    mining.update(DT, state);
    integrate(state);
    if (collected.length > before) {
      if (firstAt == null) firstAt = state.simTime;
      lastAt = state.simTime;
    }
    state.simTime += DT;
  }
  assert.equal(collected.length, 24, 'every drop in the cloud must still arrive');
  const span = lastAt - firstAt;
  assert.ok(span >= 0.9, `the cloud must stream, not snap (span ${span.toFixed(3)}s)`);
  assert.ok(span <= 2.2, `the cloud must not dribble in forever (span ${span.toFixed(3)}s)`);
});

test('the collection payload carries the truthful hull intake point and ripple position', () => {
  const { state, player, collected } = makeState({ cloud: [{ x: 200, z: 0 }] });
  for (let step = 0; step < 400 && collected.length === 0; step++) tick(state);
  assert.equal(collected.length, 1);
  const payload = collected[0];
  assert.ok(payload.intakePoint, 'presentation needs a real intake point');
  const offset = Math.hypot(
    payload.intakePoint.x - player.pos.x,
    payload.intakePoint.z - player.pos.z,
  );
  assert.ok(Math.abs(offset - player.radius) < 1e-9,
    `intake must sit on the hull radius (got ${offset.toFixed(4)} vs ${player.radius})`);
  // Along the incoming vector: the drop came in from +X, so the intake is the +X surface point.
  assert.ok(payload.intakePoint.x > player.pos.x);
  assert.equal(payload.captured, true);
  assert.equal(payload.chainIndex, 0);
  assert.equal(payload.capturePathId, payload.pickupId);
});

test('the capture schedule is transient: collected and departed drops release their slot', () => {
  const { state, pickups, collected } = makeState({
    cloud: [{ x: 60, z: 0 }, { x: 90, z: 0 }, { x: 120, z: 0 }],
  });
  mining.update(DT, state);
  assert.equal(state.miningRuntime.captureWave.entries.size, 3);

  // One drop despawns mid-flight, one is teleported clean out of the band.
  pickups[1].alive = false;
  pickups[2].pos.x = MAGNET_RANGE + 500;
  state.simTime += DT;
  mining.update(DT, state);
  const wave = state.miningRuntime.captureWave;
  assert.equal(wave.entries.has(pickups[1].id), false, 'a dead drop must not hold a slot');
  assert.equal(wave.entries.has(pickups[2].id), false, 'a departed drop must not hold a slot');
  assert.equal(wave.entries.has(pickups[0].id), true);

  // Run the survivor home; its slot must be gone once it lands.
  for (let step = 0; step < 400 && collected.length === 0; step++) tick(state);
  assert.equal(collected.length, 1);
  assert.equal(state.miningRuntime.captureWave.entries.size, 0);
  assert.equal(state.miningRuntime.diagnostics.pickupsCaptureScheduled, 0);
});

test('a crowded field still magnetizes the nearest drop and scoops an overlapping one on tick one', () => {
  // Mirrors the shipped gameplay-core crowded-magnet contract: the ripple must not cost the very
  // first frame of pull, and a drop already inside the scoop is never queued behind a schedule.
  const { state, pickups, collected } = makeState({
    cloud: [{ x: 80, z: 0 }, { x: 2, z: 0 }, { x: 5000, z: 0 }],
  });
  mining.update(DT, state);
  assert.ok(pickups[0].vel.x < 0, 'nearby drop should magnetize on the first tick');
  assert.equal(pickups[1].alive, false, 'overlapping drop should still scoop immediately');
  assert.equal(pickups[2].vel.x, 0, 'a far drop is untouched');
  assert.equal(collected.length, 1, 'exactly one collection event, on the first frame');
  assert.equal(state.miningRuntime.captureWave.entries.has(pickups[1].id), false,
    'a drop already inside the scoop never takes a ripple slot');
});

test('cargo and credit acceptance are unchanged and still idempotent under the ripple', () => {
  const { state, pickups, collected, grants } = makeState({
    cloud: [{
      x: 18,
      z: 0,
      data: {
        kind: CREDIT_CHIP_KIND,
        amount: 75,
        credits: 75,
        grantReason: 'kill:credit_chip:wr:test:0',
      },
    }],
    capVolume: 0,
  });
  mining.update(DT, state);
  assert.equal(pickups[0].alive, false);
  assert.equal(collected.length, 1);
  assert.equal(collected[0].kind, CREDIT_CHIP_KIND);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].amount, 75);
  assert.equal(grants[0].reason, 'kill:credit_chip:wr:test:0');
  assert.equal(state.player.credits, 0, 'mining must not write player credits');
  assert.deepEqual(state.player.cargo.items, {});

  state.simTime += DT;
  mining.update(DT, state);
  assert.equal(grants.length, 1, 'a dead chip cannot grant a second time');
});

test('sim-time rewind restarts the ripple instead of freezing the band on stale slots', () => {
  const { state, pickups } = makeState({ cloud: [{ x: 100, z: 0 }, { x: 140, z: 0 }] });
  state.simTime = 40;
  mining.update(DT, state);
  assert.equal(captureActivatedAt(state.miningRuntime.captureWave, pickups[1].id), 40.04);

  state.simTime = 3; // a restored save / lab rewind
  mining.update(DT, state);
  assert.equal(captureActivatedAt(state.miningRuntime.captureWave, pickups[0].id), 3);
  assert.equal(captureActivatedAt(state.miningRuntime.captureWave, pickups[1].id), 3.04);
});

// ---------------------------------------------------------------------------
// Presentation contract — pooled curved ribbons, no billboards
// ---------------------------------------------------------------------------

function makeStreamHarness(pickupCount) {
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, radius: 8, rot: 0 };
  const wave = createCaptureWave();
  const pickups = [];
  const entities = new Map([[player.id, player]]);
  for (let i = 0; i < pickupCount; i++) {
    const angle = (i / Math.max(1, pickupCount)) * Math.PI * 2;
    const e = {
      id: 100 + i,
      alive: true,
      type: 'pickup',
      pos: { x: Math.cos(angle) * 120, z: Math.sin(angle) * 120 },
      vel: { x: -Math.cos(angle) * 200, z: -Math.sin(angle) * 200 },
      radius: 2.2,
      data: { kind: 'ore', commodityId: 'cmdty_scrap_metal', amount: 1 },
    };
    pickups.push(e);
    entities.set(e.id, e);
    wave.entries.set(e.id, { activateAt: 0, chainId: 1, chainIndex: i });
    wave.chainSizes.set(1, i + 1);
  }
  const state = {
    playerId: player.id,
    entities,
    entityList: [player, ...pickups],
    simTime: 1,
    settings: {},
    miningRuntime: { captureWave: wave },
  };
  const sprites = [];
  const particles = [];
  const harness = Object.create(vfx);
  harness.state = state;
  harness.helpers = { player: () => player };
  harness._scene = new THREE.Scene();
  harness._t = 0.5;
  harness._frameMembrane = null;
  harness._spawnLocalXZ = { x: 0, z: 0 };
  harness._pickupStreams = new Map();
  harness._pickupStreamPool = [];
  harness._pickupStreamFree = [];
  harness._pickupStreamLocal = { x: 0, z: 0 };
  harness._pickupStreamSeen = new Set();
  harness._lootMagnetLive = 0;
  harness._lights = null; // _flashLight is a real point light; without a pool it is a no-op
  harness._spawnSprite = (...args) => { sprites.push(args); };
  harness._spawnParticle = (...args) => { particles.push(args); };
  return { harness, state, player, pickups, wave, sprites, particles };
}

function advanceStreams(harness, pickups, steps, step = 1 / 24) {
  for (let s = 0; s < steps; s++) {
    for (const e of pickups) {
      if (!e.alive) continue;
      e.pos.x += e.vel.x * step;
      e.pos.z += e.vel.z * step;
      // Curve the approach so a straight pickup-to-hull chord could not reproduce the path.
      const vx = e.vel.x;
      e.vel.x = vx * 0.985 - e.vel.z * 0.16;
      e.vel.z = e.vel.z * 0.985 + vx * 0.16;
    }
    harness._updateLootMagnet(step);
    harness.state.simTime += step;
  }
}

test('the pickup route draws pooled ribbons and spawns no sprite or particle stand-ins', () => {
  const { harness, pickups, sprites, particles } = makeStreamHarness(4);
  advanceStreams(harness, pickups, 6);

  assert.equal(harness._pickupStreams.size, 4, 'each captured drop gets its own stream');
  assert.equal(sprites.length, 0, 'no stretched flash comet cards on the pickup route');
  assert.equal(particles.length, 0, 'no billboard grain standing in for the stream');

  // Arrival must not reintroduce a flash card or a sprite ring either.
  const arriving = pickups[0];
  harness._onPickup({
    pickupId: arriving.id,
    capturePathId: arriving.id,
    collectorId: 1,
    kind: 'ore',
    commodityId: 'cmdty_scrap_metal',
    amount: 1,
    acceptedAmount: 1,
    pos: { x: arriving.pos.x, z: arriving.pos.z },
    intakePoint: { x: 8, z: 0 },
  });
  assert.equal(sprites.length, 0, 'no arrival flash cards');
  assert.equal(particles.length, 0, 'no arrival implosion billboards');
});

test('the stream follows the real curved path, not a straight pickup-to-hull chord', () => {
  const { harness, pickups } = makeStreamHarness(1);
  advanceStreams(harness, pickups, 8);
  const slot = harness._pickupStreams.get(pickups[0].id);
  assert.ok(slot, 'a captured drop must own a stream');
  const info = slot.trail.inspect();
  assert.ok(info.visiblePointCount >= 3,
    `the ribbon needs real history to curve (got ${info.visiblePointCount} points)`);
  assert.equal(info.ownerIdentity, pickups[0], 'history is bound to the drop entity itself');

  // Read the committed centreline out of the drawn geometry: a chord would be collinear.
  const positions = slot.trail.getMesh().geometry.getAttribute('position').array;
  const count = info.visiblePointCount;
  let maxDeviation = 0;
  const ax = (positions[0] + positions[3]) / 2;
  const az = (positions[2] + positions[5]) / 2;
  const li = (count - 1) * 6;
  const bx = (positions[li] + positions[li + 3]) / 2;
  const bz = (positions[li + 2] + positions[li + 5]) / 2;
  const chord = Math.hypot(bx - ax, bz - az);
  for (let i = 1; i < count - 1; i++) {
    const px = (positions[i * 6] + positions[i * 6 + 3]) / 2;
    const pz = (positions[i * 6 + 2] + positions[i * 6 + 5]) / 2;
    const cross = Math.abs((bx - ax) * (az - pz) - (ax - px) * (bz - az));
    maxDeviation = Math.max(maxDeviation, chord > 1e-6 ? cross / chord : 0);
  }
  assert.ok(maxDeviation > 1,
    `the ribbon must bow off the straight chord (max deviation ${maxDeviation.toFixed(3)} wu)`);
});

test('simultaneous intake ribbons are hard-capped at 24 and reuse a fixed allocation pool', () => {
  const { harness, pickups } = makeStreamHarness(40);
  advanceStreams(harness, pickups, 3);
  assert.equal(harness._pickupStreams.size, PICKUP_STREAM_CAP);
  assert.equal(harness._pickupStreamPool.length, PICKUP_STREAM_CAP,
    'the pool never grows past the declared cap');
  assert.equal(harness._lootMagnetLive, PICKUP_STREAM_CAP,
    'the declared budget share reports the live ribbon count, not a stale sprite counter');

  // Retire the whole cloud and drive a second one: the pool is reused, never re-allocated.
  for (const e of pickups) e.alive = false;
  harness._updateLootMagnet(1 / 24);
  assert.equal(harness._pickupStreams.size, 0, 'dead drops release their slot');
  for (const e of pickups) { e.alive = true; }
  advanceStreams(harness, pickups, 2);
  assert.equal(harness._pickupStreamPool.length, PICKUP_STREAM_CAP);
});

test('an uncaptured drop draws nothing and the subsystem sleeps when the band is empty', () => {
  const { harness, pickups, wave } = makeStreamHarness(3);
  wave.entries.clear();
  assert.equal(harness._lootMagnetRelevant(), false, 'nothing captured means nothing to draw');
  advanceStreams(harness, pickups, 3);
  assert.equal(harness._pickupStreams.size, 0);

  // A scheduled-but-not-yet-activated drop is still drifting, so it must stay undrawn.
  wave.entries.set(pickups[0].id, { activateAt: harness.state.simTime + 0.5, chainId: 2, chainIndex: 0 });
  advanceStreams(harness, pickups, 1);
  assert.equal(harness._pickupStreams.size, 0, 'pre-activation drift draws no stream');
  assert.equal(harness._lootMagnetLive, 0);
});

test('arrival terminates the stream on the hull intake point and drains it deterministically', () => {
  const { harness, pickups } = makeStreamHarness(1);
  advanceStreams(harness, pickups, 6);
  const drop = pickups[0];
  const slot = harness._pickupStreams.get(drop.id);
  const before = slot.trail.inspect().visiblePointCount;

  harness._onPickup({
    pickupId: drop.id,
    capturePathId: drop.id,
    collectorId: 1,
    kind: 'ore',
    commodityId: 'cmdty_scrap_metal',
    amount: 1,
    acceptedAmount: 1,
    pos: { x: drop.pos.x, z: drop.pos.z },
    intakePoint: { x: 8, z: 0 },
  });
  drop.alive = false;
  assert.equal(slot.arrivalAge, 0, 'the stream enters its hull runout');
  const live = slot.trail.inspect();
  assert.ok(live.visiblePointCount >= before, 'the intake point is appended, not dropped');
  assert.ok(Math.abs(live.liveX - 8) < 1e-9 && Math.abs(live.liveZ) < 1e-9,
    'the path terminates exactly on the reported hull surface point');

  // The runout finishes on its own and hands the pooled slot back.
  for (let i = 0; i < 8 && harness._pickupStreams.size; i++) harness._updateLootMagnet(1 / 24);
  assert.equal(harness._pickupStreams.size, 0, 'the drained stream retires itself');
  assert.equal(harness._pickupStreamFree.length, 1, 'its allocation returns to the pool');
});

test('reduced flash dims the intake stream without touching capture physics or rewards', () => {
  const plain = makeStreamHarness(1);
  advanceStreams(plain.harness, plain.pickups, 5);
  const plainOpacity = plain.harness._pickupStreams
    .get(plain.pickups[0].id).trail.getMaterial().uniforms.uOpacity.value;

  const reduced = makeStreamHarness(1);
  reduced.state.settings = { video: { flashReduce: true } };
  advanceStreams(reduced.harness, reduced.pickups, 5);
  const reducedSlot = reduced.harness._pickupStreams.get(reduced.pickups[0].id);
  assert.ok(reducedSlot, 'reduced flash must not remove the stream');
  assert.ok(reducedSlot.trail.getMaterial().uniforms.uOpacity.value < plainOpacity,
    'reduced flash dims the intake instead of changing what the drop does');
  assert.deepEqual(
    { x: reduced.pickups[0].pos.x, z: reduced.pickups[0].pos.z },
    { x: plain.pickups[0].pos.x, z: plain.pickups[0].pos.z },
    'accessibility settings never move a pickup',
  );
});

// ---------------------------------------------------------------------------
// Collection pitch ladder
// ---------------------------------------------------------------------------

test('the ladder climbs bounded semitones and saturates on the eighth pickup', () => {
  const chain = createPickupChain();
  const rates = [];
  for (let i = 0; i < 12; i++) rates.push(advancePickupChain(chain, i * 0.05, {}).rate);
  for (let i = 1; i <= PICKUP_CHAIN_PITCH_STEPS; i++) {
    assert.ok(rates[i] > rates[i - 1], `rung ${i} must rise above rung ${i - 1}`);
    assert.ok(Math.abs(rates[i] / rates[i - 1] - PICKUP_CHAIN_SEMITONE) < 1e-12,
      'each rung is exactly one semitone');
  }
  for (let i = PICKUP_CHAIN_PITCH_STEPS; i < 12; i++) {
    assert.equal(rates[i], rates[PICKUP_CHAIN_PITCH_STEPS], 'the ladder saturates, it never shrieks');
  }
  assert.ok(rates[PICKUP_CHAIN_PITCH_STEPS] < 1.51, 'seven semitones is the whole climb');
});

test('the ladder resets after a 0.32 s gap and not a hair before', () => {
  const chain = createPickupChain();
  assert.equal(advancePickupChain(chain, 0, {}).index, 0);
  assert.equal(advancePickupChain(chain, 0.3, {}).index, 1);
  assert.equal(advancePickupChain(chain, 0.3 + PICKUP_CHAIN_RESET_S, {}).index, 2,
    'a gap of exactly the reset window still continues the chain');
  const gapped = advancePickupChain(chain, 0.3 + PICKUP_CHAIN_RESET_S * 2 + 0.001, {});
  assert.equal(gapped.index, 0);
  assert.equal(gapped.reset, true);
});

test('a dense cloud shimmers: voices thin and dim past the soft cap while pitch keeps its place', () => {
  const chain = createPickupChain();
  const voices = [];
  for (let i = 0; i < 24; i++) voices.push(advancePickupChain(chain, i * 0.05, {}));

  for (let i = 0; i < PICKUP_CHAIN_SOFT_CAP; i++) {
    assert.equal(voices[i].play, true, `pickup ${i} is under the soft cap and must speak`);
  }
  const played = voices.filter((v) => v.play).length;
  assert.ok(played < 24, 'a 24-drop cloud must not fire 24 identical full-gain voices');
  assert.ok(played >= PICKUP_CHAIN_SOFT_CAP, 'the cap thins the cloud, it does not mute it');
  assert.ok(voices[23].gain < voices[0].gain, 'gain decays into the tail of a dense cloud');
  assert.ok(voices[23].gain > 0, 'a thinned voice is quieter, never silent-by-zero');
  // Pitch state advances even on the skipped voices.
  assert.equal(voices[23].index, 23);
  assert.equal(voices[23].rate, voices[PICKUP_CHAIN_PITCH_STEPS].rate);
});

test('credit chips speak with a rounder, lower voice than materials', () => {
  const material = advancePickupChain(createPickupChain(), 0, {});
  const credit = advancePickupChain(createPickupChain(), 0, { credit: true });
  assert.equal(material.recipeId, 'sfx_loot_collect');
  assert.equal(credit.recipeId, 'sfx_ui_confirm');
  assert.ok(credit.rate < material.rate, 'money lands lower than scrap');
  assert.notEqual(credit.recipeId, material.recipeId, 'you learn to hear money');
});

// ---------------------------------------------------------------------------
// Live audio route
// ---------------------------------------------------------------------------

function makeAudioHarness() {
  const listeners = Object.create(null);
  const bus = {
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return () => {}; },
    emit(type, payload) { for (const fn of listeners[type] || []) fn(payload); },
  };
  const state = {
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { credits: 0 },
    simTime: 0,
    settings: {},
    mode: 'flight',
  };
  audio.init({ state, bus, helpers: {} });
  const played = [];
  audio.play = (recipeId, opts) => { played.push({ recipeId, ...(opts || {}) }); return null; };
  return { audio, bus, state, played };
}

test('a collected credit chip lands as exactly one money voice, not a doubled confirm', () => {
  const { bus, state, played } = makeAudioHarness();
  // The live order is mining → pickup:collected → economy:grantCredits → credits:changed.
  bus.emit('pickup:collected', {
    pickupId: 7,
    collectorId: 1,
    kind: CREDIT_CHIP_KIND,
    amount: 40,
    acceptedAmount: 40,
    credits: 40,
    grantReason: 'kill:credit_chip:wr:9:0',
    pos: { x: 0, z: 0 },
    intakePoint: { x: 8, z: 0 },
  });
  bus.emit('credits:changed', { delta: 40, reason: 'kill:credit_chip:wr:9:0', total: 40 });

  assert.equal(played.length, 1, 'one pickup, one money voice');
  assert.equal(played[0].recipeId, 'sfx_ui_confirm');
  assert.ok(played[0].rate < 1, 'the chip voice is the rounder, lower read');
  assert.deepEqual(played[0].position, { x: 8, z: 0 }, 'the voice pans from the hull intake point');

  // Ordinary credit grants (mission payout, trade) keep their generic confirm.
  played.length = 0;
  state.simTime = 5;
  bus.emit('credits:changed', { delta: 500, reason: 'mission:payout', total: 540 });
  assert.equal(played.length, 1);
  assert.equal(played[0].recipeId, 'sfx_ui_confirm');
  assert.equal(played[0].rate, undefined, 'the generic confirm is untouched');
  assert.equal(isCreditChipGrantReason('kill:credit_chip:wr:9:0'), true);
  assert.equal(isCreditChipGrantReason('mission:payout'), false);
});

test('a material cloud drives one rising, soft-capped ladder off the live event', () => {
  const { bus, state, played } = makeAudioHarness();
  for (let i = 0; i < 12; i++) {
    state.simTime = i * 0.05;
    bus.emit('pickup:collected', {
      pickupId: 200 + i,
      collectorId: 1,
      kind: 'ore',
      commodityId: 'cmdty_scrap_metal',
      amount: 1,
      acceptedAmount: 1,
      pos: { x: 10, z: 0 },
      intakePoint: { x: 8, z: 0 },
      chainIndex: i,
      chainCount: 12,
    });
  }
  assert.ok(played.length > 0);
  assert.ok(played.every((v) => v.recipeId === 'sfx_loot_collect'),
    'materials never borrow the money voice');
  assert.ok(played.length < 12, 'the soft cap thins a dense stream');
  assert.ok(played[1].rate > played[0].rate, 'the ladder rises with the chain');

  // After a gap the next pickup starts at the bottom rung again.
  played.length = 0;
  state.simTime += 1;
  bus.emit('pickup:collected', {
    pickupId: 999,
    collectorId: 1,
    kind: 'ore',
    commodityId: 'cmdty_scrap_metal',
    amount: 1,
    acceptedAmount: 1,
    pos: { x: 10, z: 0 },
    intakePoint: { x: 8, z: 0 },
  });
  assert.equal(played.length, 1);
  assert.equal(played[0].rate, 1, 'a fresh chain restarts at the bottom of the ladder');
});

test('a rejected pickup makes no sound and does not move the ladder', () => {
  const { bus, state, played } = makeAudioHarness();
  state.simTime = 1;
  bus.emit('pickup:collected', {
    pickupId: 1,
    collectorId: 1,
    kind: 'ore',
    commodityId: 'cmdty_scrap_metal',
    amount: 4,
    acceptedAmount: 0,
    rejectedAmount: 4,
    pos: { x: 10, z: 0 },
  });
  assert.equal(played.length, 0, 'a bounced pickup is silent');
  state.simTime = 1.01;
  bus.emit('pickup:collected', {
    pickupId: 2,
    collectorId: 1,
    kind: 'ore',
    commodityId: 'cmdty_scrap_metal',
    amount: 1,
    acceptedAmount: 1,
    pos: { x: 10, z: 0 },
  });
  assert.equal(played.length, 1);
  assert.equal(played[0].rate, 1, 'the ladder still starts at the bottom rung');
});
