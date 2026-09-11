// PQ-159.02 — The beat: rated moments get a 150 ms time dip, a camera hold, and a stinger;
// death gets a cam. Fires on the moment detector only; headless sims unchanged. Seed 15902.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BEAT_DIP_MS,
  BEAT_DIP_S,
  BEAT_HOLD_S,
  BEAT_SEED,
  BEAT_STINGER,
  MOMENT_DETECTOR_EVENT,
  applyMomentBeat,
  feel,
  isMomentDetectorEvent,
  resolveMomentBeat,
} from '../src/render/feel.js';
import { CAMERA_HOLD_S, createChaseCamera } from '../src/render/camera.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';

const SEED = BEAT_SEED;
const DT = 1 / 60;

function makeBody({ id, type = 'ship', x, z, vx = 0, vz = 0, radius = 7, mass = 20 }) {
  return {
    id, type, alive: true, collides: true, collisionMask: 0xffff,
    pos: { x, z }, vel: { x: vx, z: vz }, radius, mass, team: 0, flags: {}, data: {}, hull: 100,
  };
}

function entityHash(state) {
  const parts = [];
  for (const e of state.entities.values()) {
    parts.push([
      e.id,
      e.pos && e.pos.x,
      e.pos && e.pos.z,
      e.vel && e.vel.x,
      e.vel && e.vel.z,
      e.hull,
    ].join(':'));
  }
  return parts.sort().join('|');
}

function feelFixture() {
  const player = makeBody({ id: 1, x: 0, z: 0 });
  player.maxSpeed = 120;
  const state = {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: 1,
    entities: new Map([[1, player]]),
    settings: { video: { fov: 50, motionReduce: false } },
    camera: { zoom: 144, tilt: 60, lookAhead: 18, lerp: 6, trauma: 0 },
    input: { aimWorld: null },
    player: {},
    ui: { screenStack: [], docked: false },
    render: {},
    rng: () => { throw new Error('presentation must not consume sim RNG'); },
  };
  globalThis.window = { innerWidth: 1600, innerHeight: 900 };
  const camera = createChaseCamera(state);
  camera.snapToPlayer();
  state.render.cameraCtrl = camera;
  const bus = createBus();
  const effects = createTimeEffects(state);
  const cues = [];
  bus.on('audio:cue', (c) => cues.push(c));
  const host = Object.create(feel);
  host._injectStyle = () => {};
  host._mountVignette = () => {};
  host._ensureVignette = () => null;
  host._updateSpeedLines = () => {};
  host.init({ state, bus, timeEffects: effects });
  return {
    state, bus, host, camera, player, cues, effects,
    frame: (dt = DT) => host.frame(dt, state),
  };
}

test('the beat is 150 ms and fires only on the moment detector', () => {
  assert.equal(BEAT_DIP_MS, 150);
  assert.equal(BEAT_DIP_S, 0.15);
  assert.equal(BEAT_HOLD_S, 0.15);
  assert.equal(CAMERA_HOLD_S, 0.15);
  assert.equal(isMomentDetectorEvent(MOMENT_DETECTOR_EVENT), true);
  assert.equal(isMomentDetectorEvent('stunt:trickDetected'), false);
  assert.equal(isMomentDetectorEvent('physics:impact'), false);

  const beat = resolveMomentBeat('moment:holyShit', { score: 8 });
  assert.ok(beat);
  assert.equal(beat.dipMs, 150);
  assert.equal(beat.holdS, 0.15);
  assert.equal(beat.stinger, BEAT_STINGER);
  assert.equal(resolveMomentBeat('physics:impact', { dp: 800 }), null);
  assert.equal(resolveMomentBeat('combat:collisionConsequence', { exchangedMomentum: 2000 }), null);
  assert.equal(resolveMomentBeat('stunt:trickDetected', { moment: false }), null);
  console.log(`SEED=${SEED} dipMs=${beat.dipMs} stinger=${beat.stinger} nonMoment=null`);
});

test('live feel+director: a rated moment dips time, holds the camera, and plays the stinger', () => {
  const { state, bus, camera, player, cues, frame } = feelFixture();
  camera.follow(DT);
  const focusBefore = { x: state.camera.focus.x, z: state.camera.focus.z };
  bus.emit('moment:holyShit', { score: 8, trickId: 'wrecking_ball' });
  frame(DT);

  assert.ok(state.timeScale < 1, `timeScale ${state.timeScale} must dip on the beat`);
  assert.ok(camera.holdRemaining() > 0, 'camera hold must arm for 150 ms');
  assert.ok(cues.some((c) => c && c.id === BEAT_STINGER), 'stinger must fire');

  player.pos.x = 40;
  player.pos.z = 12;
  for (let i = 0; i < 6; i++) camera.follow(DT);
  assert.ok(
    Math.hypot(state.camera.focus.x - focusBefore.x, state.camera.focus.z - focusBefore.z) < 1.5,
    'the hold must keep the frame from chasing the hull for the beat',
  );

  for (let i = 0; i < 20; i++) frame(DT);
  assert.equal(state.timeScale, 1, 'the 150 ms dip expires and timeScale returns');
});

test('collisions do not fire the rated-moment beat', () => {
  const { bus, camera, cues, frame } = feelFixture();
  bus.emit('physics:impact', {
    tick: 10, aId: 1, bId: 2, dp: 1200, playerInvolved: true, playerDeltaV: 60,
    pos: { x: 4, z: 0 }, normal: { x: 1, z: 0 },
  });
  frame(DT);
  assert.equal(camera.holdRemaining(), 0, 'a collision must not arm the 150 ms camera hold');
  assert.equal(cues.some((c) => c && c.id === BEAT_STINGER), false, 'collision is not a stinger');
});

test('player death arms the death cam', () => {
  const { bus, camera, frame } = feelFixture();
  bus.emit('player:death', { pos: { x: 0, z: 0 } });
  frame(DT);
  assert.equal(camera.isDeathCam(), true);
  assert.ok(camera.holdRemaining() > 0.5, 'death cam holds longer than the 150 ms beat');
});

test('headless sim hash is unchanged by the presentation beat', () => {
  const a = createGameState(SEED);
  const b = createGameState(SEED);
  assert.equal(entityHash(a), entityHash(b), 'same seed, same entities');

  const { state, bus, host, frame } = feelFixture();
  const before = entityHash(state);
  const timeBefore = state.simTime;
  bus.emit('moment:holyShit', { score: 12 });
  applyMomentBeat(host, resolveMomentBeat('moment:holyShit', { score: 12 }));
  frame(DT);
  assert.equal(entityHash(state), before, 'the beat must not move sim bodies');
  assert.equal(state.simTime, timeBefore, 'the beat must not advance simTime');
  console.log(`SEED=${SEED} headlessHash=${before} unchanged=1 timeScale=${state.timeScale}`);
});
