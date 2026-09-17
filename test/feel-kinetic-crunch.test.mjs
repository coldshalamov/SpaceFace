import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import {
  COLLISION_DELTA_V_FLOOR,
  CRUNCH_HOLD_MAX_S,
  CRUNCH_HOLD_MIN_S,
  HS_IMPACT_MAX,
  feel,
  kineticCrunchPresentationHold,
  resolveCollisionFeel,
  resolveKineticCrunch,
  resolveKineticRecoil,
} from '../src/render/feel.js';

const VISION = 'heavy combat should bite';

function crunchCtx(extra = {}) {
  return {
    motionReduce: false,
    mode: 'flight',
    playerId: 1,
    ...extra,
  };
}

function damage(weaponId, extra = {}) {
  return {
    attackerId: 1,
    targetId: 2,
    weaponId,
    amount: 60,
    armorHit: true,
    type: extra.type,
    ...extra,
  };
}

function collisionCtx(deltaV, extra = {}) {
  return {
    deltaV,
    playerDistance: 0,
    motionReduce: false,
    mode: 'flight',
    ...extra,
  };
}

function feelHost() {
  const traumas = [];
  const state = {
    tick: 40,
    simTime: 1,
    mode: 'flight',
    playerId: 1,
    timeScale: 1,
    settings: { video: { motionReduce: false } },
    ui: { screenStack: [], docked: false },
    entities: new Map([
      [1, { id: 1, type: 'ship', mass: 16, pos: { x: 0, z: 0 } }],
      [2, { id: 2, type: 'ship', mass: 20, pos: { x: 80, z: 0 } }],
    ]),
    render: { cameraCtrl: { addTrauma: (value) => traumas.push(value) } },
  };
  const bus = createBus();
  const effects = createTimeEffects(state);
  const host = Object.create(feel);
  host._injectStyle = () => {};
  host._mountVignette = () => {};
  host._ensureVignette = () => null;
  host._updateSpeedLines = () => {};
  host.init({ state, bus, timeEffects: effects });
  return {
    state,
    bus,
    host,
    traumas,
    frame: (dt = 0) => host.frame(dt, state),
  };
}

test('kinetic crunch is a 1–2 frame presentation hold, never a sim stall', () => {
  const pulse = resolveKineticCrunch(damage('wpn_pulse_laser_s', { type: 'energy', amount: 8 }), crunchCtx());
  assert.equal(pulse, null, `${VISION}: energy repeaters do not crunch`);

  const flak = resolveKineticCrunch(damage('wpn_flak_turret_s', { type: 'kinetic', amount: 4 }), crunchCtx());
  assert.ok(flak && flak.id === 'crunch.tick' && flak.holdS === 0 && flak.stallsSim === false,
    `${VISION}: flak stays a rhythmic tick, not a freeze`);

  const rail = resolveKineticCrunch(damage('wpn_railgun_m', { type: 'kinetic' }), crunchCtx());
  assert.ok(rail, `${VISION}: a railgun penetrator must crunch`);
  assert.equal(rail.id, 'crunch.rail');
  assert.equal(rail.stallsSim, false, `${VISION}: crunch must not claim a sim stall`);
  assert.ok(rail.holdS >= CRUNCH_HOLD_MIN_S && rail.holdS <= CRUNCH_HOLD_MAX_S,
    `${VISION}: rail hold is 1–2 frames (got ${rail.holdS})`);

  const torpedo = resolveKineticCrunch(damage('wpn_torpedo_l', { type: 'explosive', amount: 320, hullHit: true }), crunchCtx());
  assert.ok(torpedo && torpedo.id === 'crunch.warhead');
  assert.ok(torpedo.holdS >= rail.holdS, `${VISION}: a torpedo holds at least as long as a railgun`);
  assert.ok(torpedo.holdS <= CRUNCH_HOLD_MAX_S);
  assert.ok(torpedo.fov > rail.fov && rail.fov > flak.fov,
    `${VISION}: FOV punch scales with weapon mass (flak ${flak.fov} < rail ${rail.fov} < torpedo ${torpedo.fov})`);
  assert.ok(torpedo.trauma > rail.trauma && rail.trauma > flak.trauma,
    `${VISION}: trauma scales with weapon mass`);
});

test('crunch queues gate motionReduce, photo mode, non-flight, and uninvolved contacts', () => {
  const hit = damage('wpn_railgun_m', { type: 'kinetic', brokeShield: true, armorHit: false });
  assert.equal(resolveKineticCrunch(hit, crunchCtx({ motionReduce: true })), null);
  assert.equal(resolveKineticCrunch(hit, crunchCtx({ mode: 'menu' })), null);
  assert.equal(resolveKineticCrunch(hit, crunchCtx({ photoMode: true })), null);
  assert.equal(
    resolveKineticCrunch(hit, crunchCtx({
      state: { render: { photoMode: { active: true } } },
    })),
    null,
    `${VISION}: photo mode silences crunch via the shared feel presentation gate`,
  );
  assert.equal(
    resolveKineticCrunch({ ...hit, attackerId: 9, targetId: 8, isPlayer: false }, crunchCtx()),
    null,
    `${VISION}: a distant NPC furball does not punch the player camera`,
  );
  assert.equal(resolveKineticCrunch(null, crunchCtx()), null);
  assert.equal(resolveKineticCrunch({ attackerId: 1, targetId: 2, weaponId: 'wpn_railgun_m' }, crunchCtx()), null,
    `${VISION}: a receipt with no contact/amount is not a crunch`);
});

test('recoil FOV and trauma are mass-proportional; motionReduce suppresses them', () => {
  const pulse = resolveKineticRecoil('wpn_pulse_laser_s', { mode: 'flight' });
  const rail = resolveKineticRecoil('wpn_railgun_m', { mode: 'flight' });
  const torpedo = resolveKineticRecoil('wpn_torpedo_l', { mode: 'flight' });
  assert.ok(pulse && rail && torpedo);
  assert.ok(pulse.fov < rail.fov && rail.fov < torpedo.fov,
    `${VISION}: muzzle kick scales pulse < rail < torpedo (got ${pulse.fov}, ${rail.fov}, ${torpedo.fov})`);
  assert.ok(pulse.trauma < rail.trauma && rail.trauma < torpedo.trauma);
  assert.equal(pulse.stallsSim, false);
  assert.equal(resolveKineticRecoil('wpn_railgun_m', { motionReduce: true }), null);
  assert.equal(resolveKineticRecoil('wpn_railgun_m', { mode: 'loading' }), null);
});

test('collision ramp: scrape is a tick, slam is an authoritative shock with a pose hold', () => {
  const scrape = resolveCollisionFeel({ dp: 8 * 20 }, collisionCtx(8));
  const knock = resolveCollisionFeel({ dp: 60 * 20 }, collisionCtx(60));
  const slam = resolveCollisionFeel({ dp: 150 * 20 }, collisionCtx(150));
  assert.equal(scrape.id, 'impact.scrape');
  assert.equal(knock.id, 'impact.knock');
  assert.equal(slam.id, 'impact.slam');
  assert.equal(scrape.holdS, 0, `${VISION}: a light scrape is a textured tick, not a freeze`);
  assert.ok(slam.holdS >= CRUNCH_HOLD_MIN_S && slam.holdS <= CRUNCH_HOLD_MAX_S,
    `${VISION}: a high-speed slam arms a 1–2 frame presentation hold`);
  assert.ok(slam.hsDur > knock.hsDur && knock.hsDur > scrape.hsDur);
  assert.ok(slam.trauma > knock.trauma && knock.trauma > scrape.trauma);
  assert.ok(slam.hsDur <= HS_IMPACT_MAX);
  assert.equal(resolveCollisionFeel({ dp: 7.9 * 20 }, collisionCtx(7.9)), null);
  assert.ok(COLLISION_DELTA_V_FLOOR > 0);
  assert.equal(resolveCollisionFeel({ dp: 150 * 20 }, collisionCtx(150, { motionReduce: true })), null);
});

test('live combat queue: railgun crunch holds interpolation without touching timeScale', () => {
  const { state, bus, host, traumas, frame } = feelHost();
  const beforeScale = state.timeScale;
  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 2,
    weaponId: 'wpn_railgun_m',
    amount: 60,
    armorHit: true,
    type: 'kinetic',
  });
  assert.equal(state.timeScale, beforeScale, `${VISION}: crunch must not stall the 60 Hz sim clock`);
  assert.equal(host._hsTimer, 0, `${VISION}: crunch must not arm the time-effects hit-stop timer`);
  assert.ok(host._crunchHold >= CRUNCH_HOLD_MIN_S, `${VISION}: railgun armor hit arms a presentation hold`);
  assert.equal(kineticCrunchPresentationHold(state), true);
  assert.equal(state.render.holdInterpolation, true);
  assert.ok(traumas.length >= 1, `${VISION}: railgun crunch adds camera trauma`);
  assert.ok(host._fovPunch > 0, `${VISION}: railgun crunch punches FOV`);

  frame(CRUNCH_HOLD_MAX_S + 0.001);
  assert.equal(host._crunchHold, 0);
  assert.equal(kineticCrunchPresentationHold(state), false);
  assert.equal(state.timeScale, 1);
});

test('torpedo and pulse fire/hit queues stay distinct on the live host', () => {
  const { state, bus, host, traumas, frame } = feelHost();
  bus.emit('combat:fire', { ownerId: 1, weaponId: 'wpn_pulse_laser_s' });
  const pulseFov = host._fovPunch;
  const pulseTrauma = traumas.length;
  bus.emit('combat:fire', { ownerId: 1, weaponId: 'wpn_torpedo_l' });
  assert.ok(host._fovPunch > pulseFov, `${VISION}: torpedo muzzle kick exceeds a pulse repeater`);
  assert.ok(traumas.length > pulseTrauma);

  host._fovPunch = 0;
  traumas.length = 0;
  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 2,
    weaponId: 'wpn_pulse_laser_s',
    amount: 8,
    armorHit: true,
    type: 'energy',
  });
  assert.equal(host._crunchHold, 0, `${VISION}: pulse armor hits stay rhythmic (no hold)`);
  assert.equal(state.timeScale, 1);

  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 2,
    weaponId: 'wpn_torpedo_l',
    amount: 320,
    hullHit: true,
    type: 'explosive',
  });
  assert.ok(host._crunchHold > 0);
  assert.equal(state.timeScale, 1);
  assert.ok(traumas.length >= 1);
  frame(1 / 60);
  assert.ok(host._crunchHold < CRUNCH_HOLD_MAX_S);
});

test('motionReduce and modal gates suppress crunch on the live queue', () => {
  for (const gate of ['motionReduce', 'modal', 'docked', 'mode']) {
    const { state, bus, host, traumas, frame } = feelHost();
    if (gate === 'motionReduce') state.settings.video.motionReduce = true;
    if (gate === 'modal') state.ui.screenStack.push('pause');
    if (gate === 'docked') state.ui.docked = true;
    if (gate === 'mode') state.mode = 'menu';
    bus.emit('combat:damage', {
      attackerId: 1,
      targetId: 2,
      weaponId: 'wpn_railgun_m',
      amount: 60,
      armorHit: true,
      type: 'kinetic',
      isPlayer: true,
    });
    frame();
    assert.equal(state.timeScale, 1, `${gate} must not stall sim`);
    assert.equal(host._crunchHold, 0, `${gate} must suppress the presentation hold`);
    assert.equal(kineticCrunchPresentationHold(state), false);
    assert.equal(host._hsTimer, 0);
    if (gate === 'motionReduce') {
      assert.deepEqual(traumas, [], 'motionReduce keeps vestibular punch off');
      assert.equal(host._fovPunch, 0);
    }
  }
});

test('turning motionReduce on mid-hold releases the interpolation pause immediately', () => {
  const { state, host, bus, frame } = feelHost();
  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 1,
    weaponId: 'wpn_siege_lance_l',
    amount: 420,
    hullHit: true,
    type: 'kinetic',
    isPlayer: true,
  });
  assert.ok(host._crunchHold > 0);
  state.settings.video.motionReduce = true;
  frame(0);
  assert.equal(host._crunchHold, 0);
  assert.equal(kineticCrunchPresentationHold(state), false);
});
