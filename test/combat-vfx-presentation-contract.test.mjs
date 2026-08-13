import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProjectileTrailSpawnPlan,
  createProjectileTrailSpawnPlanScratch,
  resolveMuzzleProfile,
  resolveProjectileTrailProfile,
  resolveImpactPresentationProfile,
  resolveWeaponPresentationFamily,
} from '../src/render/vfxProfiles.js';
import { projectileHitPayload } from '../src/core/physics.js';
import { weapons } from '../src/systems/weapons.js';
import { normalizeDamagePacket } from '../src/combat/damage.js';

test('weapon presentation family is structural rather than a damage-color alias', () => {
  const cases = [
    ['wpn_autocannon_m', 'kinetic', 'autocannon'],
    ['wpn_flak_turret_s', 'kinetic', 'flak'],
    ['wpn_railgun_m', 'rail', 'railgun'],
    ['wpn_siege_lance_l', 'rail', 'siege-lance'],
    ['wpn_plasma_cannon_m', 'plasma', 'thermal-bolt'],
    ['wpn_pulse_laser_m', 'plasma', 'pulse-bolt'],
    ['wpn_beam_laser_m', 'beam', 'continuous-beam'],
    ['wpn_missile_rack_m', 'missile', 'missile'],
    ['wpn_torpedo_l', 'missile', 'torpedo'],
    ['wpn_emp_disruptor_m', 'emp', 'disruptor'],
  ];
  for (const [weaponId, family, variant] of cases) {
    assert.deepEqual(resolveWeaponPresentationFamily(weaponId), { family, variant });
  }
});

test('muzzle and projectile trail resolve from the same family contract', () => {
  assert.equal(resolveMuzzleProfile('wpn_railgun_m', null).family, 'rail');
  assert.equal(resolveMuzzleProfile('wpn_beam_laser_m', null).family, 'beam');
  const kinetic = resolveProjectileTrailProfile('wpn_autocannon_m');
  const kineticPlan = buildProjectileTrailSpawnPlan(kinetic, {
    pos: { x: 10, z: 20 }, vel: { x: 180, z: 0 }, radius: 0.7,
  });
  assert.equal(kinetic.mode, 'tracer');
  assert.ok(kineticPlan.streak && kineticPlan.streak.length > 1.5,
    'autocannon flight must expose a readable elongated tracer');
  assert.equal(kineticPlan.particle, null,
    'autocannon flight must not rely on a glowing particle ball');
  assert.equal(resolveProjectileTrailProfile('wpn_missile_rack_m').class, 'missile');
  const plasma = resolveProjectileTrailProfile('wpn_plasma_cannon_m');
  assert.equal(plasma.class, 'plasma');
  assert.equal(plasma.mode, 'thermal-wake',
    'plasma must use a coherent thermal wake rather than detached heat particles');
  const plasmaPlan = buildProjectileTrailSpawnPlan(plasma, {
    pos: { x: 10, z: 20 }, vel: { x: 80, z: 12 }, radius: 0.7,
  });
  assert.ok(plasmaPlan.streak, 'plasma thermal wake must provide connected streak geometry');
  assert.equal(plasmaPlan.particle, null, 'plasma thermal wake must not provide bead particles');
  const friendlyPlasmaPlan = buildProjectileTrailSpawnPlan(plasma, {
    pos: { x: 10, z: 20 }, vel: { x: 80, z: 12 }, radius: 0.7, team: 0,
  });
  const enemyPlasmaPlan = buildProjectileTrailSpawnPlan(plasma, {
    pos: { x: 10, z: 20 }, vel: { x: 80, z: 12 }, radius: 0.7, team: 1,
  });
  assert.notEqual(friendlyPlasmaPlan.tailColor, enemyPlasmaPlan.tailColor,
    'plasma wake must stay palette-coherent with its allegiance-aware projectile body');
  const pulse = resolveProjectileTrailProfile('wpn_pulse_laser_m');
  assert.equal(pulse.class, 'pulse');
  assert.equal(pulse.mode, 'streak', 'pulse trail must remain a connected directional wake, not heat beads');
  assert.ok(pulse.streakLen > 1 && pulse.streakLen < 4, 'pulse wake stays shorter than a rail trace');
  const pulseCore = Number.parseInt(pulse.coreColor.slice(1), 16);
  const pulseRed = (pulseCore >> 16) & 0xff;
  const pulseGreen = (pulseCore >> 8) & 0xff;
  assert.ok(pulseGreen > pulseRed * 2.5,
    `pulse wake must remain saturated cyan rather than a near-white bloom streak: ${pulse.coreColor}`);
  assert.ok(pulse.streakOpacity <= 0.22,
    `pulse wake must remain subordinate to its projectile body: ${pulse.streakOpacity}`);
  assert.equal(resolveProjectileTrailProfile('wpn_emp_disruptor_m').class, 'emp');
});

test('projectile trail cadence reuses immutable profiles and one resident spawn plan', () => {
  const profile = resolveProjectileTrailProfile('wpn_missile_rack_m');
  assert.strictEqual(resolveProjectileTrailProfile('wpn_missile_rack_m'), profile,
    'profile resolution must not allocate a clone for every projectile cadence');

  const scratch = createProjectileTrailSpawnPlanScratch();
  const origin = scratch.origin;
  const velocity = scratch.vel;
  const first = buildProjectileTrailSpawnPlan(profile, {
    pos: { x: 10, z: 20 }, vel: { x: 80, z: 0 }, radius: 1,
  }, 1, scratch);
  const second = buildProjectileTrailSpawnPlan(profile, {
    pos: { x: 30, z: 40 }, vel: { x: 60, z: 20 }, radius: 1,
  }, 1, scratch);
  assert.strictEqual(first, scratch);
  assert.strictEqual(second, scratch);
  assert.strictEqual(second.origin, origin);
  assert.strictEqual(second.vel, velocity);
  assert.equal(second.skip, false);
});

test('impact families differ by structure and timing rather than tint alone', () => {
  const profiles = [
    'wpn_autocannon_m',
    'wpn_railgun_m',
    'wpn_plasma_cannon_m',
    'wpn_pulse_laser_s',
    'wpn_beam_laser_m',
    'wpn_missile_rack_m',
    'wpn_emp_disruptor_m',
  ].map((weaponId) => resolveImpactPresentationProfile(weaponId));
  assert.equal(new Set(profiles.map((profile) => profile.mode)).size, profiles.length);
  assert.equal(new Set(profiles.map((profile) => `${profile.life}:${profile.fragmentCount}`)).size, profiles.length);
  assert.ok(profiles.every((profile) => profile.primaryShape !== 'ring'));
});

test('pulse-bolt impact is a cyan ion sting, not plasma thermal splash', () => {
  const pulse = resolveImpactPresentationProfile('wpn_pulse_laser_s');
  const plasma = resolveImpactPresentationProfile('wpn_plasma_cannon_m');
  assert.equal(pulse.variant, 'pulse-bolt');
  assert.equal(pulse.mode, 'ion-sting');
  assert.equal(pulse.primaryShape, 'contact-slit');
  assert.notEqual(pulse.mode, plasma.mode);
  assert.notEqual(pulse.primaryShape, plasma.primaryShape);
  const pulseCore = Number.parseInt(pulse.coreColor.slice(1), 16);
  const pulseRed = (pulseCore >> 16) & 0xff;
  const pulseGreen = (pulseCore >> 8) & 0xff;
  assert.ok(pulseGreen > pulseRed * 2.5,
    `pulse impact must stay saturated cyan rather than inherit plasma orange: ${pulse.coreColor}`);
  const muzzle = resolveMuzzleProfile('wpn_pulse_laser_s', null);
  assert.equal(muzzle.variant, 'pulse-bolt');
  assert.equal(muzzle.lane, 'energy');
  const muzzleCore = Number.parseInt(muzzle.coreColor.slice(1), 16);
  const muzzleRed = (muzzleCore >> 16) & 0xff;
  const muzzleGreen = (muzzleCore >> 8) & 0xff;
  assert.ok(muzzleGreen > muzzleRed * 2.5,
    `pulse muzzle must ignite cyan, not near-white energy-lane default: ${muzzle.coreColor}`);
});

test('projectile hit payload carries normalized approach and contact normal', () => {
  const projectile = {
    ownerId: 7,
    vel: { x: 30, z: 40 },
    data: { weaponId: 'wpn_autocannon_m', damage: 5, damageType: 'kinetic' },
  };
  const target = { id: 9, pos: { x: 10, z: 20 } };
  const payload = projectileHitPayload(projectile, target, { x: 7, z: 24 });
  assert.deepEqual(payload.approach, { x: 0.6, z: 0.8 });
  assert.equal(payload.targetId, 9);
  assert.ok(Math.abs(Math.hypot(payload.normal.x, payload.normal.z) - 1) < 1e-12);
  assert.ok(payload.normal.x < 0 && payload.normal.z > 0);
});

test('continuous beam emits begin/update/end presentation phases without muzzle respawn ambiguity', () => {
  const events = [];
  const host = Object.create(weapons);
  host.bus = { emit: (name, payload) => events.push({ name, payload }) };
  host._beamFiring = new Set();
  host._beamFiringPrev = new Set();
  host._beamActiveMeta = new Map();
  host._hardpointDir = () => 0;
  host._muzzle = () => ({ x: 5, z: 7 });
  const state = { combat: { beams: [] } };
  const entity = { id: 41, factionId: 'test', pos: { x: 0, z: 0 }, rot: 0 };
  const weapon = { defId: 'wpn_beam_laser_m', slotIndex: 2, _heat: 0 };
  const def = { continuous: true, range: 250, damageType: 'energy' };

  host._serviceBeam(entity, weapon, def, true, 100, 1 / 60, state, 0, null);
  assert.equal(events.at(-1).name, 'combat:fire');
  assert.equal(events.at(-1).payload.phase, 'begin');
  assert.equal(events.at(-1).payload.continuous, true);
  assert.deepEqual(events.at(-1).payload.to, { x: 255, z: 7 });

  host._beamFiringPrev = new Set(host._beamFiring);
  host._beamFiring.clear();
  host._serviceBeam(entity, weapon, def, true, 100, 1 / 60, state, 0, null);
  assert.equal(events.at(-1).payload.phase, 'update');

  host._beamFiringPrev = new Set(host._beamFiring);
  host._beamFiring.clear();
  host._emitStoppedBeams();
  assert.equal(events.at(-1).name, 'combat:beamStop');
  assert.equal(events.at(-1).payload.phase, 'end');
  assert.equal(events.at(-1).payload.hardpointIdx, 2);
  assert.equal(events.at(-1).payload.ownerStillFiring, false);
});

test('per-hardpoint beam stop reports when the owner still has another live beam', () => {
  const events = [];
  const host = Object.create(weapons);
  host.bus = { emit: (name, payload) => events.push({ name, payload }) };
  host._beamFiringPrev = new Set(['ship:0', 'ship:1']);
  host._beamFiring = new Set(['ship:1']);
  host._beamActiveMeta = new Map([
    ['ship:0', { beamKey: 'ship:0', ownerId: 'ship', weaponId: 'beam', hardpointIdx: 0 }],
    ['ship:1', { beamKey: 'ship:1', ownerId: 'ship', weaponId: 'beam', hardpointIdx: 1 }],
  ]);
  host._emitStoppedBeams();
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.ownerStillFiring, true);
});

test('damage routing preserves presentation direction from projectile contact', () => {
  const packet = normalizeDamagePacket({
    channels: { kinetic: 3 },
    hit: {
      pos: { x: 10, z: 20 },
      approach: { x: 0.6, z: 0.8 },
      normal: { x: -0.8, z: 0.6 },
    },
  });
  assert.deepEqual(packet.hit.approach, { x: 0.6, z: 0.8 });
  assert.deepEqual(packet.hit.normal, { x: -0.8, z: 0.6 });
});
