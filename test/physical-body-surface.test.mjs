import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  collisionSurface,
  recordImpulseProvenance,
} from '../src/combat/impulseKernel.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { createBus } from '../src/core/eventBus.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';

const HULL = (id, team, x, mass = 16) => ({
  id, type: 'ship', alive: true, team, factionId: `faction_test_${team}`,
  pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 12, mass,
  hull: 300, hullMax: 300, armorHp: 0, armorMax: 0, armorFlat: 0, shield: 0, shieldMax: 0,
  cap: 100, capMax: 100, capRegen: 5, lastDamageT: -1e9, flags: {},
  data: { derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship', intent: { fire: false, moveX: 0, moveZ: 0 } },
});

const THROWABLE = (id, type, x, physicsBody) => ({
  id, type, alive: true, team: null,
  pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
  radius: 3, mass: physicsBody && physicsBody.mass || 1,
  physicsBody, flags: {}, data: {},
});

function harness(other) {
  const player = { ...HULL(1, 0, -600, 18), isPlayer: true, hull: 500, hullMax: 500 };
  const victim = HULL(2, 1, -400);
  const bus = createBus();
  const helpers = { combatPhysics: { applyImpulse: () => true } };
  const state = {
    tick: 100, simTime: 100 / 60, mode: 'flight', playerId: 1,
    entities: new Map([[player.id, player], [victim.id, victim], [other.id, other]]),
    entityList: [player, victim, other],
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: 47 },
  };
  const kernel = createCombatKernel({ state, bus, helpers, registry: { get: () => null } });
  const registry = { get: (name) => (name === 'combat' ? { kernel } : null) };
  const collisions = Object.create(collisionConsequences);
  collisions.init({ state, bus, helpers, registry });
  return { player, victim, bus, state, collisions };
}

function withConsequences(flags, fn) {
  const previous = { weaponImpulseConsequences: COMBAT_FLAGS.weaponImpulseConsequences };
  Object.assign(COMBAT_FLAGS, { weaponImpulseConsequences: true, ...flags });
  try { return fn(); } finally { Object.assign(COMBAT_FLAGS, previous); }
}

test('collisionSurface classifies authored physical bodies by material, not a closed type list', () => {
  assert.equal(collisionSurface({ type: 'pod' }), 'debris');
  assert.equal(collisionSurface({ type: 'prop' }), 'debris');
  assert.equal(collisionSurface({ type: 'buoy' }), 'debris');
  assert.equal(collisionSurface({ type: 'debris' }), 'debris');
  assert.equal(collisionSurface({ type: 'crate', physicsBody: { mass: 8 } }), 'debris');
  assert.equal(collisionSurface({ type: 'crate', physicsBody: { mass: 8, material: 'rock' } }), 'terrain');
  assert.equal(collisionSurface({ type: 'crate', physicsBody: { mass: 8, material: 'station' } }), 'structure');
  assert.equal(collisionSurface({ type: 'crate', physicsBody: { mass: 8, material: 'ship' } }), 'craft');
  assert.equal(collisionSurface({ type: 'slab', physicsBody: { mass: 8, dynamic: false } }), 'structure');
});

test('collisionSurface keeps ghosts, sensors, projectiles, and bodiless unknowns at zero', () => {
  assert.equal(collisionSurface({ type: 'fx', physicsBody: { mass: 8 } }), 'other');
  assert.equal(collisionSurface({ type: 'projectile', physicsBody: { mass: 8 } }), 'other');
  assert.equal(collisionSurface({ type: 'crate', physicsBody: { mass: 8, material: 'projectile' } }), 'other');
  assert.equal(collisionSurface({ type: 'crate', physicsBody: { mass: 8, material: 'massline_sensor' } }), 'other');
  assert.equal(collisionSurface({ type: 'crate', physicsBody: { mass: 8, material: 'sensor' } }), 'other');
  assert.equal(collisionSurface({ type: 'crate', collides: false, physicsBody: { mass: 8 } }), 'other');
  assert.equal(collisionSurface({ type: 'crate', physicsBody: { mass: 8, collides: false } }), 'other');
  assert.equal(collisionSurface({ type: 'crate', physicsBody: { mass: 0 } }), 'other');
  assert.equal(collisionSurface({ type: 'crate', physicsBody: false }), 'other');
  assert.equal(collisionSurface({ type: 'crate' }), 'other');
  assert.equal(collisionSurface(null), 'other');
});

test('a thrown crate with player provenance deals energy-scaled damage credited to the player', () => {
  withConsequences({}, () => {
    const crate = THROWABLE(9, 'crate', -420, { schemaVersion: 1, mass: 6, dynamic: true });
    const h = harness(crate);
    recordImpulseProvenance(crate, {
      actorId: h.player.id, weaponId: 'massline', tag: 'massline_throw',
      appliedTick: h.state.tick, magnitude: 540,
    });
    const packets = [];
    const damage = [];
    h.bus.on('combat:collisionConsequence', (p) => packets.push(p));
    h.bus.on('combat:damage', (p) => damage.push(p));
    h.bus.emit('physics:impact', {
      consequenceKernelVersion: 1, aId: crate.id, bId: h.victim.id,
      impulse: 640, dp: 640, tick: h.state.tick,
      pos: { x: -400, z: 0 }, normal: { x: 1, z: 0 }, preSolveClosingSpeed: 90,
    });
    assert.equal(packets.length, 1, 'one consequence packet for the damageable side of a crate-on-hull hit');
    assert.equal(packets[0].surface, 'debris');
    assert.ok(packets[0].impactDamage > 0, 'a massive thrown crate must do real damage');
    assert.equal(packets[0].provenance.actorId, h.player.id, 'the player keeps credit for what they threw');
    assert.ok(damage.length >= 1, 'the packet routes real hull damage');
  });
});

test('the same authored body with impactDamageScale 0 hits for nothing', () => {
  withConsequences({}, () => {
    const slab = THROWABLE(9, 'crate', -420, { schemaVersion: 1, mass: 6, dynamic: true, impactDamageScale: 0 });
    const h = harness(slab);
    recordImpulseProvenance(slab, {
      actorId: h.player.id, weaponId: 'massline', tag: 'massline_throw',
      appliedTick: h.state.tick, magnitude: 540,
    });
    const packets = [];
    const damage = [];
    h.bus.on('combat:collisionConsequence', (p) => packets.push(p));
    h.bus.on('combat:damage', (p) => damage.push(p));
    h.bus.emit('physics:impact', {
      consequenceKernelVersion: 1, aId: slab.id, bId: h.victim.id,
      impulse: 640, dp: 640, tick: h.state.tick,
      pos: { x: -400, z: 0 }, normal: { x: 1, z: 0 }, preSolveClosingSpeed: 90,
    });
    assert.equal(packets.length, 1);
    assert.equal(packets[0].surface, 'debris');
    assert.equal(packets[0].impactDamage, 0, 'an authored zero scale is honored');
    assert.equal(damage.length, 0, 'no damage packet is routed');
  });
});

test('a thrown pod hits for damage; a ghost fx entity hits for zero', () => {
  withConsequences({}, () => {
    const pod = THROWABLE(9, 'pod', -420, { schemaVersion: 1, mass: 5, dynamic: true });
    const fx = { id: 10, type: 'fx', alive: true, pos: { x: -420, z: 0 }, vel: { x: 0, z: 0 }, mass: 5, physicsBody: { mass: 5 }, flags: {}, data: {} };
    const h = harness(pod);
    h.state.entities.set(fx.id, fx);
    h.state.entityList.push(fx);
    recordImpulseProvenance(pod, {
      actorId: h.player.id, weaponId: 'massline', tag: 'massline_throw',
      appliedTick: h.state.tick, magnitude: 450,
    });
    const packets = [];
    h.bus.on('combat:collisionConsequence', (p) => packets.push(p));
    h.bus.emit('physics:impact', {
      consequenceKernelVersion: 1, aId: pod.id, bId: h.victim.id,
      impulse: 640, dp: 640, tick: h.state.tick,
      pos: { x: -400, z: 0 }, normal: { x: 1, z: 0 }, preSolveClosingSpeed: 90,
    });
    assert.equal(packets.length, 1);
    assert.equal(packets[0].surface, 'debris');
    assert.ok(packets[0].impactDamage > 0);
    packets.length = 0;
    h.bus.emit('physics:impact', {
      consequenceKernelVersion: 1, aId: fx.id, bId: h.victim.id,
      impulse: 640, dp: 640, tick: h.state.tick,
      pos: { x: -400, z: 0 }, normal: { x: 1, z: 0 }, preSolveClosingSpeed: 90,
    });
    assert.equal(packets.length, 1);
    assert.equal(packets[0].surface, 'other');
    assert.equal(packets[0].impactDamage, 0, 'a ghost fx body never deals collision damage');
  });
});
