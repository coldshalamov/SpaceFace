import test from 'node:test';
import assert from 'node:assert/strict';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { clauseById } from '../src/data/contractClauses.js';
import { contractClausesSystem, attachClauses } from '../src/systems/contractClauses.js';
import { missions } from '../src/systems/missions.js';

// FB-056 — the authored time_limit clause is offered on deadline'd contracts, ticks against
// m.deadline_s on simTime, honors on completion before expiry, breaches on expiry, and posts a
// one-line receipt through the comms/mission-log lane. The research grant stays single-sourced
// inside missions' settlement.

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
    id: clause.id, event: clause.event, label: clause.label,
    prose: clause.prose, rewardMult: clause.rewardMult,
  };
}

function makeOffer(overrides = {}) {
  return {
    id: 'offer_time_limit',
    type: 'cargo_delivery',
    stationId: 'station_helios',
    factionId: 'faction_mts',
    params: { cmdtyId: 'cmdty_salvage_electronics', qty: 1 },
    reward_cr: 1000,
    collateral_cr: 200,
    riskTier: 2,
    duration_s: 600,
    destStationId: 'station_beltout',
    destSectorId: 'sector_ceres_belt',
    distance: 1200,
    title: 'Deadline freight',
    summary: 'A deadline-bearing contract used by the FB-056 acceptance contract.',
    source: 'careerContract',
    preloadedCargo: true,
    clauses: [serializableClause('time_limit')],
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

test('generated offers that carry a real duration can roll the time_limit clause', () => {
  let attached = 0;
  let deadlineFree = 0;
  for (let i = 0; i < 400; i++) {
    const offer = attachClauses({
      id: `tl_${i}`, type: 'cargo_delivery', reward_cr: 1000, duration_s: 900,
    }, 7);
    const row = (offer.clauses || []).find((c) => c && c.id === 'time_limit');
    if (row) attached++;
    const bare = attachClauses({ id: `free_${i}`, type: 'cargo_delivery', reward_cr: 1000 }, 7);
    if ((bare.clauses || []).some((c) => c && c.id === 'time_limit')) deadlineFree++;
  }
  assert.ok(attached > 0, 'a deadline-bearing offer can attach time_limit');
  assert.equal(deadlineFree, 0, 'a deadline-free offer never carries the deadline clause');
});

test('completion before the deadline honors the clause, pays the bonus, and prints one receipt line', () => {
  const offer = makeOffer();
  const { state, bus, clauseSystem } = initSystems(offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  assert.equal(state.missions.active.length, 1);
  const mission = state.missions.active[0];
  assert.equal(mission.deadline_s, 620, 'acceptance seeds deadline_s from offer.duration_s on simTime');
  assert.ok(mission._clauseState && mission._clauseState.time_limit, 'acceptance seeds the clause runtime');

  // Deliver well inside the window (simTime is still 20 of a 620 deadline).
  bus.emit('dock:docked', { stationId: offer.destStationId });

  assert.equal(state.missions.active.length, 0, 'completed mission settles');
  assert.equal(count(bus, 'mission:completed'), 1);
  assert.equal(count(bus, 'mission:expired'), 0);
  assert.equal(count(bus, 'contract:clauseBroken'), 0);
  assert.equal(count(bus, 'contract:clauseHonored', (p) => p.clauseId === 'time_limit'), 1,
    'the clause honors exactly once on completion before the deadline');

  const rewardEvents = bus.log.filter((entry) => entry.name === 'economy:grantCredits'
    && /^mission:/.test(entry.payload && entry.payload.reason || ''));
  assert.equal(rewardEvents.length, 1);
  assert.equal(rewardEvents[0].payload.amount, Math.round(offer.reward_cr * 1.05),
    'the honored +5% rides the one canonical payout');

  const honorReceipts = bus.log.filter((entry) => entry.name === 'comms:log'
    && /term honored/i.test(entry.payload && entry.payload.text || ''));
  assert.equal(honorReceipts.length, 1, 'one visible receipt line through the comms/mission-log lane');
  assert.match(honorReceipts[0].payload.text, /time limit/i);

  // The clause research grant stays single-sourced inside missions' settlement.
  const grants = bus.log.filter((entry) => entry.name === 'research:pointsChanged'
    && entry.payload && entry.payload.source === 'clause_honor');
  assert.equal(grants.length, 1, 'the honor grant fires once — never doubled by the receipt listener');
  assert.equal(grants[0].payload.granted, 1, 'CLAUSE_HONOR_RP per honored clause');
  assert.equal(state.player.researchPoints, 1);
  clauseSystem.destroy();
});

test('expiry at the deadline breaches the clause through the same one penalty intent', () => {
  const offer = makeOffer({ id: 'offer_time_limit_expiry' });
  const { state, bus, missionSystem, clauseSystem } = initSystems(offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  const mission = state.missions.active[0];
  assert.ok(mission);

  state.simTime = 621; // one second past deadline_s (20 + 600)
  missionSystem.update(1 / 60, state); // missions own the expiry machinery; clauses observe it

  // The expired contract leaves `active`. PQ-138.04 may refile the lapsed leg as a restitution
  // successor — the assertion keys on the expired id, never on list length.
  assert.ok(!state.missions.active.some((m) => m && m.id === mission.id),
    'the deadline removes the expired contract');
  assert.equal(count(bus, 'mission:expired'), 1);
  assert.equal(count(bus, 'contract:clauseBroken', (p) => p.clauseId === 'time_limit'), 1,
    'expiry breaches the clause — the same intent every clause uses');
  assert.equal(mission._clauseState.time_limit.breached, true,
    'the breach flag is latched on the instance record');
  assert.equal(count(bus, 'contract:clauseHonored'), 0);
  assert.equal(count(bus, 'mission:failed'), 0,
    'expiry is its own terminal outcome — the clause intent does not double-penalize');
  assert.equal(state.missions.receipts[0].outcome, 'expired');
  assert.equal(state.missions.receipts[0].collateralLostCr, offer.collateral_cr,
    'the shipped collateral-forfeit path owns the deposit');

  // The observer's own tick stays silent after settlement — no late double breach.
  clauseSystem.update(1 / 60, state);
  assert.equal(count(bus, 'contract:clauseBroken'), 1);
  clauseSystem.destroy();
});

test('the system tick breaches an active mission that has run past its deadline', () => {
  const offer = makeOffer({ id: 'offer_time_limit_tick' });
  const { state, bus, clauseSystem } = initSystems(offer);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  const mission = state.missions.active[0];
  assert.ok(mission);

  // Inside the window: the tick sees no breach.
  clauseSystem.update(1 / 60, state);
  assert.equal(count(bus, 'contract:clauseBroken'), 0);

  // Past it (missions.update not run — the observer tick still enforces the predicate).
  state.simTime = 621;
  clauseSystem.update(1 / 60, state);
  assert.equal(count(bus, 'contract:clauseBroken', (p) => p.clauseId === 'time_limit'), 1);
  assert.equal(mission._clauseState.time_limit.breached, true);
  clauseSystem.update(1 / 60, state);
  assert.equal(count(bus, 'contract:clauseBroken'), 1, 'the breach fires exactly once');
  clauseSystem.destroy();
});
