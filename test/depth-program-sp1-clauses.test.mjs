import test from 'node:test';
import assert from 'node:assert/strict';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { clauseById } from '../src/data/contractClauses.js';
import { contractClausesSystem } from '../src/systems/contractClauses.js';
import { missions } from '../src/systems/missions.js';
import { missionPreflight } from '../src/ui/missionPreflight.js';
import { activeMissionContractTerms, missionReceiptRows, recommendedActions } from '../src/ui/screens/missionLog.js';

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

function serializableClause(id) {
  const clause = clauseById(id);
  assert.ok(clause, `known clause ${id}`);
  return {
    id: clause.id,
    event: clause.event,
    label: clause.label,
    prose: clause.prose,
    rewardMult: clause.rewardMult,
  };
}

function makeOffer(clauseId, overrides = {}) {
  return {
    id: `offer_clause_${clauseId}`,
    type: 'cargo_delivery',
    stationId: 'station_helios',
    factionId: 'faction_mts',
    params: { cmdtyId: 'cmdty_salvage_electronics', qty: 1 },
    reward_cr: 1000,
    collateral_cr: 200,
    riskTier: 2,
    destStationId: 'station_beltout',
    destSectorId: 'sector_ceres_belt',
    distance: 1200,
    title: `Clause ${clauseId}`,
    summary: 'A live clause-bearing mission used by the SP1 acceptance contract.',
    source: 'careerContract',
    preloadedCargo: true,
    clauses: [serializableClause(clauseId)],
    cause: {
      fingerprint: `clause:${clauseId}`,
      chainId: 'sp1_clause_acceptance',
      archetypeId: 'long_read',
      stageIndex: 2,
      branchId: 'lawful',
      attempt: 0,
    },
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

function count(bus, name, predicate = () => true) {
  return bus.log.filter((entry) => entry.name === name && predicate(entry.payload || {})).length;
}

test('explicit offer clauses copy into the active canonical mission and survive JSON save', () => {
  const offer = makeOffer('no_scan');
  const { state, bus, missionSystem, clauseSystem } = initSystems(offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  assert.equal(state.missions.active.length, 1);
  assert.deepEqual(state.missions.active[0].clauses, offer.clauses,
    'missions copies the serializable clause terms instead of dropping them at acceptance');
  const saved = JSON.parse(JSON.stringify(missionSystem.serialize()));
  assert.deepEqual(saved.active[0].clauses, offer.clauses);
  clauseSystem.destroy();
});
test('a live clause breach routes through the one mission failure/collateral path exactly once', () => {
  const offer = makeOffer('no_scan');
  const { state, bus, clauseSystem } = initSystems(offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  assert.equal(state.missions.active.length, 1);

  bus.emit('player:scannedByPatrol', { hasContraband: false, patrolId: 77 });
  bus.emit('player:scannedByPatrol', { hasContraband: false, patrolId: 77 });
  assert.equal(state.missions.active.length, 0, 'broken clause settles and removes the active mission');
  assert.equal(count(bus, 'contract:clauseBroken'), 1, 'clause predicate emits once');
  assert.equal(count(bus, 'mission:failed'), 1, 'missions owns one canonical failure');
  assert.equal(count(bus, 'faction:repDelta'), 1, 'one failure reputation penalty');
  assert.equal(count(bus, 'economy:chargeCredits'), 1, 'collateral was charged once at accept, never again on breach');
  assert.equal(state.missions.receipts.length, 1);
  const receipt = state.missions.receipts[0];
  assert.equal(receipt.outcome, 'failed');
  assert.match(receipt.reason, /clause.*no_scan/i);
  assert.equal(receipt.collateralLostCr, offer.collateral_cr);
  clauseSystem.destroy();
});

test('a final target kill breaches no_kills before patrol completion can pay or honor it', () => {
  const offer = makeOffer('no_kills', {
    id: 'offer_clause_no_kills_final_target',
    type: 'patrol_clear',
    params: { clearCount: 1, targetStrength: 1 },
    preloadedCargo: false,
  });
  const { state, bus, clauseSystem } = initSystems(offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  const active = state.missions.active[0];
  assert.ok(active);
  active.targetEntityIds = [777];
  active.objectiveTarget = 1;

  bus.emit('entity:killed', { id: 777, killerId: state.playerId });

  assert.equal(state.missions.active.length, 0);
  assert.equal(count(bus, 'contract:clauseBroken'), 1);
  assert.equal(count(bus, 'mission:failed'), 1);
  assert.equal(count(bus, 'mission:completed'), 0,
    'missions must yield kill-objective completion to the later clause observer');
  assert.equal(count(bus, 'contract:clauseHonored'), 0);
  assert.equal(count(bus, 'economy:grantCredits', (payload) => (
    /^mission:/.test(payload.reason || '')
  )), 0, 'the forbidden final kill never reaches the clean payout path');
  assert.equal(state.missions.receipts[0].outcome, 'failed');
  assert.match(state.missions.receipts[0].reason, /clause.*no_kills/i);
  clauseSystem.destroy();
});

test('a clean live clause pays its bonus once, emits one honor receipt, and keeps normal collateral facts', () => {
  const offer = makeOffer('cargo_intact');
  const { state, bus, clauseSystem } = initSystems(offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  assert.equal(state.missions.active.length, 1);
  assert.equal(state.player.cargo.items[offer.params.cmdtyId], offer.params.qty,
    'sealed cargo is physically aboard before completion');

  bus.emit('dock:docked', { stationId: offer.destStationId });
  assert.equal(state.missions.active.length, 0);
  assert.equal(count(bus, 'contract:clauseBroken'), 0);
  assert.equal(count(bus, 'contract:clauseHonored', (payload) => payload.clauseId === 'cargo_intact'), 1,
    'clean clause honors once despite synchronous mission event ordering');
  const rewardEvents = bus.log.filter((entry) => entry.name === 'economy:grantCredits'
    && /^mission:/.test(entry.payload && entry.payload.reason || ''));
  assert.equal(rewardEvents.length, 1);
  assert.equal(rewardEvents[0].payload.amount, Math.round(offer.reward_cr * offer.clauses[0].rewardMult),
    'clean bonus is included before the canonical payout event');
  const collateralRefunds = bus.log.filter((entry) => entry.name === 'economy:grantCredits'
    && /^collateral_refund:/.test(entry.payload && entry.payload.reason || ''));
  assert.equal(collateralRefunds.length, 1);
  assert.equal(collateralRefunds[0].payload.amount, offer.collateral_cr);
  assert.equal(state.missions.receipts.length, 1);
  assert.equal(state.missions.receipts[0].outcome, 'completed');
  assert.equal(state.missions.receipts[0].rewardCr, Math.round(offer.reward_cr * offer.clauses[0].rewardMult));
  assert.equal(state.missions.receipts[0].collateralRefundCr, offer.collateral_cr);
  clauseSystem.destroy();
});

test('clause fine print and one-time service fees are visible before accept and in the active log', () => {
  const offer = makeOffer('no_scan', {
    source: 'setPieceMission',
    upfrontCostCr: 180,
  });
  const state = baseState(offer);
  state.player.credits = 300;

  const preflight = missionPreflight(offer, state);
  assert.match(preflight.blocker || '', /380 cr.*deposit.*service fees/i,
    'preflight must account for collateral plus the one-time service fee');
  assert.ok(preflight.chips.some((chip) => /180 cr.*non-refundable service fee.*first attempt only/i.test(chip.text)),
    'the board must distinguish the one-time rumor/service purchase from refundable collateral');
  assert.ok(preflight.chips.some((chip) => /fine print.*no scan.*breach fails.*forfeit/i.test(chip.text)),
    'the board must disclose the clause before accept');

  const active = { ...offer, status: 'active' };
  const terms = activeMissionContractTerms(active, state);
  assert.ok(terms.some((term) => term.label === 'Clause' && /no scan/i.test(term.text)),
    'the active Mission Log must retain the clause as a contract term');
});

test('between-stage SP1 routes persist as a named, chartable Mission Log action', () => {
  const offer = makeOffer('no_scan', {
    id: 'sp1_followup_fence',
    source: 'setPieceMission',
    stationId: 'station_beltout',
    title: 'Choose the lawful fence',
    cause: {
      chainId: 'sp1_chain_route',
      archetypeId: 'long_read',
      stageIndex: 3,
      stageId: 'fence_choice',
      branchId: 'lawful',
      attempt: 0,
      house: 'Quiet Office',
    },
  });
  const state = baseState(offer);
  state.missions.receipts = [{
    source: 'setPieceMission',
    chainId: offer.cause.chainId,
    stageIndex: 2,
    outcome: 'completed',
    house: 'Quiet Office',
    houseText: 'The bearing paid out. Bring the recovered record to a desk that keeps names.',
    nextStationId: offer.stationId,
    nextStationIds: [offer.stationId],
  }];

  const action = recommendedActions(state, [], null)[0];
  assert.equal(action.label, 'NEXT CONTRACT');
  assert.match(action.body, /Belt Outpost/,
    'continuity must use the player-facing station name instead of a raw station id');
  assert.doesNotMatch(action.body, /station_beltout/);
  assert.equal(action.mapAction && action.mapAction.stationId, 'station_beltout',
    'the persistent action must hand off to the real galaxy-map target');
});

test('Mission Log continuation selection ignores stale receipts from chains with no posted offer', () => {
  const longRead = makeOffer('no_scan', {
    id: 'sp1_long_read_waiting',
    source: 'setPieceMission',
    stationId: 'station_beltout',
    title: 'Fence the recovered record',
    cause: {
      chainId: 'sp1_long_read_waiting_chain',
      archetypeId: 'long_read',
      stageIndex: 3,
      stageId: 'fence_choice',
      branchId: 'lawful',
      attempt: 0,
      house: 'Quiet Office',
    },
  });
  const state = baseState(longRead);
  state.missions.receipts = [
    { source: 'setPieceMission', chainId: 'sp1_hearing_done', archetypeId: 'hearing', outcome: 'completed', nextStationIds: [] },
    { source: 'setPieceMission', chainId: 'sp1_hearing_done', archetypeId: 'hearing', outcome: 'completed', nextStationIds: ['station_forge'] },
    {
      source: 'setPieceMission', chainId: longRead.cause.chainId, archetypeId: 'long_read', outcome: 'completed',
      house: 'Quiet Office', houseText: 'The older file is still waiting.',
      nextStationId: longRead.stationId, nextStationIds: [longRead.stationId],
    },
  ];

  const action = recommendedActions(state, [], null)[0];
  assert.equal(action.label, 'NEXT CONTRACT');
  assert.match(action.title, /Fence the recovered record/i);
  assert.equal(action.mapAction && action.mapAction.stationId, longRead.stationId);
});

test('settlement receipt rows retain SP1 house voice, recovery copy, and named continuation boards', () => {
  const state = baseState(makeOffer('no_scan'));
  state.missions.receipts = [{
    source: 'setPieceMission',
    type: 'salvage_retrieval',
    title: 'The record went missing',
    outcome: 'failed',
    reason: 'clause_broken:no_scan',
    rewardCr: 0,
    collateralLostCr: 260,
    chainId: 'sp1_receipt_voice',
    archetypeId: 'long_read',
    house: 'Quiet Office',
    houseText: 'The file stays open because the Office says it does.',
    recoveryText: 'A reduced-stake recovery copy is waiting.',
    nextStationId: 'station_beltout',
    nextStationIds: ['station_beltout'],
  }];

  const row = missionReceiptRows(state, 1)[0];
  assert.match(row.body, /Quiet Office.*file stays open.*reduced-stake recovery/i);
  assert.match(row.meta, /Next: Belt Outpost/i);
  assert.doesNotMatch(row.meta, /station_beltout/);
});
