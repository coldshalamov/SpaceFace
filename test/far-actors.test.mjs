import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { NEAR_EXIT_PAD_WU, SIM_TIER } from '../src/world/activityClassification.js';
import { ensureActivityClassified, requestActivityPhysicsInterest } from '../src/world/activityRuntime.js';
import { getAsteroidFieldRock, insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { getDressingRow, insertDressingRow } from '../src/world/dressingTable.js';
import { BORROWED_SUN } from '../src/data/borrowedSun.js';
import { resolveFarEncounters } from '../src/world/farEncounterOutcomes.js';
import { world } from '../src/systems/world.js';
import {
  FAR_ACTOR_SCHEMA,
  farActorCensus,
  farActorHoldsWorldRecord,
  farActorTableRadius,
  findFarActorForTargetIdentity,
  getFarActor,
  insertFarActor,
  promoteFarActor,
  promoteFarActorForTargetIdentity,
  restoreFarActorTable,
  serializeFarActorTable,
  shouldVirtualizeFarActor,
  tickFarActors,
} from '../src/world/farActorTable.js';

function boot(seed = 21) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 0, z: 0 },
    radius: 8,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  return { state, bus, helpers, player };
}

function spawnShip(helpers, spec) {
  const ent = helpers.spawnEntity({
    id: spec.id,
    type: 'ship',
    pos: spec.pos,
    radius: 8,
    mass: 20,
    hull: 80,
    hullMax: 80,
    collides: true,
    data: spec.data || { trafficRole: 'hauler', homeSectorId: 'sector_ceres_belt' },
  });
  ent.homeSectorId = 'sector_ceres_belt';
  ent.activity = spec.activity || { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
  return ent;
}

test('the carrier owns its transient parts instead of shelving anonymous far NPCs', () => {
  const { state } = boot();
  for (const type of ['drone', 'ship', 'wreck']) {
    const body = { id: 999, alive: true, type,
      data: { persistenceOwner: BORROWED_SUN.owner },
      activity: { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false } };
    assert.equal(shouldVirtualizeFarActor(body, state), false, type);
    assert.equal(shouldVirtualizeFarActor({ ...body, data: {} }, state), true,
      `ordinary ${type} still uses distant NPC residency`);
  }
  const ordinary = { id: 1000, alive: true, type: 'ship', pos: { x: 9000, z: 0 }, data: {} };
  const shell = { id: 1001, alive: true, type: 'drone', pos: { x: 12000, z: 9000 },
    data: { persistenceOwner: BORROWED_SUN.owner }, budgetRequester: 'borrowed_sun:sails' };
  const table = restoreFarActorTable(state, { schema: FAR_ACTOR_SCHEMA, version: 1, rows: [ordinary, shell] });
  assert.deepEqual(table.rows.map(row => row.id), [ordinary.id],
    'Continue drops only unrecoverable carrier part shells, whose owner re-derives the cohort');
  assert.equal(table.byId.has(shell.id), false);
  assert.equal([...table.grid.values()].flat().includes(shell), false);
});

test('a live encounter keeps its cast resident beyond the far radius', () => {
  const { state } = boot();
  const nestId = 'campaign47a:charon:nest:v1';
  // The nest's authored escape lane requires the player to clear 3000 WU from the
  // carrier — past the far-actor exit radius. If the cast virtualizes first, the
  // encounter aborts 'unresolved_nest_carrier' and the visit orphans 'active'.
  const cast = [
    { nestCarrier: true, nestEncounterId: nestId, nestSlot: 'carrier' },
    { nestEncounterId: nestId, nestSlot: 'door:0' },
    { nestEncounterId: nestId, nestSlot: 'wasp:0' },
  ];
  cast.forEach((data, i) => {
    const body = { id: 5000 + i, alive: true, type: 'ship', pos: { x: 9000, z: 0 }, data,
      activity: { simTier: SIM_TIER.S2_ABSTRACT, pinnedExact: false } };
    assert.equal(shouldVirtualizeFarActor(body, state), false, data.nestSlot);
  });
  // Generic live-encounter membership — no nest stamp — is residency too: an
  // encounter-bound actor must stay materialized while its row is live.
  state.encounterDirector = { live: {}, squadMembership: { 6001: 'enc_1' } };
  const bound = { id: 6001, alive: true, type: 'ship', pos: { x: 9000, z: 0 }, data: {},
    activity: { simTier: SIM_TIER.S2_ABSTRACT, pinnedExact: false } };
  assert.equal(shouldVirtualizeFarActor(bound, state), false, 'live-encounter squad member');
  assert.equal(shouldVirtualizeFarActor({ ...bound, id: 6002 }, state), true,
    'an unbound far actor still shelves');
});

test('far dormant ships leave the combat list and rematerialize on approach', () => {
  const { state, helpers, bus, player } = boot();
  const far = spawnShip(helpers, { pos: { x: 12000, z: 0 } });
  const near = spawnShip(helpers, {
    pos: { x: 20, z: 0 },
    activity: { simTier: SIM_TIER.S1_NEAR, pinnedExact: false },
  });
  const farId = far.id;
  const nearId = near.id;

  const first = tickFarActors(state, helpers, bus);
  assert.ok(first.shelved >= 1);
  assert.equal(state.entities.has(farId), false);
  assert.ok(getFarActor(state, farId));
  assert.ok(state.entities.get(nearId));
  assert.equal(state.entities.get(nearId).alive, true);
  assert.ok(state.entities.get(player.id));

  player.pos.x = 12000;
  const second = tickFarActors(state, helpers, bus);
  assert.ok(second.restored >= 1);
  const restored = state.entities.get(farId);
  assert.ok(restored);
  assert.equal(restored.type, 'ship');
  assert.equal(restored.physicsBody, undefined,
    'an entity with no authored physics descriptor keeps the normal default-body path');
  assert.equal(getFarActor(state, farId), null);
});

test('a shelved far actor keeps its id until it comes back', () => {
  const { state, helpers, bus, player } = boot();
  const far = spawnShip(helpers, { pos: { x: 12000, z: 0 } });
  const farId = far.id;

  tickFarActors(state, helpers, bus);
  assert.equal(state.entities.has(farId), false);
  assert.ok(getFarActor(state, farId));
  assert.equal(state.freeIds.includes(farId), false, 'the far row still owns its id');

  // The relay capture's collision: a later spawn, dressing prop or field rock took the shelved id.
  const other = spawnShip(helpers, {
    pos: { x: 300, z: 0 },
    activity: { simTier: SIM_TIER.S1_NEAR, pinnedExact: false },
  });
  const prop = insertDressingRow(state, { pos: { x: 12040, z: 30 }, radius: 6, homeSectorId: 'sector_ceres_belt' });
  const rock = insertAsteroidFieldRock(state, { pos: { x: 12080, z: -30 }, radius: 6, homeSectorId: 'sector_ceres_belt' });
  assert.notEqual(other.id, farId, 'a new ship must not take the shelved id');
  assert.notEqual(prop.id, farId, 'a dressing prop must not take the shelved id');
  assert.notEqual(rock.id, farId, 'a field rock must not take the shelved id');

  player.pos.x = 12000;
  tickFarActors(state, helpers, bus);
  const restored = state.entities.get(farId);
  assert.ok(restored, 'the ship comes back under its own id');
  assert.equal(restored.type, 'ship');
  assert.equal(getFarActor(state, farId), null);
  assert.equal(getDressingRow(state, prop.id), prop);
  assert.equal(getAsteroidFieldRock(state, rock.id), rock);

  helpers.removeEntity(farId, { immediate: true });
  assert.ok(state.freeIds.includes(farId), 'with no row holding it, the id returns to the pool');
});

test('a live body forced onto a shelved id evicts the stale far row on approach', () => {
  const { state, helpers, bus, player } = boot();
  const far = spawnShip(helpers, { pos: { x: 12000, z: 0 } });
  const farId = far.id;

  tickFarActors(state, helpers, bus);
  assert.ok(getFarActor(state, farId));

  const forced = spawnShip(helpers, {
    id: farId,
    pos: { x: 12000, z: 0 },
    activity: { simTier: SIM_TIER.S1_NEAR, pinnedExact: false },
  });
  assert.equal(forced.id, farId, 'the fixture builds the alias through an explicit id');

  player.pos.x = 12000;
  tickFarActors(state, helpers, bus);

  assert.equal(state.entities.get(farId), forced);
  assert.equal(getFarActor(state, farId), null, 'the stale row must not survive as an alias');
});

test('a far actor never comes back onto an id a dressing prop or field rock holds', () => {
  const { state, helpers, bus, player } = boot();
  const shipA = spawnShip(helpers, { pos: { x: 12000, z: 0 } });
  const shipB = spawnShip(helpers, { pos: { x: 12100, z: 0 } });
  const idA = shipA.id;
  const idB = shipB.id;

  tickFarActors(state, helpers, bus);
  assert.ok(getFarActor(state, idA));
  assert.ok(getFarActor(state, idB));

  // Explicit-id inserts check only their own table and live bodies, so build that alias directly.
  const prop = insertDressingRow(state, { id: idA, pos: { x: 12040, z: 30 }, radius: 6, homeSectorId: 'sector_ceres_belt' });
  const rock = insertAsteroidFieldRock(state, { id: idB, pos: { x: 12080, z: -30 }, radius: 6, homeSectorId: 'sector_ceres_belt' });
  assert.equal(prop.id, idA, 'the fixture must alias the prop onto the shelved id');
  assert.equal(rock.id, idB, 'the fixture must alias the rock onto the shelved id');

  player.pos.x = 12000;
  tickFarActors(state, helpers, bus);

  const ships = state.entityList.filter((e) => e.alive !== false && e.type === 'ship' && e.id !== player.id);
  assert.equal(ships.length, 2, 'both ships come back');
  for (const ship of ships) {
    assert.notEqual(ship.id, idA);
    assert.notEqual(ship.id, idB);
  }
  assert.equal(state.entities.has(idA), false);
  assert.equal(state.entities.has(idB), false);
  assert.equal(getDressingRow(state, idA), prop);
  assert.equal(getAsteroidFieldRock(state, idB), rock);
  assert.equal(getFarActor(state, idA), null);
  assert.equal(getFarActor(state, idB), null);
});

test('a booked far salvage target promotes by stable identity through the world owner', () => {
  const { state, helpers, bus } = boot();
  state.world.currentSectorId = 'sector_ceres_belt';
  const target = helpers.spawnEntity({
    type: 'wreck', pos: { x: 12000, z: 0 }, vel: { x: 0, z: 0 },
    radius: 5, mass: 80, hull: 100, hullMax: 100, collides: true,
    physicsBody: { schemaVersion: 1, mass: 80, inertiaY: 320, centerOfMass: { x: 0, y: 0, z: 0 },
      radius: 5, shape: 'capsule', dynamic: true, ccd: true, material: 'debris',
      attachmentPoints: { massline: { x: 0, y: 0, z: 0 } }, thrusters: [], revision: 7,
      useMeasuredSkin: false },
    data: { worldRecordId: 'wr_booked_salvage', salvorTargetKey: 'salvor:booked-test',
      salvagePointId: 'zone_ceres_derelict:sal0',
      sectorId: 'sector_ceres_belt', homeSectorId: 'sector_ceres_belt',
      salvagePool: { cmdty_scrap_metal: 1 } },
  });
  target.homeSectorId = 'sector_ceres_belt';
  const targetId = target.id;
  insertFarActor(state, target, state.simTime, helpers);
  helpers.removeEntity(targetId, { immediate: true, reason: 'virtualize' });
  assert.equal(state.entities.has(targetId), false);
  const savedRows = JSON.parse(JSON.stringify(serializeFarActorTable(state.world.farActors)));
  restoreFarActorTable(state, savedRows);
  assert.equal(getFarActor(state, targetId).physicsBody.dynamic, true,
    'the authored dynamic body survives the ordinary far-row save/load projection');
  assert.equal(getFarActor(state, targetId).physicsBody.shape, 'capsule');
  assert.equal(getFarActor(state, targetId).physicsBody.material, 'debris');
  assert.equal(getFarActor(state, targetId).physicsBody.mass, 80);
  assert.equal(getFarActor(state, targetId).physicsBody.useMeasuredSkin, false);
  assert.equal(findFarActorForTargetIdentity(state, {
    kind: 'worldRecord', worldRecordId: 'wr_booked_salvage',
  }, { type: 'wreck', sectorId: 'sector_ceres_belt' })?.id, targetId);

  // A foreign live body may reuse the old numeric slot. It must not be returned as the
  // booked wreck or cause the stable far record to be discarded.
  const foreign = spawnShip(helpers, {
    id: targetId, pos: { x: 200, z: 0 }, data: { worldRecordId: 'wr_foreign' },
    activity: { simTier: SIM_TIER.S1_NEAR, pinnedExact: false },
  });
  const worker = helpers.spawnEntity({
    type: 'ship', pos: { x: 11500, z: 0 }, vel: { x: 0, z: 0 }, radius: 8,
    mass: 14, hull: 50, hullMax: 50, collides: true,
    data: { worldRecordId: 'wr_scavenger', jobId: 'job:wr_scavenger',
      homeSectorId: 'sector_ceres_belt', sectorId: 'sector_ceres_belt' },
  });
  state.npcJobs = { byId: {
    'job:wr_scavenger': {
      entityId: worker.id, worldRecordId: 'wr_scavenger', sectorId: 'sector_ceres_belt',
      job: { id: 'job:wr_scavenger', kind: 'salvor', phase: 'transit',
        route: [{ id: 'cut:hold' }, { id: `hulk:${targetId}`, pos: { x: 12000, z: 0 } }],
        payload: { role: 'scavenger', targetId, targetType: 'wreck',
          targetIdentity: { kind: 'worldRecord', worldRecordId: 'wr_booked_salvage' } } },
    },
  } };
  state.world.records = { byId: {
    wr_booked_salvage: { recordId: 'wr_booked_salvage', kind: 'wreck', alive: true,
      sectorId: 'sector_ceres_belt', pos: { x: 12000, z: 0 }, hull: 100, hullMax: 100 },
  } };
  const owner = Object.create(world);
  owner.state = state;
  owner.bus = bus;
  owner.helpers = helpers;
  owner._adoptedSalvorMaterializationRequests = new Map();
  const request = {
    jobId: 'job:wr_scavenger', workerWorldRecordId: 'wr_scavenger',
    targetIdentity: { kind: 'worldRecord', worldRecordId: 'wr_booked_salvage' },
    targetType: 'wreck', sectorId: 'sector_ceres_belt', approachBandWU: 80,
  };
  let restoredEvent = null;
  const emit = bus.emit.bind(bus);
  bus.emit = (name, payload) => {
    if (name === 'world:farActorRestored') restoredEvent = payload;
    return emit(name, payload);
  };
  const pose = owner.requestAdoptedSalvorTargetMaterialization(request);
  assert.deepEqual(pose.pos, { x: 12000, z: 0 }, 'world owner returns the current far-row pose');
  assert.equal(owner._adoptedSalvorMaterializationRequests.size, 0,
    'the world does not request a restore while the worker is outside its physical approach band');
  worker.pos.x = 11950;
  owner.requestAdoptedSalvorTargetMaterialization(request);
  assert.equal(owner._adoptedSalvorMaterializationRequests.size, 1,
    'only the exact booked target is queued once the worker reaches the approach band');

  // The ordinary sweep is player-centered and must leave this distant row shelved. The targeted
  // request then uses the same far-actor promotion and spawn-budget owner, with identity checked
  // before the numeric slot is considered.
  tickFarActors(state, helpers, bus);
  assert.ok(getFarActor(state, targetId));
  owner._processAdoptedSalvorMaterializationRequests(state);
  const restored = [...state.entities.values()].find(entity =>
    entity.type === 'wreck' && entity.data?.worldRecordId === 'wr_booked_salvage');
  assert.ok(restored, 'the same live wreck record is promoted');
  assert.notEqual(restored.id, targetId, 'a reused id is never mistaken for the booked wreck');
  assert.equal(restored.physicsBody.dynamic, true, 'promotion restores the explicit dynamic physics body');
  assert.equal(restored.physicsBody.shape, 'capsule');
  assert.equal(restored.physicsBody.material, 'debris');
  assert.equal(restored.physicsBody.mass, 80);
  assert.equal(restored.physicsBody.inertiaY, 320);
  assert.equal(restored.physicsBody.attachmentPoints.massline.x, 0);
  assert.equal(restored.physicsBody.useMeasuredSkin, false);
  assert.equal(state.entities.get(targetId), foreign, 'the unrelated live body remains untouched');
  assert.deepEqual(restored.data.salvagePool, { cmdty_scrap_metal: 1 }, 'promotion preserves the salvage pool');
  assert.equal(getFarActor(state, targetId), null, 'the exact far row is consumed once');
  assert.equal(owner._adoptedSalvorMaterializationRequests.size, 0, 'successful promotion releases its request');
  assert.equal(restoredEvent?.jobId, null,
    'the restored wreck event carries the wreck job id, not the requesting worker job');
  assert.equal(restoredEvent?.causeJobId, 'job:wr_scavenger',
    'the approach request job is reported separately as the restoration cause');
  assert.equal(owner._adoptedSalvorApproachHolds.get('job:wr_scavenger')?.targetEntity, restored,
    'the world owner briefly hands the physical body to the existing latch/physics loop');
  tickFarActors(state, helpers, bus,
    entity => owner._retainAdoptedSalvorApproachBody(entity, state));
  assert.equal(state.entities.get(restored.id), restored,
    'the exact approached body survives the next player-centered sweep for physical claiming');

  const entry = state.npcJobs.byId['job:wr_scavenger'];
  const activeLine = { id: 'line:npc-tow', state: 'active', controlMode: 'npc_tow',
    ownerId: worker.id, targetId: restored.id };
  owner.registry = { get: name => name === 'combat'
    ? { kernel: { attachments: { get: id => id === activeLine.id ? activeLine : null } } } : null };
  entry.towAttachmentId = activeLine.id;
  entry.towTargetId = restored.id;
  entry.towTargetRef = restored;
  const attachedHold = owner._adoptedSalvorApproachHolds.get('job:wr_scavenger');
  const attachedLease = attachedHold?.activityLease;
  assert.ok(attachedLease, 'promotion obtains a bounded classifier-owned native-body lease');
  assert.equal(owner._retainAdoptedSalvorApproachBody(restored, state), true);
  assert.equal(owner._adoptedSalvorApproachHolds.has('job:wr_scavenger'), false,
    'a real active npc_tow binding ends the temporary handoff');
  assert.equal(attachedHold.activityLease, null, 'the exact lease is released when the real line is active');

  entry.towAttachmentId = null;
  entry.towTargetId = null;
  entry.towTargetRef = null;
  const makeHold = (expiresAt = state.simTime + 3) => {
    const activityLease = requestActivityPhysicsInterest(state, worker, restored,
      { expiresAt, sectorId: 'sector_ceres_belt' });
    assert.ok(activityLease);
    const hold = { jobId: 'job:wr_scavenger', workerWorldRecordId: 'wr_scavenger',
      workerEntityId: worker.id, activityOwner: worker, activityLease,
      targetIdentity: { kind: 'worldRecord', worldRecordId: 'wr_booked_salvage' },
      targetEntity: restored, targetGeneration: restored.occupantGeneration ?? null,
      sectorId: 'sector_ceres_belt', approachBandWU: 80, expiresAt };
    owner._adoptedSalvorApproachHolds.set('job:wr_scavenger', hold);
    return hold;
  };

  const retargetHold = makeHold();
  state.npcJobs.byId['job:wr_scavenger'].job.payload.targetIdentity = {
    kind: 'worldRecord', worldRecordId: 'wr_different_booked_target',
  };
  assert.equal(owner._retainAdoptedSalvorApproachBody(restored, state), false,
    'same-kind retargeting releases the old target residency handoff');
  assert.equal(owner._adoptedSalvorApproachHolds.has('job:wr_scavenger'), false);
  assert.equal(retargetHold.activityLease, null, 'retargeting releases the exact activity lease');
  state.npcJobs.byId['job:wr_scavenger'].job.payload.targetIdentity = {
    kind: 'worldRecord', worldRecordId: 'wr_booked_salvage',
  };
  restored.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
  const distanceHold = makeHold();
  worker.pos.x = 11799;
  assert.equal(owner._retainAdoptedSalvorApproachBody(restored, state), false);
  assert.equal(owner._adoptedSalvorApproachHolds.has('job:wr_scavenger'), false,
    'the handoff releases when the same worker leaves its bounded approach area');
  assert.equal(distanceHold.activityLease, null);
  worker.pos.x = 11950;
  const expiryHold = makeHold(state.simTime + 0.5);
  state.simTime = 4;
  assert.equal(owner._retainAdoptedSalvorApproachBody(restored, state), false);
  assert.equal(owner._adoptedSalvorApproachHolds.has('job:wr_scavenger'), false,
    'the handoff also expires on sim time');
  assert.equal(expiryHold.activityLease, null);
  const rewindHold = makeHold(state.simTime + 3);
  owner._adoptedSalvorMaterializationRequests.set('stale-request', { nextAttemptAt: 8 });
  owner._adoptedSalvorLeaseClock = 9;
  state.simTime = 2;
  owner._resetAdoptedSalvorApproachOnClockRewind(state);
  assert.equal(owner._adoptedSalvorApproachHolds.size, 0,
    'a rewound Continue clock releases the transient approach handoff');
  assert.equal(owner._adoptedSalvorMaterializationRequests.size, 0,
    'a rewound Continue clock drops stale retry deadlines');
  assert.equal(rewindHold.activityLease, null, 'clock rewind releases the classifier lease');
  assert.equal(shouldVirtualizeFarActor(restored, state), true,
    'after expiry the normal far-actor policy can shelf the body again');
});

test('malformed stable far-actor identities never match missing row keys', () => {
  const state = { world: { farActors: { rows: [
    { id: 1, type: 'wreck', alive: true, data: {} },
  ] } } };
  for (const identity of [
    { kind: 'worldRecord' },
    { kind: 'worldRecord', worldRecordId: '' },
    { kind: 'marker' },
    { kind: 'salvagePoint', salvagePointId: 'point' },
    { kind: 'salvagePoint', sourceKey: 'source' },
    { kind: 'salvorTarget' },
  ]) {
    assert.equal(findFarActorForTargetIdentity(state, identity), null,
      `${identity.kind} identity with a missing/empty key fails closed`);
  }
});

test('a destroyed booked far wreck cannot be restored by an adopted salvage request', () => {
  const { state, helpers } = boot();
  const wreck = helpers.spawnEntity({
    type: 'wreck', pos: { x: 12000, z: 0 }, vel: { x: 0, z: 0 }, radius: 5,
    mass: 80, hull: 0, hullMax: 100, collides: true,
    data: { worldRecordId: 'wr_destroyed_salvage', sectorId: 'sector_ceres_belt',
      salvagePool: { cmdty_scrap_metal: 1 } },
  });
  insertFarActor(state, wreck, state.simTime, helpers);
  helpers.removeEntity(wreck.id, { immediate: true, reason: 'virtualize' });
  state.world.records = { byId: {
    wr_destroyed_salvage: { recordId: 'wr_destroyed_salvage', kind: 'wreck', alive: false,
      outcome: 'destroyed', sectorId: 'sector_ceres_belt', hull: 0 },
  } };
  assert.equal(promoteFarActorForTargetIdentity(state,
    { kind: 'worldRecord', worldRecordId: 'wr_destroyed_salvage' },
    { type: 'wreck', sectorId: 'sector_ceres_belt' }, helpers), null);
  assert.ok(getFarActor(state, wreck.id), 'a denied destroyed record remains unpromoted');
  assert.equal(state.entities.has(wreck.id), false);
});

test('survival/swarm holds every live ship on the table', () => {
  const { state, helpers, bus } = boot();
  state.run = { kind: 'survival', ruleset: 'swarm' };
  const far = spawnShip(helpers, { pos: { x: 18000, z: 0 } });
  assert.equal(shouldVirtualizeFarActor(far, state), false);
  const result = tickFarActors(state, helpers, bus);
  assert.equal(result.shelved, 0);
  assert.ok(state.entities.get(far.id));
});

test('an onboarding-stamped body never shelves — the lean row drops the owner keys', () => {
  // X-02 round-5: the Claim Jumper raid cast stamps data.onboarding (+ onboardingRaidWing on
  // the wing). leanIdentityData does not carry either, so a shelved/promoted wing returned an
  // anonymous inert husk _raidActor could never rebind — an open raid slot pointing at a hull
  // the latch could no longer arm. Owner-keyed tutorial bodies stay resident like authored
  // characters; an ordinary ship beside them still shelves.
  const { state, helpers, bus } = boot();
  const wing = spawnShip(helpers, {
    pos: { x: 15000, z: 0 },
    data: { onboarding: true, onboardingRaidWing: true, homeSectorId: 'sector_helios_prime' },
  });
  const ordinary = spawnShip(helpers, { pos: { x: 15100, z: 0 } });
  assert.equal(shouldVirtualizeFarActor(wing, state), false);
  assert.equal(shouldVirtualizeFarActor(ordinary, state), true);
  tickFarActors(state, helpers, bus);
  assert.ok(state.entities.get(wing.id), 'the stamped body stays live past the exit radius');
  assert.equal(getFarActor(state, wing.id), null);
  assert.equal(state.entities.has(ordinary.id), false);
  assert.ok(getFarActor(state, ordinary.id));
});

test('pinned and nearby wrecks stay; dormant far wrecks shelve', () => {
  const { state, helpers, bus } = boot();
  const farWreck = helpers.spawnEntity({
    type: 'wreck',
    pos: { x: 15000, z: 40 },
    radius: 10,
    mass: 40,
    collides: false,
    data: { wreckClass: 'battlefield', homeSectorId: 'sector_ceres_belt' },
  });
  farWreck.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
  const pinned = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 16000, z: 0 },
    radius: 8,
    mass: 20,
    hull: 50,
    hullMax: 50,
    collides: true,
    flags: { missionPinned: true },
    data: { missionPinned: true, homeSectorId: 'sector_ceres_belt' },
  });
  pinned.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };

  tickFarActors(state, helpers, bus);
  assert.equal(state.entities.has(farWreck.id), false);
  assert.ok(getFarActor(state, farWreck.id));
  assert.ok(state.entities.get(pinned.id));
  const census = farActorCensus(state);
  assert.ok(census.farActors >= 1);
  assert.ok(census.liveShips >= 2);
});

test('unnamed quiet world-site wrecks shelf; unique wrecks stay', () => {
  const { state, helpers, bus } = boot();
  const siteWreck = helpers.spawnEntity({
    type: 'wreck',
    pos: { x: 18000, z: 0 },
    radius: 24,
    mass: 1e9,
    collides: true,
    data: {
      worldSiteId: 'world_site_wreck_cathedral',
      worldRecordId: 'world_site_wreck_cathedral/component/cathedral_hull',
      persistenceOwner: 'asteroidSites',
      kind: 'world_site_component',
      homeSectorId: 'sector_ceres_belt',
    },
  });
  siteWreck.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
  const unique = helpers.spawnEntity({
    type: 'wreck',
    pos: { x: 19000, z: 0 },
    radius: 12,
    mass: 1e6,
    collides: true,
    data: { uniqueWreckId: 'wreck_isc_vigilant', name: 'ISC Vigilant', homeSectorId: 'sector_ceres_belt' },
  });
  unique.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };

  assert.equal(shouldVirtualizeFarActor(siteWreck, state), true);
  assert.equal(shouldVirtualizeFarActor(unique, state), false);
  tickFarActors(state, helpers, bus);
  assert.equal(state.entities.has(siteWreck.id), false);
  assert.ok(getFarActor(state, siteWreck.id));
  assert.ok(state.entities.get(unique.id));
});

test('far snapshot stays lean and promote runs catch-up first', () => {
  const { state, helpers } = boot();
  const ship = spawnShip(helpers, {
    pos: { x: 40, z: 0 },
    data: {
      trafficRole: 'hauler',
      homeSectorId: 'sector_ceres_belt',
      shipDefId: 'hull_workhorse',
      salvagePool: { cmdty_scrap_metal: 9 },
      aftermath: { markerId: 'fat', evidence: { long: true } },
    },
  });
  ship.vel = { x: 12, z: 0 };
  ship.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false, lastExactT: 0 };
  state.simTime = 0;
  const rec = insertFarActor(state, ship, 0);
  assert.equal(rec.data.salvagePool, undefined);
  assert.equal(rec.data.aftermath, undefined);
  assert.equal(rec.trafficRole, 'hauler');
  assert.equal(rec.hullDefId, 'hull_workhorse');
  assert.ok(!('flags' in rec) || rec.flags == null);

  rec.lastExactT = 0;
  rec.vel = { x: 12, z: 0 };
  rec.pos = { x: 40, z: 0 };
  state.simTime = 5;
  helpers.removeEntity(ship.id, { immediate: true });
  const live = promoteFarActor(state, rec.id, helpers);
  assert.ok(live);
  assert.ok(Math.abs(live.pos.x - 100) < 0.01, `expected catch-up pose ~100, got ${live.pos.x}`);
  assert.equal(getFarActor(state, rec.id), null);
  assert.equal(live.data.defId, 'hull_workhorse',
    'a hull shelved under shipDefId promotes with defId re-canonicalized (D29: the whole-ship selector reads defId only)');
});

test('production leftover S3 still shelves after delayed far-actor exit', () => {
  const { state, helpers, bus, player } = boot();
  state.runtime = { ...(state.runtime || {}), profileId: 'production' };
  player.maxSpeed = 500;
  state.tick = 1;

  const primed = ensureActivityClassified(state);
  assert.equal(primed.classifyMode, 'full');
  const radii = farActorTableRadius(state);
  const nearExit = (primed.physicsReachWu || 0) + NEAR_EXIT_PAD_WU;
  assert.ok(
    radii.exit > nearExit + 8,
    `need decodeR hysteresis band (far exit ${radii.exit} vs near exit ${nearExit})`,
  );

  const x = (nearExit + radii.exit) / 2;
  const far = spawnShip(helpers, {
    pos: { x, z: 0 },
    data: {
      trafficRole: 'hauler',
      homeSectorId: 'sector_ceres_belt',
      named: true,
    },
  });
  const farId = far.id;

  state.tick = 2;
  const insideExit = tickFarActors(state, helpers, bus);
  assert.equal(insideExit.shelved, 0, 'S3 inside far-actor exit must stay live');
  assert.equal(state.entities.has(farId), true);
  const stamped = state.entities.get(farId);
  assert.equal(stamped.activity.simTier, SIM_TIER.S3_DORMANT);
  const listed = ensureActivityClassified(state);
  assert.ok(
    listed.dormantIds.includes(farId) || listed.abstractIds.includes(farId),
    'visited S3 is listed on the classify tick',
  );

  player.pos.x = -1e5;
  state.tick = 3;
  const leftover = ensureActivityClassified(state);
  assert.equal(leftover.classifyMode, 'incremental');
  assert.equal(leftover.dormantIds.includes(farId), false, 'leftover S3 is counted not listed');
  assert.equal(leftover.abstractIds.includes(farId), false);
  assert.ok(leftover.counts.s3 >= 1);
  assert.equal(state.entities.get(farId).activity.simTier, SIM_TIER.S3_DORMANT);

  const delayed = tickFarActors(state, helpers, bus);
  assert.ok(delayed.shelved >= 1, 'unvisited S3 beyond exit must still shelve');
  assert.equal(state.entities.has(farId), false);
  assert.ok(getFarActor(state, farId));
});

test('shelved far actors round-trip through the save payload', () => {
  const { state, helpers, bus } = boot();
  const far = spawnShip(helpers, {
    pos: { x: 12000, z: 0 },
    data: {
      trafficRole: 'hauler',
      homeSectorId: 'sector_ceres_belt',
      worldRecordId: 'wr_npc_roundtrip',
      ai: { archetype: 'trader', passive: true },
    },
  });
  const farId = far.id;
  tickFarActors(state, helpers, bus);
  assert.equal(state.entities.has(farId), false);
  assert.ok(getFarActor(state, farId));

  // Save-path shape: serialize → JSON (localStorage) → restore into the cleared state.
  const payload = JSON.parse(JSON.stringify(serializeFarActorTable(state.world.farActors)));
  state.entities.clear();
  state.entityList.length = 0;
  state.freeIds.length = 0;
  state.nextEntityId = 1;
  restoreFarActorTable(state, payload);

  const row = getFarActor(state, farId);
  assert.ok(row, 'shelved row must restore from the save payload');
  assert.equal(row.data.worldRecordId, 'wr_npc_roundtrip');
  assert.deepEqual(row.data.ai, { archetype: 'trader', passive: true },
    'the durable ai descriptor must survive shelve→save→load');
  assert.equal(farActorHoldsWorldRecord(state, 'wr_npc_roundtrip'), true,
    'a shelved record must not rematerialize a second live entity');
  assert.equal(farActorHoldsWorldRecord(state, 'wr_npc_other'), false);

  // The shelved id stays reserved: fresh spawns must never land on it.
  state.nextEntityId = farId; // simulate an allocator that would collide
  const spawned = helpers.spawnEntity({ type: 'fx', pos: { x: 0, z: 0 } });
  assert.notEqual(spawned.id, farId, 'allocator must skip the shelved id');
  assert.equal(getFarActor(state, farId), row);

  // The actor still promotes back live on approach after reload.
  const live = promoteFarActor(state, farId, helpers);
  assert.ok(live, 'restored far actor must promote back to a live entity');
  assert.equal(live.data.worldRecordId, 'wr_npc_roundtrip');
  assert.deepEqual(live.data.ai, { archetype: 'trader', passive: true });
});

test('runtime presentation stamps on shelved rows never reach the save payload', () => {
  const { state, helpers, bus } = boot();
  const far = spawnShip(helpers, {
    pos: { x: 12000, z: 0 },
    data: { trafficRole: 'hauler', homeSectorId: 'sector_ceres_belt' },
  });
  const farId = far.id;
  tickFarActors(state, helpers, bus);
  const row = getFarActor(state, farId);
  assert.ok(row);

  // The mesh loop resolves the shelved row itself as a presentation entity and stamps a live
  // Object3D on it (e.mesh = m; e.view = { root: m }). A recursive clone of that graph
  // stack-overflows — serializing must strip runtime fields instead.
  const fakeObject3D = { isObject3D: true, children: [], matrix: { elements: new Array(16).fill(0) } };
  fakeObject3D.children.push(fakeObject3D); // cyclic, like a real scene graph can be
  row.mesh = fakeObject3D;
  row.view = { root: fakeObject3D };
  row._noMesh = true;
  row.liveEntityId = 9999;

  const payload = serializeFarActorTable(state.world.farActors);
  assert.ok(payload, 'serialize must not throw on presentation-stamped rows');
  const json = JSON.stringify(payload); // proves the payload is JSON-safe
  const restored = JSON.parse(json);
  const saved = restored.rows.find((r) => r.id === farId);
  assert.ok(saved);
  for (const key of ['mesh', 'view', '_noMesh', 'liveEntityId', '_cell']) {
    assert.equal(saved[key], undefined, `runtime field ${key} must not serialize`);
  }
  assert.equal(saved.type, 'ship');
  assert.equal(saved.trafficRole, 'hauler');
});

test('a due far encounter rekeys catch-up before resolving a pair that crossed cells', () => {
  const { state, helpers } = boot(47);
  const pirate = spawnShip(helpers, { pos: { x: 399, z: 0 } });
  pirate.team = 1;
  pirate.vel = { x: 2, z: 0 };
  pirate.data.trafficRole = 'pirate';
  pirate.activity = { simTier: SIM_TIER.S3_DORMANT, lastExactT: 0, nextEventAtT: 1 };
  const trader = spawnShip(helpers, { pos: { x: 390, z: 0 } });
  trader.team = 0;
  trader.vel = { x: 0, z: 0 };
  trader.data.trafficRole = 'hauler';
  trader.activity = { simTier: SIM_TIER.S3_DORMANT, lastExactT: 0, nextEventAtT: 1 };

  const pirateRow = insertFarActor(state, pirate, 0);
  const traderRow = insertFarActor(state, trader, 0);
  assert.equal(pirateRow._cell, traderRow._cell, 'the scheduled pair starts in one spatial cell');

  assert.equal(resolveFarEncounters(state, 1), 0);
  assert.equal(pirateRow.pos.x, 401, 'the delayed pirate catches up to the event time');
  assert.equal(pirateRow.type, 'ship');
  assert.equal(traderRow.type, 'ship');
  assert.notEqual(pirateRow._cell, traderRow._cell, 'catch-up moved the pair into separate cells');
  const memberships = [...state.world.farActors.grid.values()].flat();
  assert.equal(memberships.filter((row) => row === pirateRow).length, 1);
  assert.equal(memberships.filter((row) => row === traderRow).length, 1);
});

test('a missing or empty far-actor payload restores to no table', () => {
  const { state } = boot();
  assert.equal(restoreFarActorTable(state, null), null);
  assert.equal(state.world.farActors, null);
  assert.equal(restoreFarActorTable(state, { schema: FAR_ACTOR_SCHEMA, rows: [] }), null);
  assert.equal(restoreFarActorTable(state, { schema: 'bogus', rows: [{ id: 5 }] }), null);
  // Legacy saves (no farActors key) keep the old behavior: records rematerialize live.
  assert.equal(farActorHoldsWorldRecord(state, 'wr_npc_roundtrip'), false);
});

test('shelving records the bound requester and promotion re-acquires its slot', () => {
  const { state, helpers, bus } = boot();
  const budget = makeBudgetApi(state);
  helpers.spawnBudget = budget;
  // The registered system wires this in init(); the bare API does not self-subscribe.
  bus.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  const far = spawnShip(helpers, { pos: { x: 12000, z: 0 } });
  const farId = far.id;
  budget.request(1, 'world:ambient:sector_ceres_belt');
  assert.ok(budget.bindEntity(farId, 'world:ambient:sector_ceres_belt'));
  assert.equal(budget.current(), 1);

  // Shelve through the same call site the world uses: the destroy receipt frees the live
  // binding while the row keeps the requester it must re-acquire to come back.
  insertFarActor(state, far, 0, helpers);
  helpers.removeEntity(farId, { immediate: true, reason: 'virtualize' });
  bus.flush();
  assert.equal(budget.current(), 0, 'virtualize releases the live-bound slot');
  assert.equal(getFarActor(state, farId).budgetRequester, 'world:ambient:sector_ceres_belt');

  const promoted = promoteFarActor(state, farId, helpers);
  assert.ok(promoted);
  assert.equal(budget.ownerForEntity(promoted.id), 'world:ambient:sector_ceres_belt');
  assert.equal(budget.current(), 1, 'a promoted bound actor is counted again');
});

test('a saturated cap defers promotion of a bound row instead of returning it unbound', () => {
  const { state, helpers, bus } = boot();
  const budget = makeBudgetApi(state);
  helpers.spawnBudget = budget;
  // The registered system wires this in init(); the bare API does not self-subscribe.
  bus.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  const far = spawnShip(helpers, { pos: { x: 12000, z: 0 } });
  const farId = far.id;
  budget.request(1, 'world:ambient:sector_ceres_belt');
  budget.bindEntity(farId, 'world:ambient:sector_ceres_belt');
  insertFarActor(state, far, 0, helpers);
  helpers.removeEntity(farId, { immediate: true, reason: 'virtualize' });
  bus.flush();

  // Every slot is now claimed by a different requester.
  assert.equal(budget.request(budget.max(), 'fixture:saturated'), budget.max());
  assert.equal(promoteFarActor(state, farId, helpers), null,
    'promotion refuses rather than spawning uncounted');
  assert.ok(getFarActor(state, farId), 'the refused row stays shelved for a later retry');

  budget.release('fixture:saturated');
  const promoted = promoteFarActor(state, farId, helpers);
  assert.ok(promoted, 'the row promotes once a slot frees');
  assert.equal(budget.ownerForEntity(promoted.id), 'world:ambient:sector_ceres_belt');
});

test('an unbound shelved actor promotes without touching the budget', () => {
  const { state, helpers, bus } = boot();
  const budget = makeBudgetApi(state);
  helpers.spawnBudget = budget;
  // The registered system wires this in init(); the bare API does not self-subscribe.
  bus.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  const far = spawnShip(helpers, { pos: { x: 12000, z: 0 } });
  const farId = far.id;
  insertFarActor(state, far, 0, helpers);
  helpers.removeEntity(farId, { immediate: true, reason: 'virtualize' });
  assert.equal(getFarActor(state, farId).budgetRequester, undefined);

  budget.request(budget.max(), 'fixture:saturated');
  const promoted = promoteFarActor(state, farId, helpers);
  assert.ok(promoted, 'never-bound rows (traffic, wrecks) promote even when saturated');
  assert.equal(budget.ownerForEntity(promoted.id), null);
});
