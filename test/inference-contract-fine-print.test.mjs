import test from 'node:test';
import assert from 'node:assert/strict';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { CLAUSE_IDS, CONTRACT_CLAUSES, clauseById } from '../src/data/contractClauses.js';
import { attachClauses, contractClausesSystem } from '../src/systems/contractClauses.js';
import { missions } from '../src/systems/missions.js';

// INFERENCE-28 (mission fine print): CONTRACT_CLAUSES shipped five authored terms — no_kills,
// cargo_intact, no_scan, rescue_priority, time_limit — with the whole downstream machine live
// (observer, breach→collateral, honor→premium, dossier chips, preflight disclosure). But
// attachClauses was never called: ordinary board offers could never carry fine print, so the
// player only ever met these terms inside authored set pieces. _withConditions now rolls the
// seeded clause first in the term chain.

class Bus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }
  on(name, fn) {
    const rows = this.handlers.get(name) || [];
    rows.push(fn);
    this.handlers.set(name, rows);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

const FINE_PRINT_IDS = new Set(CLAUSE_IDS);
const finePrintRows = (offer) => (offer.clauses || []).filter((row) => row && FINE_PRINT_IDS.has(row.id));

function genOffer(id, overrides = {}) {
  return {
    id,
    type: 'cargo_delivery',
    stationId: 'station_tethys',
    factionId: 'faction_mts',
    params: { cmdtyId: 'cmdty_salvage_electronics', qty: 2 },
    reward_cr: 1000,
    collateral_cr: 200,
    riskTier: 2,
    destStationId: 'station_beltout',
    destSectorId: 'sector_ceres_belt',
    distance: 1200,
    title: `Generated ${id}`,
    summary: 'A board offer rolled through _withConditions.',
    source: 'stationBoard',
    preloadedCargo: true,
    ...overrides,
  };
}

function baseState(offer) {
  return {
    meta: { seed: 47, playtimeS: 0 },
    seed: 47,
    tick: 0,
    simTime: 20,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 5000,
      researchPoints: 0,
      cargo: { items: {}, capVolume: 20, capMass: 20, usedVolume: 0, usedMass: 0 },
      stats: {},
    },
    missions: {
      boards: { [offer.stationId]: { refreshEpoch: 0, slots: [offer] } },
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: JSON.parse(JSON.stringify(MISSION_TUNING)),
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: { faction_mts: { rep: 500 } },
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    entities: new Map(),
    entityList: [],
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function initSystems(offer) {
  const state = baseState(offer);
  const bus = new Bus();
  const missionSystem = { ...missions };
  const clauseSystem = { ...contractClausesSystem };
  const helpers = { hash32, mulberry32, voice: { say: () => true } };
  missionSystem.init({ state, bus, helpers });
  clauseSystem.init({ state, bus, helpers });
  return { state, bus, missionSystem, clauseSystem };
}

// Roll a stable offer id through the mission system's own term chain until it stamps the named
// fine-print clause — same seeded path the live board uses, so the found id is deterministic.
function offerWithClause(clauseId, type = 'cargo_delivery', overrides = {}) {
  const probe = initSystems(genOffer('probe', overrides)).missionSystem;
  for (let i = 0; i < 400; i++) {
    const offer = genOffer(`offer_gen_${clauseId}_${i}`, { type, ...overrides });
    const stamped = probe._withConditions(offer, 0);
    if (finePrintRows(stamped).some((row) => row.id === clauseId)) return stamped;
  }
  return null;
}

function count(bus, name, predicate = () => true) {
  return bus.log.filter((entry) => entry.name === name && predicate(entry.payload || {})).length;
}

test('ordinary board offers gain authored fine print — some ids, not others, deterministically', () => {
  const { missionSystem } = initSystems(genOffer('probe'));
  let stampedCount = 0;
  for (let i = 0; i < 60; i++) {
    const offer = genOffer(`offer_spread_${i}`);
    const a = missionSystem._withConditions(JSON.parse(JSON.stringify(offer)), 0);
    const b = missionSystem._withConditions(JSON.parse(JSON.stringify(offer)), 0);
    assert.deepEqual(a, b, `stamping is deterministic for ${offer.id}`);
    const rows = finePrintRows(a);
    for (const row of rows) {
      assert.ok(clauseById(row.id), `row ${row.id} resolves to an authored clause`);
      assert.ok(row.rewardMult > 1, 'honor premium rides the row');
      assert.ok(row.label && row.prose, 'the chip carries its authored label and prose');
    }
    if (rows.length) stampedCount++;
  }
  assert.ok(stampedCount > 3 && stampedCount < 50,
    `fine print is a treat, not wallpaper (stamped ${stampedCount}/60)`);
});

test('a fine-print row and physics conditions coexist — the clause survives the appenders', () => {
  const { missionSystem } = initSystems(genOffer('probe'));
  for (let i = 0; i < 400; i++) {
    const offer = genOffer(`offer_mix_${i}`);
    const stamped = missionSystem._withConditions(offer, 0);
    const rows = stamped.clauses || [];
    if (rows.some((row) => row && FINE_PRINT_IDS.has(row.id))
      && rows.some((row) => row && row.conditionId)) {
      assert.ok(true, `offer ${offer.id} carries a clause and a condition in one clauses array`);
      return;
    }
  }
  assert.fail('no offer in 400 carried both a fine-print row and a condition row');
});

test('a generated no_scan offer breaches once through the canonical collateral path', () => {
  const offer = offerWithClause('no_scan');
  assert.ok(offer, 'a generated no_scan offer exists');
  const { state, bus, clauseSystem } = initSystems(offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  assert.equal(state.missions.active.length, 1);
  assert.deepEqual(state.missions.active[0].clauses, offer.clauses,
    'the generated clause copies onto the active mission');
  bus.emit('player:scannedByPatrol', { hasContraband: false, patrolId: 77 });
  bus.emit('player:scannedByPatrol', { hasContraband: false, patrolId: 77 });
  assert.equal(state.missions.active.length, 0);
  assert.equal(count(bus, 'contract:clauseBroken'), 1);
  assert.equal(count(bus, 'mission:failed'), 1);
  assert.equal(count(bus, 'economy:chargeCredits'), 1, 'collateral charged once at accept');
  assert.match(state.missions.receipts[0].reason, /clause.*no_scan/i);
  clauseSystem.destroy();
});

test('a generated cargo_intact offer pays the honor premium on a clean delivery', () => {
  const offer = offerWithClause('cargo_intact');
  assert.ok(offer, 'a generated cargo_intact offer exists');
  const { state, bus, clauseSystem } = initSystems(offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  assert.equal(state.missions.active.length, 1);
  bus.emit('dock:docked', { stationId: offer.destStationId });
  assert.equal(state.missions.active.length, 0);
  const clause = offer.clauses.find((row) => row.id === 'cargo_intact');
  assert.equal(count(bus, 'contract:clauseHonored', (p) => p.clauseId === 'cargo_intact'), 1);
  const rewards = bus.log.filter((e) => e.name === 'economy:grantCredits'
    && /^mission:/.test(e.payload && e.payload.reason || ''));
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].payload.amount, Math.round(offer.reward_cr * clause.rewardMult),
    'the clean run pays the disclosed premium');
  clauseSystem.destroy();
});

test('a generated no_kills patrol fails on the kill it would otherwise pay for', () => {
  const offer = offerWithClause('no_kills', 'patrol_clear', {
    params: { clearCount: 1, targetStrength: 1 },
    preloadedCargo: false,
  });
  assert.ok(offer, 'a generated no_kills patrol offer exists');
  const { state, bus, clauseSystem } = initSystems(offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  const active = state.missions.active[0];
  active.targetEntityIds = [777];
  active.objectiveTarget = 1;
  bus.emit('entity:killed', { id: 777, killerId: state.playerId });
  assert.equal(state.missions.active.length, 0);
  assert.equal(count(bus, 'mission:failed'), 1);
  assert.equal(count(bus, 'mission:completed'), 0,
    'the forbidden final kill never reaches the payout path');
  clauseSystem.destroy();
});

test('fail-closed boundaries — dead and uncompletable terms can never attach', () => {
  const { missionSystem } = initSystems(genOffer('probe'));
  let sawRow = false;
  for (let i = 0; i < 600; i++) {
    for (const type of ['cargo_delivery', 'smuggling_run', 'bulk_trade', 'salvage_retrieval', 'passenger_transport', 'escort', 'patrol_clear', 'bounty_hunt']) {
      const customsDest = genOffer(`offer_customs_${i}`, { type, destStationId: 'station_customs' });
      const stamped = missionSystem._withConditions(customsDest, 0);
      const rows = finePrintRows(stamped);
      sawRow = sawRow || rows.length > 0;
      assert.equal(rows.some((row) => row.id === 'no_scan'), false,
        'no_scan must never destination a berth that sweeps every dock');
      assert.equal(rows.some((row) => row.id === 'time_limit'), false,
        'time_limit is dead twice over — its event is unobserved');
      if (type === 'passenger_transport') {
        assert.equal(rows.some((row) => row.id === 'rescue_priority'), false,
          'rescue_priority can never fire on passenger_transport (no _escorteeId)');
      }
    }
  }
  assert.ok(sawRow, 'the sweep must actually roll clause rows to mean anything');
});

test('authored fiction is left alone — story and teaching-board offers carry no generated fine print', () => {
  const { missionSystem } = initSystems(genOffer('probe'));
  for (let i = 0; i < 60; i++) {
    for (const offer of [
      genOffer(`offer_story_${i}`, { storyTag: 'campaign47a' }),
      genOffer(`offer_helios_${i}`, { stationId: 'station_helios' }),
      genOffer(`offer_piece_${i}`, { source: 'authoredSetPiece' }),
    ]) {
      const stamped = missionSystem._withConditions(offer, 0);
      assert.equal(finePrintRows(stamped).length, 0,
        `${offer.id} must not gain generated fine print`);
    }
  }
});
