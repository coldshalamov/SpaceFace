import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { clearIneligibleAIFiringIntents } from '../src/systems/aiPorts.js';
import { getActivityFrame } from '../src/core/worldActivityManager.js';
import {
  ensureActivityClassified,
  entityNeedsAiThink,
  getActivityWakeEvents,
  getActivityOwnerEntities,
} from '../src/world/activityRuntime.js';
import { SIM_TIER } from '../src/world/activityClassification.js';
import {
  RECORD_KIND,
  captureEntityRecord,
  clearScheduledWake,
  stableRecordId,
} from '../src/world/worldRecords.js';
import { advanceWorldRecord, consumeScheduledWorldWake } from '../src/world/worldCatchup.js';
import {
  applyResourceBodyToEntity,
  captureResourceBodyRecord,
  createEmptyResourceBodyBag,
  MAX_RESOURCE_BODIES,
  shouldGarbageCollectResourceBody,
  upsertResourceBody,
} from '../src/world/resourceBodyRecords.js';

function ship(id, x, data = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 8,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    team: id === 1 ? 0 : 1,
    data,
  };
}

function activityState(entities, extras = {}) {
  const list = entities.slice();
  return {
    tick: 0,
    simTime: 0,
    mode: 'flight',
    playerId: 1,
    camera: { zoom: 144 },
    settings: { video: { fov: 50 }, performance: { simulationWorkerPhase14: true } },
    entities: new Map(list.map((entity) => [entity.id, entity])),
    entityList: list,
    ...extras,
  };
}

test('activity classification does not start the unsafe per-tick abstract worker seam', () => {
  const player = ship(1, 0);
  const far = ship(2, 5000, { ai: { passive: true } });
  const state = activityState([player, far]);

  ensureActivityClassified(state);

  assert.equal(far.activity.simTier, SIM_TIER.S4_AGGREGATE);
  assert.equal(state.__simWorker, undefined,
    'classification must not create an async worker with stale-tier result risk');
  assert.equal(state.entityList.includes(far), true);
});

test('production owner views retain resident exact/near actors while aggregates remain resident', () => {
  const player = ship(1, 0);
  const near = ship(2, 180, { ai: { passive: false, combatant: true } });
  const compat = ship(4, 200);
  compat.ai = { passive: false, combatant: true };
  const far = ship(3, 5000, {
    ai: { passive: false },
    itinerary: { routeId: 'lane_a' },
    trafficRole: 'hauler',
  });
  const state = activityState([player, near, compat, far]);

  ensureActivityClassified(state);
  assert.equal(getActivityOwnerEntities(state, 'ai').includes(compat), true,
    'compatibility owners stored on entity.ai must stay in the production view');
  assert.equal(far.activity.simTier, SIM_TIER.S2_ABSTRACT);
  assert.equal(getActivityOwnerEntities(state, 'ai').includes(far), false);
  assert.equal(getActivityOwnerEntities(state, 'traffic').includes(far), false);
  assert.equal(state.entityList.includes(far), true);

  // A deterministic scheduled wake promotes the actor into both owner views without changing
  // its simulation tier or making it a physics body.
  far.activity.nextEventAtT = 1;
  state.tick = 60;
  state.simTime = 1;
  ensureActivityClassified(state);
  assert.equal(getActivityOwnerEntities(state, 'ai').includes(far), true);
  assert.equal(getActivityOwnerEntities(state, 'traffic').includes(far), true);
  assert.equal(far.activity.simTier, SIM_TIER.S2_ABSTRACT);
});

test('an exact-to-dormant transition gets one fail-closed firing cleanup', () => {
  const player = ship(1, 0);
  const hostile = ship(2, 20, { ai: { combatant: true, passive: false } });
  hostile.data.combat = { targetId: 1 };
  hostile.data.intent = { fire: true, fireGroup: 'primary' };
  const state = activityState([player, hostile]);

  ensureActivityClassified(state);
  assert.equal(hostile.activity.simTier, SIM_TIER.S0_EXACT);
  // The target/aggro pin is removed and the hostile leaves the authority radius. The grace window
  // keeps it exact briefly, then the transition view must clear its old fire intent exactly once.
  delete hostile.data.combat.targetId;
  hostile.pos.x = 5000;
  for (let tick = 1; tick <= 180; tick++) {
    state.tick = tick;
    state.simTime = tick / 60;
    ensureActivityClassified(state);
    clearIneligibleAIFiringIntents(state);
    if (hostile.activity.simTier !== SIM_TIER.S0_EXACT
      && hostile.activity.simTier !== SIM_TIER.S1_NEAR) break;
  }
  assert.notEqual(hostile.activity.simTier, SIM_TIER.S0_EXACT);
  assert.equal(hostile.data.intent.fire, false);
  assert.equal(hostile.data.intent.fireGroup, null);
});

test('durable capture persists normalized abstract intent and scheduled wake', () => {
  const entity = ship(9, 24, {
    homeSectorId: 'sector_test',
    defId: 'ship_mule',
    trafficRole: 'hauler',
    worldRecordId: 'wr_stable',
    intent: { moveX: 1, moveZ: 0, fire: false },
  });
  entity.homeSectorId = 'sector_test';
  entity.ai = { passive: false, combatant: true, nextEventAtT: 7 };
  entity.activity = {
    simTier: SIM_TIER.S2_ABSTRACT,
    intent: {
      kind: 'travel',
      routeId: 'lane_a',
      startT: 0,
      endT: 10,
      parameters: { from: { x: 24, z: 0 }, to: { x: 124, z: 0 } },
    },
    nextEventAtT: 7,
  };

  const record = captureEntityRecord(entity, {
    seed: 77,
    sectorId: 'sector_test',
    simTime: 0,
    abstractTier: SIM_TIER.S2_ABSTRACT,
  });
  assert.equal(record.recordId, 'wr_stable');
  assert.equal(record.kind, RECORD_KIND.CONVOY);
  assert.equal(record.intent.kind, 'travel');
  assert.equal(record.intent.routeId, 'lane_a');
  assert.equal(record.nextEventAtT, 7);
  assert.equal(record.ai.combatant, true,
    'compatibility AI stored on entity.ai must survive durable capture');
  assert.equal(record.lastExactT, 0);
});

test('resource body restoration keeps modified seam, fragment, tether, and depletion state', () => {
  const record = captureResourceBodyRecord({
    type: 'asteroid',
    alive: true,
    pos: { x: 11, z: -4 },
    vel: { x: 2, z: 0 },
    data: {
      homeSectorId: 'sector_test',
      sectorId: 'sector_test',
      fieldId: 'field_a',
      activityObjectSlotId: 'slot_4',
      oreHP: 12,
      oreHPMax: 80,
      yieldRemainingU: 3,
      yieldMaxU: 9,
      seams: { north: 'fractured' },
      fractureState: { level: 2 },
      fragmentsRemaining: 4,
      bulkCoreState: { opened: true, mass: 2 },
      depletedAtT: 2,
      displaced: true,
      lastMinedT: 1,
    },
    flags: { tethered: true },
  }, {
    sectorId: 'sector_test',
    fieldId: 'field_a',
    slotId: 'slot_4',
    simTime: 5,
  });
  assert.ok(record);
  const entity = {
    type: 'asteroid',
    alive: true,
    pos: { x: 0, z: 0 },
    data: {},
    flags: {},
  };
  applyResourceBodyToEntity(entity, record);
  assert.equal(entity.data.oreHP, 12);
  assert.equal(entity.data.yieldMaxU, 9);
  assert.deepEqual(entity.data.seams, { north: 'fractured' });
  assert.deepEqual(entity.data.fractureState, { level: 2 });
  assert.equal(entity.data.fragmentsRemaining, 4);
  assert.deepEqual(entity.data.bulkCoreState, { opened: true, mass: 2 });
  assert.equal(entity.data.depletedAtT, 2);
  assert.equal(entity.data.displaced, true);
  assert.equal(entity.data.tethered, true);
  assert.equal(entity.flags.tethered, true);
});

test('world rematerialization catches a record forward from simulation time zero', () => {
  const state = createGameState(121);
  state.mode = 'flight';
  state.meta.seed = 121;
  state.simTime = 5;
  state.tick = 300;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);

  const recordId = stableRecordId(121, 'sector_helios_prime', RECORD_KIND.NPC, 'zero-time');
  world.upsertWorldRecord({
    recordId,
    kind: RECORD_KIND.NPC,
    sectorId: 'sector_helios_prime',
    homeSectorId: 'sector_helios_prime',
    pos: { x: 0, z: 0 },
    vel: { x: 2, z: 0 },
    alive: true,
    outcome: 'active',
    lastExactT: 0,
  });
  const entity = world._spawnFromDurableRecord(state.world.records.byId[recordId], 'sector_helios_prime');
  assert.ok(entity);
  assert.equal(entity.pos.x, 10);
});

test('scheduled activity wake is consumed once and clears its durable edge', () => {
  const player = ship(1, 0);
  const far = ship(2, 5000, {
    homeSectorId: 'sector_test',
    worldRecordId: 'wr_wake_once',
    trafficRole: 'hauler',
    itinerary: { routeId: 'lane_wake' },
    ai: { passive: true },
  });
  const state = activityState([player, far], {
    world: { records: { byId: {
      wr_wake_once: {
        recordId: 'wr_wake_once', kind: RECORD_KIND.CONVOY, sectorId: 'sector_test',
        pos: { x: 5000, z: 0 }, vel: { x: 0, z: 0 }, alive: true,
        nextEventAtT: 1, scheduledEventIds: ['wake-1'],
      },
    } } },
  });
  ensureActivityClassified(state);
  assert.equal(getActivityOwnerEntities(state, 'traffic').includes(far), false);
  state.tick = 60;
  state.simTime = 1;
  ensureActivityClassified(state);
  assert.equal(getActivityOwnerEntities(state, 'traffic').includes(far), true);
  assert.equal(state.world.records.byId.wr_wake_once.nextEventAtT, null);
  assert.deepEqual(state.world.records.byId.wr_wake_once.scheduledEventIds, []);
  state.tick = 61;
  state.simTime = 1.01;
  ensureActivityClassified(state);
  assert.equal(getActivityOwnerEntities(state, 'traffic').includes(far), false,
    'an acknowledged wake must not admit the same actor on every later tick');
});

test('owner boundary consumes durable and live-only wakes once and carries one tick token', () => {
  const player = ship(1, 0);
  const durable = ship(2, 5000, {
    worldRecordId: 'wr_owner_wake', trafficRole: 'hauler', ai: { passive: true },
    wakeEvent: { id: 'owner-wake', kind: 'traffic' },
  });
  const liveOnly = ship(3, 5200, {
    trafficRole: 'courier', ai: { passive: true }, nextEventAtT: 2,
    wakeEvent: { id: 'live-wake', kind: 'traffic' },
  });
  const state = activityState([player, durable, liveOnly], {
    world: { records: { byId: {
      wr_owner_wake: {
        recordId: 'wr_owner_wake', kind: RECORD_KIND.CONVOY, sectorId: 'sector_test',
        pos: { x: 5000, z: 0 }, vel: { x: 0, z: 0 }, alive: true,
        nextEventAtT: 1, scheduledEventIds: ['owner-wake'],
      },
    } } },
  });

  state.tick = 60;
  state.simTime = 1;
  ensureActivityClassified(state);
  assert.equal(getActivityOwnerEntities(state, 'traffic').includes(durable), true);
  const durableEvents = getActivityWakeEvents(state);
  assert.equal(durableEvents.get(durable.id).event.eventId, 'owner-wake');
  assert.equal(state.world.records.byId.wr_owner_wake.nextEventAtT, null);
  assert.deepEqual(state.world.records.byId.wr_owner_wake.scheduledEventIds, []);
  assert.equal(entityNeedsAiThink(durable, state), true,
    'the consuming owner tick receives a one-tick wake token');

  state.tick = 120;
  state.simTime = 2;
  ensureActivityClassified(state);
  assert.equal(getActivityOwnerEntities(state, 'traffic').includes(liveOnly), true);
  const liveEvents = getActivityWakeEvents(state);
  assert.equal(liveEvents.get(liveOnly.id).event.eventId, 'live-wake');
  assert.equal(liveOnly.data.nextEventAtT, null);
  assert.equal(entityNeedsAiThink(liveOnly, state), true);

  state.tick = 121;
  state.simTime = 2.01;
  ensureActivityClassified(state);
  assert.equal(getActivityOwnerEntities(state, 'traffic').includes(durable), false);
  assert.equal(getActivityOwnerEntities(state, 'traffic').includes(liveOnly), false);
  assert.equal(entityNeedsAiThink(durable, state), false);
  assert.equal(entityNeedsAiThink(liveOnly, state), false);
});

test('initially inactive AI offensive intent gets one fail-closed cleanup', () => {
  const player = ship(1, 0);
  const far = ship(2, 9000, { ai: { passive: false }, intent: { fire: true, fireGroup: 'primary' } });
  const state = activityState([player, far]);
  ensureActivityClassified(state);
  assert.equal(far.activity.simTier, SIM_TIER.S4_AGGREGATE);
  assert.equal(clearIneligibleAIFiringIntents(state), 1);
  assert.equal(far.data.intent.fire, false);
  assert.equal(far.data.intent.fireGroup, null);
  state.tick = 1;
  state.simTime = 1 / 60;
  ensureActivityClassified(state);
  assert.equal(clearIneligibleAIFiringIntents(state), 0,
    'far inactive actors are not rescanned by a recurring full cleanup');
});

test('sector recapture preserves scheduled and lifecycle continuity fields', () => {
  const entity = ship(8, 2400, {
    homeSectorId: 'sector_test', worldRecordId: 'wr_continuity', trafficRole: 'hauler',
  });
  const previous = {
    recordId: 'wr_continuity', kind: RECORD_KIND.CONVOY, sectorId: 'sector_test',
    pos: { x: 0, z: 0 }, scheduledEventIds: ['arrival-1'],
    regeneration: { hullRate: 2, shieldRate: 3, repairAtT: 9 },
    deactivation: { reason: 'residency', exactSnapshotHash: 'abc', generation: 4 },
  };
  const recaptured = captureEntityRecord(entity, {
    sectorId: 'sector_test', seed: 7, simTime: 10, previousRecord: previous,
  });
  assert.deepEqual(recaptured.scheduledEventIds, ['arrival-1']);
  assert.deepEqual(recaptured.regeneration, previous.regeneration);
  assert.deepEqual(recaptured.deactivation, previous.deactivation);
});

test('recapture preserves a prior wake timer unless an explicit clear API is used', () => {
  const entity = ship(18, 2400, {
    homeSectorId: 'sector_test', worldRecordId: 'wr_timer', trafficRole: 'hauler',
    nextEventAtT: -1,
  });
  const previous = {
    recordId: 'wr_timer', kind: RECORD_KIND.CONVOY, sectorId: 'sector_test',
    pos: { x: 0, z: 0 }, nextEventAtT: 23, scheduledEventIds: ['timer-23'],
  };
  const preserved = captureEntityRecord(entity, {
    sectorId: 'sector_test', seed: 7, simTime: 10, previousRecord: previous,
  });
  assert.equal(preserved.nextEventAtT, 23);
  assert.deepEqual(preserved.scheduledEventIds, ['timer-23']);

  const cleared = captureEntityRecord(entity, clearScheduledWake({
    sectorId: 'sector_test', seed: 7, simTime: 10, previousRecord: previous,
  }));
  assert.equal(cleared.nextEventAtT, null);
  assert.deepEqual(cleared.scheduledEventIds, []);
});

test('traffic endpoint itinerary becomes deterministic catch-up intent', () => {
  const entity = ship(12, 0, {
    homeSectorId: 'sector_test', worldRecordId: 'wr_traffic_route', trafficRole: 'courier',
    itinerary: {
      routeId: 'helios:origin>dest', startT: 0, endT: 10,
      from: { x: 0, z: 0 }, to: { x: 100, z: 0 },
    },
  });
  const rec = captureEntityRecord(entity, { sectorId: 'sector_test', seed: 9, simTime: 0 });
  assert.equal(rec.intent.kind, 'travel');
  assert.equal(rec.intent.routeId, 'helios:origin>dest');
  const later = advanceWorldRecord(rec, 0, 5);
  assert.equal(later.pos.x, 50);
});

test('production station-ID itineraries resolve into deterministic abstract endpoints', () => {
  const cases = [
    {
      role: 'express',
      itinerary: {
        kind: 'express_hitch_route', routeId: 'express:helios',
        originStationId: 'station_helios', destinationStationId: 'station_coalition',
        departureAt: 2, dueAt: 12,
      },
      from: 'station_helios', to: 'station_coalition',
    },
    {
      role: 'courier',
      itinerary: {
        kind: 'priority_courier_leg', serviceId: 'priority_courier_tethys',
        originStationId: 'station_tethys', destinationStationId: 'station_customs',
        departureAt: 4, dueAt: 14,
      },
      from: 'station_tethys', to: 'station_customs',
    },
    {
      role: 'passenger_liner',
      itinerary: {
        kind: 'passenger_liner_leg', serviceId: 'passenger_liner_ceres',
        originStationId: 'station_ceres', destinationStationId: 'station_beltout',
        departureAt: 6, dueAt: 16,
      },
      from: 'station_ceres', to: 'station_beltout',
    },
  ];
  for (const [index, entry] of cases.entries()) {
    const entity = ship(40 + index, 0, {
      homeSectorId: 'sector_helios_prime',
      worldRecordId: `wr_station_route_${index}`,
      trafficRole: entry.role,
      itinerary: entry.itinerary,
    });
    const rec = captureEntityRecord(entity, {
      sectorId: 'sector_helios_prime', seed: 101, simTime: 0,
    });
    assert.ok(rec.intent, `${entry.role} itinerary should persist an abstract intent`);
    assert.deepEqual(Object.keys(rec.intent.parameters).sort(), ['from', 'to']);
    assert.notDeepEqual(rec.intent.parameters.from, rec.intent.parameters.to);
    assert.equal(rec.intent.startT, entry.itinerary.departureAt);
    assert.equal(rec.intent.endT, entry.itinerary.dueAt);
    const mid = advanceWorldRecord(rec, 0, 10);
    assert.notDeepEqual(mid.pos, rec.pos, `${entry.role} catch-up should advance between stations`);
  }
});

test('tracked and imminent-collision facts prevent downgrade', () => {
  const player = ship(1, 0);
  const tracked = ship(2, 8000, { worldRecordId: 'wr_tracked', scanned: true });
  const incoming = ship(3, 200);
  incoming.vel.x = -300;
  const state = activityState([player, tracked, incoming], {
    signalInvestigation: {
      trackedId: 'signal:tracked',
      records: { 'signal:tracked': { entityId: 2, sourceId: 'wr_tracked', status: 'tracked' } },
    },
  });
  ensureActivityClassified(state);
  assert.equal(tracked.activity.pins.includes('PLAYER_SCANNED_AND_TRACKED'), true);
  assert.equal(tracked.activity.simTier, SIM_TIER.S0_EXACT);
  assert.equal(incoming.activity.pins.includes('IMMINENT_COLLISION'), true);
  assert.equal(incoming.activity.simTier, SIM_TIER.S0_EXACT);
});

test('resource body round-trip keeps mining yield state and distinguishes depletion', () => {
  const depleted = captureResourceBodyRecord({
    type: 'asteroid', alive: true, pos: { x: 4, z: 1 },
    data: {
      homeSectorId: 'sector_test', fieldId: 'field_a', activityObjectSlotId: 'slot_1',
      oreHP: 0, oreHPMax: 80, yieldU: 17, yieldRemainingU: 4, yieldMaxU: 17,
      pctEjected: 0.8, _oreCarry: 0.25, depletedAtT: 11,
      recoveryPolicy: { oreRate: 1, yieldRate: 0.5, recoverDepleted: true },
    },
    flags: {},
  }, { sectorId: 'sector_test', fieldId: 'field_a', slotId: 'slot_1', simTime: 12 });
  assert.equal(depleted.outcome, 'depleted');
  const entity = { type: 'asteroid', alive: false, pos: { x: 0, z: 0 }, data: {}, flags: {} };
  applyResourceBodyToEntity(entity, depleted);
  assert.equal(entity.data.yieldU, 17);
  assert.equal(entity.data.pctEjected, 0.8);
  assert.equal(entity.data._oreCarry, 0.25);
  assert.equal(entity.data.recoveryPolicy.recoverDepleted, true);
  assert.equal(shouldGarbageCollectResourceBody(depleted, { fieldMayRegenerate: true }), false);
  assert.equal(shouldGarbageCollectResourceBody(depleted, { fieldMayRegenerate: true, allowDepletedGc: true }), false,
    'recovery/GC still protects a player-modified body until the record is explicitly recovered');
});

test('player-modified resource records require explicit retirement for GC or bound eviction', () => {
  const bag = createEmptyResourceBodyBag();
  for (let i = 0; i < MAX_RESOURCE_BODIES + 2; i++) {
    upsertResourceBody(bag, {
      recordId: `rb_modified_${i}`,
      sectorId: 'sector_test', fieldId: 'field_a', slotId: `slot_${i}`,
      pos: { x: i, z: 0 }, lastObservedT: i, playerModified: true,
    });
  }
  assert.equal(Object.keys(bag.byId).length, MAX_RESOURCE_BODIES + 2,
    'modified records may exceed the generic bound until an authority retires one');
  assert.ok(bag.byId.rb_modified_0);
  const modified = bag.byId.rb_modified_0;
  modified.oreHp = modified.oreHpMax = 10;
  assert.equal(shouldGarbageCollectResourceBody(modified, { fieldMayRegenerate: true }), false);
  assert.equal(shouldGarbageCollectResourceBody(modified, {
    fieldMayRegenerate: true, authoritativeRetirement: true,
  }), true);

  upsertResourceBody(bag, {
    recordId: 'rb_authoritative_trim',
    sectorId: 'sector_test', fieldId: 'field_a', slotId: 'trim',
    pos: { x: 0, z: 0 }, lastObservedT: MAX_RESOURCE_BODIES + 3, playerModified: false,
  }, { authoritativeRetirement: true });
  assert.equal(Object.keys(bag.byId).length, MAX_RESOURCE_BODIES,
    'only an explicit authoritative retirement may trim the protected set');
  assert.equal(bag.byId.rb_modified_0, undefined);
});

test('activity frame and telemetry buffers stay stable across unchanged classifications', () => {
  const state = activityState([ship(1, 0), ship(2, 300)]);
  const first = getActivityFrame(state);
  const published = state.activityRuntime;
  const second = getActivityFrame(state);
  assert.equal(first, second);
  assert.equal(state.activityRuntime, published);
  assert.equal(first.reasonsById, second.reasonsById);
  assert.equal(first.changedIds, second.changedIds);
});
