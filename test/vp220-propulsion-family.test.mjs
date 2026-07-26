/**
 * VP-220 adversarial behavioral tests — propulsion family contracts.
 * Proves structure/timing/identity, not string aesthetics or recipe prose.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { validateRecipe } from '../src/render/thruster/recipes/validate.js';
import {
  LIVE_ENGINE_PROFILE_IDS,
  resolveThrusterRecipes,
  listThrusterRecipePacks,
  assertAllLiveFamiliesDistinct,
  assertFamiliesStructurallyDistinct,
  familyStructuralSignature,
  collectThrusterTextureIds,
} from '../src/render/thruster/recipes/registry.js';
import {
  KESTREL_MAIN_PLUME_RECIPE,
  KESTREL_RCS_RECIPE,
} from '../src/render/thruster/recipes/kestrelRecipes.js';
import {
  ContinuousPlumeSystem,
  PlumeSlotPool,
} from '../src/render/thruster/systems/continuousPlume.js';
import {
  RcsImpulseSystem,
  assertRcsStructurallyDistinct,
} from '../src/render/thruster/systems/rcsImpulse.js';
import {
  assertContinuousThrottleResponse,
  resolveDriveMode,
  sampleThrottle,
  sampleThrottleInto,
  integrateDriveState,
  compileDriveRates,
} from '../src/render/thruster/systems/throttleResponse.js';
import { assertAccessibilityInvariants } from '../src/render/thruster/systems/accessibility.js';
import { ENGINE_PROFILES } from '../src/render/vfxProfiles.js';

const SOCKETS = [{ x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 }];
const A11Y_OFF = { reducedMotion: false, reducedFlash: false, lowQuality: false, qualityTier: 'high' };

test('live ENGINE_PROFILES ids each resolve to a validated main+RCS pack', () => {
  const profileIds = Object.keys(ENGINE_PROFILES);
  for (const id of profileIds) {
    assert.ok(LIVE_ENGINE_PROFILE_IDS.includes(id), `${id} must be in thruster registry`);
    const pack = resolveThrusterRecipes(id);
    assert.equal(pack.profileId, id);
    assert.equal(validateRecipe(pack.main).ok, true, `${id} main invalid`);
    assert.equal(validateRecipe(pack.rcs).ok, true, `${id} rcs invalid`);
    assert.equal(assertRcsStructurallyDistinct(pack.main, pack.rcs).ok, true, `${id} rcs not distinct`);
    assert.equal(assertContinuousThrottleResponse(pack.main).ok, true, `${id} throttle not continuous`);
    assert.equal(assertAccessibilityInvariants(pack.main).ok, true, `${id} main a11y`);
    assert.equal(assertAccessibilityInvariants(pack.rcs).ok, true, `${id} rcs a11y`);
  }
  assert.equal(listThrusterRecipePacks().length, profileIds.length);
});

test('accepted Kestrel substrate remains the ion_small family identity', () => {
  const pack = resolveThrusterRecipes('engine_ion_small');
  assert.equal(pack.main, KESTREL_MAIN_PLUME_RECIPE);
  assert.equal(pack.rcs, KESTREL_RCS_RECIPE);
  assert.equal(pack.main.id, 'hitch_kestrel_main_plume');
  assert.equal(pack.main.engineFamily, 'hitch_ion_kestrel');
});

test('live families differ by structure and timing, not tint alone', () => {
  const all = assertAllLiveFamiliesDistinct();
  assert.equal(all.ok, true, all.failures.join('; '));
  // Spot-check vector vs industrial (needle vs torch) on aspect ratio + flow.
  const vector = familyStructuralSignature(resolveThrusterRecipes('engine_vector').main);
  const industrial = familyStructuralSignature(resolveThrusterRecipes('engine_industrial').main);
  assert.ok(vector.aspectRatio > industrial.aspectRatio * 1.15,
    'vector must be a longer/narrower stream than industrial torch');
  assert.ok(industrial.fork > vector.fork + 0.2,
    'industrial turbulence/fork exceeds vector needle');
  assert.ok(industrial.baseFlow < vector.baseFlow,
    'industrial is slower flow than vector');
  assert.ok(vector.driveRise > industrial.driveRise,
    'vector snaps on faster than industrial torch');
});

test('throttle continuum responds continuously for every family (length/width/flow)', () => {
  for (const pack of listThrusterRecipePacks()) {
    const r = assertContinuousThrottleResponse(pack.main, 11);
    assert.equal(r.ok, true, `${pack.profileId}: ${r.failures.join('; ')}`);
    const idle = sampleThrottle(pack.main, 0, { mode: 'idle' });
    const full = sampleThrottle(pack.main, 1, { mode: 'accel' });
    assert.ok(full.length > idle.length, `${pack.profileId} length continuum`);
    assert.ok(full.flowSpeed > idle.flowSpeed * 0.9, `${pack.profileId} flow continuum`);
  }
});

test('drive modes communicate idle/accel/cruise/boost/brake/reverse through structure', () => {
  const recipe = resolveThrusterRecipes('engine_ion_small').main;
  const modes = {
    idle: resolveDriveMode({ drive: 0.06, throttle: 0.06, boost: 0 }, recipe),
    accel: resolveDriveMode({ drive: 0.8, throttle: 0.8, boost: 0 }, recipe),
    cruise: resolveDriveMode({ drive: 0.9, throttle: 0.9, boost: 0, cruise: 1 }, recipe),
    boost: resolveDriveMode({ drive: 1.0, throttle: 1.0, boost: 1 }, recipe),
    reverse: resolveDriveMode({ drive: 0.2, throttle: 0, reverse: 0.5, retroOnly: true }, recipe),
    brake: resolveDriveMode({ drive: 0.4, throttle: 0.05, speedDrive: 0.6, brake: 0.5 }, recipe),
  };
  assert.equal(modes.idle, 'idle');
  assert.equal(modes.accel, 'accel');
  assert.equal(modes.cruise, 'cruise');
  assert.equal(modes.boost, 'boost');
  assert.equal(modes.reverse, 'reverse');
  assert.equal(modes.brake, 'brake');

  const sample = (mode, throttle = 1) => sampleThrottle(recipe, throttle, { mode });
  const idle = sample('idle', 0.06);
  const accel = sample('accel', 1);
  const cruise = sample('cruise', 1);
  const boost = sample('boost', 1);
  const brake = sample('brake', 0.2);
  const reverse = sample('reverse', 0.2);

  assert.ok(accel.length > idle.length * 1.2, 'accel longer than idle');
  assert.ok(cruise.length > accel.length * 0.95, 'cruise extends stream');
  assert.ok(cruise.width < accel.width * 1.01, 'cruise tightens width relative to open accel');
  assert.ok(boost.length > cruise.length, 'boost is the longest structural state');
  assert.ok(boost.flowSpeed > accel.flowSpeed, 'boost accelerates flow');
  assert.ok(brake.length < accel.length * 0.7, 'brake shortens residual glow');
  assert.ok(reverse.length < idle.length * 1.1, 'reverse suppresses main nozzle stream');
  assert.ok(reverse.effectiveDrive < accel.effectiveDrive * 0.25, 'reverse effective drive collapses');
});

test('pool samples carry continuum mode without per-frame allocation', () => {
  const pack = resolveThrusterRecipes('engine_vector').main;
  const pool = new PlumeSlotPool(pack, { maxSockets: 2, maxLayers: 5 });
  const before = pool.allocationCount;
  // Warm boost blend so continuum mode can leave the rise transient.
  for (let i = 0; i < 24; i++) {
    pool.update(1, SOCKETS, A11Y_OFF, 1 / 60, 1, { cruise: 0, reverse: 0 });
  }
  // Result object is reused — capture scalars immediately.
  const boostResult = pool.update(1, SOCKETS, A11Y_OFF, 1 / 60, 1, { cruise: 0, reverse: 0 });
  const boostMode = boostResult.mode;
  const boostLength = boostResult.sample.length;
  const boostAlloc = boostResult.frameAllocations;
  const reverseResult = pool.update(0.05, SOCKETS, A11Y_OFF, 1 / 60, 0, {
    reverse: 0.8, retroOnly: true, speedDrive: 0.5,
  });
  const reverseMode = reverseResult.mode;
  const reverseLength = reverseResult.sample.length;
  assert.equal(pool.allocationCount, before, 'no allocations after construction');
  assert.equal(boostAlloc, 0);
  assert.equal(reverseResult.frameAllocations, 0);
  assert.equal(boostMode, 'boost');
  assert.equal(reverseMode, 'reverse');
  assert.ok(boostLength > reverseLength * 2, 'boost structure exceeds reverse residual');
});

test('family pools produce distinct layer geometry at equal throttle', () => {
  const vector = new PlumeSlotPool(resolveThrusterRecipes('engine_vector').main);
  const industrial = new PlumeSlotPool(resolveThrusterRecipes('engine_industrial').main);
  const plasma = new PlumeSlotPool(resolveThrusterRecipes('engine_plasma_ring').main);
  // Warm drive state so samples stabilize.
  for (let i = 0; i < 30; i++) {
    vector.update(1, SOCKETS, A11Y_OFF, 1 / 30, 0);
    industrial.update(1, SOCKETS, A11Y_OFF, 1 / 30, 0);
    plasma.update(1, SOCKETS, A11Y_OFF, 1 / 30, 0);
  }
  const slot = (pool, role) => pool.slots.slice(0, pool.activeCount).find((s) => s.layerRole === role);
  const vCore = slot(vector, 'core');
  const iCore = slot(industrial, 'core');
  const pSheath = slot(plasma, 'sheath');
  const vSheath = slot(vector, 'sheath');
  assert.ok(vCore.length > iCore.length * 1.05, 'vector core stream longer than industrial');
  assert.ok(iCore.width > vCore.width * 1.15, 'industrial core wider than vector needle');
  assert.ok(pSheath.width > vSheath.width * 1.2, 'plasma sheath is the broad capital read');
});

test('RCS impulse direction and lifecycle are truthful and bounded', () => {
  for (const pack of listThrusterRecipePacks()) {
    const rcs = new RcsImpulseSystem(THREE, pack.rcs);
    const axis = [0.6, 0, -0.8];
    const idx = rcs.fire([1, 2, 3], axis, 0.85);
    assert.ok(idx >= 0);
    const imp = rcs.pool.impulses[idx];
    const len = Math.hypot(imp.axis[0], imp.axis[1], imp.axis[2]);
    assert.ok(Math.abs(len - 1) < 1e-5, 'axis normalized');
    // Exhaust axis must match fire direction (truthful actuator direction).
    assert.ok(imp.axis[0] * axis[0] + imp.axis[2] * axis[2] > 0.99);
    assert.equal(imp.origin[0], 1);
    assert.equal(imp.origin[2], 3);

    let aliveFrames = 0;
    for (let f = 0; f < 90; f++) {
      const result = rcs.update(1 / 60, A11Y_OFF);
      assert.equal(result.frameAllocations, 0);
      if (result.activeImpulseCount > 0) aliveFrames += 1;
    }
    assert.ok(aliveFrames > 2 && aliveFrames < 40,
      `${pack.profileId} RCS must be short-lived (frames=${aliveFrames})`);
    assert.equal(rcs.pool.activeImpulseCount, 0, `${pack.profileId} no lingering RCS`);
    // Overflow reuses oldest slot — bounded pool.
    for (let i = 0; i < rcs.pool.maxImpulses + 4; i++) {
      rcs.fire([i, 0, 0], [1, 0, 0], 1);
    }
    assert.ok(rcs.pool.activeImpulseCount <= rcs.pool.maxImpulses);
    rcs.dispose();
  }
});

test('accessibility preserves family feedback for every pack', () => {
  for (const pack of listThrusterRecipePacks()) {
    const normal = new ContinuousPlumeSystem(THREE, pack.main, { distortionEnabled: false });
    const reduced = new ContinuousPlumeSystem(THREE, pack.main, { distortionEnabled: false });
    normal.update(1, 1, SOCKETS, { a11y: A11Y_OFF });
    reduced.update(1, 1, SOCKETS, {
      a11y: { reducedMotion: true, reducedFlash: true, lowQuality: true, qualityTier: 'low' },
    });
    assert.ok(reduced.pool.activeCount >= 2, `${pack.profileId} keeps ≥2 layers under a11y`);
    const nCore = normal.pool.slots.slice(0, normal.pool.activeCount).find((s) => s.layerRole === 'core');
    const rCore = reduced.pool.slots.slice(0, reduced.pool.activeCount).find((s) => s.layerRole === 'core');
    assert.ok(nCore && rCore, `${pack.profileId} core present`);
    assert.ok(rCore.width >= nCore.width * 0.9,
      `${pack.profileId} reduced motion must not erase minification-safe core width`);
    const nInner = normal.layerBatches.find((b) => b.role === 'inner' || b.role === 'sheath');
    const rInner = reduced.layerBatches.find((b) => b.role === 'inner' || b.role === 'sheath');
    if (nInner && rInner) {
      assert.ok(rInner.material.uniforms.uIntensity.value > 0,
        `${pack.profileId} secondary layer intensity preserved`);
    }
    // low quality tier still draws
    assert.ok(reduced.pool.activeCount > 0);
    normal.dispose();
    reduced.dispose();
  }
});

test('socket axis truth: exhaust follows socket forward (negated for shader convention)', () => {
  const pack = resolveThrusterRecipes('engine_plasma_ring').main;
  const pool = new PlumeSlotPool(pack);
  const sockets = [
    { x: 1, y: 0, z: 2, ax: 0.0, ay: 0, az: 1.0 },
    { x: -1, y: 0, z: 2, ax: 0.7071, ay: 0, az: 0.7071 },
  ];
  pool.update(1, sockets, A11Y_OFF, 1 / 60, 0);
  const bySocket = [[], []];
  for (let i = 0; i < pool.activeCount; i++) {
    bySocket[pool.slots[i].socketIndex].push(pool.slots[i]);
  }
  assert.ok(bySocket[0].length >= 2 && bySocket[1].length >= 2);
  for (const s of bySocket[0]) {
    assert.equal(s.axis[0], 0);
    assert.equal(s.axis[2], 1);
    assert.equal(s.offset[0], 1);
  }
  for (const s of bySocket[1]) {
    assert.ok(Math.abs(s.axis[0] - 0.7071) < 1e-4);
    assert.ok(Math.abs(s.axis[2] - 0.7071) < 1e-4);
  }
});

test('family GPU batches bind textures and dispose cleanly', () => {
  const textures = Object.create(null);
  for (const id of collectThrusterTextureIds()) {
    textures[id] = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    textures[id].needsUpdate = true;
  }
  for (const pack of listThrusterRecipePacks()) {
    const plume = new ContinuousPlumeSystem(THREE, pack.main, {
      textures,
      distortionEnabled: false,
    });
    const rcs = new RcsImpulseSystem(THREE, pack.rcs, { textures });
    assert.equal(plume.assertLayerBindings().ok, true, `${pack.profileId} plume bind`);
    assert.equal(rcs.assertLayerBindings().ok, true, `${pack.profileId} rcs bind`);
    plume.update(1 / 60, 1, SOCKETS, { boost: 0.5, a11y: A11Y_OFF });
    rcs.fire([0, 0, 0], [1, 0, 0], 1);
    rcs.update(1 / 60, A11Y_OFF);
    plume.dispose();
    rcs.dispose();
    assert.equal(plume._disposed, true);
    assert.equal(rcs._disposed, true);
  }
});

test('drive integration is continuous (no binary boost snap)', () => {
  const recipe = resolveThrusterRecipes('engine_resonator').main;
  const rates = { driveRise: 9.5, driveFall: 4.2, boostRise: 8.5, boostFall: 3.6 };
  compileDriveRates(recipe, rates);
  const state = { plumeDrive: 0, boostBlend: 0 };
  const samples = [];
  for (let i = 0; i < 20; i++) {
    integrateDriveState(state, 1, 1, 1 / 60, rates);
    samples.push(state.boostBlend);
  }
  assert.ok(samples[0] < samples[5]);
  assert.ok(samples[5] < samples[19]);
  assert.ok(samples[2] > 0.05 && samples[2] < 0.95, 'boost blends, does not snap 0→1');
});

test('pairwise family distinction helper rejects tint-only clones', () => {
  const base = structuredClone(KESTREL_MAIN_PLUME_RECIPE);
  base.id = 'clone_a';
  base.engineFamily = 'clone_a';
  const tintOnly = structuredClone(base);
  tintOnly.id = 'clone_b';
  tintOnly.engineFamily = 'clone_b';
  tintOnly.layers[0].colorHex = '#ff0000';
  tintOnly.layers[1].colorHex = '#00ff00';
  const r = assertFamiliesStructurallyDistinct(base, tintOnly);
  assert.equal(r.ok, false, 'tint-only clone must fail structural distinction');
});
