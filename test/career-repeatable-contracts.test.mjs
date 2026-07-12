import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { COMMODITIES } from '../src/data/commodities.js';
import { MISSION_TUNING, MISSION_TYPES } from '../src/data/missions.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  CAREER_CONTRACT_IDS,
  REPEATABLE_CAREER_CONTRACTS,
  careerContractsFor,
  validateCareerContractCatalog,
} from '../src/data/careerContracts.js';
import { getRegionalEcologyProfile } from '../src/data/regionalEcology.js';
import {
  buildCareerContractOffer,
  careerContracts,
  completedOriginIdentity,
  ensureCareerContractState,
} from '../src/systems/careerContracts.js';
import { missions } from '../src/systems/missions.js';

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) {
    const list = this.handlers.get(name) || [];
    list.push(fn);
    this.handlers.set(name, list);
    return () => this.off(name, fn);
  }
  off(name, fn) { this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn)); }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

const STATION_TO_SECTOR = new Map();
for (const sector of SECTORS) for (const station of sector.stations || []) STATION_TO_SECTOR.set(station.id, sector.id);
const MISSION_TYPE_IDS = new Set(MISSION_TYPES.map((entry) => entry.type));
const COMMODITY_IDS = new Set(COMMODITIES.map((entry) => entry.id));

function identityReceipts(status = 'completed') {
  return Object.fromEntries(CAREER_CONTRACT_IDS.map((careerId) => [careerId, {
    careerId,
    status,
    lane: careerId === 'hauler' ? 'freight' : careerId === 'hunter' ? 'warrant' : 'extraction',
    verb: careerId === 'hauler' ? 'carry' : careerId === 'hunter' ? 'intercept' : 'survey',
  }]));
}

function cloneTuning() {
  return JSON.parse(JSON.stringify(MISSION_TUNING));
}

function baseState({ originsComplete = true, seed = 47, simTime = 0 } = {}) {
  return {
    meta: { seed, playtimeS: 0 },
    seed,
    tick: 0,
    simTime,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 500000,
      researchPoints: 0,
      cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 },
      stats: {},
    },
    careers: { origins: { __meta: { identityReceipts: originsComplete ? identityReceipts() : {}, upgradeReceipts: {} } } },
    missions: { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: cloneTuning() },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: {
      faction_scn: { rep: 500 }, faction_mts: { rep: 500 }, faction_dmc: { rep: 500 }, faction_free: { rep: 500 }, faction_reach: { rep: 0 },
    },
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    entities: new Map(),
    entityList: [],
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random forbidden in career contracts'); };
  Date.now = () => { throw new Error('Date.now forbidden in career contracts'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

function eventCount(bus, name, predicate = () => true) {
  return bus.log.filter((entry) => entry.name === name && predicate(entry.payload || {})).length;
}

test('catalog contains nine authored three-stage careers with explicit action, risk, recovery, and consequences', () => {
  const validation = validateCareerContractCatalog();
  assert.deepEqual(validation, { ok: true, errors: [], contracts: 9, stages: 27 });
  assert.equal(REPEATABLE_CAREER_CONTRACTS.length, 9);
  assert.equal(new Set(REPEATABLE_CAREER_CONTRACTS.map((entry) => entry.skillExpression)).size, 9);

  for (const careerId of CAREER_CONTRACT_IDS) assert.equal(careerContractsFor(careerId).length, 3);
  for (const def of REPEATABLE_CAREER_CONTRACTS) {
    assert.ok(def.actor.name && def.actor.motive.length >= 40, `${def.id}: intentional actor/motive`);
    assert.ok(def.failure.consequence.length >= 30 && def.failure.recovery.length >= 30, `${def.id}: failure recovery`);
    assert.equal(def.stages.length, 3);
    const startSectorId = STATION_TO_SECTOR.get(def.startStationId);
    assert.ok(def.stages.some((stage) => stage.destSectorId !== startSectorId
      || (stage.destStationId && stage.destStationId !== def.startStationId)), `${def.id}: real travel leg`);
    assert.ok(def.stages.some((stage) => stage.collateralCr > 0 || stage.params.cmdtyId || ['escort', 'passenger_transport'].includes(stage.type)), `${def.id}: economy/cargo custody risk`);
    for (const stage of def.stages) {
      assert.ok(MISSION_TYPE_IDS.has(stage.type), `${def.id}/${stage.id}: canonical mission type`);
      assert.ok(STATION_TO_SECTOR.has(stage.boardStationId), `${def.id}/${stage.id}: real board station`);
      assert.ok(getRegionalEcologyProfile(stage.destSectorId), `${def.id}/${stage.id}: committed regional ecology`);
      if (stage.destStationId) assert.equal(STATION_TO_SECTOR.get(stage.destStationId), stage.destSectorId, `${def.id}/${stage.id}: destination station/sector truth`);
      if (stage.params.cmdtyId) assert.ok(COMMODITY_IDS.has(stage.params.cmdtyId), `${def.id}/${stage.id}: real commodity`);
      assert.ok(stage.instruction.length >= 45 && stage.failureText.length >= 35 && stage.recoveryText.length >= 35);
      for (const impulse of [stage.successImpulse, stage.failureImpulse]) {
        assert.ok(Number.isFinite(impulse.danger) && Number.isFinite(impulse.pricePressure));
      }
    }
  }
});

test('offer generation deterministically consumes origin identity, regional ecology, and open causal aftermath', () => {
  guarded(() => {
    const state = baseState({ seed: 991 });
    state.aftermathWrecks = { causes: {
      wreck_ceres_1: {
        fingerprint: 'wreck_ceres_1', sectorId: 'sector_ceres_belt', status: 'open',
        motiveId: 'predation', consequenceKind: 'security', createdTick: 12,
      },
    } };
    const def = REPEATABLE_CAREER_CONTRACTS.find((entry) => entry.id === 'hauler_relief_circuit');
    const own = ensureCareerContractState(state);
    const a = buildCareerContractOffer(state, def, own.runs[def.id]);
    const b = buildCareerContractOffer(state, def, own.runs[def.id]);
    assert.deepEqual(a, b);
    assert.equal(a.source, 'careerContract');
    assert.equal(a.cause.originLane, 'freight');
    assert.equal(a.cause.originVerb, 'carry');
    assert.equal(a.cause.regionalFamilyId, 'industrial_belt');
    assert.equal(a.cause.regionalResourceKind, 'metallic');
    assert.equal(a.cause.aftermathFingerprint, 'wreck_ceres_1');
    assert.match(a.summary, /Mara Venn.*Causal lead wreck_ceres_1/s);
    const nextCycle = buildCareerContractOffer(state, def, { ...own.runs[def.id], cycle: 1 });
    assert.notEqual(nextCycle.id, a.id);
    assert.ok(nextCycle.params.qty > a.params.qty, 'repeat cycle scales authored work deterministically');
  });
});

test('origin completion gates offers; three stages settle once, persist consequences, and repeat next epoch', () => {
  guarded(() => {
    const locked = baseState({ originsComplete: false });
    assert.equal(completedOriginIdentity(locked, 'hauler'), null);
    const lockedBus = new Bus();
    const lockedSys = { ...careerContracts };
    lockedSys.init({ state: locked, bus: lockedBus });
    lockedBus.emit('dock:docked', { stationId: 'station_helios' });
    assert.equal(eventCount(lockedBus, 'mission:offered'), 0);
    lockedSys.destroy();

    const state = baseState();
    const bus = new Bus();
    const boarded = [];
    bus.on('mission:offered', (offer) => {
      boarded.push(offer);
      bus.emit('mission:offerBoarded', {
        offerId: offer.id, stationId: offer.stationId, source: offer.source,
        causeFingerprint: offer.cause.fingerprint,
      });
    });
    const sys = { ...careerContracts };
    sys.init({ state, bus });

    const def = REPEATABLE_CAREER_CONTRACTS.find((entry) => entry.id === 'hauler_relief_circuit');
    for (let stageIndex = 0; stageIndex < 3; stageIndex++) {
      const stage = def.stages[stageIndex];
      bus.emit('dock:docked', { stationId: stage.boardStationId });
      const offer = boarded.at(-1);
      assert.equal(offer.cause.contractId, def.id);
      assert.equal(offer.cause.stageIndex, stageIndex);
      const missionId = `m_relief_${stageIndex}`;
      bus.emit('mission:accepted', { missionId, source: 'careerContract', causeFingerprint: offer.cause.fingerprint });
      bus.emit('mission:completed', { missionId, source: 'careerContract', causeFingerprint: offer.cause.fingerprint });
      bus.emit('mission:completed', { missionId, source: 'careerContract', causeFingerprint: offer.cause.fingerprint });
    }
    const own = ensureCareerContractState(state);
    const run = own.runs[def.id];
    assert.equal(run.status, 'completed');
    assert.deepEqual(run.completedStages, def.stages.map((stage) => stage.id));
    assert.equal(own.receipts.filter((receipt) => receipt.contractId === def.id).length, 3);
    assert.equal(eventCount(bus, 'sectorsim:impulse', (payload) => payload.kind.startsWith('career_contract:hauler:')), 3, 'duplicate settlement has no duplicate persistent impulse');
    assert.equal(eventCount(bus, 'careerContract:completed', (payload) => payload.contractId === def.id), 1);

    const offerCount = boarded.length;
    bus.emit('dock:docked', { stationId: def.startStationId });
    assert.equal(boarded.length, offerCount, 'same epoch cannot instantly farm a completed chain');
    state.simTime = 601;
    bus.emit('dock:docked', { stationId: def.startStationId });
    assert.equal(boarded.at(-1).cause.cycle, 1, 'next board epoch opens deterministic repeat cycle');
    sys.destroy();
  });
});

test('failure reoffers only the failed stage with recovery copy and one adverse sector impulse', () => {
  guarded(() => {
    const state = baseState();
    const bus = new Bus();
    const offers = [];
    bus.on('mission:offered', (offer) => {
      offers.push(offer);
      bus.emit('mission:offerBoarded', { offerId: offer.id, source: offer.source, causeFingerprint: offer.cause.fingerprint });
    });
    const sys = { ...careerContracts };
    sys.init({ state, bus });
    bus.emit('dock:docked', { stationId: 'station_reach' });
    const first = offers.at(-1);
    assert.equal(first.cause.contractId, 'hauler_wreck_reclamation');
    bus.emit('mission:accepted', { missionId: 'm_fail_1', source: 'careerContract', causeFingerprint: first.cause.fingerprint });
    bus.emit('mission:failed', { missionId: 'm_fail_1', source: 'careerContract', causeFingerprint: first.cause.fingerprint, reason: 'abandoned' });
    bus.emit('mission:failed', { missionId: 'm_fail_1', source: 'careerContract', causeFingerprint: first.cause.fingerprint, reason: 'abandoned' });
    assert.equal(eventCount(bus, 'sectorsim:impulse', (payload) => payload.kind.endsWith(':failed')), 1);
    const run = ensureCareerContractState(state).runs.hauler_wreck_reclamation;
    assert.equal(run.status, 'recovering');
    assert.equal(run.stageIndex, 0);
    assert.equal(run.attempt, 1);
    bus.emit('dock:docked', { stationId: 'station_reach' });
    const retry = offers.at(-1);
    assert.equal(retry.cause.stageIndex, 0);
    assert.equal(retry.cause.attempt, 1);
    assert.notEqual(retry.id, first.id);
    assert.ok(retry.reward_cr < first.reward_cr);
    assert.match(retry.summary, /Recovery:/);
    sys.destroy();
  });
});

test('career-chain state survives JSON save and missions owns the real external board seam', () => {
  guarded(() => {
    const state = baseState();
    const bus = new Bus();
    const missionSys = { ...missions };
    missionSys.init({ state, bus, helpers: { hash32: (...args) => 47 + args.length, voice: { say: () => true } } });
    const careerSys = { ...careerContracts };
    careerSys.init({ state, bus });
    const offered = careerSys._offerAtStation('station_helios');
    assert.ok(offered);
    const board = state.missions.boards.station_helios;
    assert.ok(board.slots.some((offer) => offer.id === offered.id && offer.source === 'careerContract'));
    const instance = missionSys._instanceFromOffer(offered);
    assert.equal(instance.source, 'careerContract');
    assert.equal(instance.cause.contractId, 'hauler_relief_circuit');

    const saved = missionSys.serialize();
    assert.equal(saved.careerContracts.runs.hauler_relief_circuit.status, 'offered');
    const restoredState = baseState();
    const restoredBus = new Bus();
    const restoredMissions = { ...missions };
    restoredMissions.init({ state: restoredState, bus: restoredBus, helpers: { voice: { say: () => true } } });
    restoredMissions.deserialize(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(
      restoredState.missions.careerContracts.runs.hauler_relief_circuit,
      state.missions.careerContracts.runs.hauler_relief_circuit,
    );
    careerSys.destroy();
  });
});

test('default registry wires the event-driven career contract system after missions without UI hooks', () => {
  const source = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ careerContracts \} from '\.\.\/systems\/careerContracts\.js';/);
  assert.match(source, /careerLadders, liveCareerLadderBranches, missions, careerContracts, economyContracts/);
  const systemSource = readFileSync(new URL('../src/systems/careerContracts.js', import.meta.url), 'utf8');
  assert.doesNotMatch(systemSource, /Math\.random|Date\.now|src\/ui|\.\.\/ui\//);
  assert.doesNotMatch(systemSource, /player\.credits\s*=|cargo\.items\s*=|factions\[[^\]]+\]\.rep\s*=/);
});
