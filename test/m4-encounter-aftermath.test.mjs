import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEncounterCausality,
  causeContractOffer,
  encounterVarietyKey,
  resolvedEncounterFingerprint,
} from '../src/world/encounterCausality.js';
import {
  aftermathWrecks,
  aftermathForSector,
  causalAftermathForSector,
} from '../src/systems/aftermathWrecks.js';
import { missions } from '../src/systems/missions.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) { const list = this.handlers.get(name) || []; list.push(fn); this.handlers.set(name, list); }
  off(name, fn) { this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn)); }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function baseState(seed = 47) {
  return {
    meta: { seed },
    tick: 600,
    simTime: 10,
    playerId: 1,
    player: { credits: 5000, cargo: { items: {} }, stats: {} },
    factions: { faction_scn: { rep: 500 } },
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    entities: new Map(),
    entityList: [],
    ui: {},
  };
}

function harness(state = baseState()) {
  const bus = new Bus();
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: nextId++, alive: true, data: { ...(spec.data || {}) } };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  aftermathWrecks.init({ state, bus, helpers });
  return { state, bus, helpers };
}

test('resolved encounter fingerprints are deterministic six-part experience tuples', () => {
  const input = {
    seed: 47,
    encounterId: 'enc_sector_helios_3_ambush_snare_1',
    shapeId: 'ambush_snare',
    sectorId: 'sector_helios_prime',
    zoneId: 'helios_lane',
    zoneType: 'trade_lane',
    doctrineId: 'interceptor_flyby',
    variantKind: 'ambush_snare',
    script: 'ambush',
  };
  const a = buildEncounterCausality(input);
  const b = buildEncounterCausality(input);
  assert.deepEqual(a, b);
  assert.equal(a.varietyKey, encounterVarietyKey(input));
  const resolvedA = resolvedEncounterFingerprint(a, 'cleared');
  const resolvedB = resolvedEncounterFingerprint(b, 'cleared');
  assert.deepEqual(resolvedA, resolvedB);
  assert.equal(resolvedA.tuple.length, 6);
  assert.deepEqual(resolvedA.tuple, [
    'ambush_snare', 'interceptor_flyby', 'trade_lane', 'ambush_snare', 'cleared', 'security_relief',
  ]);
  assert.notEqual(
    resolvedEncounterFingerprint(a, 'escaped').fingerprint,
    resolvedA.fingerprint,
    'consequence changes the experience fingerprint',
  );
});
test('aftermath markers rematerialize once after travel and Continue, then stay gone after salvage', () => {
  const state = baseState();
  const { bus } = harness(state);
  const zone = zonesForSector('sector_helios_prime')[0];
  assert.ok(zone && zone.center, 'Helios has a named zone fixture');
  const pos = sectorLocalToGlobalForSector(zone.center, 'sector_helios_prime');
  const causality = buildEncounterCausality({
    seed: 47, encounterId: 'enc_a', shapeId: 'ambush_snare', sectorId: 'sector_helios_prime',
    zoneId: zone.id, zoneType: zone.type, doctrineId: 'interceptor_flyby', script: 'ambush',
  });
  const victim = {
    id: 40, type: 'ship', alive: false, pos, factionId: 'faction_reach',
    data: { defId: 'raider', encounterFingerprint: causality.fingerprint, encounterCausality: causality },
  };
  state.entities.set(victim.id, victim);
  state.entityList.push(victim);
  bus.emit('entity:killed', { id: victim.id, killerId: state.playerId, pos, sectorId: 'sector_helios_prime' });
  assert.equal(aftermathForSector(state, 'sector_helios_prime').length, 1);

  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime', continuous: true, noTeleport: true });
  const firstSpawns = bus.log.filter((entry) => entry.name === 'aftermathWreck:spawned');
  assert.equal(firstSpawns.length, 1, 'repeat/continuous enter cannot duplicate a live marker');

  const saved = aftermathWrecks.serialize();
  aftermathWrecks.destroy();
  const resumed = baseState();
  const resumedHarness = harness(resumed);
  aftermathWrecks.deserialize(saved);
  resumedHarness.bus.emit('save:loaded', {});
  resumedHarness.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  const continuedSpawns = resumedHarness.bus.log.filter((entry) => entry.name === 'aftermathWreck:spawned');
  assert.equal(continuedSpawns.length, 1, 'Continue plus enter rematerializes exactly one wreck');

  resumedHarness.bus.emit('salvage:completed', {
    wreckId: continuedSpawns[0].payload.entityId,
    markerId: continuedSpawns[0].payload.markerId,
  });
  assert.equal(aftermathForSector(resumed, 'sector_helios_prime').length, 0);
  const afterSalvageSave = aftermathWrecks.serialize();
  aftermathWrecks.deserialize(afterSalvageSave);
  resumedHarness.bus.emit('save:loaded', {});
  assert.equal(aftermathForSector(resumed, 'sector_helios_prime').length, 0, 'salvaged marker cannot ghost after Continue');
  aftermathWrecks.destroy();
});

test('adverse encounters post one evidence-linked remedy and settle its field impulse once', () => {
  const state = baseState();
  const { bus } = harness(state);
  const causality = buildEncounterCausality({
    seed: 47, encounterId: 'enc_distress_1', shapeId: 'distress_call', variantKind: 'distress_genuine',
    sectorId: 'sector_helios_prime', zoneId: 'helios_lane', zoneType: 'trade_lane', script: 'distress',
  });
  const resolved = resolvedEncounterFingerprint(causality, 'lost');
  causality.resolvedFingerprint = resolved.fingerprint;
  bus.emit('encounter:resolved', { causality, outcome: 'lost', t: 18 });
  const cause = causalAftermathForSector(state, 'sector_helios_prime')[0];
  assert.equal(cause.status, 'open');
  assert.match(cause.evidence, /transponder/i);
  assert.match(cause.remedy, /recorder/i);

  let offered = null;
  bus.on('mission:offered', (offer) => {
    offered = offer;
    bus.emit('mission:offerBoarded', {
      offerId: offer.id,
      source: offer.source,
      causeFingerprint: offer.cause.fingerprint,
    });
  });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.ok(offered);
  assert.equal(offered.source, 'encounterAftermath');
  assert.equal(offered.cause.fingerprint, cause.fingerprint);
  assert.match(offered.summary, /Evidence:.*Remedy:/);

  const missionPayload = {
    missionId: 'm_after_1', source: 'encounterAftermath', causeFingerprint: cause.fingerprint,
  };
  bus.emit('mission:accepted', missionPayload);
  bus.emit('mission:completed', missionPayload);
  bus.emit('mission:completed', missionPayload);
  const impulses = bus.log.filter((entry) => entry.name === 'sectorsim:impulse'
    && entry.payload.fingerprint === cause.fingerprint);
  assert.equal(impulses.length, 1, 'duplicate completion cannot settle reward/remedy twice');
  assert.ok(impulses[0].payload.danger < 0);
  assert.equal(causalAftermathForSector(state, 'sector_helios_prime')[0].status, 'remedied');
  aftermathWrecks.destroy();
});

test('missions preserve legacy lifecycle payloads alongside encounter aftermath identity', () => {
  const state = baseState();
  state.missions = { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null };
  state.story = { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 };
  const bus = new Bus();
  missions.init({ state, bus, helpers: {} });
  state.missions.boards.station_helios = { refreshEpoch: 0, slots: [] };
  const causality = buildEncounterCausality({
    seed: 47, encounterId: 'enc_toll_1', shapeId: 'pirate_toll', sectorId: 'sector_helios_prime', zoneId: 'helios_lane',
  });
  const cause = {
    fingerprint: causality.fingerprint, status: 'open', actor: causality.actor, zoneName: 'Helios Lane',
    evidence: causality.evidence, remedy: 'Clear the toll crew.', motiveId: causality.motiveId,
    consequenceKind: 'security', remedyType: 'patrol_clear', sectorId: 'sector_helios_prime', attempts: 0,
  };
  const offer = causeContractOffer(cause, { id: 'station_helios', factionId: 'faction_scn' }, 47);
  assert.equal(missions._onExternalBoardOffer(offer), true);
  const boarded = state.missions.boards.station_helios.slots.find((entry) => entry.id === offer.id);
  assert.ok(boarded);
  boarded.storyTag = 'm4:aftermath-contract';
  const instance = missions._instanceFromOffer(boarded);
  assert.equal(instance.source, 'encounterAftermath');
  assert.equal(instance.cause.fingerprint, cause.fingerprint);

  assert.equal(missions.acceptMission(boarded.id), true);
  const acceptedMission = state.missions.active[0];
  acceptedMission.chainNextSeed = null;
  const accepted = bus.log.find((entry) => entry.name === 'mission:accepted');
  assert.deepEqual({
    missionId: accepted.payload.missionId,
    type: accepted.payload.type,
    storyTag: accepted.payload.storyTag,
    source: accepted.payload.source,
    causeFingerprint: accepted.payload.causeFingerprint,
  }, {
    missionId: acceptedMission.id, type: acceptedMission.type, storyTag: 'm4:aftermath-contract',
    source: 'encounterAftermath', causeFingerprint: cause.fingerprint,
  });
  assert.equal(accepted.payload.sourceOfferId, boarded.id, 'external offer provenance survives acceptance');

  missions._completeMission(acceptedMission, 0);
  const completed = bus.log.find((entry) => entry.name === 'mission:completed');
  assert.equal(Number.isFinite(completed.payload.repMult), true);
  assert.deepEqual({
    missionId: completed.payload.missionId,
    type: completed.payload.type,
    factionId: completed.payload.factionId,
    repMult: completed.payload.repMult,
    source: completed.payload.source,
    causeFingerprint: completed.payload.causeFingerprint,
  }, {
    missionId: acceptedMission.id, type: acceptedMission.type, factionId: acceptedMission.factionId,
    repMult: completed.payload.repMult, source: 'encounterAftermath', causeFingerprint: cause.fingerprint,
  });
  assert.equal(completed.payload.causeTag, 'security');
  assert.ok(completed.payload.rewardCr > 0, 'completion retains the settled reward receipt');

  const failedMission = missions._instanceFromOffer({ ...boarded, id: `${boarded.id}_failed` });
  state.missions.active.push(failedMission);
  missions._failMission(failedMission, 0, 'abandoned');
  const failed = bus.log.find((entry) => entry.name === 'mission:failed');
  assert.deepEqual(failed.payload, {
    missionId: failedMission.id,
    reason: 'abandoned',
    source: 'encounterAftermath',
    causeFingerprint: cause.fingerprint,
  });

  const expiredMission = missions._instanceFromOffer({ ...boarded, id: `${boarded.id}_expired` });
  state.missions.active.push(expiredMission);
  missions._expireMission(expiredMission, 0);
  const expired = bus.log.find((entry) => entry.name === 'mission:expired');
  assert.deepEqual(expired.payload, {
    missionId: expiredMission.id,
    reason: 'deadline',
    source: 'encounterAftermath',
    causeFingerprint: cause.fingerprint,
  });
});
