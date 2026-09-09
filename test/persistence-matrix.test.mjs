import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_TIER } from '../src/world/activityClassification.js';
import {
  ensureActivityClassified,
  entityNeedsAiThink,
  entityNeedsPhysics,
} from '../src/world/activityRuntime.js';
import {
  advanceWorldRecord,
  advanceResourceBody,
} from '../src/world/worldCatchup.js';
import {
  captureEntityRecord,
  createEmptyRecordsBag,
  gcExpiredRecentMemory,
  isPermanentWorldRecord,
  markRecordDestroyed,
  recordShouldRematerialize,
  upsertRecord,
} from '../src/world/worldRecords.js';
import { isEntityRenderRelevant } from '../src/render/renderer.js';
import { packPresentationWorldToFence, createSnapshotFence } from '../src/render/snapshotFence.js';

function makeState(entities, extras = {}) {
  const map = new Map();
  for (const entity of entities) map.set(entity.id, entity);
  return {
    tick: extras.tick == null ? 10 : extras.tick,
    simTime: extras.simTime == null ? 10 : extras.simTime,
    playerId: 1,
    mode: 'flight',
    camera: { zoom: 144, tilt: 60 },
    settings: { video: { fov: 50 } },
    entities: map,
    entityList: entities,
    player: extras.player || {},
    combat: extras.combat || {},
    world: extras.world || { currentSectorId: 'sec_helios' },
    meta: extras.meta || { seed: 47 },
    ...extras,
  };
}

function ship(id, x, extras = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 8,
    pos: { x, z: 0 },
    vel: { x: extras.vx || 0, z: 0 },
    rot: 0,
    angVel: 0,
    team: extras.team == null ? 1 : extras.team,
    isPlayer: extras.isPlayer === true,
    data: extras.data || {},
    flags: extras.flags || {},
    homeSectorId: extras.homeSectorId || 'sec_helios',
  };
}

function rock(id, x, extras = {}) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    collides: true,
    radius: 10,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    data: {
      oreHP: extras.oreHP == null ? 40 : extras.oreHP,
      oreHPMax: extras.oreHPMax == null ? 80 : extras.oreHPMax,
      fieldId: 'field_a',
      activityObjectSlotId: String(id),
      ...(extras.data || {}),
    },
    flags: extras.flags || {},
  };
}

test('mine, leave 2s and 30s, return: same rock, remaining ore, no Rapier while far', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const ast = rock(12, 30, { oreHP: 17 });
  const state = makeState([player, ast], { tick: 1, simTime: 1 });
  ensureActivityClassified(state);
  assert.equal(entityNeedsPhysics(ast), true);
  ast.pos.x = 5000;
  for (let i = 2; i <= 200; i++) {
    state.tick = i;
    state.simTime = i / 60;
    ensureActivityClassified(state);
  }
  assert.equal(ast.data.oreHP, 17);
  assert.equal(ast.alive, true);
  assert.equal(entityNeedsPhysics(ast), false);
  state.tick = 1860;
  state.simTime = 31;
  ensureActivityClassified(state);
  assert.equal(ast.data.oreHP, 17);
  assert.equal(entityNeedsPhysics(ast), false);
  ast.pos.x = 20;
  ast.activity.simTier = SIM_TIER.S3_DORMANT;
  ast.activity.graceUntilT = -1;
  ast.activity.lastExactT = 4;
  state.tick = 1801;
  state.simTime = 32;
  ensureActivityClassified(state);
  assert.equal(ast.data.oreHP, 17);
  assert.equal(entityNeedsPhysics(ast), true);
});

test('follow passive ship and chase hostile across the render edge', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const hauler = ship(4, 40, { data: { itinerary: { routeId: 'lane_a' } }, team: 2 });
  const pirate = ship(2, 40, {
    team: 1,
    data: { combat: { targetId: 1 }, ai: { combatant: true, passive: false } },
  });
  const state = makeState([player, hauler, pirate], { tick: 0, simTime: 0 });
  ensureActivityClassified(state);
  hauler.pos.x = 4000;
  pirate.pos.x = 2500;
  for (let i = 1; i <= 150; i++) {
    state.tick = i;
    state.simTime = i / 60;
    ensureActivityClassified(state);
  }
  assert.equal(hauler.alive, true);
  assert.equal(pirate.alive, true);
  assert.equal(hauler.activity.simTier, SIM_TIER.S2_ABSTRACT);
  assert.equal(pirate.activity.simTier, SIM_TIER.S0_EXACT);
  assert.equal(isEntityRenderRelevant(hauler, state), false);
  assert.equal(entityNeedsAiThink(pirate, state), true);
  assert.equal(entityNeedsPhysics(hauler), false);
});

test('killed durable actor does not rematerialize; replacement gets a new id', () => {
  const bag = createEmptyRecordsBag();
  const rec = captureEntityRecord(ship(6, 100, {
    data: { homeSectorId: 'sec_helios' },
    homeSectorId: 'sec_helios',
  }), { sectorId: 'sec_helios', seed: 47, tick: 10, simTime: 10 });
  upsertRecord(bag, rec);
  markRecordDestroyed(bag, rec.recordId, { outcome: 'destroyed' });
  assert.equal(recordShouldRematerialize(bag.byId[rec.recordId], 'FULL'), false);
  const replacement = captureEntityRecord(ship(7, 120, {
    data: { homeSectorId: 'sec_helios' },
    homeSectorId: 'sec_helios',
  }), { sectorId: 'sec_helios', seed: 47, tick: 40, simTime: 40 });
  assert.notEqual(replacement.recordId, rec.recordId);
});

test('tether stays exact off-glass; itinerary catch-up uses simTime', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const chunk = rock(9, 3000, { flags: { tethered: true } });
  const state = makeState([player, chunk], {
    combat: { attachments: { byId: { t1: { ownerId: 1, targetId: 9, state: 'active' } } } },
  });
  ensureActivityClassified(state);
  assert.equal(chunk.activity.simTier, SIM_TIER.S0_EXACT);
  const advanced = advanceWorldRecord({
    pos: { x: 0, z: 0 },
    vel: { x: 10, z: 0 },
    rot: 0,
    angVel: 0,
    lastExactT: 0,
    intent: { kind: 'travel', routeId: 'lane_a', startT: 0, endT: 10 },
    alive: true,
  }, 0, 4, {});
  assert.ok(advanced.pos.x > 0);
  const ore = advanceResourceBody({
    oreHp: 10,
    oreHpMax: 80,
    lastMinedT: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    recoveryPolicy: { oreRate: 1 },
  }, 0, 5, {});
  assert.ok(ore.oreHp >= 10);
});

test('recent-memory records expire; wrecks do not', () => {
  const bag = createEmptyRecordsBag();
  const generic = {
    recordId: 'wr_generic',
    kind: 'npc',
    lastObservedT: 0,
    alive: true,
  };
  const wreck = {
    recordId: 'wr_wreck',
    kind: 'wreck',
    lastObservedT: 0,
    alive: true,
  };
  bag.byId.wr_generic = generic;
  bag.byId.wr_wreck = wreck;
  assert.equal(isPermanentWorldRecord(wreck), true);
  assert.equal(gcExpiredRecentMemory(bag, 200, 180), 1);
  assert.equal(bag.byId.wr_generic, undefined);
  assert.equal(bag.byId.wr_wreck.recordId, 'wr_wreck');
});

test('snapshot fence packs presentation-world columns without live object chase', () => {
  const world = {
    alive: new Uint8Array([1, 1]),
    activeSlots: new Uint32Array([0, 1]),
    entityIds: new Float64Array([11, 22]),
    typeCodes: new Uint16Array([1, 1]),
    x: new Float64Array([3, 8]),
    y: new Float64Array([0, 0]),
    z: new Float64Array([4, 1]),
    flags: new Uint32Array([0, 0]),
    getDiagnostics() { return { active: 2 }; },
  };
  const fence = createSnapshotFence({ capacity: 8 });
  const packed = packPresentationWorldToFence(world, fence, 12);
  assert.equal(packed, 2);
  const latest = fence.latestSnapshot();
  assert.equal(latest.columns.entityId[0], 11);
  assert.equal(latest.columns.position[0], 3);
  assert.equal(fence.sequence, 1);
});
