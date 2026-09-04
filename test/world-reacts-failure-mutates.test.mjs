/**
 * PQ-138.04 — "failure should usually mutate the situation."
 *
 * A broken contract must not dead-end in a red toast: the situation the player is standing in
 * (a dead convoy, a confiscated manifest) becomes the next objective. This suite pins the rule at
 * the `_failMission` choke point: descriptor-less failures (abandoned, busted) stay plain failures,
 * descriptor failures post+accept a LIVE successor through postAndAcceptAuthoredOffer, and a
 * refused successor falls back to the ordinary failure with no orphan left behind.
 *
 * Harness shape copied from test/depth-program-sp1-clauses.test.mjs (same Bus/state/systems
 * pattern); nothing is imported from that suite and it is not edited.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { clauseById } from '../src/data/contractClauses.js';
import { contractClausesSystem } from '../src/systems/contractClauses.js';
import { missions } from '../src/systems/missions.js';

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

function makeEscortOffer(overrides = {}) {
  return {
    id: 'offer_escort_convoy_1',
    type: 'escort',
    stationId: 'station_helios',
    factionId: 'faction_mts',
    params: { targetStrength: 1 },
    reward_cr: 900,
    collateral_cr: 0,
    riskTier: 2,
    destStationId: 'station_forge',
    destSectorId: 'sector_vesta_forge',
    distance: 2400,
    title: 'Escort the relief convoy',
    summary: 'Keep the convoy intact to Forge Foundry.',
    source: 'careerContract',
    ...overrides,
  };
}

function makeSmugglingOffer(overrides = {}) {
  return {
    id: 'offer_smuggle_1',
    type: 'smuggling_run',
    stationId: 'station_helios',
    factionId: 'faction_mts',
    params: { cmdtyId: 'cmdty_classified_salvage', qty: 1 },
    reward_cr: 1200,
    collateral_cr: 150,
    riskTier: 3,
    destStationId: 'station_beltout',
    destSectorId: 'sector_ceres_belt',
    distance: 1200,
    title: 'Run the sealed ledger',
    summary: 'Carry encoded records past customs.',
    source: 'careerContract',
    preloadedCargo: true,
    ...overrides,
  };
}

function makeCargoIntactOffer(overrides = {}) {
  return {
    id: 'offer_clause_cargo_intact_1',
    type: 'cargo_delivery',
    stationId: 'station_helios',
    factionId: 'faction_mts',
    params: { cmdtyId: 'cmdty_salvage_electronics', qty: 2 },
    reward_cr: 800,
    collateral_cr: 100,
    riskTier: 2,
    destStationId: 'station_beltout',
    destSectorId: 'sector_ceres_belt',
    distance: 1200,
    title: 'Sealed lot to Belt Outpost',
    summary: 'Deliver the tagged electronics unopened.',
    source: 'careerContract',
    preloadedCargo: true,
    clauses: [serializableClause('cargo_intact')],
    ...overrides,
  };
}

function baseState(offers) {
  const boards = {};
  for (const offer of [].concat(offers)) {
    boards[offer.stationId] = boards[offer.stationId] || { refreshEpoch: 0, slots: [] };
    boards[offer.stationId].slots.push(offer);
  }
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
      boards,
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

function initSystems(offers) {
  const state = baseState(offers);
  const bus = new Bus();
  const missionSystem = { ...missions };
  const clauseSystem = { ...contractClausesSystem };
  const helpers = { hash32, mulberry32, voice: { say: () => true } };
  const registry = { get: () => null };
  missionSystem.init({ state, bus, helpers, registry });
  clauseSystem.init({ state, bus, helpers, registry });
  return { state, bus, missionSystem, clauseSystem };
}

function count(bus, name, predicate = () => true) {
  return bus.log.filter((entry) => entry.name === name && predicate(entry.payload || {})).length;
}

function failureToastCount(bus) {
  return count(bus, 'toast', (p) => /^Mission FAILED:/.test(p.text || ''));
}

/** Accept the escort offer and destroy its escortee through the shipped entity:destroyed route. */
function runEscorteeLostScenario() {
  const harness = initSystems(makeEscortOffer());
  const { state, bus } = harness;
  bus.emit('ui:acceptMission', { missionId: 'offer_escort_convoy_1' });
  assert.equal(state.missions.active.length, 1, 'escort accepted');
  const escort = state.missions.active[0];
  escort._escorteeId = 555;
  escort._escorteeSectorId = 'sector_helios_prime';
  bus.emit('entity:destroyed', { id: 555, type: 'ship' });
  return { ...harness, failedMissionId: escort.id };
}

test('a destroyed escortee mutates the escort into a live salvage successor', () => {
  const { state, failedMissionId, clauseSystem } = runEscorteeLostScenario();
  const successor = state.missions.active.find((m) => m && m.mutatedFromMissionId === failedMissionId);
  assert.ok(
    successor,
    'failure should usually mutate the situation — the dead convoy must leave a live salvage objective, not a dead end',
  );
  assert.equal(
    successor.mutatedFromMissionId,
    failedMissionId,
    'failure should usually mutate the situation: the successor names the contract it grew out of',
  );
  assert.equal(successor.status, 'active');
  assert.equal(successor.mutationTag, 'salvage');
  assert.equal(successor.type, 'salvage_retrieval');
  assert.notEqual(successor.id, failedMissionId);
  // The old mission really is over: exactly one active mission and it is the successor.
  assert.equal(state.missions.active.length, 1);
  assert.equal(state.missions.receipts[0].outcome, 'failed');
  assert.equal(state.missions.receipts[0].mutatedToMissionId, successor.id,
    'the failed contract receipt names its successor so the chain is readable');
  clauseSystem.destroy();
});

test('mission:failed still fires exactly once and now carries the mutation pointer', () => {
  const { state, bus, failedMissionId, clauseSystem } = runEscorteeLostScenario();
  const successor = state.missions.active[0];
  assert.equal(count(bus, 'mission:failed'), 1, 'one canonical failure — never suppressed');
  const failed = bus.log.find((entry) => entry.name === 'mission:failed');
  assert.equal(failed.payload.missionId, failedMissionId);
  assert.equal(failed.payload.mutatedToMissionId, successor.id);
  assert.equal(failed.payload.mutationTag, 'salvage');
  clauseSystem.destroy();
});

test('a mutated failure skips the Mission FAILED toast; a descriptor-less failure keeps it', () => {
  const mutated = runEscorteeLostScenario();
  assert.equal(failureToastCount(mutated.bus), 0,
    'a mutated failure says what happened next, not a scolding');
  assert.ok(
    count(mutated.bus, 'toast', (p) => /salvage/i.test(p.text || '') && p.kind === 'warn') >= 1,
    'the mutation toast names the follow-up now on the table',
  );
  mutated.clauseSystem.destroy();

  // busted: a smuggling run scanned with contraband has no mutation descriptor — plain failure.
  const { state, bus, clauseSystem } = initSystems(makeSmugglingOffer());
  bus.emit('ui:acceptMission', { missionId: 'offer_smuggle_1' });
  assert.equal(state.missions.active.length, 1);
  bus.emit('player:scannedByPatrol', { hasContraband: true, patrolId: 9 });
  assert.equal(state.missions.active.length, 0, 'busted settles and removes the run');
  assert.equal(count(bus, 'mission:failed'), 1);
  assert.equal(failureToastCount(bus), 1, 'a failure with no descriptor still scolds');
  const failed = bus.log.find((entry) => entry.name === 'mission:failed');
  assert.equal('mutatedToMissionId' in failed.payload, false,
    'descriptor-less failures keep the exact legacy mission:failed payload shape');
  clauseSystem.destroy();
});

test('abandonMission does NOT mutate — quitting on purpose is still a plain failure', () => {
  const { state, bus, clauseSystem } = initSystems(makeEscortOffer());
  bus.emit('ui:acceptMission', { missionId: 'offer_escort_convoy_1' });
  const escort = state.missions.active[0];
  assert.equal(bus.emit('ui:abandonMission', { missionId: escort.id }), undefined);
  assert.equal(state.missions.active.length, 0, 'abandoning leaves no successor behind');
  assert.equal(failureToastCount(bus), 1);
  assert.equal(state.missions.active.some((m) => m && m.mutatedFromMissionId), false);
  clauseSystem.destroy();
});

test('the same failure twice mints the same successor offer id (deterministic from hash32)', () => {
  const first = runEscorteeLostScenario();
  const second = runEscorteeLostScenario();
  const a = first.state.missions.active[0];
  const b = second.state.missions.active[0];
  assert.equal(a.sourceOfferId, b.sourceOfferId,
    'two runs of one seed must build the same successor offer id');
  assert.equal(a.id, b.id, 'same accept order, same mission id sequence');
  assert.deepEqual(a.params, b.params, 'successor params are hash-derived, never clock or random');
  first.clauseSystem.destroy();
  second.clauseSystem.destroy();
});

test('a refused mutation falls back to the ordinary failure — no orphan, no hang', () => {
  const { state, bus, clauseSystem } = initSystems(makeCargoIntactOffer());
  bus.emit('ui:acceptMission', { missionId: 'offer_clause_cargo_intact_1' });
  assert.equal(state.missions.active.length, 1, 'clause-bearing delivery accepted');
  // Fill the hold AFTER accept so the restitution successor (replace the 2u lot) fails its cargo
  // capacity preflight. The refused mutation must degrade to the plain failure, never vanish.
  state.player.cargo.usedVolume = state.player.cargo.capVolume;

  bus.emit('player:scannedByPatrol', { hasContraband: true, patrolId: 42 });

  assert.equal(count(bus, 'contract:clauseBroken'), 1, 'the clause observer emitted once');
  assert.equal(count(bus, 'mission:failed'), 1);
  const failed = bus.log.find((entry) => entry.name === 'mission:failed');
  assert.equal(failed.payload.reason, 'clause_broken:cargo_intact');
  assert.equal('mutatedToMissionId' in failed.payload, false,
    'a refused mutation adds no mutation pointer');
  assert.equal(state.missions.active.length, 0,
    'the failed mission still leaves the active list — no orphan, no hang');
  assert.equal(failureToastCount(bus), 1, 'the player gets the ordinary failure, not silence');
  assert.equal(state.missions.receipts[0].outcome, 'failed');
  clauseSystem.destroy();
});

test('mutation fields round-trip the save, and an unmutated mission never carries them', () => {
  const escortOffer = makeEscortOffer({ id: 'offer_escort_convoy_rt' });
  const plainOffer = makeCargoIntactOffer({
    id: 'offer_cargo_plain_rt',
    clauses: [],
    title: 'Ordinary freight',
  });
  const { state, bus, missionSystem, clauseSystem } = initSystems([escortOffer, plainOffer]);
  bus.emit('ui:acceptMission', { missionId: escortOffer.id });
  bus.emit('ui:acceptMission', { missionId: plainOffer.id });
  assert.equal(state.missions.active.length, 2);
  const escort = state.missions.active.find((m) => m.type === 'escort');
  escort._escorteeId = 777;
  escort._escorteeSectorId = 'sector_helios_prime';
  bus.emit('entity:destroyed', { id: 777, type: 'ship' });
  const successor = state.missions.active.find((m) => m.mutatedFromMissionId === escort.id);
  assert.ok(successor, 'escort failure mutated before the save');

  const saved = JSON.parse(JSON.stringify(missionSystem.serialize()));
  const restoredState = baseState([]);
  const restoredBus = new Bus();
  const restoredSystem = { ...missions };
  restoredSystem.init({
    state: restoredState,
    bus: restoredBus,
    helpers: { hash32, mulberry32, voice: { say: () => true } },
    registry: { get: () => null },
  });
  restoredSystem.deserialize(saved);

  const restoredSuccessor = restoredState.missions.active.find((m) => m.id === successor.id);
  assert.ok(restoredSuccessor, 'successor survives the round trip');
  assert.equal(restoredSuccessor.mutatedFromMissionId, escort.id);
  assert.equal(restoredSuccessor.mutationTag, 'salvage');

  const restoredPlain = restoredState.missions.active.find((m) => m.title === 'Ordinary freight');
  assert.ok(restoredPlain, 'the unmutated mission survives too');
  assert.equal('mutationTag' in restoredPlain, false,
    'golden safety: a mission that never mutated carries NO mutation key at all');
  assert.equal('mutatedFromMissionId' in restoredPlain, false);
  clauseSystem.destroy();
});
