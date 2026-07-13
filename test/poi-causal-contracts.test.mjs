import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import {
  POI_CAUSAL_BOARD_CAP,
  buildPoiCausalOffer,
  validatePoiCausalOffer,
} from '../src/missions/poiCausalOffers.js';
import { livingPoiBehaviors as livingProto } from '../src/systems/livingPoiBehaviors.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { scanner as scannerProto } from '../src/systems/scanner.js';

const SOURCE_SECTOR_ID = 'sector_helios_prime';
const SOURCE_STATION_ID = 'station_helios';
const SOURCE_FACTION_ID = 'faction_scn';

function makeAftermath(index = 0, familyId = 'derelict_salvage') {
  return {
    behaviorId: `poib:${SOURCE_SECTOR_ID}:${familyId}:zone-${index}`,
    familyId,
    sectorId: SOURCE_SECTOR_ID,
    zoneId: `zone-${index}`,
    kind: familyId === 'anomaly_research' ? 'stabilized_signal' : 'picked_clean',
    outcome: familyId === 'anomaly_research' ? 'triangulated' : 'records_recovered',
    resolvedAt: 20 + index,
    resolvedDay: index,
    expiresDay: index + 3,
    cause: familyId === 'anomaly_research'
      ? 'A coherent return survived the local scan.'
      : 'A registry fragment survived the wreck.',
    fingerprint: `pb_causal_${index}_${familyId}`,
  };
}

function buildOffer(index = 0, familyId = 'derelict_salvage', seed = 4701) {
  return buildPoiCausalOffer({
    seed,
    aftermath: makeAftermath(index, familyId),
    stationId: SOURCE_STATION_ID,
    factionId: SOURCE_FACTION_ID,
    zoneName: familyId === 'anomaly_research' ? 'Quiet Aperture' : 'Ledger Wreck',
  });
}

function boot(seed = 4701) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 20;
  state.tick = 1200;
  state.playerId = 1;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.player.credits = 5000;
  state.player.researchPoints = 0;
  state.player.stats = state.player.stats || {};
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200,
  };
  state.world.currentSectorId = SOURCE_SECTOR_ID;
  state.world.activeSector = { id: SOURCE_SECTOR_ID, stations: [], fields: [], pois: [], gates: [] };
  state.missions = { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null };
  state.story = { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 };
  state.ui = state.ui || {};
  state.nav = state.nav || {};
  state.factions[SOURCE_FACTION_ID] = { ...(state.factions[SOURCE_FACTION_ID] || {}), rep: 500 };

  const bus = createBus();
  const log = [];
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    log.push({ event, payload });
    return rawEmit(event, payload);
  };
  let nextId = 100;
  const player = {
    id: state.playerId,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const helpers = {
    hash32,
    mulberry32,
    player: () => player,
    voice: { say: () => true },
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: nextId++,
        alive: spec.alive !== false,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        data: { ...(spec.data || {}) },
        flags: { ...(spec.flags || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const worldMarks = [];
  const missions = Object.assign({}, missionsProto);
  const living = Object.assign({}, livingProto);
  const scanner = Object.assign({}, scannerProto);
  missions.init({
    state,
    bus,
    helpers,
    registry: {
      get(name) {
        return name === 'world'
          ? { markWorldRecordDestroyed: (recordId, options) => worldMarks.push({ recordId, options }) }
          : null;
      },
    },
  });
  living.init({ state, bus, helpers });
  scanner.init({ state, bus, helpers });
  return { state, bus, helpers, missions, living, scanner, player, log, worldMarks };
}

function resolvePoiLead(h, familyId = 'derelict_salvage') {
  const aftermath = makeAftermath(0, familyId);
  const row = {
    behaviorId: aftermath.behaviorId,
    familyId,
    sectorId: aftermath.sectorId,
    zoneId: aftermath.zoneId,
    zoneName: familyId === 'anomaly_research' ? 'Quiet Aperture' : 'Ledger Wreck',
    stationId: SOURCE_STATION_ID,
    beneficiaryFactionId: SOURCE_FACTION_ID,
    status: 'engaged',
    mapLabel: 'CAUSAL SITE',
    radarKind: familyId === 'anomaly_research' ? 'anomaly' : 'derelict',
    contract: { cause: aftermath.cause },
    fingerprint: aftermath.fingerprint,
  };
  assert.equal(h.living._resolve(row, aftermath.outcome, {}), true);
  const board = h.state.missions.boards[SOURCE_STATION_ID];
  const offer = board && board.slots.find((candidate) => candidate && candidate.source === 'poiBehavior');
  assert.ok(offer, 'resolving the physical POI boards one causal contract');
  return offer;
}

test('pure builder is stable by save seed plus aftermath fingerprint and selects one connected destination', () => {
  const first = buildOffer(0, 'derelict_salvage', 4701);
  const repeat = buildOffer(0, 'derelict_salvage', 4701);
  const otherCause = buildOffer(1, 'derelict_salvage', 4701);
  assert.deepEqual(first, repeat);
  assert.notEqual(first.id, otherCause.id);
  assert.deepEqual(validatePoiCausalOffer(first), { ok: true });
  assert.equal(first.source, 'poiBehavior');
  assert.equal(first.type, 'recon_scan');
  assert.equal(first.cause.fingerprint, makeAftermath().fingerprint);
  assert.equal(first.params.poiSignalFollowup.targetRecordId, repeat.params.poiSignalFollowup.targetRecordId);
  assert.notEqual(first.destSectorId, SOURCE_SECTOR_ID);
  assert.ok(first.params.poiSignalFollowup.targetType === 'wreck'
    || first.params.poiSignalFollowup.targetType === 'anomaly');
  assert.equal(first.params.poiSignalFollowup.team, 2);
  assert.equal(first.minRep, -1000, 'an earned causal lead cannot become unsolvable behind standing');
});

test('resolved derelict boards idempotently and external POI rows remain bounded across refresh', () => {
  const h = boot();
  const first = resolvePoiLead(h);
  assert.equal(validatePoiCausalOffer(first).ok, true);
  assert.equal(h.missions._onExternalBoardOffer(first), false, 'same stable offer cannot board twice');

  for (let index = 1; index < POI_CAUSAL_BOARD_CAP + 4; index++) {
    const offer = buildOffer(index);
    assert.equal(h.missions._onExternalBoardOffer(offer), true);
  }
  let rows = h.state.missions.boards[SOURCE_STATION_ID].slots
    .filter((candidate) => candidate && candidate.source === 'poiBehavior');
  assert.equal(rows.length, POI_CAUSAL_BOARD_CAP);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);

  h.state.simTime = 601;
  h.missions.ensureBoard(SOURCE_STATION_ID);
  rows = h.state.missions.boards[SOURCE_STATION_ID].slots
    .filter((candidate) => candidate && candidate.source === 'poiBehavior');
  assert.equal(rows.length, POI_CAUSAL_BOARD_CAP, 'unexpired causal leads survive normal board refresh');
});

test('accepted causal contract uses scanner progression and completes only the exact investigated entity', () => {
  const h = boot();
  const offer = resolvePoiLead(h, 'anomaly_research');
  assert.equal(h.missions.acceptMission(offer.id), true);
  const mission = h.state.missions.active.find((candidate) => candidate.sourceOfferId === offer.id);
  assert.ok(mission);
  assert.equal(mission.needsTargets, true);

  h.bus.emit('scan:completed', { targetId: null, sectorId: offer.destSectorId });
  h.bus.emit('signal:investigated', {
    signalId: 'signal:entity:wrong', entityId: 9999, sectorId: offer.destSectorId,
  });
  assert.ok(h.state.missions.active.includes(mission), 'generic and wrong-signal scans never advance the contract');

  h.state.world.currentSectorId = offer.destSectorId;
  h.state.world.activeSector = { id: offer.destSectorId, stations: [], fields: [], pois: [], gates: [] };
  h.bus.emit('sector:enter', { sectorId: offer.destSectorId });
  assert.equal(mission.targetEntityIds.length, 1);
  const target = h.state.entities.get(mission.targetEntityIds[0]);
  const follow = mission.params.poiSignalFollowup;
  assert.ok(target && target.alive);
  assert.equal(target.team, 2);
  assert.equal(target.data.worldRecordId, follow.targetRecordId);
  assert.equal(target.data.missionId, mission.id);
  assert.equal(follow.entityId, target.id);

  h.player.pos = { x: target.pos.x + 900, z: target.pos.z };
  h.scanner._pulse(h.state, h.player, h.state.simTime);
  const signalId = `signal:entity:${target.id}`;
  const stageOne = h.state.signalInvestigation.records[signalId];
  assert.equal(stageOne.stage, 1);
  h.scanner._pulse(h.state, h.player, h.state.simTime + 8.1);
  assert.equal(h.state.signalInvestigation.records[signalId].stage, 2);
  h.bus.emit('signal:track', { signalId });
  h.player.pos = { x: target.pos.x, z: target.pos.z };
  h.scanner._updateTrackedSignal(h.state);

  assert.equal(h.state.missions.active.includes(mission), false);
  const completion = h.log.find((row) => row.event === 'mission:completed'
    && row.payload.missionId === mission.id);
  assert.equal(completion.payload.source, 'poiBehavior');
  assert.equal(completion.payload.causeFingerprint, offer.cause.fingerprint);
  assert.equal(completion.payload.factionId, SOURCE_FACTION_ID);
  assert.ok(Number.isFinite(completion.payload.repMult));
  assert.equal(h.log.filter((row) => row.event === 'economy:grantCredits'
    && row.payload.reason === `mission:${mission.id}`).length, 1);
  assert.equal(h.state.player.credits, 5000, 'missions emits a wallet intent and never writes credits');
  assert.equal(h.state.factions[SOURCE_FACTION_ID].rep, 500,
    'missions carries faction settlement on mission:completed and never writes rep');
  assert.deepEqual(h.state.player.cargo.items, {}, 'signal settlement never writes cargo');
  assert.ok(h.state.player.researchPoints > 0);
  assert.ok(h.log.some((row) => row.event === 'research:pointsChanged'));
  const receipt = h.state.missions.receipts.find((row) => row.missionId === mission.id);
  assert.equal(receipt.sourceOfferId, offer.id);
  assert.equal(receipt.causeFingerprint, offer.cause.fingerprint);
  assert.equal(receipt.targetRecordId, follow.targetRecordId);
  assert.deepEqual(h.worldMarks, [{
    recordId: follow.targetRecordId,
    options: { outcome: 'investigated', reason: 'mission_settled' },
  }], 'the world authority tombstones any saved target record on settlement');
  h.bus.emit('signal:investigated', {
    signalId, entityId: target.id, sectorId: offer.destSectorId,
  });
  assert.equal(h.log.filter((row) => row.event === 'economy:grantCredits'
    && row.payload.reason === `mission:${mission.id}`).length, 1,
  'duplicate investigation receipts cannot pay twice');
  assert.equal(h.worldMarks.length, 1);
  const debrief = h.log.find((row) => row.event === 'comms:popup'
    && /registry|signal/i.test(row.payload && row.payload.text || ''));
  assert.ok(debrief, 'completion emits a cause-specific debrief');
});

test('travel and Continue adopt the same durable target record without spawning a duplicate', () => {
  const first = boot(4702);
  const offer = resolvePoiLead(first);
  assert.equal(first.missions.acceptMission(offer.id), true);
  const mission = first.state.missions.active.find((candidate) => candidate.sourceOfferId === offer.id);
  first.state.world.currentSectorId = offer.destSectorId;
  first.bus.emit('sector:enter', { sectorId: offer.destSectorId });
  const original = first.state.entities.get(mission.targetEntityIds[0]);
  const recordId = original.data.worldRecordId;
  const saved = first.missions.serialize();

  const resumed = boot(4702);
  resumed.state.world.currentSectorId = offer.destSectorId;
  const rematerialized = resumed.helpers.spawnEntity({
    type: 'wreck', team: 2, factionId: null, alive: true,
    pos: { ...original.pos }, collides: false,
    data: { worldRecordId: recordId, durable: true, homeSectorId: offer.destSectorId },
  });
  resumed.missions.deserialize(saved);
  resumed.bus.emit('save:loaded', {});

  const continuedMission = resumed.state.missions.active.find((candidate) => candidate.sourceOfferId === offer.id);
  assert.deepEqual(continuedMission.targetEntityIds, [rematerialized.id]);
  assert.equal(continuedMission.params.poiSignalFollowup.entityId, rematerialized.id);
  assert.equal(rematerialized.data.missionId, continuedMission.id);
  assert.equal(rematerialized.data.worldRecordId, recordId);
  const before = resumed.state.entityList.length;
  resumed.bus.emit('sector:enter', { sectorId: offer.destSectorId, continuous: true, noTeleport: true });
  assert.equal(resumed.state.entityList.length, before);
  assert.deepEqual(continuedMission.targetEntityIds, [rematerialized.id]);
});

test('POI adoption ignores stale wrong-record targets and retains one deterministic exact record', () => {
  const staleHarness = boot(4703);
  const staleOffer = resolvePoiLead(staleHarness);
  assert.equal(staleHarness.missions.acceptMission(staleOffer.id), true);
  const staleMission = staleHarness.state.missions.active
    .find((candidate) => candidate.sourceOfferId === staleOffer.id);
  const stale = staleHarness.helpers.spawnEntity({
    type: 'wreck', team: 2, alive: true,
    pos: { x: 100, z: 100 }, collides: false,
    data: {
      missionId: staleMission.id,
      missionTag: staleMission.id,
      worldRecordId: 'world:stale-wrong-record',
      durable: true,
    },
  });
  staleMission.targetEntityIds = [stale.id];
  staleHarness.state.world.currentSectorId = staleOffer.destSectorId;
  staleHarness.missions._ensureMissionTargets(staleMission);

  assert.equal(stale.alive, true, 'an unrelated durable entity is ignored rather than claimed');
  assert.equal(stale.data.worldRecordId, 'world:stale-wrong-record');
  assert.equal(staleMission.targetEntityIds.length, 1);
  const replacement = staleHarness.state.entities.get(staleMission.targetEntityIds[0]);
  assert.notEqual(replacement.id, stale.id);
  assert.equal(replacement.data.worldRecordId,
    staleMission.params.poiSignalFollowup.targetRecordId);

  const duplicateHarness = boot(4704);
  const duplicateOffer = resolvePoiLead(duplicateHarness);
  assert.equal(duplicateHarness.missions.acceptMission(duplicateOffer.id), true);
  const duplicateMission = duplicateHarness.state.missions.active
    .find((candidate) => candidate.sourceOfferId === duplicateOffer.id);
  const recordId = duplicateMission.params.poiSignalFollowup.targetRecordId;
  const first = duplicateHarness.helpers.spawnEntity({
    type: 'wreck', team: 2, alive: true,
    pos: { x: 200, z: 200 }, collides: false,
    data: { worldRecordId: recordId, durable: true },
  });
  const retained = duplicateHarness.helpers.spawnEntity({
    type: 'wreck', team: 2, alive: true,
    pos: { x: 300, z: 300 }, collides: false,
    data: { worldRecordId: recordId, durable: true },
  });
  duplicateMission.targetEntityIds = [retained.id, first.id];
  duplicateMission.params.poiSignalFollowup.entityId = retained.id;
  duplicateHarness.missions._adoptLiveMissionTargets(duplicateMission);

  assert.deepEqual(duplicateMission.targetEntityIds, [retained.id]);
  assert.equal(duplicateMission.params.poiSignalFollowup.entityId, retained.id);
  assert.equal(retained.alive, true);
  assert.equal(first.alive, false, 'duplicate live materialization is retired deterministically');
});

test('abandon after hard sector exit tombstones the durable POI record with no runtime target ids', () => {
  const h = boot(4705);
  const offer = resolvePoiLead(h);
  assert.equal(h.missions.acceptMission(offer.id), true);
  const mission = h.state.missions.active.find((candidate) => candidate.sourceOfferId === offer.id);
  const recordId = mission.params.poiSignalFollowup.targetRecordId;
  h.state.world.currentSectorId = offer.destSectorId;
  h.bus.emit('sector:enter', { sectorId: offer.destSectorId });
  const target = h.state.entities.get(mission.targetEntityIds[0]);
  assert.ok(target && target.alive);

  h.bus.emit('sector:exit', { sectorId: offer.destSectorId });
  assert.deepEqual(mission.targetEntityIds, [], 'hard exit clears ephemeral entity ids');
  h.worldMarks.length = 0;
  assert.equal(h.missions.abandonMission(mission.id), true);

  assert.deepEqual(h.worldMarks, [{
    recordId,
    options: { outcome: 'destroyed', reason: 'mission_settled' },
  }]);
  assert.equal(target.alive, false, 'cleanup also retires an exact live materialization if present');
});

test('missions reject malformed poiBehavior producers before they reach a board', () => {
  const h = boot();
  const good = buildOffer();
  const malformed = {
    ...good,
    id: `${good.id}:bad`,
    destSectorId: SOURCE_SECTOR_ID,
    params: { ...good.params, poiSignalFollowup: { ...good.params.poiSignalFollowup, targetRecordId: '' } },
  };
  assert.equal(validatePoiCausalOffer(malformed).ok, false);
  assert.equal(h.missions._onExternalBoardOffer(malformed), false);
  const standingGated = { ...good, id: `${good.id}:gated`, minRep: 100 };
  assert.equal(validatePoiCausalOffer(standingGated).ok, false);
  assert.equal(h.missions._onExternalBoardOffer(standingGated), false);
  assert.equal(h.state.missions.boards[SOURCE_STATION_ID], undefined);
});
