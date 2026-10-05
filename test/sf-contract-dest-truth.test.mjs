// SF-CONTRACT-DEST-TRUTH — a field contract's destination must be a berth the contract can
// settle at. economyContracts picked relief and surplus destinations off raw station records
// with no dock gate: a repGated-only neighbor (Sker Haven, Nyx March) could be named the
// delivery target for a pilot the berth refuses — the same "contract the world cannot settle"
// class the board picker already guards, one emitter over.
//
// Contract (deterministic, real economyContracts owner):
//   1. a gated-only neighbor can never be a relief destination — the evaluation declines
//      rather than name a berth that refuses;
//   2. standing opens the same berth — rep ≥ 1 makes the fence the destination again;
//   3. a surplus haul-out skips every gated sector and lands on the best dockable neighbor;
//   4. an explicit minRep berth (Mercenary Outpost, -30) counts as dockable — the gate reads
//      the dock contract, not a hostile-sounding flag.
import assert from 'node:assert/strict';
import test from 'node:test';

import { economyContracts } from '../src/systems/economyContracts.js';
import { SECTORS } from '../src/data/sectors.js';

const PALLAS = SECTORS.find((s) => s.id === 'sector_pallas_drift');
const DRIFT = PALLAS.stations.find((s) => s.id === 'station_drift');
const INFO = {
  id: DRIFT.id, name: DRIFT.name, type: DRIFT.type,
  tier: PALLAS.tier || 0, size: DRIFT.size || 'M',
  factionId: DRIFT.factionId || PALLAS.factionId, sectorId: PALLAS.id,
};

function fieldNode({ pressure = 0, pressureTag = 'market_balance' } = {}) {
  return {
    danger: 0.2,
    pricePressure: pressure,
    influence: { faction_scn: 0.4 },
    dominantFactionId: 'faction_scn',
    dominantInfluence: 0.4,
    contestMargin: 0.1,
    trend: { danger: 0, pricePressure: 0, influence: 0 },
    driver: { danger: 'structural_baseline', pricePressure: pressureTag, influence: 'territorial_anchor' },
  };
}

function makeState({ nodes = {}, repByFaction = {}, simTime = 100, seed = 7 } = {}) {
  const factions = {};
  for (const [fid, rep] of Object.entries(repByFaction)) factions[fid] = { rep };
  return {
    mode: 'flight',
    simTime,
    playerId: 1,
    meta: { seed },
    world: { currentSectorId: PALLAS.id, sectors: {} },
    entities: new Map([[1, { id: 1, type: 'ship', alive: true, team: 1, pos: { x: 0, z: 0 } }]]),
    entityList: [{ id: 1 }],
    player: {
      credits: 50000, researchPoints: 0, stats: {},
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 500, capMass: 500 },
    },
    factions,
    nav: {}, ui: {},
    economy: { markets: {} },
    sectorSim: {
      field: { version: 1, epochDays: 2, nodes },
      sectors: {}, meta: {},
    },
  };
}

function sys(state) {
  const bus = { on() {}, off() {}, emit() {} };
  const s = { ...economyContracts };
  s.init({ bus, state, helpers: { voice: { say() { return true; } } } });
  return s;
}

const SKER_DISTRESS = () => fieldNode({ pressure: 0.4, pressureTag: 'route_scarcity' });

test('a gated-only neighbor can never be a relief destination', () => {
  // Pallas's only distressed neighbor is Sker Haven — one repGated berth. The evaluation
  // must decline rather than name a berth the rep-0 pilot cannot dock at.
  const state = makeState({ nodes: { sector_sker_haven: SKER_DISTRESS() } });
  const offer = sys(state).planOffer(INFO, 0);
  assert.equal(offer, null, 'a gated-only distress posts nothing a pilot cannot settle');
});

test('standing opens the gated relief berth', () => {
  const state = makeState({
    nodes: { sector_sker_haven: SKER_DISTRESS() },
    repByFaction: { faction_reach: 5 },
  });
  const offer = sys(state).planOffer(INFO, 0);
  assert.ok(offer, 'standing lets the relief run post');
  assert.equal(offer.destStationId, 'station_sker');
  assert.equal(offer.cause.tag, 'route_scarcity');
});

test('a surplus haul-out skips every gated sector for the best dockable neighbor', () => {
  // Home is in surplus; Sker and Nyx both out-pressure Ceres — but every berth in those
  // sectors is gated. The freight must land on the best dockable read, not the best raw one.
  const state = makeState({
    nodes: {
      sector_pallas_drift: fieldNode({ pressure: -0.4, pressureTag: 'route_surplus' }),
      sector_sker_haven: fieldNode({ pressure: 0.9 }),
      sector_nyx_march: fieldNode({ pressure: 0.8 }),
      sector_ceres_belt: fieldNode({ pressure: 0.5 }),
      sector_io_reach: fieldNode({ pressure: 0.2 }),
    },
  });
  const s = sys(state);
  const offer = s.planOffer(INFO, 0);
  assert.ok(offer, 'a dockable neighbor takes the surplus');
  assert.equal(offer.type, 'cargo_delivery');
  assert.equal(offer.destSectorId, 'sector_ceres_belt',
    `gated sectors must be skipped (got ${offer.destSectorId})`);
  assert.notEqual(offer.destStationId, 'station_sker');
  assert.notEqual(offer.destStationId, 'station_nyx_march');
  // Same inputs, same offer — the pick is seeded, not ambient.
  assert.deepEqual(sys(makeState({
    nodes: {
      sector_pallas_drift: fieldNode({ pressure: -0.4, pressureTag: 'route_surplus' }),
      sector_sker_haven: fieldNode({ pressure: 0.9 }),
      sector_nyx_march: fieldNode({ pressure: 0.8 }),
      sector_ceres_belt: fieldNode({ pressure: 0.5 }),
      sector_io_reach: fieldNode({ pressure: 0.2 }),
    },
  })).planOffer(INFO, 0), offer);
});

test('an explicit minRep berth counts as dockable freight', () => {
  // Io Reach's Mercenary Outpost vets at rep >= -30 — a rep-0 pilot can dock there even
  // though the faction reads hostile. With the strongest pressure it should WIN the pick.
  const state = makeState({
    nodes: {
      sector_pallas_drift: fieldNode({ pressure: -0.4, pressureTag: 'route_surplus' }),
      sector_sker_haven: fieldNode({ pressure: 0.9 }),
      sector_ceres_belt: fieldNode({ pressure: 0.5 }),
      sector_io_reach: fieldNode({ pressure: 0.6 }),
    },
  });
  const offer = sys(state).planOffer(INFO, 0);
  assert.ok(offer);
  assert.equal(offer.destSectorId, 'sector_io_reach',
    'a minRep -30 berth is dockable freight at rep 0');
  assert.ok(['station_reach', 'station_io_merc'].includes(offer.destStationId));
});

test('below its own minRep the berth stops taking freight', () => {
  // Same fixture, but Quiet standing of -50 is below the Outpost's -30 contract. Io Reach
  // keeps a second open berth — the freight must land on Reach Station, never the gate.
  const state = makeState({
    repByFaction: { faction_quiet: -50 },
    nodes: {
      sector_pallas_drift: fieldNode({ pressure: -0.4, pressureTag: 'route_surplus' }),
      sector_io_reach: fieldNode({ pressure: 0.6 }),
      sector_ceres_belt: fieldNode({ pressure: 0.5 }),
    },
  });
  const s = sys(state);
  const offer = s.planOffer(INFO, 0);
  assert.ok(offer);
  assert.equal(offer.destSectorId, 'sector_io_reach');
  assert.equal(offer.destStationId, 'station_reach',
    'the open berth takes the freight its gated sibling cannot');
  // Pin the pool, not the draw: below -30 the Outpost must be absent outright —
  // a pick that merely lands on Reach by rng would vacuously pass the offer asserts.
  const io = SECTORS.find((sec) => sec.id === 'sector_io_reach');
  assert.deepEqual(
    s._dockableStations(io).map((st) => st.id),
    ['station_reach'],
  );
});
