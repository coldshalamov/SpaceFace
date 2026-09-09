import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  VELOCITY_LANGUAGE_FLAGS,
  VELOCITY_BAND,
  VL_BOOST_BIAS,
  VL_EXCEPTIONAL_SPEED_RATIO_MAX,
  publishVelocityLanguage,
  readOwnedExceptionalSpeed,
  resolveExceptionalSpeed,
  resolveRegionCrossfade,
  velocityBandDrive,
} from '../src/render/velocityLanguage.js';
import { resolveGovernedCombatSpeed } from '../src/core/flight/propulsionCatalog.js';
import { feel, speedLineDriveLegacy } from '../src/render/feel.js';
import {
  PHYSICS_EARNED_SPEED_ZOOM_MAX,
  SPEED_ZOOM_MAX,
  SPEED_ZOOM_MIN,
  resolveExceptionalSpeedZoomFactor,
  resolveSpeedZoomFactor,
} from '../src/render/camera.js';
import { vfx } from '../src/render/vfx.js';

const EPS = 1e-12;
const near = (actual, expected, label) => {
  assert.ok(Math.abs(actual - expected) <= EPS, `${label}: expected ${expected}, got ${actual}`);
};

test('exceptional-speed classifier is bounded, physics-owned, and boost-independent', () => {
  assert.equal(VL_EXCEPTIONAL_SPEED_RATIO_MAX, 3);
  assert.equal(VL_BOOST_BIAS, 0);
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.equal(resolveExceptionalSpeed(bad, 100, true), 0);
    assert.equal(resolveExceptionalSpeed(200, bad, true), 0);
  }
  for (const maxSpeed of [0, -1, -Infinity]) {
    assert.equal(resolveExceptionalSpeed(200, maxSpeed, true), 0);
  }
  for (const provenance of [false, null, undefined, 1, 'true', {}]) {
    assert.equal(resolveExceptionalSpeed(300, 100, provenance), 0);
  }
  near(resolveExceptionalSpeed(100, 100, true), 0, '1x');
  near(resolveExceptionalSpeed(200, 100, true), 0.5, '2x');
  near(resolveExceptionalSpeed(300, 100, true), 1, '3x');
  near(resolveExceptionalSpeed(900, 100, true), 1, 'above 3x');

  const unboosted = velocityBandDrive(200, 100, false, false);
  const boosted = velocityBandDrive(200, 100, true, false);
  assert.equal(unboosted.band, VELOCITY_BAND.MODERATE);
  assert.equal(boosted.band, unboosted.band);
  assert.equal(boosted.count, unboosted.count);
  assert.equal(velocityBandDrive(0, 100, false, false, true).exceptionalSpeed, 0,
    'silent/default drive must carry an explicit zero scalar');
});

test('velocity and region resolvers fully overwrite caller-owned records without value drift', () => {
  const driveOut = {};
  const driveCases = [
    [0, 100, false, false, true],
    [175, 100, false, false, true],
    [350, 100, true, false, true],
    [900, 100, true, true, true],
    [NaN, 100, false, false, true],
  ];
  for (const args of driveCases) {
    const expected = velocityBandDrive(...args);
    const actual = velocityBandDrive(...args, driveOut);
    assert.strictEqual(actual, driveOut);
    assert.deepEqual(actual, expected);
  }

  const legacyOut = {};
  const legacyExpected = speedLineDriveLegacy(135, 100, true, true);
  assert.strictEqual(speedLineDriveLegacy(135, 100, true, true, legacyOut), legacyOut);
  assert.deepEqual(legacyOut, legacyExpected);

  const regionOut = {};
  const regionCases = [
    [{ x: 0, z: 0 }, null],
    [{ x: 0, z: 0 }, { candidates: ['sector_helios_prime'] }],
    [{ x: 6400, z: 5200 }, { crossfadeWU: 900 }],
    [{ x: NaN, z: Infinity }, null],
  ];
  for (const [position, options] of regionCases) {
    const expected = resolveRegionCrossfade(position, options);
    const actual = resolveRegionCrossfade(position, options, regionOut);
    assert.strictEqual(actual, regionOut);
    assert.deepEqual(actual, expected);
  }
});

test('feel retains live velocity and region records across high-refresh publication', () => {
  const savedBands = VELOCITY_LANGUAGE_FLAGS.bands;
  const savedRegions = VELOCITY_LANGUAGE_FLAGS.regionVolumes;
  VELOCITY_LANGUAGE_FLAGS.bands = true;
  VELOCITY_LANGUAGE_FLAGS.regionVolumes = true;
  try {
    const player = {
      id: 17,
      pos: { x: 0, z: 0 },
      vel: { x: 210, z: 35 },
      maxSpeed: 172.07,
      propulsion: { family: 'reaction', combatSpeed: 95, maxSpeed: 95 },
      flags: { boosting: false },
      _flightFrame: { governor: { physicsEarned: true } },
    };
    const state = {
      playerId: player.id,
      entities: new Map([[player.id, player]]),
      camera: { tilt: 60 },
      settings: { video: { motionReduce: false } },
      render: {},
    };
    const system = Object.create(feel);
    system.state = state;
    system._slCanvas = { isConnected: true, style: { opacity: '0' } };
    system._slCtx = {};
    system._slOpacity = 0;
    system._slGrain = 0;

    system._updateSpeedLines(0);
    const node = state.render.velocityLanguage;
    const driveIdentity = node.drive;
    const regionIdentity = node.region;
    assert.strictEqual(driveIdentity, system._velocityDriveScratch);
    assert.strictEqual(regionIdentity, system._regionCrossfadeScratch);

    for (let frame = 1; frame <= 240; frame++) {
      player.vel.x = 120 + (frame % 181);
      player.vel.z = (frame % 17) - 8;
      player.pos.x = frame * 37;
      player.pos.z = frame * -19;
      system._updateSpeedLines(0);
      assert.strictEqual(node.drive, driveIdentity);
      assert.strictEqual(node.region, regionIdentity);
    }

    const speed = Math.hypot(player.vel.x, player.vel.z);
    const governedCap = resolveGovernedCombatSpeed(player, state, player.maxSpeed);
    assert.equal(governedCap, 95);
    assert.deepEqual(
      { ...node.drive },
      velocityBandDrive(speed, governedCap, false, false, true),
    );
    assert.deepEqual({ ...node.region }, resolveRegionCrossfade(player.pos));
    assert.equal(node.frame, 241);
  } finally {
    VELOCITY_LANGUAGE_FLAGS.bands = savedBands;
    VELOCITY_LANGUAGE_FLAGS.regionVolumes = savedRegions;
  }
});

test('feel publishes an owner-bound exceptional scalar and reduced motion zeros it', () => {
  const player = {
    id: 7,
    pos: { x: 0, z: 0 },
    vel: { x: 190, z: 0 },
    maxSpeed: 172.07,
    propulsion: { family: 'reaction', combatSpeed: 95, maxSpeed: 95 },
    flags: { boosting: true },
    _flightFrame: { governor: { physicsEarned: true } },
  };
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player]]),
    camera: { tilt: 60 },
    settings: { video: { motionReduce: false } },
    render: {},
  };
  const system = Object.create(feel);
  system.state = state;
  system._slCanvas = { isConnected: true, style: { opacity: '0' } };
  system._slCtx = {};
  system._slOpacity = 0;
  system._slGrain = 0;

  system._updateSpeedLines(0);
  assert.equal(state.render.velocityLanguage.schema, 'velocity_language_v1');
  assert.equal(state.render.velocityLanguage.ownerId, player.id);
  near(state.render.velocityLanguage.drive.exceptionalSpeed, 0.5, 'published 2x scalar at 190 WU/s');
  near(readOwnedExceptionalSpeed(state), 0.5, 'owned scalar');

  player.vel.x = 285;
  system._updateSpeedLines(0);
  near(state.render.velocityLanguage.drive.exceptionalSpeed, 1, 'published 3x scalar at 285 WU/s');
  near(readOwnedExceptionalSpeed(state), 1, 'owned 3x scalar');

  state.render.velocityLanguage.ownerId = 99;
  assert.equal(readOwnedExceptionalSpeed(state), 0, 'stale player record must fail closed');
  state.settings.video.motionReduce = true;
  player.vel.x = 190;
  system._updateSpeedLines(0);
  assert.equal(state.render.velocityLanguage.ownerId, player.id);
  assert.equal(state.render.velocityLanguage.drive.exceptionalSpeed, 0);

  state.settings.video.motionReduce = false;
  player._flightFrame.governor.physicsEarned = 1;
  system._updateSpeedLines(0);
  assert.equal(state.render.velocityLanguage.drive.exceptionalSpeed, 0, 'provenance is strict boolean');

  const defaultState = { playerId: 2, render: {} };
  const node = publishVelocityLanguage(defaultState, null, null);
  assert.equal(node.ownerId, 2);
  node.drive = { exceptionalSpeed: 1 };
  node.schema = 'future_velocity_language';
  assert.equal(readOwnedExceptionalSpeed(defaultState), 0, 'unknown record schema must fail closed');
  assert.equal(readOwnedExceptionalSpeed({ render: { velocityLanguage: { drive: { exceptionalSpeed: 1 } } } }), 0,
    'ownerless record without a current player must fail closed');
});

test('camera preserves ordinary framing and consumes only the normalized exceptional scalar', () => {
  const exceptionalMid = SPEED_ZOOM_MAX + (PHYSICS_EARNED_SPEED_ZOOM_MAX - SPEED_ZOOM_MAX) * 0.5;
  const vision =
    'Zip around, stay in control of the combat area — above the cap the camera opens with speed';
  near(resolveSpeedZoomFactor(0, 100, false), SPEED_ZOOM_MIN, 'idle ordinary frame');
  near(resolveSpeedZoomFactor(100, 100, false), SPEED_ZOOM_MAX, 'hull-max ordinary frame');
  near(resolveSpeedZoomFactor(300, 100, false), SPEED_ZOOM_MAX, 'ordinary cap');
  near(resolveExceptionalSpeedZoomFactor(0), SPEED_ZOOM_MAX, 'exceptional 0');
  near(
    resolveExceptionalSpeedZoomFactor(0.5),
    exceptionalMid,
    `${vision}: exceptional midpoint must sit halfway from the ordinary cap to the earned cap`,
  );
  near(resolveExceptionalSpeedZoomFactor(1), PHYSICS_EARNED_SPEED_ZOOM_MAX, 'exceptional max');
  near(resolveExceptionalSpeedZoomFactor(NaN), SPEED_ZOOM_MAX, 'nonfinite scalar');
  near(resolveExceptionalSpeedZoomFactor(8), PHYSICS_EARNED_SPEED_ZOOM_MAX, 'clamped scalar');

  // Compatibility wrapper retains the previous boolean call surface and exact curve.
  near(
    resolveSpeedZoomFactor(200, 100, true),
    exceptionalMid,
    `${vision}: 2x cruise with physics-earned provenance must open to the same midpoint`,
  );
  near(resolveSpeedZoomFactor(300, 100, true), PHYSICS_EARNED_SPEED_ZOOM_MAX, 'legacy 3x wrapper');
  near(resolveSpeedZoomFactor(300, 100, 1), SPEED_ZOOM_MAX, 'legacy provenance remains strict');
});

function makeProjectile(id, ownerId, extra = {}) {
  const projectile = {
    id,
    type: 'projectile',
    alive: true,
    ownerId,
    pos: { x: 100, z: 50 },
    vel: { x: 280, z: 40 },
    rot: 0,
    radius: 1.2,
    data: { weaponId: 'wpn_pulse_laser_m', kind: 'bullet', damageType: 'energy', ...extra },
  };
  if (ownerId === undefined) delete projectile.ownerId;
  return projectile;
}

function makeVfxHarness(projectile, exceptionalSpeed, options = {}) {
  const scene = new THREE.Scene();
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
  };
  const entities = new Map([[player.id, player], [projectile.id, projectile]]);
  let reads = 0;
  const drive = {};
  Object.defineProperty(drive, 'exceptionalSpeed', {
    configurable: true,
    enumerable: true,
    get() { reads++; return exceptionalSpeed; },
  });
  const state = {
    mode: 'flight',
    playerId: player.id,
    player: {},
    entities,
    entityList: [player, projectile],
    settings: {
      video: {
        particleQuality: 'high', motionReduce: options.motionReduce === true,
        engineTrails: false, bloom: true,
      },
    },
    render: {
      scene,
      velocityLanguage: {
        schema: 'velocity_language_v1',
        ownerId: options.recordOwnerId ?? player.id,
        drive,
        region: null,
        frame: 1,
      },
    },
    content: {},
  };
  const system = Object.create(vfx);
  system.init({ state, bus: { on() {} }, helpers: {} });
  return { system, state, projectile, reads: () => reads };
}

function firstLiveStreak(system) {
  const index = system._activeTrailStreaks[0];
  return index == null ? null : system._ts[index];
}

function snapshotStreak(system) {
  const streak = firstLiveStreak(system);
  assert.ok(streak, 'expected a pooled connected projectile streak');
  return {
    width: streak.size0 * 0.42,
    length: streak.size0 * streak.stretch,
    opacity: streak.op0,
    life: streak.life,
    count: system._liveTrailStreakCount,
    poolCapacity: system._ts.length,
  };
}

function snapshotLiveStreaks(system) {
  const result = [];
  for (let cursor = 0; cursor < system._liveTrailStreakCount; cursor++) {
    const streak = system._ts[system._activeTrailStreaks[cursor]];
    result.push({
      width: streak.size0 * 0.42,
      length: streak.size0 * streak.stretch,
      opacity: streak.op0,
      life: streak.life,
    });
  }
  result.sort((a, b) => a.width - b.width || a.life - b.life);
  return result;
}

function snapshotLiveSprites(system) {
  const result = [];
  for (let cursor = 0; cursor < system._liveSpriteCount; cursor++) {
    const sprite = system._spr[system._activeSprites[cursor]];
    result.push({
      kind: sprite.kind,
      life: sprite.life,
      size0: sprite.size0,
      size1: sprite.size1,
      opacity0: sprite.op0,
      opacity1: sprite.op1,
      aspect: sprite.aspect,
    });
  }
  return result;
}

test('only an owner-bound player projectile receives bounded connected-wake amplification', () => {
  const baseHarness = makeVfxHarness(makeProjectile(10, 1), 0);
  const scratch = baseHarness.system._projectileTrailPlanScratch;
  const nestedStreak = scratch._streak;
  baseHarness.system.update(1 / 60);
  const base = snapshotStreak(baseHarness.system);
  assert.equal(baseHarness.reads(), 1, 'shared scalar must be read once per update');
  assert.equal(baseHarness.system._projectileTrailPlanScratch, scratch, 'plan scratch identity changed');
  assert.equal(baseHarness.system._projectileTrailPlanScratch._streak, nestedStreak, 'nested streak scratch changed');

  const heroHarness = makeVfxHarness(makeProjectile(11, 1), 1);
  heroHarness.system.update(1 / 60);
  const hero = snapshotStreak(heroHarness.system);
  near(hero.length, base.length * 1.4, 'hero wake length');
  near(hero.opacity, Math.min(1, base.opacity * 1.15), 'hero wake opacity');
  near(hero.width, base.width, 'width unchanged');
  near(hero.life, base.life, 'life unchanged');
  assert.equal(hero.count, base.count, 'pool count changed');
  assert.equal(hero.poolCapacity, base.poolCapacity, 'pool capacity changed');

  for (const [label, projectile, options] of [
    ['npc', makeProjectile(12, 2), {}],
    ['missing top-level owner', makeProjectile(13, undefined, { ownerId: 1 }), {}],
    ['stale velocity owner', makeProjectile(14, 1), { recordOwnerId: 9 }],
    ['reduced motion', makeProjectile(15, 1), { motionReduce: true }],
  ]) {
    const harness = makeVfxHarness(projectile, 1, options);
    harness.system.update(1 / 60);
    const actual = snapshotStreak(harness.system);
    near(actual.length, base.length, `${label} length`);
    near(actual.opacity, base.opacity, `${label} opacity`);
    near(actual.width, base.width, `${label} width`);
    near(actual.life, base.life, `${label} life`);
    assert.equal(actual.count, base.count, `${label} count`);
  }

  heroHarness.projectile.alive = false;
  heroHarness.system._markProjectileCacheDirty();
  for (let i = 0; i < 90; i++) heroHarness.system.update(1 / 60);
  assert.equal(heroHarness.system._liveTrailStreakCount, 0, 'pooled wake did not drain');
  assert.equal(heroHarness.system._ts.length, hero.poolCapacity, 'drain resized the pool');
});

test('the shared exceptional scalar is read once for a multi-projectile update', () => {
  const harness = makeVfxHarness(makeProjectile(16, 1), 1);
  const second = makeProjectile(17, 1);
  second.pos = { x: 120, z: 65 };
  harness.state.entities.set(second.id, second);
  harness.state.entityList.push(second);
  harness.system._markProjectileCacheDirty();
  harness.system.update(1 / 60);
  assert.equal(harness.reads(), 1, 'shared scalar must be read once, not once per projectile');
  assert.equal(harness.system._liveTrailStreakCount, 2, 'exceptional presentation changed projectile count');
});

test('missile exhaust and plasma wake amplify only their connected streak layers', () => {
  const cases = [
    {
      label: 'missile',
      data: { weaponId: 'wpn_missile_rack_m', kind: 'missile', damageType: 'explosive' },
      expectedStreaks: 1,
      primeFrameIndex: 2,
      expectedSprites: 1,
    },
    {
      label: 'plasma',
      data: { weaponId: 'wpn_plasma_cannon_m', kind: 'bolt', damageType: 'thermal' },
      expectedStreaks: 2,
      primeFrameIndex: 0,
      expectedSprites: 0,
    },
  ];

  for (const entry of cases) {
    const base = makeVfxHarness(makeProjectile(30, 1, entry.data), 0);
    const hero = makeVfxHarness(makeProjectile(31, 1, entry.data), 1);
    base.system._projectileTrailFrameIndex = entry.primeFrameIndex;
    hero.system._projectileTrailFrameIndex = entry.primeFrameIndex;
    base.system.update(1 / 60);
    hero.system.update(1 / 60);

    const baseStreaks = snapshotLiveStreaks(base.system);
    const heroStreaks = snapshotLiveStreaks(hero.system);
    assert.equal(baseStreaks.length, entry.expectedStreaks, `${entry.label} base streak count`);
    assert.equal(heroStreaks.length, entry.expectedStreaks, `${entry.label} hero streak count`);
    for (let i = 0; i < baseStreaks.length; i++) {
      near(heroStreaks[i].length, baseStreaks[i].length * 1.4, `${entry.label} layer ${i} length`);
      near(heroStreaks[i].opacity, Math.min(1, baseStreaks[i].opacity * 1.15),
        `${entry.label} layer ${i} opacity`);
      near(heroStreaks[i].width, baseStreaks[i].width, `${entry.label} layer ${i} width`);
      near(heroStreaks[i].life, baseStreaks[i].life, `${entry.label} layer ${i} life`);
    }

    const baseSprites = snapshotLiveSprites(base.system);
    const heroSprites = snapshotLiveSprites(hero.system);
    assert.equal(baseSprites.length, entry.expectedSprites, `${entry.label} base sprite count`);
    assert.deepEqual(heroSprites, baseSprites, `${entry.label} smoke/sprite layer changed`);
    assert.equal(hero.system._ts.length, base.system._ts.length, `${entry.label} streak pool capacity changed`);
    assert.equal(hero.system._spr.length, base.system._spr.length, `${entry.label} sprite pool capacity changed`);
    assert.equal(hero.system._projectileTrailFrameIndex, base.system._projectileTrailFrameIndex,
      `${entry.label} cadence frame changed`);
    assert.equal(hero.system._cadenceProjectileTrail, base.system._cadenceProjectileTrail,
      `${entry.label} cadence accumulator changed`);
    assert.deepEqual(hero.system.inspect().projectileTrails, base.system.inspect().projectileTrails,
      `${entry.label} diagnostics changed`);
  }
});

test('particle-only projectile trails do not receive exceptional amplification', () => {
  const baseHarness = makeVfxHarness(
    makeProjectile(20, 1, { weaponId: 'wpn_emp_disruptor_m', damageType: 'emp' }),
    0,
  );
  const heroHarness = makeVfxHarness(
    makeProjectile(21, 1, { weaponId: 'wpn_emp_disruptor_m', damageType: 'emp' }),
    1,
  );
  baseHarness.system.update(1 / 60);
  heroHarness.system.update(1 / 60);
  assert.equal(baseHarness.system._liveTrailStreakCount, 0);
  assert.equal(heroHarness.system._liveTrailStreakCount, 0);
  assert.equal(heroHarness.system._liveCount, baseHarness.system._liveCount);
  assert.deepEqual(heroHarness.system.inspect().projectileTrails, baseHarness.system.inspect().projectileTrails);
});
