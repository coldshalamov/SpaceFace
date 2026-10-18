import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { missions } from '../src/systems/missions.js';
import { world as worldSystem } from '../src/systems/world.js';
import { RESIDENCY_TIER } from '../src/data/sectorCoordinates.js';
import { upsertRecord } from '../src/world/worldRecords.js';

const SECTOR = 'sector_helios_prime';
const STATION = 'station_helios';

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.meta.seed = 4242;
  state.settings.gameplay.tutorialHints = false;
  const bus = createBus();
  const helpers = { hash32, mulberry32 };
  const world = Object.create(worldSystem);
  const missionSystem = Object.create(missions);
  const registry = { get: (name) => name === 'world' ? world : null };
  const ctx = { state, bus, helpers, registry };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', team: 0, pos: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 4, mass: 12,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  world.init(ctx);
  missionSystem.init(ctx);
  world.enterSector(SECTOR);
  return { state, bus, helpers, world, missionSystem };
}

function accept(h, type = 'bounty_hunt', params = {}) {
  const offer = {
    id: `offer_retirement_${h.state.missions.nextId}`,
    type, stationId: STATION, factionId: 'faction_mts',
    destStationId: STATION, destSectorId: SECTOR,
    title: 'Clear the recovery lane', summary: 'Help the station crew.',
    reward_cr: 900, collateral_cr: 0, riskTier: 1, distance: 1000,
    duration_s: 600, params: { targetStrength: 1, ...params },
    source: 'careerContract',
  };
  h.state.missions.boards[STATION] = { refreshEpoch: 0, slots: [offer] };
  h.bus.emit('ui:acceptMission', { missionId: offer.id });
  const m = h.state.missions.active.find((row) => row.sourceOfferId === offer.id);
  assert.ok(m, 'the board contract was accepted');
  assert.ok(m.targetEntityIds.length, 'the accepted contract spawned its targets');
  return m;
}

function captureOnExit(h, m) {
  const targets = m.targetEntityIds.map((id) => h.state.entities.get(id));
  h.world._setSectorTier(SECTOR, RESIDENCY_TIER.RECORD_ONLY);
  h.state.world.currentSectorId = 'sector_ceres_belt';
  for (const target of targets) {
    assert.ok(h.state.world.records.byId[target.data.worldRecordId], 'sector demotion recorded the target');
  }
  return targets;
}

function reenter(h) {
  h.world.enterSector(SECTOR);
  return h.state.entityList.filter((e) => e && e.alive);
}

for (const settlement of ['abandon', 'expire', 'fail', 'complete']) {
  test(`${settlement} retires a recorded bounty target before sector re-entry`, () => {
    const h = boot();
    const m = accept(h);
    const [target] = captureOnExit(h, m);
    if (settlement === 'abandon') h.bus.emit('ui:abandonMission', { missionId: m.id });
    else if (settlement === 'expire') h.missionSystem._expireMission(m, 0);
    else if (settlement === 'fail') h.missionSystem._failMission(m, 0, 'target_lost');
    else h.missionSystem._completeMission(m, 0);
    const live = reenter(h);
    assert.equal(live.filter((e) => e.data?.missionTag === m.id).length, 0,
      'the settled contract must not respawn an orphan target');
    assert.equal(live.filter((e) => e.data?.worldRecordId === target.data.worldRecordId).length, 0,
      'the swept target stays gone');
    assert.equal(h.state.world.records.byId[target.data.worldRecordId].alive, false);
  });
}

test('abandon retires a record-only target when its runtime target list is absent', () => {
  const h = boot();
  const m = accept(h);
  const [target] = captureOnExit(h, m);
  h.helpers.removeEntity(target.id, { immediate: true, reason: 'sector_residency' });
  m.targetEntityIds = [];
  h.bus.emit('ui:abandonMission', { missionId: m.id });
  assert.equal(reenter(h).filter((e) => e.data?.missionTag === m.id).length, 0,
    'an offscreen record must retire even without a live target id');
});

test('settlement preserves a recorded target still claimed by another active contract', () => {
  const h = boot();
  const m = accept(h);
  const [target] = captureOnExit(h, m);
  const other = { ...m, id: 'second_active_contract', targetEntityIds: [target.id], params: {} };
  h.state.missions.active.push(other);
  h.bus.emit('ui:abandonMission', { missionId: m.id });
  assert.equal(target.alive, true, 'the other contract keeps its target');
  assert.equal(h.state.world.records.byId[target.data.worldRecordId].alive, true,
    'the other contract keeps the durable target too');
  assert.equal(reenter(h).filter((e) => e.data?.worldRecordId === target.data.worldRecordId).length, 1);
});

test('a failed escort wing survives two residency cycles as an unpinned ordinary ship', () => {
  const h = boot();
  const m = accept(h, 'escort', { convoySize: 2, ambushSize: 0 });
  const targets = captureOnExit(h, m);
  const wing = targets.find((e) => e.data.escortee === true);
  assert.ok(wing, 'the convoy has a surviving wing hauler');
  h.bus.emit('ui:abandonMission', { missionId: m.id });
  assert.equal(wing.alive, true);
  assert.equal(wing.data.missionTag, null);
  let rec = h.state.world.records.byId[wing.data.worldRecordId];
  assert.equal(rec.alive, true);
  assert.equal(rec.missionTag, null, 'the survivor record must lose the settled contract');
  assert.equal(rec.kind, 'npc');
  assert.equal(wing.data.missionPinned, false);
  assert.equal(wing.flags.missionPinned, false);
  h.world._setSectorTier(SECTOR, RESIDENCY_TIER.RECORD_ONLY);
  let restored = reenter(h).find((e) => e.data?.worldRecordId === rec.recordId);
  assert.ok(restored, 'the surviving hauler returns as lane life');
  assert.equal(restored.data.missionTag ?? null, null);
  assert.equal(restored.data.missionPinned === true || restored.flags?.missionPinned === true, false);
  h.world._setSectorTier(SECTOR, RESIDENCY_TIER.RECORD_ONLY);
  rec = h.state.world.records.byId[rec.recordId];
  restored = reenter(h).find((e) => e.data?.worldRecordId === rec.recordId);
  assert.ok(restored, 'the released hauler survives a second capture');
  assert.equal(restored.data.missionTag ?? null, null);
});

test('a fleeing bounty target keeps its life and loses its durable contract claim', () => {
  const h = boot();
  const m = accept(h);
  const target = h.state.entities.get(m.targetEntityIds[0]);
  target.data.ai.fsm = 'flee';
  captureOnExit(h, m);
  h.bus.emit('ui:abandonMission', { missionId: m.id });
  const rec = h.state.world.records.byId[target.data.worldRecordId];
  assert.equal(target.alive, true);
  assert.equal(rec.alive, true, 'the handed-off target must not be retired as destroyed');
  assert.equal(rec.missionTag, null, 'the fleeing actor loses its durable contract claim');
  assert.equal(rec.kind, 'npc');
  assert.equal(target.flags.missionPinned, false);
  h.world._setSectorTier(SECTOR, RESIDENCY_TIER.RECORD_ONLY);
  const restored = reenter(h).find((e) => e.data?.worldRecordId === rec.recordId);
  assert.ok(restored);
  assert.equal(restored.data.missionTag ?? null, null);
  assert.equal(restored.data.missionPinned === true || restored.flags?.missionPinned === true, false);
});

test('an explicit released-actor upsert clears both spellings of a prior contract claim', () => {
  const h = boot();
  const m = accept(h);
  const [target] = captureOnExit(h, m);
  const prior = h.state.world.records.byId[target.data.worldRecordId];
  const rec = upsertRecord(h.state.world.records, {
    ...prior, kind: 'npc', missionId: null, missionTag: null,
  });
  assert.equal(rec.missionId, null, 'explicit release clears the latched mission id');
  assert.equal(rec.missionTag, null, 'explicit release clears the legacy mission tag');
  assert.equal(rec.alive, true);
});

test('record-only cleanup also works without an initialized world system', () => {
  const h = boot();
  const m = accept(h);
  const [target] = captureOnExit(h, m);
  h.helpers.removeEntity(target.id, { immediate: true, reason: 'sector_residency' });
  m.targetEntityIds = [];
  h.missionSystem.registry = null;
  h.bus.emit('ui:abandonMission', { missionId: m.id });
  const rec = h.state.world.records.byId[target.data.worldRecordId];
  assert.equal(rec.alive, false);
  assert.equal(rec.outcome, 'destroyed');
});
