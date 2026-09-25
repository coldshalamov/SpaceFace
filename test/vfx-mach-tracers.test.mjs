import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { RICOCHET_COS_LIMIT, resolveRicochet, vfx } from '../src/render/vfx.js';
import {
  BOLT_VARIANT,
  EnergyBoltPool,
  FLIGHT_MODE,
  HULL_SCORCH_CAPACITY,
  HullScorchPool,
  WEAPON_LIGHT_POOL_SIZE,
  WeaponLightPool,
  WeaponVfxPresenter,
  heatForWeaponVariant,
  resolveWeaponRecipe,
  scorchHeatForAge,
} from '../src/render/weapons/index.js';

test('kinetic and rail recipes resolve to sharpened Mach-tracer flight', () => {
  const auto = resolveWeaponRecipe('wpn_autocannon_m');
  assert.equal(auto.flight.mode, FLIGHT_MODE.ENERGY_CARD);
  assert.equal(auto.flight.boltVariant, BOLT_VARIANT.KINETIC);
  assert.ok(auto.flight.dashLength >= 9, `autocannon dash ${auto.flight.dashLength}`);
  assert.ok(auto.flight.width <= 1.1, `autocannon width ${auto.flight.width}`);
  assert.ok(auto.flight.intensity >= 2.2, `autocannon intensity ${auto.flight.intensity}`);
  assert.ok(auto.flight.pixelFloor >= 10, 'Mach tracer stays readable at combat distance');
  assert.ok(auto.flight.ribbonWidth <= 0.2, 'tracer wake is a needle, not a tube');

  const rail = resolveWeaponRecipe('wpn_railgun_m');
  assert.equal(rail.flight.boltVariant, BOLT_VARIANT.RAIL);
  assert.ok(rail.flight.dashLength >= 20, `rail dash ${rail.flight.dashLength}`);
  assert.ok(rail.flight.width <= 0.8, `rail width ${rail.flight.width}`);
  assert.ok(rail.flight.intensity >= 3.5, `rail intensity ${rail.flight.intensity}`);

  const siege = resolveWeaponRecipe('wpn_siege_lance_l');
  assert.ok(siege.flight.dashLength > rail.flight.dashLength, 'siege out-reaches rail');
  assert.ok(siege.muzzle.lightPeak > rail.muzzle.lightPeak, 'siege seats harder light');
  assert.ok(rail.muzzle.lightDistance >= 20, 'rail light rakes nearby crags');
});

test('bolt shader carries Mach-tracer cores for kinetic and rail', () => {
  const pool = new EnergyBoltPool(null, { capacity: 2 });
  const frag = pool.material.fragmentShader;
  assert.match(frag, /machDiamonds/, 'kinetic shock-diamond flicker');
  assert.match(frag, /machCore/, 'kinetic needle core');
  assert.match(frag, /railNeedle/, 'rail white-hot needle');
  assert.match(frag, /railHalo/, 'rail ionized halo');
  pool.dispose();
});

test('molten scars live in a 32-slot ring and carry blackbody heat', () => {
  assert.equal(HULL_SCORCH_CAPACITY, 32);
  const pool = new HullScorchPool(null);
  assert.equal(pool.capacity, 32);
  assert.equal(pool.slots.length, 32);
  for (let i = 0; i < 40; i++) {
    pool.spawn({
      targetId: null, localX: i, localY: 0.3, localZ: 0,
      nx: 0, ny: 1, nz: 0, width: 1.8, height: 1.15, life: 5, opacity: 1, heat: 1,
    });
  }
  assert.equal(pool.slots.filter((s) => s.alive).length, 32, 'oldest scars evict first');
  const live = pool.update(0.016, null);
  assert.equal(live, 32);
  assert.equal(pool.mesh.count, 32);
  const heat = pool.size.getW(0);
  assert.ok(heat > 0.9 && heat <= 1, `fresh scar runs white-hot, got ${heat}`);
  assert.match(pool.material.fragmentShader, /scorchBlackbody/);
  pool.dispose();
});

test('scorch heat cools monotonically from white-hot to charcoal', () => {
  assert.equal(scorchHeatForAge(0, 5, 1), 1);
  const samples = [0, 0.5, 1, 2, 3, 4, 4.9].map((age) => scorchHeatForAge(age, 5, 1));
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] < samples[i - 1], `heat falls: ${samples.join(',')}`);
  }
  assert.ok(samples[samples.length - 1] < 0.05, 'scars end as cold charcoal');
  assert.equal(heatForWeaponVariant('thermal-bolt'), 1.0);
  assert.equal(heatForWeaponVariant('concussion-slug'), 0.9);
  assert.ok(heatForWeaponVariant('pulse-bolt') < 0.8, 'pulse leaves a warm sting, not a forge mark');
  assert.equal(heatForWeaponVariant('unknown-dialect'), 0.8);
});

test('resolveRicochet skips only the acute grazing band', () => {
  assert.equal(RICOCHET_COS_LIMIT, 0.38);
  assert.equal(resolveRicochet(1, 0, -1, 0), null, 'head-on hits dig in');
  assert.equal(resolveRicochet(0, 0, 0, 1), null, 'degenerate approach never skips');
  assert.equal(resolveRicochet(0, 0, 0, 0), null, 'degenerate normal never skips');
  assert.equal(resolveRicochet(0.97, 0.24, 0, 1), null, 'separating contacts never skip');
  const graze = resolveRicochet(0.97, -0.24, 0, 1);
  assert.ok(graze, 'a 14-degree kiss of the plate skips');
  assert.ok(Math.abs(graze.rx - 0.97) < 0.02, `mirror x ${graze.rx}`);
  assert.ok(Math.abs(graze.rz - 0.24) < 0.02, `mirror z ${graze.rz}`);
  assert.ok(Math.abs(Math.hypot(graze.rx, graze.rz) - 1) < 1e-9, 'skip direction is unit');
  const scratch = { rx: 0, rz: 0, graze: 0 };
  assert.strictEqual(resolveRicochet(0.97, -0.24, 0, 1, scratch), scratch, 'hot path reuses scratch');
});

test('weapon light pool culls dim newcomers when full', () => {
  assert.equal(WEAPON_LIGHT_POOL_SIZE, 2);
  const pool = new WeaponLightPool(null);
  assert.ok(pool.spawn({ x: 0, y: 0.4, z: 0, color: '#fff', intensity: 3, distance: 14, life: 1, priority: 0.9 }));
  assert.ok(pool.spawn({ x: 1, y: 0.4, z: 0, color: '#fff', intensity: 3, distance: 14, life: 1, priority: 0.8 }));
  assert.equal(pool.live, 2);
  assert.equal(
    pool.spawn({ x: 2, y: 0.4, z: 0, color: '#fff', intensity: 3, distance: 14, life: 1, priority: 0.4 }),
    null,
    'a dim skirmish beat must not steal a heavy flash mid-beat',
  );
  assert.ok(pool.spawn({ x: 3, y: 0.4, z: 0, color: '#fff', intensity: 5, distance: 20, life: 1, priority: 1 }));
  assert.equal(pool.live, 2);
  pool.update(2.0);
  assert.equal(pool.live, 0);
  pool.dispose();
});

test('presenter seats heavy hits with harder light and culls off-table skirmish light', () => {
  const fire = (weaponId, targetId, pos) => {
    const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
    presenter.state = {
      playerId: 'pilot',
      entities: new Map([['pilot', { id: 'pilot', pos: { x: 0, z: 0 } }]]),
      settings: {},
      render: { meshes: new Map() },
    };
    presenter.handleHit({
      weaponId, targetId, pos, normal: { x: -1, z: 0 }, approach: { x: 1, z: 0 },
    }, false);
    const peaks = presenter.lights.slots.filter((s) => s.alive).map((s) => s.peak);
    const scar = presenter.scorches.slots.find((s) => s.alive);
    const out = { peaks, scorchHeat: scar && scar.heat0 };
    presenter.dispose();
    return out;
  };
  const auto = fire('wpn_autocannon_m', 'foe', { x: 10, z: 0 });
  assert.equal(auto.peaks.length, 1);
  assert.ok(Math.abs(auto.peaks[0] - 2.0) < 1e-9, `autocannon peak ${auto.peaks[0]}`);
  assert.equal(auto.scorchHeat, 0.8);
  const siege = fire('wpn_siege_lance_l', 'foe', { x: 10, z: 0 });
  assert.equal(siege.peaks.length, 1);
  assert.ok(siege.peaks[0] > auto.peaks[0] * 1.5, `siege peak ${siege.peaks[0]}`);
  const plasma = fire('wpn_plasma_cannon_m', 'foe', { x: 10, z: 0 });
  assert.equal(plasma.scorchHeat, 1.0, 'plasma strikes white-hot');
  const far = fire('wpn_autocannon_m', 'foe', { x: 5000, z: 0 });
  assert.equal(far.peaks.length, 0, 'nobody sees that light; the pool stays free');
  assert.equal(far.scorchHeat, 0.8, 'the scar still stamps');
  const playerHit = fire('wpn_autocannon_m', 'pilot', { x: 5000, z: 0 });
  assert.equal(playerHit.peaks.length, 1, 'player-involved beats always survive the cull');
});

test('ballistic muzzles breathe bore gas and carbon; energy stays clean', () => {
  const runFire = (weaponId, family, variant) => {
    const system = Object.create(vfx);
    system._scene = {};
    system._burst = 1;
    system._ent = () => ({ id: 'ship', rot: 0 });
    system._posFrom = () => ({ x: 4, z: 2 });
    system._dirAngle = () => 0;
    system._muzzleProfile = () => ({
      family, variant, lane: 'ballistic', sizeMul: 1, coreColor: '#ffffff',
    });
    const sprites = [];
    system._spawnSprite = (...args) => sprites.push(args);
    system._spawnProjectileTrailStreak = () => {};
    system._flashLight = () => {};
    system._weaponPresenter = { handleFire() { return true; } };
    system._onFire({ weaponId, ownerId: 'ship', origin: { x: 4, z: 2 }, dir: { x: 1, z: 0 } });
    return sprites;
  };
  const auto = runFire('wpn_autocannon_m', 'kinetic', 'autocannon');
  assert.ok(auto.length >= 3, `autocannon muzzle breathes, got ${auto.length} sprites`);
  assert.ok(auto.some((args) => args[9] === '#14100d'), 'carbon flecks ride the muzzle');
  const rail = runFire('wpn_railgun_m', 'rail', 'railgun');
  assert.ok(rail.length >= 3, `rail muzzle breathes, got ${rail.length} sprites`);
  const pulse = runFire('wpn_pulse_laser_s', 'plasma', 'pulse-bolt');
  assert.equal(pulse.length, 0, 'energy ignition stays fully presenter-owned');
});

test('grazing kinetic hits skip; head-on hits dig in', () => {
  const capture = (weaponId, approach, normal, shield = 0) => {
    const calls = { sprites: [], streaks: [], cones: [], lights: [] };
    const host = Object.create(vfx);
    host._scene = {};
    host._burst = 1;
    // The live init owns these scratch colours; the hit also emits ordinary armour spall.
    // Keep that path active while this fixture observes the grazing-specific cone/leader.
    host._c0 = new THREE.Color();
    host._c1 = new THREE.Color();
    host._spawnParticle = () => {};
    host._posFrom = () => ({ x: 10, z: 20 });
    host._ent = () => ({ factionId: 'test', shield });
    host._shieldColor = () => '#66ccff';
    host._spawnSprite = (...args) => calls.sprites.push(args);
    host._spawnProjectileTrailStreak = (...args) => calls.streaks.push(args);
    host._impactParticleCone = (...args) => calls.cones.push(args);
    host._flashLight = (...args) => calls.lights.push(args);
    host._onProjectileHit({ weaponId, targetId: 17, approach, normal });
    return calls;
  };
  const grazeApproach = { x: 0.97, z: -0.24 };
  const grazeNormal = { x: 0, z: 1 };
  const headOn = capture('wpn_autocannon_m', { x: 1, z: 0 }, { x: -1, z: 0 });
  assert.equal(headOn.cones.length, 1, 'head-on keeps only the incidence fan');
  const graze = capture('wpn_autocannon_m', grazeApproach, grazeNormal);
  assert.equal(graze.cones.length, 2, 'gouge plus the skipping burst');
  assert.equal(graze.cones[0][3], 0.42, 'skip burst is a tight directional fan');
  assert.ok(graze.streaks.length > headOn.streaks.length, 'the skipping round draws a leader');
  const shielded = capture('wpn_autocannon_m', grazeApproach, grazeNormal, 40);
  assert.equal(shielded.cones.length, 1, 'rounds do not skip off shields');
  const plasma = capture('wpn_plasma_cannon_m', grazeApproach, grazeNormal);
  assert.equal(plasma.cones.length, 1, 'plasma splashes; only slugs skip');
});

test('mining carves a molten scar at a slow cadence', () => {
  const system = Object.create(vfx);
  system._scene = {};
  system.state = { simTime: 0 };
  system._t = 0;
  system._burst = 1;
  system._c0 = new THREE.Color();
  system._c1 = new THREE.Color();
  system._miningBeam = { targetId: 'rock-1' };
  system._posFrom = () => ({ x: 30, z: 40 });
  system._ent = () => null;
  system.helpers = {};
  system._toLocalXZ = (x, z, out) => {
    const target = out || { x: 0, z: 0 };
    target.x = x;
    target.z = z;
    return target;
  };
  system._spawnParticle = () => {};
  system._spawnSprite = () => {};
  system._flashLight = () => {};
  const scars = [];
  system._weaponPresenter = {
    quarks: null,
    stampMiningScar: (...args) => { scars.push(args); return true; },
  };
  system._onMiningTick({ oreType: 'ore_iron' });
  system._onMiningTick({ oreType: 'ore_iron' });
  assert.equal(scars.length, 1, 'one scar per cadence window');
  system.state.simTime = 1.0;
  system._onMiningTick({ oreType: 'ore_iron' });
  assert.equal(scars.length, 2);
  assert.equal(scars[0][0], 'rock-1', 'scar stays retained to the rock');
  assert.equal(scars[0][8], 1.0, 'mining strikes white-hot');
});

test('pools stay bounded under sustained weapon fire', () => {
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  presenter.state = {
    playerId: 'pilot',
    entityList: [],
    entities: new Map(),
    settings: {},
    render: { meshes: new Map() },
  };
  const ids = [
    'wpn_autocannon_m',
    'wpn_railgun_m',
    'wpn_plasma_cannon_m',
    'wpn_siege_lance_l',
    'wpn_pulse_laser_s',
  ];
  for (let i = 0; i < 150; i++) {
    const weaponId = ids[i % ids.length];
    presenter.handleFire({ weaponId, ownerId: 'pilot', origin: { x: i, z: 0 } }, { x: i, z: 0 }, 0);
    presenter.handleHit({
      weaponId, targetId: 'foe', pos: { x: i, z: 0 },
      normal: { x: -1, z: 0 }, approach: { x: 1, z: 0 },
    }, false);
    if (i % 10 === 0) {
      presenter.update(1 / 60, { state: presenter.state, interpolationAlpha: 1, viewportHeight: 1000 });
    }
  }
  presenter.update(1, { state: presenter.state, interpolationAlpha: 1, viewportHeight: 1000 });
  assert.equal(presenter.discharges.slots.length, 48);
  assert.equal(presenter.scorches.slots.length, 32);
  assert.ok(presenter.scorches.slots.filter((s) => s.alive).length <= 32);
  assert.ok(presenter.lights.live <= WEAPON_LIGHT_POOL_SIZE);
  assert.ok(presenter.bolts.live <= 256);
  presenter.dispose();
});
