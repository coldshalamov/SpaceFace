import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { TERRAIN_CRUMPLE_LAW } from '../src/combat/impulseKernel.js';
import {
  AUDIO_RECIPE_BY_ID,
  COLLISION_CUE,
  audio,
  resolveCollisionCue,
} from '../src/audio/audioSystem.js';
import { createChaseCamera } from '../src/render/camera.js';
import {
  BOOST_LAG_FRACTION,
  BELL_COOL_S,
  createLatchSpring,
  integrateBellHeat,
  resolveSlipstreamInto,
  sampleBellThermal,
  stepBoostLag,
  stepLatchSpring,
} from '../src/presentation/flightOverheadMath.js';

const slipOut = () => ({ active: false, intensity: 0, side: 0, yawCouple: 0 });

test('drift ribbons arm only when forward thrust is cut', () => {
  const coast = resolveSlipstreamInto({
    throttle: 0,
    boosting: false,
    lateralSpeed: 22,
    yawRate: 0,
    lateralDemand: -0.6,
    yawDemand: 0,
  }, slipOut());
  assert.equal(coast.active, true);
  assert.equal(coast.side, 1, 'exhaust follows the starboard slide');
  assert.ok(coast.intensity > 0.4);

  const thrusting = resolveSlipstreamInto({
    throttle: 0.8,
    boosting: false,
    lateralSpeed: 22,
    yawRate: 0,
    lateralDemand: 0,
    yawDemand: 0,
  }, slipOut());
  assert.equal(thrusting.active, false);

  const boosting = resolveSlipstreamInto({
    throttle: 0,
    boosting: true,
    lateralSpeed: 22,
    yawRate: 1.2,
    lateralDemand: 0,
    yawDemand: 0.8,
  }, slipOut());
  assert.equal(boosting.active, false);

  const yaw = resolveSlipstreamInto({
    throttle: 0.05,
    boosting: false,
    lateralSpeed: 0,
    yawRate: 1.1,
    lateralDemand: 0,
    yawDemand: 0.7,
  }, slipOut());
  assert.equal(yaw.active, true);
  assert.notEqual(yaw.yawCouple, 0, 'a cut-thrust rotation lights the couple');
});

test('engine bells charge white-hot and cool to gunmetal in 2 seconds', () => {
  let heat = 0;
  for (let i = 0; i < 40; i++) heat = integrateBellHeat(heat, 1, 0.05);
  assert.ok(heat > 0.9, `sustained burn should be white-hot, got ${heat}`);
  const hot = sampleBellThermal(heat);
  assert.ok(hot.g > 0.7 && hot.b > 0.7, 'full heat is white, not a stuck red');
  assert.ok(hot.intensity > 2);

  const cherry = sampleBellThermal(0.5);
  assert.ok(cherry.r > cherry.g * 2 && cherry.b < 0.15, 'mid cooldown is cherry, not white');

  let cooled = 1;
  const steps = Math.round(BELL_COOL_S / 0.05);
  for (let i = 0; i < steps; i++) cooled = integrateBellHeat(cooled, 0, 0.05);
  assert.ok(cooled < 0.06, `two seconds of cooldown should be gunmetal, got ${cooled}`);
  assert.equal(sampleBellThermal(0).intensity, 0);
});

test('boost lag is 2% of camera distance and the latch spring returns to the ship', () => {
  let lag = 0;
  for (let i = 0; i < 30; i++) lag = stepBoostLag(lag, true, 100, 0.05, false);
  assert.ok(Math.abs(lag - BOOST_LAG_FRACTION * 100) < 0.15, `expected ~2 wu, got ${lag}`);
  for (let i = 0; i < 40; i++) lag = stepBoostLag(lag, false, 100, 0.05, false);
  assert.ok(lag < 0.05, 'releasing boost recenters the lag');
  assert.equal(stepBoostLag(0, true, 100, 0.05, true), 0);

  const spring = createLatchSpring();
  stepLatchSpring(spring, {
    latched: true,
    heavy: true,
    anchorX: 80,
    anchorZ: 0,
    playerX: 0,
    playerZ: 0,
    motionReduced: false,
  }, 0.05);
  assert.ok(spring.targetX > 8, 'latch pulls toward the asteroid');
  let pulled = 0;
  for (let i = 0; i < 8; i++) {
    stepLatchSpring(spring, {
      latched: true,
      heavy: true,
      anchorX: 80,
      anchorZ: 0,
      playerX: 0,
      playerZ: 0,
      motionReduced: false,
    }, 0.05);
    pulled = Math.max(pulled, spring.x);
  }
  assert.ok(pulled > 4, 'the spring actually moves before it returns');
  for (let i = 0; i < 40; i++) {
    stepLatchSpring(spring, {
      latched: true,
      heavy: true,
      anchorX: 80,
      anchorZ: 0,
      playerX: 0,
      playerZ: 0,
      motionReduced: false,
    }, 0.05);
  }
  assert.ok(Math.abs(spring.x) < 1.5, `still latched, the frame should have recentered, got ${spring.x}`);

  const light = createLatchSpring();
  stepLatchSpring(light, {
    latched: true,
    heavy: false,
    anchorX: 80,
    anchorZ: 0,
    playerX: 0,
    playerZ: 0,
    motionReduced: false,
  }, 0.2);
  assert.equal(light.x, 0, 'a light latch does not pull the camera');
});

test('a low-speed rock or station bump is a scrape, and a real hit is not', () => {
  assert.equal(COLLISION_CUE.SCRAPE_SPEED, TERRAIN_CRUMPLE_LAW.threshold);
  assert.ok(AUDIO_RECIPE_BY_ID.sfx_hull_scrape);
  assert.ok(AUDIO_RECIPE_BY_ID.sfx_rcs_hiss);
  assert.equal(AUDIO_RECIPE_BY_ID.sfx_rcs_hiss.type, 'continuous_noise');

  const loveTap = resolveCollisionCue({
    massA: 80, typeA: 'ship', massB: null, typeB: 'asteroid',
    dp: 9000, closingSpeed: 12, hullDamage: 0,
  });
  assert.equal(loveTap.tier, 'scrape');
  assert.equal(loveTap.recipeId, 'sfx_hull_scrape');
  assert.equal(loveTap.ladderId, null);

  const stationTap = resolveCollisionCue({
    massA: 40, typeA: 'ship', massB: null, typeB: 'station',
    dp: 2000, closingSpeed: 18,
  });
  assert.equal(stationTap.recipeId, 'sfx_hull_scrape');

  const damaging = resolveCollisionCue({
    massA: 80, typeA: 'ship', massB: null, typeB: 'asteroid',
    dp: 9000, closingSpeed: 12, hullDamage: 6,
  });
  assert.notEqual(damaging.recipeId, 'sfx_hull_scrape');

  const fast = resolveCollisionCue({
    massA: 24, typeA: 'ship', massB: null, typeB: 'asteroid',
    dp: 9000, closingSpeed: 80,
  });
  assert.notEqual(fast.recipeId, 'sfx_hull_scrape');

  const hulls = resolveCollisionCue({
    massA: 24, typeA: 'ship', massB: 24, typeB: 'ship',
    dp: 960, closingSpeed: 8,
  });
  assert.notEqual(hulls.recipeId, 'sfx_hull_scrape');

  const legacyKiss = resolveCollisionCue({
    massA: 16, typeA: 'ship', massB: null, typeB: 'station', dp: 40,
  });
  assert.equal(legacyKiss.tier, 'kiss');
  assert.equal(legacyKiss.recipeId, 'sfx_dock_clunk');
});

test('the live collision receipt uses the scrape for a slow asteroid bump', () => {
  const played = [];
  const state = {
    tick: 40,
    mode: 'flight',
    playerId: 1,
    settings: { audio: { muted: false }, video: {} },
    entities: new Map([
      [1, { id: 1, type: 'ship', mass: 40, pos: { x: 0, z: 0 } }],
      [2, { id: 2, type: 'asteroid', mass: 800, pos: { x: 8, z: 0 } }],
    ]),
  };
  const bus = createBus();
  const host = Object.create(audio);
  audio.init.call(host, { state, bus, helpers: {} });
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return { id: 1 }; };
  host._applyWeightDuck = () => {};
  bus.emit('physics:impact', {
    tick: 40,
    aId: 1,
    bId: 2,
    dp: 8000,
    impulse: 8000,
    preSolveClosingSpeed: 14,
    hullDamage: 0,
    pos: { x: 8, z: 0 },
  });
  assert.equal(played.length, 1);
  assert.equal(played[0].recipeId, 'sfx_hull_scrape');
  assert.equal(played[0].opts.ladderId, undefined);
});

function chaseHarness(overrides = {}) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    prevPos: { x: 0, z: 0 },
    vel: { x: 90, z: 0 },
    rot: 0,
    bank: 0,
    radius: 6,
    mass: 24,
    flags: { boosting: false },
    maxSpeed: 120,
    ...overrides.player,
  };
  const state = {
    settings: { video: { fov: 50, motionReduce: false } },
    camera: { zoom: 140, tilt: 60, lerp: 18, lookAhead: 0 },
    input: { actions: {} },
    entities: new Map([[1, player]]),
    playerId: 1,
    player: { tether: overrides.tether || null },
    render: { interpolationAlpha: 1 },
    combat: {},
  };
  const cam = createChaseCamera(state, { innerWidth: 1280, innerHeight: 720 });
  return { state, player, cam };
}

test('the chase camera lags on boost and springs toward a heavy asteroid latch', () => {
  const coast = chaseHarness();
  const boost = chaseHarness({ player: { flags: { boosting: true } } });
  for (let i = 0; i < 24; i++) {
    coast.cam.follow(0.05, 1);
    boost.cam.follow(0.05, 1);
  }
  assert.ok(
    boost.state.camera.focus.x < coast.state.camera.focus.x - 1,
    `boost should sit behind the coast frame (${boost.state.camera.focus.x} vs ${coast.state.camera.focus.x})`,
  );

  const latched = chaseHarness({
    tether: { active: true, targetId: 9, load: 0.8, phase: 'loaded' },
  });
  latched.state.entities.set(9, {
    id: 9,
    type: 'asteroid',
    alive: true,
    mass: 400,
    pos: { x: 70, z: 0 },
    vel: { x: 0, z: 0 },
  });
  let peak = 0;
  for (let i = 0; i < 10; i++) {
    latched.cam.follow(0.05, 1);
    peak = Math.max(peak, latched.state.camera.focus.x);
  }
  assert.ok(peak > 2, `latch should pull focus toward the rock, peak ${peak}`);
  for (let i = 0; i < 30; i++) latched.cam.follow(0.05, 1);
  assert.ok(
    latched.state.camera.focus.x < peak - 1.2,
    `the latch spring should release (${latched.state.camera.focus.x} from peak ${peak})`,
  );
});
