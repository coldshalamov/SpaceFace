import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { EXPLOSION_SCHEDULES } from '../src/render/combat/phasedExplosions.js';
import { vfx } from '../src/render/vfx.js';

const source = fs.readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');

function methodBody(name, nextName) {
  const start = source.indexOf(`  ${name}(`);
  const end = source.indexOf(`  ${nextName}(`, start + 1);
  assert(start >= 0 && end > start, `missing VFX method boundary ${name} -> ${nextName}`);
  return source.slice(start, end);
}

test('weapon muzzles use directional family geometry instead of the shared circular flash sprite', () => {
  const families = [
    ['_spawnMuzzleBallistic', '_spawnMuzzleEnergy'],
    ['_spawnMuzzleEnergy', '_spawnMuzzleExplosive'],
    ['_spawnMuzzleExplosive', '_spawnMuzzleBeam'],
    ['_spawnMuzzleBeam', '_dirAngle'],
  ];
  for (const [name, nextName] of families) {
    const body = methodBody(name, nextName);
    if (name === '_spawnMuzzleEnergy') {
      assert(body.includes('_spawnSprite(SPR_FLASH'),
        `${name} pulse branch uses a directional ignition flash`);
      assert(body.includes('3.4, base'),
        `${name} pulse flash is rolled onto the shot axis rather than a circular card`);
    } else {
      assert.equal(body.includes('_spawnSprite(SPR_FLASH'), false,
        `${name} must not reuse the generic circular flash card`);
    }
    assert(body.includes('_spawnProjectileTrailStreak'), `${name} retains a directional structural cue`);
    assert(body.includes('_flashLight'), `${name} retains brief source illumination`);
  }
});

test('pulse muzzle ignites a directional cyan slit plus source light', () => {
  const system = Object.create(vfx);
  system._scene = {};
  system._burst = 1;
  const streaks = [];
  const sprites = [];
  const lights = [];
  system._spawnProjectileTrailStreak = (...args) => streaks.push(args);
  system._spawnSprite = (...args) => sprites.push(args);
  system._flashLight = (...args) => lights.push(args);
  system._spawnMuzzleEnergy({ x: 4, z: 2 }, 0, {
    sizeMul: 1,
    family: 'plasma',
    variant: 'pulse-bolt',
    coreColor: '#34cfff',
    accentColor: '#5ff0ff',
    lightColor: '#39d0ff',
  }, 1);
  assert.equal(sprites.length, 1, 'pulse muzzle uses one directional ignition flash');
  assert.equal(sprites[0][0], 0, 'pulse ignition uses SPR_FLASH, not combustion');
  assert.ok(sprites[0][12] >= 3, `pulse flash aspect must be a slit, got ${sprites[0][12]}`);
  assert.equal(streaks.length, 1);
  assert.equal(lights.length, 1);
});

test('ordinary projectile impacts do not reintroduce the shared circular flash card', () => {
  const body = methodBody('_onProjectileHit', '_impactParticleCone');
  assert(body.includes("case 'thermal-splash'"));
  assert(body.includes("case 'combustion-burst'"));
  assert(body.includes("case 'ion-sting'"));
  assert(body.includes('_spawnProjectileTrailStreak'));
  assert(body.includes('_spawnSprite(SPR_PUFF'));
});

test('impact families retain bounded, mechanically distinct release residues', () => {
  const receipts = [
    ['kinetic', 'wpn_autocannon_m'],
    ['flak', 'wpn_flak_turret_s'],
    ['rail', 'wpn_railgun_m'],
    ['plasma', 'wpn_plasma_cannon_m'],
    ['pulse', 'wpn_pulse_laser_s'],
    ['beam', 'wpn_beam_laser_m'],
    ['missile', 'wpn_missile_rack_m'],
  ];
  const results = new Map();
  for (const [family, weaponId] of receipts) {
    const system = Object.create(vfx);
    system._scene = {};
    system._burst = 1;
    system._posFrom = (payload) => payload.pos;
    system._ent = () => null;
    system._shieldColor = () => '#55ccff';
    system._flashLight = () => {};
    const streaks = [];
    const sprites = [];
    const cones = [];
    system._spawnProjectileTrailStreak = (...args) => streaks.push(args);
    system._spawnSprite = (...args) => sprites.push(args);
    system._impactParticleCone = (...args) => cones.push(args);
    system._onProjectileHit({
      weaponId,
      pos: { x: 10, z: 20 },
      approach: { x: 1, z: 0 },
      normal: { x: -1, z: 0 },
    });
    results.set(family, {
      streaks,
      sprites,
      cones,
      signature: `${streaks.length}:${sprites.length}:${cones.length}`,
    });
  }

  assert.ok(results.get('kinetic').streaks.length >= 5,
    'kinetic release retains a gouge plus a cool-metal fragment fan');
  assert.ok(Math.max(...results.get('kinetic').streaks.map((args) => args[3])) >= 0.22);
  assert.ok(results.get('flak').streaks.length >= 8 && results.get('flak').cones.length === 1,
    'flak release retains crossed ignition structure plus its bounded full-volume fragment cloud');
  assert.equal(results.get('flak').sprites.length, 0,
    'flak proximity ignition must not fall back to any shared sprite card');
  assert.ok(results.get('rail').streaks.length >= 3,
    'rail release retains its axial ionized scar and narrow exit cue');
  assert.ok(Math.max(...results.get('rail').streaks.map((args) => args[3])) >= 0.23);
  assert.ok(results.get('plasma').sprites.length >= 3,
    'plasma release retains irregular hot bodies plus a normal-blended cooling smear');
  assert.ok(Math.max(...results.get('plasma').sprites.map((args) => args[4])) >= 0.54);
  assert.equal(results.get('pulse').sprites.length, 1,
    'pulse ion sting uses one directional contact slit, not plasma combustion sprites');
  assert.ok(results.get('pulse').streaks.length >= 3 && results.get('pulse').cones.length === 1,
    'pulse release retains an inbound cyan slit, a surface sting, and a bounded spark cone');
  assert.ok(results.get('beam').streaks.length >= 4,
    'beam release retains a contact line plus bounded scintillation branches');
  assert.ok(Math.max(...results.get('beam').streaks.map((args) => args[3])) >= 0.12);
  assert.ok(results.get('missile').sprites.length >= 5 && results.get('missile').streaks.length >= 4,
    'missile release retains clustered combustion, two vapor bodies, and casing debris');
  assert.ok(Math.max(...results.get('missile').sprites.map((args) => args[4])) >= 0.8);
  assert.equal(new Set([...results.values()].map((result) => result.signature)).size, receipts.length,
    'family identity remains structural after the white contact flash has faded');
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
  system._spawnMuzzleBeam = () => { ignitions++; };
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
