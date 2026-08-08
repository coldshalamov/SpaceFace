import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import { createBus } from '../src/core/eventBus.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { DEFAULT_VFX_ADMISSION_PRIORITY, deriveVfxAdmissionMetadata } from '../src/presentation/vfxAdmissionPriority.js';
import { PhasedExplosionLifecycle } from '../src/render/combat/phasedExplosions.js';
import { vfx } from '../src/render/vfx.js';
import { buildKillPresentationReceipt, combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';

function ship(id, team, options = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    factionId: `faction_${team}`,
    pos: { x: options.x ?? 10, z: options.z ?? -4 },
    prevPos: { x: options.x ?? 10, z: options.z ?? -4 },
    vel: { x: options.vx ?? 30, z: options.vz ?? 4 },
    rot: 0,
    angVel: 0,
    radius: options.radius ?? 8,
    mass: options.mass ?? 20,
    hull: options.hull ?? 1,
    hullMax: options.hullMax ?? options.hull ?? 1,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    capRegen: 5,
    lastDamageT: -1e9,
    flags: {},
    data: {
      combatProfileId: 'combat_profile_standard_ship',
      derived: {
        damageReductionMult: 1,
        ramDamageDealtMult: options.ramDamageDealtMult ?? 0,
      },
    },
  };
}

function killState(target = ship(9, 1)) {
  const player = ship(1, 0, { hull: 140, hullMax: 140, vx: 0, vz: 0 });
  const entities = new Map([[player.id, player], [target.id, target]]);
  return {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: player.id,
    player: { targetId: target.id },
    meta: { seed: 47 },
    settings: {
      gameplay: { difficulty: 'standard' },
      video: { particleQuality: 'low', motionReduce: false, engineTrails: true },
      accessibility: { flashReduce: false },
    },
    content: {},
    combat: { entities: {}, beams: [] },
    entities,
    entityList: [...entities.values()],
    render: { scene: new THREE.Scene() },
  };
}

function weaponLethal(weaponId, overrides = {}) {
  return {
    origin: { kind: 'weapon', id: weaponId },
    packet: {
      source: { kind: 'weapon', weaponId },
      hit: {
        pos: { x: 14, z: -3 },
        approach: { x: 0.6, z: 0.8 },
        normal: { x: -0.6, z: -0.8 },
      },
    },
    ...overrides,
  };
}

function collisionLethal(surface) {
  return {
    origin: { kind: 'collision', id: surface },
    packet: {
      source: {
        kind: `collision_${surface}`,
        collisionPresentation: {
          position: { x: 45, z: 6 },
          direction: { x: 1, z: 0 },
          normal: { x: -1, z: 0 },
          surface,
          targetVelocity: { x: 72, z: 8 },
          impact: { deltaV: 26, exchangedMomentum: 1040, impactDamage: 88 },
        },
      },
    },
  };
}

function emitted(events, name) {
  return events.find((entry) => entry.event === name)?.payload || null;
}

test('kill presentation receipts classify all five causes from canonical lethal truth', () => {
  const target = ship(9, 1);
  const state = killState(target);
  const kinetic = buildKillPresentationReceipt(state, target, state.playerId, weaponLethal('wpn_autocannon_s'));
  const explosive = buildKillPresentationReceipt(state, target, state.playerId, weaponLethal('wpn_missile_rack_m'));
  const generic = buildKillPresentationReceipt(state, target, '1', weaponLethal('wpn_pulse_laser_s'));
  const terrain = buildKillPresentationReceipt(state, target, state.playerId, collisionLethal('terrain'));
  const craft = buildKillPresentationReceipt(state, target, state.playerId, collisionLethal('craft'));

  assert.deepEqual([generic.cause, kinetic.cause, explosive.cause, terrain.cause, craft.cause], [
    'generic', 'kinetic', 'explosive', 'terrain_collision', 'ship_collision',
  ]);
  assert.deepEqual(kinetic.position, { x: 14, z: -3 });
  assert.deepEqual(kinetic.direction, { x: 0.6, z: 0.8 });
  assert.deepEqual(kinetic.normal, { x: -0.6, z: -0.8 });
  assert.deepEqual(kinetic.targetVelocity, { x: 30, z: 4 });
  assert.equal(kinetic.playerCaused, true);
  assert.equal(generic.playerCaused, false, 'killer identity must remain exact, without string coercion');
  assert.equal(generic.surface, null);
  assert.equal(generic.impact, null);
  assert.equal(terrain.surface, 'terrain');
  assert.equal(craft.surface, 'craft');
  assert.deepEqual(terrain.impact, { deltaV: 26, exchangedMomentum: 1040, impactDamage: 88 });

  const unauthoredExplosive = buildKillPresentationReceipt(state, target, state.playerId, {
    origin: { kind: 'legacy', id: 'fake_explosion' },
    packet: { channels: { kinetic: 100, thermal: 100 }, source: { damageType: 'explosive' } },
  });
  assert.equal(unauthoredExplosive.cause, 'generic',
    'channel mixes and claimed legacy damage types cannot fabricate an authored explosive origin');
});

test('receipt and every nested record are immutable and remain event-only', () => {
  const target = ship(9, 1);
  const state = killState(target);
  const events = [];
  const bus = createBus();
  bus.on('entity:killed', (payload) => events.push({ event: 'entity:killed', payload }));
  const system = Object.create(combat);
  system.init({ state, bus, helpers: {}, registry: { get() { return null; } } });

  system.kill(target, state.playerId, weaponLethal('wpn_autocannon_s'));
  const event = emitted(events, 'entity:killed');
  assert.ok(event?.presentation);
  assert.equal(event.presentation.version, 1);
  for (const value of [
    event.presentation,
    event.presentation.position,
    event.presentation.direction,
    event.presentation.normal,
    event.presentation.targetVelocity,
  ]) assert.equal(Object.isFrozen(value), true);
  const impactReceipt = buildKillPresentationReceipt(state, target, state.playerId, collisionLethal('terrain'));
  assert.equal(Object.isFrozen(impactReceipt.impact), true);
  assert.throws(() => { event.presentation.position.x = 999; }, TypeError);
  assert.equal(Object.hasOwn(target, 'presentation'), false);
  assert.equal(Object.hasOwn(state, 'presentation'), false);
  assert.doesNotMatch(JSON.stringify(state), /terrain_collision|ship_collision|"presentation"/,
    'transient presentation data must not enter entity, state, or save-shaped graphs');
});

test('authored projectile routing preserves the real approach and surface normal through death', () => {
  const target = ship(9, 1, { hull: 4, vx: -6, vz: 2 });
  const state = killState(target);
  const bus = createBus();
  const kills = [];
  bus.on('entity:killed', (payload) => kills.push(payload));
  const system = Object.create(combat);
  system.init({ state, bus, helpers: {}, registry: { get() { return null; } } });

  system.onHit({
    targetId: target.id,
    ownerId: state.playerId,
    weaponId: 'wpn_autocannon_s',
    pos: { x: 13, z: -2 },
    damagePacket: {
      channels: { kinetic: 20 },
      source: { kind: 'weapon', weaponId: 'wpn_autocannon_s' },
      hit: {
        pos: { x: 13, z: -2 },
        approach: { x: 0.8, z: 0.6 },
        normal: { x: -0.8, z: -0.6 },
      },
    },
  });

  assert.equal(kills.length, 1);
  assert.equal(kills[0].presentation.cause, 'kinetic');
  assert.deepEqual(kills[0].presentation.position, { x: 13, z: -2 });
  assert.deepEqual(kills[0].presentation.direction, { x: 0.8, z: 0.6 });
  assert.deepEqual(kills[0].presentation.normal, { x: -0.8, z: -0.6 });
  assert.deepEqual(kills[0].presentation.targetVelocity, { x: -6, z: 2 });
  assert.equal(kills[0].presentation.playerCaused, true);
});

test('real lethal terrain and Ram-Plate contacts survive synchronous damage routing', () => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  try {
    const terrainTarget = ship(9, 1, { hull: 1, vx: 84, vz: -12 });
    const terrain = { id: 90, type: 'asteroid', alive: true, pos: { x: 46, z: 6 }, vel: { x: 0, z: 0 }, radius: 40, mass: 1e6, data: {} };
    const terrainState = killState(terrainTarget);
    terrainState.entities.set(terrain.id, terrain);
    terrainState.entityList.push(terrain);
    const terrainBus = createBus();
    const terrainKills = [];
    terrainBus.on('entity:killed', (payload) => terrainKills.push(payload));
    const terrainCombat = Object.create(combat);
    terrainCombat.init({ state: terrainState, bus: terrainBus, helpers: {}, registry: { get() { return null; } } });
    const terrainSystem = Object.create(collisionConsequences);
    terrainSystem.init({ state: terrainState, bus: terrainBus, registry: { get(name) { return name === 'combat' ? terrainCombat : null; } } });
    recordImpulseProvenance(terrainTarget, {
      actorId: terrainState.playerId,
      weaponId: 'wpn_concussion_cannon_m',
      tag: 'concussion_blast',
      appliedTick: terrainState.tick,
      magnitude: 5000,
    });
    terrainBus.emit('physics:impact', {
      consequenceKernelVersion: 1,
      tick: terrainState.tick,
      aId: terrainTarget.id,
      bId: terrain.id,
      impulse: 5000,
      pos: { x: 45, z: 6 },
      normal: { x: -1, z: 0 },
    });
    assert.equal(terrainKills.length, 1);
    assert.deepEqual(terrainKills[0].presentation, {
      version: 1,
      cause: 'terrain_collision',
      position: { x: 45, z: 6 },
      direction: terrainKills[0].presentation.direction,
      normal: { x: -1, z: 0 },
      surface: 'terrain',
      targetVelocity: { x: 84, z: -12 },
      playerCaused: true,
      impact: terrainKills[0].presentation.impact,
    });
    assert.ok(terrainKills[0].presentation.impact.impactDamage > 0);
    assert.ok(terrainKills[0].presentation.impact.exchangedMomentum > 0);
    assert.ok(Math.abs(terrainKills[0].presentation.direction.x - 0.9899494936611665) < 1e-12);
    assert.ok(Math.abs(terrainKills[0].presentation.direction.z + 0.1414213562373095) < 1e-12);

    terrainSystem.destroy();
    terrainBus.clear();

    const ramTarget = ship(19, 1, { hull: 1, vx: 0, vz: 0 });
    const ramState = killState(ramTarget);
    const ramPlayer = ramState.entities.get(ramState.playerId);
    ramPlayer.vel = { x: 90, z: 0 };
    ramPlayer.data.derived.ramDamageDealtMult = 1.8;
    const ramBus = createBus();
    const ramKills = [];
    ramBus.on('entity:killed', (payload) => ramKills.push(payload));
    const ramCombat = Object.create(combat);
    ramCombat.init({ state: ramState, bus: ramBus, helpers: {}, registry: { get() { return null; } } });
    const ramSystem = Object.create(collisionConsequences);
    ramSystem.init({ state: ramState, bus: ramBus, registry: { get(name) { return name === 'combat' ? ramCombat : null; } } });
    ramBus.emit('physics:impact', {
      consequenceKernelVersion: 1,
      tick: ramState.tick,
      aId: ramTarget.id,
      bId: ramPlayer.id,
      impulse: 5000,
      pos: { x: 12, z: -3 },
      normal: { x: 0, z: 1 },
    });
    assert.equal(ramKills.length, 1);
    assert.equal(ramKills[0].presentation.cause, 'ship_collision');
    assert.equal(ramKills[0].presentation.surface, 'craft');
    assert.equal(ramKills[0].presentation.playerCaused, true);
    assert.deepEqual(ramKills[0].presentation.targetVelocity, { x: 0, z: 0 });
    assert.deepEqual(ramKills[0].presentation.direction, { x: 1, z: 0 },
      'a moving Ram-Plate counterpart supplies the killing direction even when the victim was stationary');

    ramSystem.destroy();
    ramBus.clear();
  } finally {
    COMBAT_FLAGS.weaponImpulseConsequences = previous;
  }
});

test('VFX prefers nested receipt truth while legacy kill events remain compatible', () => {
  const state = killState();
  const harness = Object.create(vfx);
  harness.state = state;
  harness._scene = state.render.scene;
  harness._explosions = new PhasedExplosionLifecycle({ capacity: 2 });
  const payload = {
    id: 9,
    killerId: state.playerId,
    type: 'ship',
    pos: { x: -999, z: -999 },
    direction: { x: -1, z: 0 },
    presentation: buildKillPresentationReceipt(state, state.entities.get(9), state.playerId,
      collisionLethal('terrain')),
  };
  assert.equal(harness._queueExplosion(payload, 'ordinary'), true);
  const entry = harness._explosions.entries.find((candidate) => candidate.active);
  const admission = deriveVfxAdmissionMetadata(payload, state);
  assert.deepEqual({ x: entry.x, z: entry.z }, payload.presentation.position);
  assert.deepEqual({ x: entry.dirX, z: entry.dirZ }, payload.presentation.direction);
  assert.deepEqual({ x: entry.normalX, z: entry.normalZ }, payload.presentation.normal);
  assert.deepEqual(
    { x: entry.targetVelocityX, z: entry.targetVelocityZ },
    payload.presentation.targetVelocity,
  );
  assert.equal(entry.cause, 'terrain_collision');
  assert.equal(entry.priority, admission.admissionPriority);

  const legacy = { id: 10, type: 'ship', pos: { x: 4, z: 8 }, direction: { x: 0, z: 1 } };
  assert.equal(harness._queueExplosion(legacy, 'ordinary'), true);
  const legacyEntry = harness._explosions.entries.find((candidate) => candidate.active && candidate !== entry);
  assert.equal(legacyEntry.cause, 'generic');
  assert.deepEqual({ x: legacyEntry.dirX, z: legacyEntry.dirZ }, legacy.direction);
  assert.equal(legacyEntry.hasNormal, false);
  assert.deepEqual(
    { x: legacyEntry.targetVelocityX, z: legacyEntry.targetVelocityZ },
    { x: 0, z: 0 },
  );
});

test('phased lifecycle normalizes, saturates, resets, and drains causal residents', () => {
  const lifecycle = new PhasedExplosionLifecycle({ capacity: 1 });
  const first = lifecycle.start({
    classId: 'ordinary',
    cause: 'explosive',
    normal: { x: 3, z: 4 },
    targetVelocity: { x: 72, z: -8 },
    direction: { x: 0, z: 1 },
    priority: 0.8,
  });
  assert.equal(first.cause, 'explosive');
  assert.deepEqual({ x: first.normalX, z: first.normalZ }, { x: 0.6, z: 0.8 });
  assert.equal(first.hasNormal, true);
  assert.deepEqual({ x: first.targetVelocityX, z: first.targetVelocityZ }, { x: 72, z: -8 });
  assert.equal(lifecycle.start({ cause: 'terrain_collision', priority: 0.2 }), null,
    'weaker work cannot displace a stronger causal resident');

  const replacement = lifecycle.start({
    cause: 'not-a-real-cause',
    normal: { x: Number.NaN, z: Infinity },
    targetVelocity: { x: Infinity, z: Number.NaN },
    priority: 0.95,
  });
  assert.equal(replacement, first);
  assert.equal(replacement.cause, 'generic');
  assert.equal(replacement.hasNormal, false);
  assert.deepEqual(
    { x: replacement.targetVelocityX, z: replacement.targetVelocityZ },
    { x: 0, z: 0 },
  );

  lifecycle.clear();
  assert.equal(lifecycle.activeCount, 0);
  assert.equal(replacement.cause, 'generic');
  assert.equal(replacement.priority, DEFAULT_VFX_ADMISSION_PRIORITY);
  assert.equal(replacement.hasNormal, false);
  assert.equal(replacement.normalX, 0);
  assert.equal(replacement.normalZ, 0);
  assert.equal(replacement.targetVelocityX, 0);
  assert.equal(replacement.targetVelocityZ, 0);
  assert.equal(replacement.dirX, 1);
  assert.equal(replacement.dirZ, 0);

  const draining = lifecycle.start({
    cause: 'ship_collision',
    direction: { x: 0, z: -1 },
    priority: 0.7,
  });
  lifecycle.update(10, () => {});
  assert.equal(lifecycle.activeCount, 0);
  assert.equal(draining.active, false);
  assert.equal(draining.cause, 'generic');
  assert.equal(draining.dirX, 1);
  assert.equal(draining.dirZ, 0);
});
