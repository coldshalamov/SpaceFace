import assert from 'node:assert/strict';
import test from 'node:test';

// FB-044 rank-gated contracts — the live board half of the faction rank ladder.
//
// Chain under test: a faction's authored rank row (RANK_GATED_CONTRACTS) posts on every desk the
// faction owns once the pilot holds the named rank step → the row rides the ordinary rolled-offer
// shape (title, minRep, minRankStep, params.rankContractId) → accepting it produces a normal active
// mission → the standing/rank gate refuses a pilot whose standing fell between posting and accept
// → boards/active round-trip through the existing serialize envelope with no schema change.

import { missions } from '../src/systems/missions.js';
import { RANK_GATED_CONTRACTS, RANK_CONTRACT_SOURCE } from '../src/data/missions.js';
import { rankTitleForStep } from '../src/systems/factions.js';

const SCN_DEF = RANK_GATED_CONTRACTS.find((d) => d.factionId === 'faction_scn');
const MTS_DEF = RANK_GATED_CONTRACTS.find((d) => d.factionId === 'faction_mts');
const SCN_STATION = 'station_coalition'; // Concord military desk — has 'missions' service
const MTS_STATION = 'station_drift';     // Meridian trade hub — different faction, different row

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(name, fn) {
      const rows = handlers.get(name) || [];
      rows.push(fn);
      handlers.set(name, rows);
    },
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const fn of [...(handlers.get(name) || [])]) fn(payload);
    },
  };
}

function makeState(repByFaction = {}) {
  const factions = {};
  for (const [id, rep] of Object.entries(repByFaction)) factions[id] = { rep };
  return {
    meta: { seed: 0x5eed },
    simTime: 1800,
    tick: 100,
    playerId: 1,
    entities: new Map(),
    player: { credits: 5000, cargo: { capVolume: 200, usedVolume: 0 }, stats: {}, researchPoints: 0 },
    ui: {},
    factions,
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    missions: { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null },
    world: { currentSectorId: 'sector_helios', activeSector: {}, sectors: {} },
    sectorSim: { sectors: {}, field: { nodes: {} } },
  };
}

function makeWorld(repByFaction = {}) {
  const state = makeState(repByFaction);
  const bus = makeBus();
  const helpers = { voice: { say() { return true; } } };
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, bus, missionSystem };
}

function rankRows(board) {
  return (board && board.slots || []).filter((o) => o && o.source === RANK_CONTRACT_SOURCE);
}

test('FB-044: a faction\'s rank contract does not post below the named rank step', () => {
  const { missionSystem } = makeWorld({ faction_scn: -100 }); // step 0 'Suspect'
  const board = missionSystem.ensureBoard(SCN_STATION);
  assert.equal(rankRows(board).length, 0,
    'a Suspect pilot sees no Concord rank contract');
  // The board itself still works — ordinary rows rolled as usual.
  assert.ok(board.slots.length > 0, 'board still carries ordinary offers');
});

test('FB-044: the rank contract posts at rank step 1 with the authored identity', () => {
  const { missionSystem } = makeWorld({ faction_scn: -29 }); // step 1 'Cleared'
  const board = missionSystem.ensureBoard(SCN_STATION);
  const rows = rankRows(board);
  assert.equal(rows.length, 1, 'exactly one Concord rank contract row');
  const offer = rows[0];
  assert.equal(offer.title, SCN_DEF.title);
  assert.equal(offer.type, SCN_DEF.type);
  assert.equal(offer.factionId, 'faction_scn');
  assert.equal(offer.stationId, SCN_STATION);
  assert.equal(offer.minRep, SCN_DEF.minRep);
  assert.equal(offer.minRankStep, SCN_DEF.minRankStep);
  assert.equal(offer.rankGated, true);
  assert.equal(offer.params && offer.params.rankContractId, SCN_DEF.id);
});

test('FB-044: the row is deduped across cached-board syncs and while a run is active', () => {
  const { state, missionSystem } = makeWorld({ faction_scn: 0 });
  const board = missionSystem.ensureBoard(SCN_STATION);
  missionSystem.ensureBoard(SCN_STATION); // same-epoch cached path syncs again
  assert.equal(rankRows(board).length, 1, 'second ensureBoard does not double-post');

  const accepted = missionSystem.acceptMission(rankRows(board)[0].id);
  assert.equal(accepted, true, 'a qualified pilot accepts the rank contract like any row');
  const active = state.missions.active.find((m) => m.params && m.params.rankContractId === SCN_DEF.id);
  assert.ok(active, 'the accepted contract is a live mission instance');
  assert.equal(active.source, RANK_CONTRACT_SOURCE);
  assert.equal(active.title, SCN_DEF.title);

  missionSystem.ensureBoard(SCN_STATION);
  assert.equal(rankRows(board).length, 0,
    'the standing row does not re-post beside its own active run');
});

test('FB-044: a fresh epoch re-posts the standing row while the rank is held', () => {
  const { state, missionSystem } = makeWorld({ faction_scn: 30 });
  const first = missionSystem.ensureBoard(SCN_STATION);
  assert.equal(rankRows(first).length, 1);
  state.simTime += 600; // next refresh epoch
  const refreshed = missionSystem.ensureBoard(SCN_STATION);
  const rows = rankRows(refreshed);
  assert.equal(rows.length, 1, 'the rank row re-posts on the next epoch');
  assert.equal(rows[0].params.rankContractId, SCN_DEF.id);
});

test('FB-044: each faction\'s board posts its own authored row, never a foreign one', () => {
  const { missionSystem } = makeWorld({ faction_scn: 0, faction_mts: 0 });
  const mtsBoard = missionSystem.ensureBoard(MTS_STATION);
  const rows = rankRows(mtsBoard);
  assert.equal(rows.length, 1, 'Meridian desk posts the Meridian row');
  assert.equal(rows[0].title, MTS_DEF.title);
  assert.equal(rows[0].type, MTS_DEF.type);
  assert.equal(rows[0].params.rankContractId, MTS_DEF.id);
  assert.equal(rows[0].factionId, 'faction_mts');
});

test('FB-044: the accept gate enforces the authored rep floor and rank step', () => {
  const { state, missionSystem } = makeWorld({ faction_scn: -29 });
  const board = missionSystem.ensureBoard(SCN_STATION);
  const offer = rankRows(board)[0];
  assert.ok(offer, 'row posted while qualified');
  state.factions.faction_scn.rep = -100; // standing fell between posting and accepting
  assert.equal(missionSystem._acceptPreflight(offer).ok, false,
    'the rep floor still refuses at accept time');
  assert.equal(missionSystem.acceptMission(offer.id), false);

  // The rank-step half of the gate, isolated: an offer that asks for a higher named rank
  // refuses a pilot whose rep clears the row's floor but not the step.
  state.factions.faction_scn.rep = 0; // step 1 'Cleared'
  const steep = { ...offer, id: 'steep-rank-test', minRep: -1000, minRankStep: 2 };
  const refused = missionSystem._acceptPreflight(steep);
  assert.equal(refused.ok, false, 'rank step 2 required, pilot holds step 1');
  assert.ok(String(refused.reason).includes(rankTitleForStep('faction_scn', 2)),
    'the refusal names the required rank');
});

test('FB-044: rank rows and the active run ride the existing save envelope', () => {
  const { state, missionSystem } = makeWorld({ faction_scn: 0 });
  missionSystem.ensureBoard(SCN_STATION);
  const offer = rankRows(state.missions.boards[SCN_STATION])[0];
  missionSystem.acceptMission(offer.id);

  const restoredState = makeState({ faction_scn: 0 });
  const bus = makeBus();
  const restored = { ...missions };
  restored.init({ state: restoredState, bus, helpers: { voice: { say() { return true; } } }, registry: { get: () => null } });
  restored.deserialize(missionSystem.serialize());

  const run = restoredState.missions.active.find((m) => m.params && m.params.rankContractId === SCN_DEF.id);
  assert.ok(run, 'the active rank contract survives save/load');
  assert.equal(run.source, RANK_CONTRACT_SOURCE);
  const board = restored.ensureBoard(SCN_STATION);
  assert.equal(rankRows(board).length, 0,
    'reloaded board does not double-post beside the restored active run');
});
