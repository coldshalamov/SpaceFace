import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { EXPLOSION_SCHEDULES } from '../src/render/combat/phasedExplosions.js';
import { vfx } from '../src/render/vfx.js';
import {
  FLIGHT_MODE,
  FLIPBOOK_ROLE,
  WEAPON_SOCKET_NAME,
  WeaponVfxPresenter,
  recipeUsesMuzzleFlipbook,
  resolveWeaponRecipe,
} from '../src/render/weapons/index.js';

test('pulse muzzle is a socket-tracked split aperture, without stacked glow cards', () => {
  const recipe = resolveWeaponRecipe('wpn_pulse_laser_s');
  assert.equal(recipe.variant, 'pulse-bolt');
  assert.equal(recipeUsesMuzzleFlipbook(recipe), true);
  assert.equal(recipe.muzzle.bore, true);
  assert.equal(recipe.flight.mode, FLIGHT_MODE.ENERGY_CARD);

  const scene = new THREE.Scene();
  const socket = { x: 12, y: 0.82, z: 0, forwardX: 1, forwardY: 0, forwardZ: 0 };
  const presenter = new WeaponVfxPresenter({
    scene,
    helpers: {
      socketWorldPose: (ownerId, name) => {
        assert.equal(name, WEAPON_SOCKET_NAME);
        return ownerId === 'ship' ? socket : null;
      },
    },
    toLocalXZ: (x, z, out) => {
      const target = out || { x: 0, z: 0 };
      target.x = x;
      target.z = z;
      return target;
    },
  });
  presenter.handleFire({
    weaponId: 'wpn_pulse_laser_s',
    ownerId: 'ship',
    origin: { x: 0, z: 0 },
  }, { x: 0, z: 0 }, 0, recipe.muzzle);
  presenter.discharges.update(0, presenter._dischargePoseResolver, presenter._a11y());
  const sources = presenter.discharges.slots.filter((slot) => slot.alive);
  assert.equal(sources.length, 1, 'pulse ignition has one retained source owner');
  assert.equal(sources[0].source, 'split-aperture');
  assert.equal(sources[0].ownerId, 'ship');
  assert.equal(presenter.flipbooks.slots.filter(slot => slot.alive).length, 0,
    'MUZZLE and BORE cards do not stack over the aperture');
  assert.ok(Math.abs(presenter.discharges.batch.attributes[0].getX(0) - 12) < 1e-6,
    'source reads SOCKET_Weapon_Front, not ship center');
  socket.x = 18;
  presenter.discharges.update(0.02, presenter._dischargePoseResolver, presenter._a11y());
  assert.equal(sources[0].x, 18, 'source follows a moving weapon socket');
  presenter.dispose();
});

test('live pulse fire skips the legacy SPR_FLASH muzzle path', () => {
  const system = Object.create(vfx);
  system._scene = {};
  system._burst = 1;
  system._ent = () => ({ id: 'ship', rot: 0 });
  system._posFrom = () => ({ x: 4, z: 2 });
  system._dirAngle = () => 0;
  system._muzzleProfile = () => ({
    family: 'plasma', variant: 'pulse-bolt', lane: 'energy', sizeMul: 1,
  });
  const sprites = [];
  const streaks = [];
  system._spawnSprite = (...args) => sprites.push(args);
  system._spawnProjectileTrailStreak = (...args) => streaks.push(args);
  system._flashLight = () => {};
  system._weaponPresenter = {
    handleFire() { return true; },
  };
  system._onFire({
    weaponId: 'wpn_pulse_laser_s',
    ownerId: 'ship',
    origin: { x: 4, z: 2 },
    dir: { x: 1, z: 0 },
  });
  assert.equal(sprites.length, 0, 'pulse must not ignite a detached SPR_FLASH beside the nose');
  assert.equal(streaks.length, 0, 'pulse must not fall back to a trail-streak muzzle');
});

test('pulse hull hits keep a cyan spark cone; shield hits write bubble contact instead', () => {
  const system = Object.create(vfx);
  system._scene = {};
  system._burst = 1;
  system._posFrom = (payload) => payload.pos;
  system._ent = () => ({ shield: 0 });
  system._flashLight = () => {};
  const cones = [];
  const sprites = [];
  system._impactParticleCone = (...args) => cones.push(args);
  system._spawnSprite = (...args) => sprites.push(args);
  system._spawnProjectileTrailStreak = () => {};
  system._weaponPresenter = {
    handleHit(_payload, hitShield) { return { sparks: !hitShield }; },
  };
  system._onProjectileHit({
    weaponId: 'wpn_pulse_laser_s',
    pos: { x: 10, z: 20 },
    approach: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
    targetId: 'tgt',
  });
  assert.equal(cones.length, 1, 'pulse hull sting keeps a bounded spark cone as secondary');
  assert.equal(sprites.length, 0, 'pulse hull must not resolve plasma thermal-splash sprites');

  cones.length = 0;
  system._ent = () => ({ shield: 40 });
  system._weaponPresenter = {
    handleHit(_payload, hitShield) { return { sparks: !hitShield }; },
  };
  system._onProjectileHit({
    weaponId: 'wpn_pulse_laser_s',
    pos: { x: 10, z: 20 },
    approach: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
    targetId: 'tgt',
  });
  assert.equal(cones.length, 0, 'shield contact is the bubble, not a spark cone in empty space');
});

test('reduced destruction prunes cost without replacing or disabling phased identity', () => {
  const runClass = (classId, reduced) => {
    const system = Object.create(vfx);
    system._burst = 1;
    system.state = {
      settings: {
        video: { motionReduce: reduced },
        accessibility: { flashReduce: reduced },
      },
    };
    system.bus = { emit: () => {} };
    system._flashLight = () => {};
    const phases = new Map();
    for (const event of EXPLOSION_SCHEDULES[classId].events) {
      const cues = { sprites: 0, streaks: 0, cones: 0 };
      system._spawnSprite = () => { cues.sprites++; };
      system._spawnProjectileTrailStreak = () => { cues.streaks++; };
      system._impactParticleCone = () => { cues.cones++; };
      system._emitExplosionPhase(event.phase, {
        classId,
        serial: 73,
        x: 0,
        z: 0,
        radius: classId === 'capital' ? 15 : 8,
        dirX: 0.92,
        dirZ: 0.38,
      });
      phases.set(event.phase, cues);
    }
    return phases;
  };

  for (const classId of ['ordinary', 'capital']) {
    const normal = runClass(classId, false);
    const reduced = runClass(classId, true);
    let normalTotal = 0;
    let reducedTotal = 0;
    for (const event of EXPLOSION_SCHEDULES[classId].events) {
      const phase = event.phase;
      const normalCount = Object.values(normal.get(phase)).reduce((sum, count) => sum + count, 0);
      const reducedCount = Object.values(reduced.get(phase)).reduce((sum, count) => sum + count, 0);
      assert.ok(normalCount > 0, `${classId}/${phase} must emit a presentation cue`);
      assert.ok(reducedCount > 0, `${classId}/${phase} must retain a useful reduced-mode cue`);
      assert.ok(reducedCount <= normalCount, `${classId}/${phase} reduced mode cannot add density`);
      normalTotal += normalCount;
      reducedTotal += reducedCount;
    }
    assert.ok(reducedTotal < normalTotal, `${classId} reduced mode must prune bounded pool pressure`);
  }
});

test('continuous beam muzzle ignition follows the pool start transition instead of receipt spelling', () => {
  const scene = new THREE.Scene();
  const owner = { id: 'ship', type: 'ship', alive: true, pos: { x: 0, z: 0 }, rot: 0 };
  const system = Object.create(vfx);
  system.init({
    state: {
      playerId: owner.id,
      entities: new Map([[owner.id, owner]]),
      entityList: [owner],
      settings: {
        video: { particleQuality: 'high', motionReduce: false, engineTrails: true },
        accessibility: { flashReduce: false },
      },
      render: { scene },
    },
    bus: createBus(),
    helpers: {},
  });
  let ignitions = 0;
  const originalHandleFire = system._weaponPresenter.handleFire.bind(system._weaponPresenter);
  system._weaponPresenter.handleFire = (...args) => {
    ignitions++;
    return originalHandleFire(...args);
  };
  const receipt = {
    beamKey: 'ship:0', ownerId: owner.id, weaponId: 'wpn_beam_laser_m', hardpointIdx: 0,
    continuous: true, origin: { x: 0, z: 0 }, to: { x: 100, z: 0 }, dir: { x: 1, z: 0 },
  };

  system._onFire(receipt);
  system._onFire(receipt);
  assert.equal(ignitions, 1,
    'an update receipt without phase:update must still move the resident beam without re-igniting');
  system._onBeamStop(receipt);
  system._onFire(receipt);
  assert.equal(ignitions, 2, 'a genuine stop followed by a new start gets a new source ignition');
});
