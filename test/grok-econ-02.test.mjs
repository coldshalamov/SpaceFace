// ECON-02: after the firsts ledger is full, a completed research contract still
// pays RESEARCH_GRANTS, with a per-day cap. Kills do not. Dedupe stays.
import assert from 'node:assert/strict';
import test from 'node:test';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { RESEARCH_FIRSTS_CAP, RESEARCH_GRANTS } from '../src/data/researchGrants.js';
import { missions } from '../src/systems/missions.js';

const SEED = 4242;

class Bus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }
  on(name, fn) {
    const rows = this.handlers.get(name) || [];
    rows.push(fn);
    this.handlers.set(name, rows);
    return () => {};
  }
  off() {}
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function boot() {
  const state = {
    meta: { seed: SEED, playtimeS: 0 },
    seed: SEED,
    tick: 0,
    simTime: 100,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 5000,
      researchPoints: 0,
      cargo: { items: {}, capVolume: 20, capMass: 20, usedVolume: 0, usedMass: 0 },
      stats: {},
    },
    missions: {
      boards: {},
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: JSON.parse(JSON.stringify(MISSION_TUNING)),
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: {},
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    entities: new Map(),
    entityList: [],
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: { hash32, mulberry32, voice: { say: () => true } } });
  return { state, bus, missionSystem };
}

function contractEvents(bus) {
  return bus.log.filter((entry) => entry.name === 'research:pointsChanged'
    && entry.payload && entry.payload.source === 'research:contract');
}

function fillFirsts(state, count) {
  const firsts = {};
  for (let i = 0; i < count; i += 1) firsts[`anomaly:fill_${i}`] = i;
  state.player.researchFirsts = firsts;
}

function complete(harness, type) {
  const mission = {
    id: `m-${harness.state.missions.nextId++}`,
    status: 'active',
    type,
    riskTier: 0,
    reward_cr: 100,
    collateral_cr: 0,
    title: type,
    summary: 'x',
  };
  harness.state.missions.active.push(mission);
  harness.missionSystem._completeMission(mission, harness.state.missions.active.length - 1);
  return mission;
}

test('a full firsts ledger still pays a research contract through RESEARCH_GRANTS, capped per day', () => {
  const harness = boot();
  const { state, bus, missionSystem } = harness;
  const spec = RESEARCH_GRANTS['research:contract'];
  assert.equal(spec.repeatable, true);
  assert.ok(spec.dailyCap > 0);
  assert.equal(Array.isArray(spec.types) && spec.types.includes('bounty_hunt'), false);
  assert.equal(RESEARCH_GRANTS['entity:killed'], undefined);

  fillFirsts(state, RESEARCH_FIRSTS_CAP - 1);
  const beforeCap = state.player.researchPoints;
  complete(harness, 'recon_scan');
  assert.equal(contractEvents(bus).length, 0, 'the contract row waits until the firsts ledger is full');
  assert.equal(state.player.researchPoints, beforeCap + 4, 'cerebral recon pay still lands before the cap');

  fillFirsts(state, RESEARCH_FIRSTS_CAP);
  const ledgerBefore = Object.keys(state.player.researchFirsts).length;
  for (let i = 0; i < spec.dailyCap; i += 1) {
    const before = state.player.researchPoints;
    complete(harness, i % 2 === 0 ? 'recon_scan' : 'salvage_retrieval');
    const events = contractEvents(bus);
    assert.equal(events.length, i + 1);
    assert.equal(events[i].payload.granted, spec.rp);
    assert.equal(events[i].payload.scope, spec.scope);
    assert.equal(state.player.researchPoints, before + (i % 2 === 0 ? 4 : 2) + spec.rp);
  }
  assert.equal(Object.keys(state.player.researchFirsts).length, ledgerBefore,
    'the contract row does not enter the firsts ledger');

  const atCap = state.player.researchPoints;
  const eventsAtCap = contractEvents(bus).length;
  complete(harness, 'recon_scan');
  assert.equal(contractEvents(bus).length, eventsAtCap, 'the next completion the same day does not pay the row');
  assert.equal(state.player.researchPoints, atCap + 4, 'cerebral pay remains; the capped row does not');

  state.simTime += 86400;
  const nextDay = state.player.researchPoints;
  complete(harness, 'salvage_retrieval');
  assert.equal(contractEvents(bus).length, eventsAtCap + 1);
  assert.equal(state.player.researchPoints, nextDay + 2 + spec.rp, 'the next sim-day pays the row again');

  const beforeBounty = state.player.researchPoints;
  const beforeBountyEvents = contractEvents(bus).length;
  complete(harness, 'bounty_hunt');
  assert.equal(contractEvents(bus).length, beforeBountyEvents);
  assert.equal(state.player.researchPoints, beforeBounty, 'a kill contract does not grant research points');

  const firstsAtDedupe = Object.keys(state.player.researchFirsts).length;
  bus.emit('anomaly:triangulated', { poiId: 'poi_econ02' });
  const paid = state.player.researchPoints;
  bus.emit('anomaly:triangulated', { poiId: 'poi_econ02' });
  assert.equal(state.player.researchPoints, paid, 'a repeated first still pays once');
  assert.equal(Object.keys(state.player.researchFirsts).length, firstsAtDedupe);
  assert.equal(missionSystem._grantResearchFirst('research:contract', { missionId: 'm-direct' }), 0);
  assert.equal(state.player.researchPoints, paid, 'emitting the contract row does not mint a first');
});
