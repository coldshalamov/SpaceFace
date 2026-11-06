/**
 * Cinder egress parity — a fleeing marked Wasp resolves as a lane clearance.
 *
 * Pins the contract side of PQ-206.02 for mission-owned hulls: the ambient bound deliberately
 * cannot take them (the contract owns their exit), but a fleeing mark drives at travel speed
 * (~470 WU/s drive_reaction_s ceiling) while the player's ship tops out lower — beyond the
 * bound the chase is mathematically dead and m_5 parks at 2/3 forever (run 104). The mission's
 * own tick resolves a sustained flee+separation as a lane clearance, releases the hull to the
 * ordinary bound, and counts the slot's hull as lost evidence for the exhausted accounting.
 *
 * RUN: `node --test test/cinder-escape-clearance.test.mjs`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus as createRuntimeBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { RESIDENCY_TIER, sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { RECORD_KIND, ensureWorldRecords } from '../src/world/worldRecords.js';

import {
  observeCinderEscape, cinderAccounting, retainCinderRetry, initializeCinderRoute,
  CINDER_TAG,
} from '../src/missions/cinderRoute.js';
// Load order matters: missionSpawningOps and missions.js import each other — missions.js must
// finish initializing before missionSpawningOps's own importers see it (the ops-object spread).
import '../src/systems/missions.js';
import { missionSpawningOps } from '../src/systems/missionSpawningOps.js';
import { EGRESS_DISTANCE_WU, EGRESS_FADE_S } from '../src/ai/egressExit.js';

function makeBus() {
  const emitted = [];
  return { emitted, emit: (n, p) => emitted.push({ n, p }), queue: (n, p) => emitted.push({ n, p }), on: () => {}, off: () => {} };
}

function cinderMission(overrides = {}) {
  return {
    id: 'm_5', type: 'patrol_clear', storyTag: CINDER_TAG, status: 'active',
    objectiveTarget: 3, objectiveProgress: 0, targetEntityIds: [7],
    completedTargetSlots: [],
    destSectorId: 'sector_charon_expanse',
    params: {
      cinderRouteVersion: 1, cinderTargetOwnerId: 'm_5', cinderIssuedSlots: [0, 1, 2],
      cinderMarkedWrecks: [],
      ...(overrides.params || {}),
    },
    ...overrides,
  };
}

function wasp(id, slot, pos = { x: 2000, z: 0 }, ai = { forceFlee: true }) {
  return {
    id, type: 'ship', alive: true, team: 1, pos, prevPos: { ...pos },
    data: {
      missionId: 'm_5', missionTag: 'm_5', missionPinned: true, missionTargetSlot: slot,
      ai: { ...ai },
    },
    flags: { missionPinned: true },
  };
}

function makeOwner(m, entities = []) {
  const map = new Map();
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, data: {} };
  map.set(1, player);
  for (const e of entities) map.set(e.id, e);
  const state = {
    playerId: 1, entities: map, entityList: [player, ...entities], simTime: 100, tick: 1,
    missions: { active: [m] }, world: { currentSectorId: 'sector_charon_expanse' },
  };
  const said = [];
  const owner = {
    state, said, completed: [],
    bus: makeBus(),
    _sayStoryLine: (text) => said.push(text),
    _completeMission: (mm) => { mm.status = 'completed'; owner.completed.push(mm.id); },
    _refreshTrackedMissionNav: () => {},
  };
  return owner;
}

test('a fleeing mark past the bound resolves as a lane clearance after the fade', () => {
  const m = cinderMission();
  const target = wasp(7, 2);
  const owner = makeOwner(m, [target]);
  const resolved = missionSpawningOps._resolveEscapedCinderTargets.call(owner, m, owner.state);
  assert.equal(resolved, 0, 'first sighting only starts the fade — the pilot still gets the window');
  assert.equal(target.data._cinderEscapeAt, 100 + EGRESS_FADE_S);
  owner.state.simTime += EGRESS_FADE_S + 0.01;
  const resolved2 = missionSpawningOps._resolveEscapedCinderTargets.call(owner, m, owner.state);
  assert.equal(resolved2, 1, 'the sustained escape resolves');
  assert.deepEqual(m.completedTargetSlots, [2]);
  assert.deepEqual(m.params.cinderEscapedSlots, [2]);
  assert.equal(m.objectiveProgress, 1);
  assert.deepEqual(m.targetEntityIds, []);
  assert.equal(target.data.missionPinned, false, 'contract identity releases the hull to the bound');
  assert.equal(target.data.missionId, null);
  assert.equal(target.data.missionTag, null);
  assert.equal(target.data.missionTargetSlot, undefined);
  assert.equal(target.flags.missionPinned, false);
  assert.ok(owner.said.some((t) => t.includes('Cinder Three ran') && t.includes('1/3')), 'clearance line names the slot');
  assert.ok(owner.bus.emitted.some((e) => e.n === 'mission:updated'), 'nav refresh emitted');
});

test('partial Cinder escape offloads and returns as ordinary NPC while remaining marks stay active', () => {
  const state = createGameState(47);
  state.mode = 'flight';
  state.meta.seed = 47;
  const bus = createRuntimeBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({ type: 'ship', pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, collides: true });
  state.playerId = player.id;
  player.isPlayer = true;
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);

  const m = cinderMission({ targetEntityIds: [] });
  state.missions.active = [m];
  state.world.currentSectorId = 'sector_charon_expanse';
  const origin = sectorGlobalOrigin(m.destSectorId);
  const targets = [0, 1, 2].map((slot) => {
    const target = helpers.spawnEntity({
      type: 'ship', pos: slot === 0
        ? { x: origin.x + 2000, z: origin.z }
        : { x: origin.x + 100 + slot * 20, z: origin.z + 100 },
      hull: 40, hullMax: 40, collides: true,
      data: { enemyTypeId: 'wasp_swarmer', lootTableId: 'wasp_swarmer', ai: slot === 0 ? { forceFlee: true } : { fsm: 'attack' } },
    });
    target.homeSectorId = m.destSectorId;
    target.data.homeSectorId = m.destSectorId;
    missionSpawningOps._stampMissionTargetIdentity.call({ state }, target, m, slot);
    m.targetEntityIds.push(target.id);
    return target;
  });
  const owner = {
    state, bus, helpers, _sayStoryLine: () => {}, _refreshTrackedMissionNav: () => {},
    _completeMission: (mission) => { mission.status = 'completed'; },
  };
  const escaped = targets[0];
  const recordId = escaped.data.worldRecordId;
  world._captureSectorDurableRecords(m.destSectorId, { reason: 'test_before_escape' });
  assert.equal(ensureWorldRecords(state.world).byId[recordId].kind, RECORD_KIND.MISSION_TARGET);

  missionSpawningOps._resolveEscapedCinderTargets.call(owner, m, state);
  state.simTime += EGRESS_FADE_S + 0.01;
  assert.equal(missionSpawningOps._resolveEscapedCinderTargets.call(owner, m, state), 1);
  assert.deepEqual(m.completedTargetSlots, [0]);

  // This is the production offload capture boundary. A live escapee remains an ordinary actor,
  // while the other two mission slots retain their exact mission-owned durable rows.
  world._captureSectorDurableRecords(m.destSectorId, { reason: 'test_offload_after_escape' });
  const bag = ensureWorldRecords(state.world);
  const escapedRecord = bag.byId[recordId];
  assert.ok(escapedRecord, 'the still-live escapee keeps a durable actor record');
  assert.equal(escapedRecord.kind, RECORD_KIND.NPC);
  assert.equal(escapedRecord.missionId, null);
  assert.deepEqual([1, 2].map((slot) => targets[slot].data.worldRecordId)
    .map((id) => bag.byId[id]?.missionId), ['m_5', 'm_5']);

  world._despawnEntityIds(new Set(targets.map((target) => target.id)));
  const active = world._emptySectorBag();
  world._rematerializeSectorRecords(m.destSectorId, active, RESIDENCY_TIER.FULL, { restoreDurableRecords: true });
  const restored = state.entityList.filter((entity) => entity?.alive && entity.data?.worldRecordId
    && targets.some((target) => target.data.worldRecordId === entity.data.worldRecordId));
  const restoredEscapee = restored.find((entity) => entity.data.worldRecordId === recordId);
  assert.ok(restoredEscapee, 'escaped live traffic can persist across sector reentry');
  assert.equal(restoredEscapee.data.missionId, undefined);
  assert.equal(restoredEscapee.data.missionTag, undefined);
  assert.equal(restoredEscapee.alive, true, 'reentry does not kill the escaped NPC as a completed mission target');
  m.targetEntityIds = []; // Mission restore clears volatile live ids before Continue adoption.
  const missionOwner = Object.assign(Object.create(missionSpawningOps), owner);
  assert.equal(missionSpawningOps._adoptLiveMissionTargets.call(missionOwner, m), 2);
  assert.deepEqual([...m.targetEntityIds].sort(), restored.filter((entity) => entity !== restoredEscapee)
    .map((entity) => entity.id).sort());
  assert.equal(restoredEscapee.alive, true);
});

test('re-closing inside the bound or the flee order ending cancels the escape', () => {
  const m = cinderMission();
  const target = wasp(7, 2);
  const owner = makeOwner(m, [target]);
  missionSpawningOps._resolveEscapedCinderTargets.call(owner, m, owner.state);
  assert.ok(Number.isFinite(target.data._cinderEscapeAt));
  target.pos = { x: 300, z: 0 }; // pilot closed back inside
  missionSpawningOps._resolveEscapedCinderTargets.call(owner, m, owner.state);
  assert.equal(target.data._cinderEscapeAt, undefined, 'escape stamp releases');
  target.pos = { x: 2000, z: 0 };
  missionSpawningOps._resolveEscapedCinderTargets.call(owner, m, owner.state);
  assert.ok(Number.isFinite(target.data._cinderEscapeAt));
  delete target.data.ai.forceFlee; // the order ended — the hull re-commits, no escape owed
  missionSpawningOps._resolveEscapedCinderTargets.call(owner, m, owner.state);
  assert.equal(target.data._cinderEscapeAt, undefined);
  assert.deepEqual(m.completedTargetSlots, []);
  assert.equal(m.params.cinderEscapedSlots, undefined);
});

test('no flee order or no separation never resolves', () => {
  const m = cinderMission({ targetEntityIds: [7, 8] });
  const fighting = wasp(7, 1, { x: 2000, z: 0 }, { fsm: 'attack' });
  const nearby = wasp(8, 2, { x: 300, z: 0 });
  const owner = makeOwner(m, [fighting, nearby]);
  owner.state.simTime += 600;
  const resolved = missionSpawningOps._resolveEscapedCinderTargets.call(owner, m, owner.state);
  assert.equal(resolved, 0);
  assert.deepEqual(m.completedTargetSlots, []);
});

test('escaped hull evidence resolves exhausted accounting when every slot is gone', () => {
  const m = cinderMission({
    completedTargetSlots: [0, 1, 2],
    objectiveProgress: 3,
    targetEntityIds: [],
    params: {
      cinderRouteVersion: 1, cinderTargetOwnerId: 'm_5', cinderIssuedSlots: [0, 1, 2],
      cinderMarkedWrecks: [
        { slot: 0, markerId: 'mk0', disposition: 'destroyed' },
        { slot: 1, markerId: 'mk1', disposition: 'stripped' },
      ],
      cinderEscapedSlots: [2],
    },
  });
  const a = cinderAccounting(m, {});
  assert.equal(a.valid, true);
  assert.equal(a.exhausted, true, 'destroyed + stripped + escaped covers every hull');
  assert.equal(a.delivered, false);
});

test('a live recoverable hull still blocks exhausted accounting', () => {
  const m = cinderMission({
    params: {
      cinderRouteVersion: 1, cinderTargetOwnerId: 'm_5', cinderIssuedSlots: [0, 1, 2],
      cinderMarkedWrecks: [
        { slot: 0, markerId: 'mk0' }, // pending — the hull is still out there
      ],
      cinderEscapedSlots: [1, 2],
    },
  });
  const a = cinderAccounting(m, {});
  assert.equal(a.exhausted, false, 'one towable hull remains');
  assert.equal(a.remaining.length, 1);
});

test('observeCinderEscape completes the contract once clearance and delivery both landed', () => {
  const m = cinderMission({
    completedTargetSlots: [0, 1],
    objectiveProgress: 2,
    targetEntityIds: [7],
    params: {
      cinderRouteVersion: 1, cinderTargetOwnerId: 'm_5', cinderIssuedSlots: [0, 1, 2],
      cinderMarkedWrecks: [
        { slot: 0, markerId: 'mk0', disposition: 'delivered' },
        { slot: 1, markerId: 'mk1', disposition: 'destroyed' },
      ],
      cinderDeliveredMarkerId: 'mk0', rookDeliveries: 1,
    },
  });
  const target = wasp(7, 2);
  const owner = makeOwner(m, [target]);
  assert.equal(observeCinderEscape(owner, target), true);
  assert.equal(m.status, 'completed', '3/3 + delivered completes');
  assert.equal(m.params.cinderOutcome, 'clear_and_delivered');
  assert.deepEqual(owner.completed, ['m_5']);
});

test('observeCinderEscape ignores foreign, dead, and already-counted bodies', () => {
  const m = cinderMission();
  const owner = makeOwner(m, []);
  const foreign = wasp(9, 1);
  foreign.data.missionId = 'other_contract';
  assert.equal(observeCinderEscape(owner, foreign), false);
  const dead = wasp(7, 2);
  dead.alive = false;
  assert.equal(observeCinderEscape(owner, dead), false);
  m.completedTargetSlots = [2];
  m.params.cinderEscapedSlots = [2];
  const again = wasp(7, 2);
  assert.equal(observeCinderEscape(owner, again), false, 'a slot already accounted never double-counts');
});

test('escaped slots survive the retry snapshot', () => {
  const m = cinderMission({
    completedTargetSlots: [2],
    objectiveProgress: 1,
    params: { cinderRouteVersion: 1, cinderTargetOwnerId: 'm_5', cinderIssuedSlots: [0, 1, 2], cinderMarkedWrecks: [], cinderEscapedSlots: [2] },
  });
  const owner = makeOwner(m, []);
  retainCinderRetry(owner, m);
  assert.deepEqual(owner.state.missions.cinderRetry.params.cinderEscapedSlots, [2]);
  const restored = cinderMission({ params: { cinderRouteVersion: 1 } });
  owner.state.missions.active = [restored];
  assert.equal(initializeCinderRoute(owner, restored), true);
  assert.deepEqual(restored.params.cinderEscapedSlots, [2], 'the escape ledger rides the retry');
  assert.deepEqual(restored.completedTargetSlots, [2]);
});
