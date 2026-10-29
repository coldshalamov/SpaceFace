import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { combat } from '../src/systems/combat.js';
import { physics } from '../src/core/physics.js';
import { weapons } from '../src/systems/weapons.js';
import { WEAPONS } from '../src/data/weapons.js';
import { SWARM_BROOD_FAMILIES } from '../src/data/swarmBrood.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { createSwarmFortifyEffects } from '../src/systems/swarmFortifyEffects.js';
import { swarmArena } from '../src/systems/swarmArena.js';

function runState(sim, wave = 1) {
  sim.state.mode = 'flight';
  // Keep this fixture on the canonical scalar physics authority; it has no native Rapier owner.
  sim.state.settings.gameplay.physicsBackend = 'custom';
  sim.state.ui.screenStack = [];
  sim.state.ui.docked = false;
  sim.state.render.sectorShellAdmission = false;
  sim.state.run = {
    kind: 'survival', ruleset: 'swarm', phase: 'active', wave,
    seed: 8181, credits: 1000, score: 0,
  };
}

function ship(sim, { x, z, team, wave = 1, idTag = 'hostile', hull = 100 } = {}) {
  return sim.spawn({
    type: 'ship', team, factionId: team === 0 ? 'faction_player' : 'faction_brood',
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 8, mass: 24, hull, hullMax: hull, armorHp: 0, shield: 0,
    collides: true, data: team === 0 ? { combatProfileId: 'combat_profile_standard_ship' } : {
      combatProfileId: 'combat_profile_standard_ship', runCohort: 'survival', runWave: wave,
      ai: { forcePlayerTarget: true, archetype: idTag }, weapons: [{ id: 'wpn_pulse_laser_s' }],
    },
  });
}

function fortifyEntity(sim, deviceId, x, z, marker = {}) {
  return sim.spawn({
    type: 'beacon', ownerId: sim.state.playerId, team: 0, factionId: 'faction_player',
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    radius: deviceId === 'kinetic_turret' ? 16 : 8, mass: 300, hull: 90, hullMax: 90,
    collides: true,
    data: { swarmFortify: {
      schemaVersion: 1, deviceId, requestId: 1, runWave: 1, socketId: 'front-near',
      runToken: 11, ordinal: 1, operational: true, ...marker,
    } },
  });
}

test('Tesla pair damages only current-wave hostiles intersecting its live segment at its cadence', () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 8181, bus, systems: [combat] });
  runState(sim, 3); // Structures bought in an earlier wave remain operational.
  const player = ship(sim, { x: -300, z: 300, team: 0 });
  sim.state.playerId = player.id;
  const endpointA = fortifyEntity(sim, 'tesla_pair', -50, 0, { pairId: 'pair-a', endpointIndex: 0 });
  const endpointB = fortifyEntity(sim, 'tesla_pair', 50, 0, { pairId: 'pair-a', endpointIndex: 1 });
  const currentHostile = ship(sim, { x: 0, z: 0, team: 1, wave: 3 });
  const friendly = ship(sim, { x: 0, z: 2, team: 0 });
  const staleHostile = ship(sim, { x: 0, z: 3, team: 1, wave: 2 });
  noteSwarmPilotAction(sim.state);

  const receipts = [];
  const teslaFire = [], teslaStop = [];
  bus.on('combat:damage', (receipt) => receipts.push(receipt));
  bus.on('combat:fire', (receipt) => { if (receipt.fortifyDeviceId === 'tesla_pair') teslaFire.push(receipt); });
  bus.on('combat:beamStop', (receipt) => { if (receipt.fortifyDeviceId === 'tesla_pair') teslaStop.push(receipt); });
  const effects = createSwarmFortifyEffects({ state: sim.state, bus, helpers: sim.helpers, registry: sim.registry });
  const pair = [endpointA, endpointB].map((entity, endpointIndex) => ({
    entityId: entity.id, entity, deviceId: 'tesla_pair', socketId: 'front-near', requestId: 1,
    pairId: 'pair-a', endpointIndex, runToken: 11, ordinal: 1,
  }));

  effects.update(1 / 60, pair);
  const firstHull = currentHostile.hull;
  assert.ok(firstHull < 100, 'a real combat route applies the energy packet');
  assert.equal(friendly.hull, 100, 'the arc never hits its own team');
  assert.equal(staleHostile.hull, 100, 'the arc does not hit a prior wave remnant');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].attackerId, endpointA.id);
  assert.equal(receipts[0].targetId, currentHostile.id);
  assert.equal(receipts[0].origin.id, 'swarm_tesla_pair');
  assert.equal(teslaFire.length, 1);
  assert.deepEqual(teslaFire[0].from, { x: endpointA.pos.x, z: endpointA.pos.z });
  assert.deepEqual(teslaFire[0].to, { x: endpointB.pos.x, z: endpointB.pos.z });
  assert.equal(teslaFire[0].continuous, true, 'the shared beam presenter receives the actual Tesla segment');
  assert.equal(teslaStop.length, 1);
  assert.equal(teslaStop[0].beamKey, teslaFire[0].beamKey, 'the beam presenter receives the cooling stop');

  sim.state.tick = 71;
  effects.update(1 / 60, pair);
  assert.equal(currentHostile.hull, firstHull, 'the sweep respects the 72-tick cadence');
  sim.state.tick = 72;
  effects.update(1 / 60, pair);
  assert.ok(currentHostile.hull < firstHull, 'the next scheduled arc applies another real hit');
  assert.equal(receipts.length, 2);
  effects.remove(endpointA.id);
});

test('kinetic turret spends finite ammo on a canonical projectile that physics routes to damage', () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 8181, bus, systems: [physics, weapons, combat],
    updateOrder: [physics, weapons, combat] });
  runState(sim);
  const player = ship(sim, { x: -300, z: 300, team: 0 });
  sim.state.playerId = player.id;
  const turret = fortifyEntity(sim, 'kinetic_turret', 0, 0, { ammo: 1 });
  const friendly = ship(sim, { x: 10, z: 40, team: 0 });
  const hostile = ship(sim, { x: 120, z: 0, team: 1 });
  noteSwarmPilotAction(sim.state);
  const receipts = [];
  bus.on('combat:damage', (receipt) => receipts.push(receipt));
  const effects = createSwarmFortifyEffects({ state: sim.state, bus, helpers: sim.helpers, registry: sim.registry });
  const structures = new Map([[turret.id, { entityId: turret.id, entity: turret, deviceId: 'kinetic_turret',
    socketId: 'front-near', requestId: 1, runToken: 11, ordinal: 1 }]]);

  effects.update(1 / 60, structures);
  const projectiles = sim.state.entityList.filter((entity) => entity.type === 'projectile' && entity.ownerId === turret.id);
  assert.equal(projectiles.length, 1);
  assert.equal(projectiles[0].data.weaponId, 'wpn_autocannon_s');
  assert.equal(projectiles[0].data.damageType, 'kinetic');
  assert.ok(projectiles[0].data.damagePacket.channels.kinetic > 0);
  assert.equal(turret.data.swarmFortify.ammo, 0);

  const physicsOwner = sim.registry.get('physics');
  for (let tick = 0; tick < 40; tick++) {
    physicsOwner.update(1 / 60, sim.state);
    sim.state.tick += 1;
    sim.state.simTime += 1 / 60;
  }
  assert.ok(hostile.hull < 100, 'the canonical projectile sweep routed a hit into combat damage');
  assert.equal(friendly.hull, 100, 'the turret ignores nearby same-team craft');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].attackerId, turret.id);
  assert.equal(receipts[0].targetId, hostile.id);
  assert.equal(receipts[0].origin.id, 'wpn_autocannon_s');

  const before = sim.state.entityList.filter((entity) => entity.type === 'projectile').length;
  sim.state.tick = 60;
  effects.update(1 / 60, structures);
  assert.equal(sim.state.entityList.filter((entity) => entity.type === 'projectile').length, before,
    'empty magazine prevents a second canonical shot');
  sim.dispose();
});

test('kinetic turret acquires the nearest live Brood target and physical rock occlusion still wins', () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 8181, bus,
    systems: [swarmArena, physics, weapons, combat],
    updateOrder: [swarmArena, physics, weapons, combat] });
  runState(sim);
  sim.state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 8181 });
  sim.state.run.phase = 'active';
  sim.state.run.wave = 1;
  const player = ship(sim, { x: -300, z: 300, team: 0 });
  sim.state.playerId = player.id;
  const turret = fortifyEntity(sim, 'kinetic_turret', 0, 0, { ammo: 2 });
  const arena = sim.registry.get('swarmArena');
  const brood = arena._brood;
  brood.prepareWave(sim.state.run, 1);
  brood.spawnWave(sim.state);
  const bodies = brood._bodies;
  const miteFamily = bodies.liveFamilyId.indexOf('mite');
  const targets = [];
  for (let i = 0; i < bodies.alive.length; i++) {
    if (!bodies.alive[i]) continue;
    bodies.px[i] = 10000 + i * 80;
    bodies.pz[i] = 10000;
    bodies.vx[i] = bodies.vz[i] = 0;
    if (bodies.family[i] === miteFamily && targets.length < 2) targets.push(i);
  }
  assert.equal(targets.length, 2);
  const [nearestSlot, occludedSlot] = targets;
  bodies.px[nearestSlot] = 120;
  bodies.pz[nearestSlot] = 0;
  bodies.hp[nearestSlot] = 8;
  bodies.px[occludedSlot] = 160;
  bodies.pz[occludedSlot] = 0;
  bodies.hp[occludedSlot] = 8;
  brood.step(sim.state); // publish the live positions into the retained target grid.

  const killReceipts = [];
  bus.on('swarm:broodKills', (receipt) => killReceipts.push(receipt));
  const effects = createSwarmFortifyEffects({ state: sim.state, bus, helpers: sim.helpers, registry: sim.registry });
  const structures = new Map([[turret.id, { entityId: turret.id, entity: turret, deviceId: 'kinetic_turret',
    socketId: 'front-near', requestId: 1, runToken: 11, ordinal: 1 }]]);

  effects.update(1 / 60, structures);
  let shot = sim.state.entityIndex.projectiles.find((entity) => entity.ownerId === turret.id && entity.alive);
  assert.ok(shot, 'the turret fires even though no full-entity ship or drone is present');
  for (let tick = 0; tick < 26; tick++) {
    sim.registry.get('physics').update(1 / 60, sim.state);
    sim.state.tick += 1;
    sim.state.simTime += 1 / 60;
  }
  assert.equal(bodies.alive[nearestSlot], 0,
    'the cannon round was led into the nearest real Brood life and killed through the canonical sweep');
  assert.equal(killReceipts.length, 1);
  assert.equal(killReceipts[0].count, 1, 'a valid owned Fortify turret receives the canonical credited kill');
  assert.equal(killReceipts[0].environmentalCount, 0);
  assert.equal(turret.data.swarmFortify.ammo, 1);

  const rock = sim.spawn({ type: 'asteroid', pos: { x: 45, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, mass: 100, hull: 200, hullMax: 200, collides: true });
  sim.state.tick = 30;
  effects.update(1 / 60, structures);
  shot = sim.state.entityIndex.projectiles.find((entity) => entity.ownerId === turret.id && entity.alive);
  assert.ok(shot, 'the next cadence targets the remaining live Brood body');
  const ammoAfterLaunch = turret.data.swarmFortify.ammo;
  for (let tick = 0; tick < 40; tick++) {
    sim.registry.get('physics').update(1 / 60, sim.state);
    sim.state.tick += 1;
    sim.state.simTime += 1 / 60;
  }
  assert.equal(rock.alive, true);
  assert.equal(bodies.alive[occludedSlot], 1, 'the rock occludes the target on the real projectile path');
  assert.equal(killReceipts.length, 1, 'an occluded Brood life gets no fabricated kill receipt');
  assert.equal(turret.data.swarmFortify.ammo, ammoAfterLaunch,
    'a fired round consumes finite ammo even when a physical blocker wins');
  effects.remove(turret.id);
  sim.dispose();
});

test('turret reload stages ammo until paid, rolls back on rejection, and holds fire through charge commit', () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 8181, bus, systems: [physics, weapons, combat],
    updateOrder: [physics, weapons, combat] });
  runState(sim);
  const player = ship(sim, { x: -300, z: 300, team: 0 });
  sim.state.playerId = player.id;
  const turret = fortifyEntity(sim, 'kinetic_turret', 0, 0, { ammo: 0 });
  const effects = createSwarmFortifyEffects({ state: sim.state, bus, helpers: sim.helpers, registry: sim.registry });
  const structures = [{ entityId: turret.id, entity: turret, deviceId: 'kinetic_turret',
    socketId: 'front-near', requestId: 1, runToken: 11, ordinal: 1 }];
  sim.state.run.phase = 'refit';

  const rejectedPurchase = effects.prepareTurretReload(turret.id, 11, 32);
  assert.equal(rejectedPurchase.ok, true);
  assert.equal(turret.data.swarmFortify.ammo, 0, 'preparation has no visible state change');
  assert.equal(rejectedPurchase.commit().ok, true);
  assert.equal(turret.data.swarmFortify.ammo, 32, 'the purchase callback can stage its world effect');
  assert.equal(rejectedPurchase.rollback().ok, true);
  assert.equal(turret.data.swarmFortify.ammo, 0, 'a failed wallet commit restores the exact prior ammo');
  assert.equal(effects.prepareTurretReload(turret.id, 12, 32).reason, 'invalid_turret');

  const paidPurchase = effects.prepareTurretReload(turret.id, 11, 32);
  assert.equal(paidPurchase.commit().ok, true);
  sim.state.run.phase = 'active';
  ship(sim, { x: 120, z: 0, team: 1, wave: 1 });
  effects.update(1 / 60, structures);
  assert.equal(sim.state.entityList.filter((entity) => entity.type === 'projectile' && entity.ownerId === turret.id).length, 0,
    'a synchronous run:spent listener cannot fire/refund the staged magazine before finalization');
  assert.equal(paidPurchase.finalize().ok, true);
  effects.update(1 / 60, structures);
  assert.equal(sim.state.entityList.filter((entity) => entity.type === 'projectile' && entity.ownerId === turret.id).length, 1);
  assert.equal(turret.data.swarmFortify.ammo, 31);
  effects.remove(turret.id);
  sim.dispose();
});

test('combat hull repair preflights groups, clamps health, and rejects dead endpoints atomically', () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 8181, bus, systems: [combat] });
  const first = fortifyEntity(sim, 'kinetic_turret', 0, 0);
  const second = fortifyEntity(sim, 'kinetic_turret', 40, 0);
  first.hull = 30;
  second.hull = 80;
  const receipts = [];
  bus.on('combat:hullRepair', (receipt) => receipts.push(receipt));

  const repaired = sim.helpers.repairCombatHulls([
    { entityId: first.id, amount: 90 },
    { entityId: second.id, amount: 50 },
  ], { reason: 'swarm_fortify' });
  assert.equal(repaired.ok, true);
  assert.equal(first.hull, 90);
  assert.equal(second.hull, 90);
  assert.equal(repaired.repairs[0].applied, 60);
  assert.equal(repaired.repairs[1].applied, 10);
  assert.deepEqual(receipts[0].source, { reason: 'swarm_fortify' });

  first.hull = 30;
  second.hull = 0;
  second.alive = false;
  const rejected = sim.helpers.repairCombatHulls([
    { entityId: first.id, amount: 20 },
    { entityId: second.id, amount: 20 },
  ], { reason: 'swarm_fortify' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'entity_unavailable');
  assert.equal(first.hull, 30, 'preflight prevents partial repair when a linked endpoint is dead');
  assert.equal(receipts.length, 1, 'rejected repair does not emit a success receipt');
  sim.dispose();
});

test('prepared hull repair stays silent until finalized and can roll back a failed purchase', () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 8181, bus, systems: [combat] });
  const first = fortifyEntity(sim, 'kinetic_turret', 0, 0);
  const second = fortifyEntity(sim, 'kinetic_turret', 40, 0);
  first.hull = 30;
  second.hull = 70;
  const receipts = [];
  bus.on('combat:hullRepair', (receipt) => receipts.push(receipt));

  const refused = sim.helpers.prepareRepairCombatHulls([
    { entityId: first.id, amount: 20 }, { entityId: second.id, amount: 20 },
  ], { requestId: 4 });
  assert.equal(first.hull, 30, 'preflight does not apply a free repair');
  assert.equal(refused.commit().ok, true);
  assert.equal(first.hull, 50);
  assert.equal(receipts.length, 0, 'wallet listeners do not see a success before purchase acceptance');
  assert.equal(refused.rollback(), true);
  assert.equal(first.hull, 30);
  assert.equal(second.hull, 70);
  assert.equal(receipts.length, 0, 'rollback emits no repair success');

  const accepted = sim.helpers.prepareRepairCombatHulls([
    { entityId: first.id, amount: 20 }, { entityId: second.id, amount: 20 },
  ], { requestId: 5 });
  assert.equal(accepted.commit().ok, true);
  const receipt = accepted.finalize();
  assert.equal(receipt.ok, true);
  assert.equal(accepted.finalize(), receipt, 'finalize is idempotent');
  assert.equal(receipts.length, 1);
  sim.dispose();
});

test('Tesla and projectile contacts damage real Brood lives and pay one receipt per kill', () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 8181, bus, systems: [swarmArena] });
  sim.state.mode = 'flight';
  sim.state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 8181 });
  sim.state.run.phase = 'active';
  sim.state.run.wave = 1;
  const player = ship(sim, { x: -300, z: 300, team: 0 });
  sim.state.playerId = player.id;
  const arena = sim.registry.get('swarmArena');
  const brood = arena._brood;
  brood.prepareWave(sim.state.run, 1);
  brood.spawnWave(sim.state);
  const bodies = brood._bodies;
  let miteFamily = -1;
  for (let i = 0; i < bodies.liveFamilyId.length; i++) if (bodies.liveFamilyId[i] === 'mite') miteFamily = i;
  assert.ok(miteFamily >= 0, 'the authored Brood mite is live in this wave');
  const slots = [];
  for (let i = 0; i < bodies.alive.length && slots.length < 2; i++) {
    if (!bodies.alive[i]) continue;
    bodies.px[i] = 10000;
    bodies.pz[i] = 10000;
    if (bodies.family[i] === miteFamily) slots.push(i);
  }
  assert.equal(slots.length, 2);
  const [teslaSlot, projectileSlot] = slots;
  const teslaEndpoint = fortifyEntity(sim, 'tesla_pair', -50, 0, { pairId: 'pair-credit', endpointIndex: 0 });
  const teslaOtherEndpoint = fortifyEntity(sim, 'tesla_pair', 50, 0, { pairId: 'pair-credit', endpointIndex: 1 });
  bodies.px[teslaSlot] = 25; bodies.pz[teslaSlot] = 0; bodies.hp[teslaSlot] = 5;
  bodies.px[projectileSlot] = 75; bodies.pz[projectileSlot] = 0; bodies.hp[projectileSlot] = 5;
  brood.step(sim.state); // build the same retained spatial grid the live physics hook reads.
  const killReceipts = [], awards = [], projectileReceipts = [], teslaReceipts = [];
  bus.on('swarm:broodKills', (receipt) => killReceipts.push(receipt));
  bus.on('run:awardRequested', (receipt) => awards.push(receipt));
  bus.on('swarm:broodProjectileHit', (receipt) => projectileReceipts.push(receipt));
  bus.on('swarm:broodTeslaHit', (receipt) => teslaReceipts.push(receipt));

  const effects = createSwarmFortifyEffects({ state: sim.state, bus, helpers: sim.helpers, registry: sim.registry });
  effects.update(1 / 60, new Map([
    [teslaEndpoint.id, { entityId: teslaEndpoint.id, entity: teslaEndpoint, deviceId: 'tesla_pair',
      runToken: 11, pairId: 'pair-credit', endpointIndex: 0 }],
    [teslaOtherEndpoint.id, { entityId: teslaOtherEndpoint.id, entity: teslaOtherEndpoint, deviceId: 'tesla_pair',
      runToken: 11, pairId: 'pair-credit', endpointIndex: 1 }],
  ]));
  assert.equal(bodies.alive[teslaSlot], 0, 'the Brood owner retires the hit typed-array life');
  assert.equal(teslaReceipts.length, 1);
  assert.equal(teslaReceipts[0].targetId, `cell:${bodies.serial[teslaSlot]}`);
  assert.equal(teslaReceipts[0].ownerId, teslaEndpoint.id, 'the live owned endpoint is the credited Tesla source');
  assert.equal(awards.length, 1, 'a live owned Tesla endpoint receives credited Brood kills');

  const request = { from: { x: 50, z: 0 }, to: { x: 100, z: 0 }, radius: 0 };
  const candidate = arena.queryBroodProjectileHit(request, {});
  assert.equal(candidate.kind, 'cell');
  assert.equal(candidate.slot, projectileSlot);
  const originalLife = bodies.serial[projectileSlot];
  bodies.serial[projectileSlot] = originalLife + 1;
  const projectile = sim.spawn({ type: 'projectile', ownerId: player.id, pos: { x: 50, z: 0 },
    vel: { x: 1, z: 0 }, radius: 1, damage: 10, alive: true, data: {} });
  assert.equal(arena.commitBroodProjectileHit(candidate, { projectileId: 9001, ownerId: player.id,
    damage: 10, sourceId: 'wpn_autocannon_s', damageType: 'kinetic' }).reason, 'stale_brood_contact',
    'a numeric id without a current projectile entity cannot consume a Brood life');
  assert.equal(arena.commitBroodProjectileHit(candidate, { projectileId: projectile.id, ownerId: player.id,
    damage: 10, sourceId: 'wpn_autocannon_s', damageType: 'kinetic' }).reason, 'stale_brood_life');
  bodies.serial[projectileSlot] = originalLife;
  const current = arena.queryBroodProjectileHit(request, {});
  const hit = arena.commitBroodProjectileHit(current, { projectileId: projectile.id, ownerId: player.id,
    damage: 10, sourceId: 'wpn_autocannon_s', damageType: 'kinetic' });
  assert.equal(hit.ok, true);
  assert.equal(bodies.alive[projectileSlot], 0);
  assert.equal(arena.commitBroodProjectileHit(current, { projectileId: projectile.id, ownerId: player.id,
    damage: 10, sourceId: 'wpn_autocannon_s', damageType: 'kinetic' }).reason, 'stale_brood_contact');
  assert.equal(projectileReceipts.length, 1, 'one canonical Brood projectile receipt is published');
  assert.equal(killReceipts.reduce((sum, row) => sum + row.count, 0), 2);
  assert.equal(awards.length, 2, 'each paid Brood life generates one run award intent');
  sim.dispose();
});

test('default Rapier projectile sweep chooses nearest collider against Brood without double hits', async () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 8181, bus, systems: [swarmArena, physics, weapons, combat] });
  runState(sim);
  sim.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  sim.state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 8181 });
  sim.state.run.phase = 'active';
  sim.state.run.wave = 1;
  const player = ship(sim, { x: -300, z: 300, team: 0 });
  sim.state.playerId = player.id;
  const turret = fortifyEntity(sim, 'kinetic_turret', 0, 0, { ammo: 1 });
  const enemy = ship(sim, { x: 150, z: 0, team: 1, wave: 1 });
  const arena = sim.registry.get('swarmArena');
  const brood = arena._brood;
  brood.prepareWave(sim.state.run, 1);
  brood.spawnWave(sim.state);
  const bodies = brood._bodies;
  let miteFamily = -1;
  for (let i = 0; i < bodies.liveFamilyId.length; i++) if (bodies.liveFamilyId[i] === 'mite') miteFamily = i;
  const slots = [];
  for (let i = 0; i < bodies.alive.length && slots.length < 3; i++) {
    if (!bodies.alive[i]) continue;
    bodies.px[i] = 10000; bodies.pz[i] = 10000;
    slots.push(i);
  }
  assert.equal(slots.length, 3);
  for (const slot of slots) bodies.family[slot] = miteFamily;
  bodies.px[slots[0]] = 60; bodies.pz[slots[0]] = 0; bodies.hp[slots[0]] = 5;
  bodies.px[slots[1]] = 70; bodies.pz[slots[1]] = 0; bodies.hp[slots[1]] = 5;
  bodies.px[slots[2]] = 70; bodies.pz[slots[2]] = 0; bodies.hp[slots[2]] = 5;
  brood.step(sim.state);
  const broodHits = [];
  const projectileHits = [];
  bus.on('swarm:broodProjectileHit', (receipt) => broodHits.push(receipt));
  bus.on('projectile:hit', (receipt) => {
    if (String(receipt?.targetId).startsWith('brood:')) projectileHits.push(receipt);
  });
  const physicsOwner = sim.registry.get('physics');
  assert.equal(await physicsOwner.prepareBackend(sim.state), true);
  assert.equal(sim.state.settings.gameplay.physicsBackend, 'rapier-dynamic');

  const effects = createSwarmFortifyEffects({ state: sim.state, bus, helpers: sim.helpers, registry: sim.registry });
  effects.update(1 / 60, [{ entityId: turret.id, entity: turret, deviceId: 'kinetic_turret',
    socketId: 'front-near', requestId: 1, runToken: 11, ordinal: 1 }]);
  const turretShot = sim.state.entityIndex.projectiles.find((p) => p.ownerId === turret.id);
  assert.ok(turretShot, 'the live weapons owner fired the finite-ammo turret round');
  setProjectilePath(turretShot, { x: 20, z: 0 }, { x: 120, z: 0 });
  physicsOwner.sweepProjectiles(1 / 60, sim.state);
  assert.equal(turretShot.alive, false);
  assert.equal(broodHits.length, 1);
  assert.equal(broodHits[0].ownerId, turret.id);
  assert.equal(projectileHits.length, 1, 'Brood contacts use ordinary projectile-hit presentation');
  assert.equal(projectileHits[0].targetId, `brood:${broodHits[0].targetId}`);
  assert.deepEqual(projectileHits[0].pos, broodHits[0].pos);
  assert.equal(bodies.alive[slots[0]], 0, 'nearer Brood is hit before the far ship');
  assert.equal(enemy.hull, 100, 'the farther collider receives no second hit');
  assert.equal(turret.data.swarmFortify.ammo, 0);

  const weaponOwner = sim.registry.get('weapons');
  const def = WEAPON_DEFINITION('wpn_autocannon_s');
  weaponOwner._spawnProjectile(player, { defId: def.id, slotIndex: 0, dmg: 8, damageType: 'kinetic',
    projSpeed: def.projSpeed, range: 420 }, def, 0, enemy, false, sim.state, {});
  const playerShot = sim.state.entityIndex.projectiles.find((p) => p.ownerId === player.id);
  assert.ok(playerShot);
  setProjectilePath(playerShot, { x: 40, z: 0 }, { x: 120, z: 0 });
  physicsOwner.sweepProjectiles(1 / 60, sim.state);
  assert.equal(playerShot.alive, false);
  assert.equal(broodHits.length, 2, 'ordinary player bullets use the same Brood life owner');
  assert.equal(broodHits[1].ownerId, player.id);
  assert.equal(projectileHits.length, 2);
  assert.equal(bodies.alive[slots[1]], 0);

  const rock = sim.spawn({ type: 'asteroid', pos: { x: 8, z: 0 }, vel: { x: 0, z: 0 },
    radius: 1, mass: 100, hull: 200, hullMax: 200, collides: true });
  weaponOwner._spawnProjectile(player, { defId: def.id, slotIndex: 1, dmg: 8, damageType: 'kinetic',
    projSpeed: def.projSpeed, range: 420 }, def, 0, enemy, false, sim.state, {});
  const blockedShot = sim.state.entityIndex.projectiles.find((p) => p.ownerId === player.id && p.alive);
  assert.ok(blockedShot);
  setProjectilePath(blockedShot, { x: 0, z: 0 }, { x: 120, z: 0 });
  physicsOwner.sweepProjectiles(1 / 60, sim.state);
  assert.equal(blockedShot.alive, false);
  assert.equal(broodHits.length, 2, 'a closer physical rock occludes the Brood target');
  assert.equal(projectileHits.length, 2, 'an occluded Brood does not emit a fake hit cue');
  assert.equal(rock.alive, true);
  assert.equal(bodies.alive[slots[2]], 1, 'the occluded Brood life remains live');

  // Earliest physical surface wins, even when the Brood center is farther than a small rock.
  // Widen this test life's authored radius to the reported 6 WU geometry without changing its
  // normal direct-damage rule or any production tuning.
  bodies.family[slots[2]] = miteFamily;
  bodies.liveFamilyRadius[miteFamily] = 6;
  bodies.px[slots[2]] = 10; bodies.pz[slots[2]] = 0;
  bodies.vx[slots[2]] = 0; bodies.vz[slots[2]] = 0; bodies.hp[slots[2]] = 100;
  brood.step(sim.state);
  bodies.px[slots[2]] = 10; bodies.pz[slots[2]] = 0;
  bodies.vx[slots[2]] = 0; bodies.vz[slots[2]] = 0;
  const broodEntry = arena.queryBroodProjectileHit({ from: { x: 0, z: 0 }, to: { x: 20, z: 0 }, radius: 0 }, {});
  assert.equal(broodEntry.slot, slots[2]);
  assert.ok(Math.abs(broodEntry.t - 0.2) < 1e-6, 'Brood query returns first surface entry, not center projection');
  weaponOwner._spawnProjectile(player, { defId: def.id, slotIndex: 2, dmg: 8, damageType: 'kinetic',
    projSpeed: def.projSpeed, range: 420 }, def, 0, enemy, false, sim.state, {});
  const entryOrderShot = sim.state.entityIndex.projectiles.find((p) => p.ownerId === player.id && p.alive);
  assert.ok(entryOrderShot);
  setProjectilePath(entryOrderShot, { x: 0, z: 0 }, { x: 20, z: 0 });
  physicsOwner.sweepProjectiles(1 / 60, sim.state);
  assert.equal(bodies.alive[slots[2]], 1, 'Brood surface entry at x=10 beats rock surface entry at x=8');
  assert.equal(broodHits.length, 3);
  assert.equal(projectileHits.length, 3);
  assert.equal(broodHits[2].targetId, `cell:${bodies.serial[slots[2]]}`);
  assert.equal(rock.alive, true);

  effects.remove(turret.id);
  physicsOwner._disableSg02DynamicAuthority();
  sim.dispose();
});

function setProjectilePath(projectile, from, to) {
  projectile.prevPos.x = from.x;
  projectile.prevPos.z = from.z;
  projectile.pos.x = to.x;
  projectile.pos.z = to.z;
  projectile.data.spawnPos = { x: from.x, z: from.z };
  projectile.data.maxDistance = 420;
  projectile.data.flightDistance = 420;
}

function WEAPON_DEFINITION(id) {
  const definition = WEAPONS.find((weapon) => weapon.id === id);
  assert.ok(definition, `weapon ${id} exists`);
  return definition;
}
