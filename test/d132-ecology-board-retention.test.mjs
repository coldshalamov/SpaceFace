/**
 * D132 — ecology (and sibling one-shot discovery) board rows must not vanish past a retention
 * cap. `alienEcology.emitEcologyOffer` sets `offersEmitted[mission.id]` the moment the row
 * boards and never emits again; `salvage._offerFromPoint` is one-shot the same way
 * (`point.offered`). A board refresh that slices retained rows below the number a site
 * actually emitted deletes authored work for the save — Ashfall Reach hosts nine authored
 * fieldwork contracts across four sites, Charon seven, all posting to one desk.
 *
 * Harness shape mirrors test/bp011-wreck-failure-content.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING } from '../src/data/missions.js';
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

function baseState() {
  return {
    meta: { seed: 47, playtimeS: 0 },
    seed: 47,
    tick: 0,
    simTime: 100,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 5000,
      researchPoints: 0,
      cargo: { items: {}, capVolume: 20, capMass: 20, usedVolume: 0, usedMass: 0 },
      stats: {},
      tether: { active: false, targetId: null },
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
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function initMissions(state, bus) {
  const missionSystem = { ...missions };
  missionSystem.init({
    state,
    bus,
    helpers: { hash32, mulberry32, voice: { say: () => true } },
    registry: { get: () => null },
  });
  return missionSystem;
}

const STATION_ID = 'station_expanse';

// The row emitEcologyOffer actually posts: id/type/stationId/params plus the site pointers.
function ecologyOffer(siteId, missionId, n) {
  return {
    id: `ecology_${missionId}`,
    offerId: `ecology_${missionId}`,
    source: 'ecology',
    sectorId: 'sector_ashfall',
    zoneId: null,
    type: 'salvage_retrieval',
    stationId: STATION_ID,
    factionId: null,
    destStationId: STATION_ID,
    destSectorId: 'sector_ashfall',
    distance: 800,
    riskTier: 2,
    collateral_cr: 0,
    duration_s: 3000,
    time_limit_s: 3000,
    title: `Fieldwork ${n}`,
    summary: `site ${siteId} contract ${n}`,
    params: {
      ecologySiteId: siteId,
      ecologyPoiId: null,
      wreckPos: { x: 100 + n, z: 200 + n },
      wreckSectorId: 'sector_ashfall',
    },
  };
}

test('D132: every emitted ecology row survives a board epoch refresh past the old 4-row cap', () => {
  const state = baseState();
  const bus = new Bus();
  const missionSystem = initMissions(state, bus);

  // Seven contracts from two multi-desk sites, all filed at the same station — the Ashfall
  // Reach / Charon shape that used to lose everything past the fourth row.
  const offers = [];
  for (let i = 0; i < 4; i++) offers.push(ecologyOffer('ashfall_reef', `ash_${i}`, i));
  for (let i = 0; i < 3; i++) offers.push(ecologyOffer('charon_bloom', `chr_${i}`, i + 4));
  for (const offer of offers) bus.emit('mission:offered', offer);

  const board0 = state.missions.boards[STATION_ID];
  for (const offer of offers) {
    assert.ok(board0.slots.some((o) => o.id === offer.id), `fixture: ${offer.id} boarded`);
  }

  // Epoch rolls: the board rebuilds. Every one-shot row is progress, not a reroll — none may
  // be sliced away, because offersEmitted/point.offered mean none can ever post again.
  const refreshSec = (state.missions.config && state.missions.config.refreshSec) || 600;
  state.simTime += refreshSec * 2 + 10;
  const board = missionSystem.ensureBoard(STATION_ID);
  assert.ok(board.refreshEpoch > 0, 'the epoch actually advanced');
  for (const offer of offers) {
    assert.ok(
      board.slots.some((o) => o.id === offer.id && o.source === 'ecology'),
      `ecology row ${offer.id} rides through the refresh until accepted`,
    );
  }
});

test('D132: a fifth salvage discovery row survives the refresh the same way', () => {
  const state = baseState();
  const bus = new Bus();
  const missionSystem = initMissions(state, bus);

  // Wreck communicators file one-shot the same way (salvage._offerFromPoint sets
  // point.offered before the row can be replayed); five finds at one dock must all keep.
  const offers = [];
  for (let i = 0; i < 5; i++) {
    offers.push({
      id: `salvage_pt${i}`,
      offerId: `salvage_pt${i}`,
      source: 'salvage',
      sectorId: 'sector_helios_prime',
      zoneId: 'zone_derelict_01',
      type: 'salvage_retrieval',
      stationId: STATION_ID,
      factionId: null,
      destStationId: STATION_ID,
      destSectorId: 'sector_helios_prime',
      distance: 600,
      riskTier: 1,
      collateral_cr: 0,
      duration_s: 2400,
      time_limit_s: 2400,
      title: `Salvage ${i}`,
      summary: 'a communicator find',
      params: { salvagePointId: `pt${i}`, wreckPos: { x: i, z: i }, wreckSectorId: 'sector_helios_prime' },
    });
  }
  for (const offer of offers) bus.emit('mission:offered', offer);

  const refreshSec = (state.missions.config && state.missions.config.refreshSec) || 600;
  state.simTime += refreshSec * 2 + 10;
  const board = missionSystem.ensureBoard(STATION_ID);
  for (const offer of offers) {
    assert.ok(
      board.slots.some((o) => o.id === offer.id && o.source === 'salvage'),
      `salvage row ${offer.id} rides through the refresh until accepted`,
    );
  }
});
