// The first-session package — placement truth and the guaranteed-beat ladder.
//
// The starter route is authored end to end: every chord a new player flies carries something
// authored, the dock rumor names real places, the first trade pays its own tolls, and the
// guaranteed encounter ladder (raid d0 → relighting d0 → salvage tail d1 → yard towout d2)
// keeps a beat on every early day. This file pins those contracts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { AUTHORED_DOCK_RUMORS } from '../src/data/frontierRumors.js';
import { FIRST_TRADE_CONTRACT } from '../src/data/economyContractTemplates.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { planEncountersDay } from '../src/systems/encounterDirector.js';

function distanceToSegment(p, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const t = Math.max(0, Math.min(1,
    ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

const HELIOS = SECTOR_ANCHORS.sector_helios_prime;
const anchorById = (sector, id) => SECTOR_ANCHORS[sector].pois.find((row) => row.id === id);
const sectorPoiById = (sector, id) => SECTORS.find((row) => row.id === sector)
  .pois.find((row) => row.id === id);

function assertPlacedInBoth(poiId, sectorId) {
  const anchor = anchorById(sectorId, poiId);
  const def = sectorPoiById(sectorId, poiId);
  assert.ok(anchor, `${poiId} has an authored anchor (position)`);
  assert.ok(def, `${poiId} has a sector def (name/plate)`);
  assert.ok(Number.isFinite(anchor.pos.x) && Number.isFinite(anchor.pos.z),
    `${poiId} anchor carries a real position`);
  return anchor;
}

test('the new chord sites are placed in both data surfaces, on the chords they serve', () => {
  const manifest = JSON.parse(readFileSync(
    new URL('../assets/ships/parts/parts_manifest.json', import.meta.url)));
  const placeIds = new Set((manifest.parts || []).map((row) => row && row.id));

  // Checkpoint Niner sits on the station→Coalition chord (the sector's barest lane).
  const picket = assertPlacedInBoth('poi_helios_picket', 'sector_helios_prime');
  assert.equal(picket.landmarkGlb, 'place_interdiction_buoy');
  assert.ok(placeIds.has('place_interdiction_buoy'), 'buoy is a manifest place prop');
  const station = HELIOS.stations.find((row) => row.id === 'station_helios').pos;
  const coalition = HELIOS.stations.find((row) => row.id === 'station_coalition').pos;
  assert.ok(distanceToSegment(picket.pos, station, coalition) < 200,
    'Checkpoint Niner sits on the Coalition chord');

  // Smear Marker 7 sits on the memorial→Pit Line bearing.
  const smear = assertPlacedInBoth('poi_helios_smear_pin', 'sector_helios_prime');
  assert.equal(smear.landmarkGlb, 'place_lane_pin');
  const memorial = anchorById('sector_helios_prime', 'poi_memorial').pos;
  const pitLine = anchorById('sector_helios_prime', 'poi_helios_pit_line').pos;
  assert.ok(distanceToSegment(smear.pos, memorial, pitLine) < 200,
    'Smear Marker 7 sits on the Fleet bearing');

  // The Ceres arrival corridor (the longest bare stretch a new player crosses) carries a
  // flare rack and a weigh pin between the Helios gate and the refinery.
  const flare = assertPlacedInBoth('poi_ceres_flare_rack', 'sector_ceres_belt');
  const weigh = assertPlacedInBoth('poi_ceres_weigh_pin', 'sector_ceres_belt');
  assert.equal(flare.landmarkGlb, 'place_worklight_tower');
  assert.equal(weigh.landmarkGlb, 'place_tally_post');
  assert.ok(placeIds.has('place_worklight_tower') && placeIds.has('place_tally_post'),
    'corridor props are manifest place props');
  const ceresGate = SECTOR_ANCHORS.sector_ceres_belt.gates
    .find((row) => row.to === 'sector_helios_prime').pos;
  const ceresStation = SECTOR_ANCHORS.sector_ceres_belt.stations
    .find((row) => row.id === 'station_ceres').pos;
  assert.ok(distanceToSegment(flare.pos, ceresGate, ceresStation) < 220
    && distanceToSegment(weigh.pos, ceresGate, ceresStation) < 220,
    'both corridor pins sit on the arrival leg');
  // And they lead inward in the right order: gate → flare → weigh → refinery.
  const along = (p) => (p.x - ceresGate.x) ** 2 + (p.z - ceresGate.z) ** 2;
  assert.ok(along(flare.pos) < along(weigh.pos), 'flare rack precedes the weigh pin');
});

test('the dock rumors name real, reachable things', () => {
  assert.ok(AUTHORED_DOCK_RUMORS.station_helios, 'the starter bar has its own lead');
  assert.ok(/Fleet/.test(AUTHORED_DOCK_RUMORS.station_helios),
    'the Helios lead names the Candle Fleet');
  assert.ok(/dark side|holds formation/.test(AUTHORED_DOCK_RUMORS.station_helios),
    'the Helios lead points at the drift line (poi_helios_pit_line)');
  assert.ok(/Belt Outpost/.test(AUTHORED_DOCK_RUMORS.station_drift),
    'the Drift lead teaches the ration run to the Belt Outpost');
});

test('the first trade clears its own tolls with margin left over', () => {
  // Round-trip gate tolls for the corridor price out at ~440 cr (194 in, 246 back).
  const TOLLS = 440;
  assert.equal(FIRST_TRADE_CONTRACT.distance, 8900,
    'the contract quotes the true station-to-station run');
  assert.ok(FIRST_TRADE_CONTRACT.terms.paysCr > TOLLS + 200,
    `pay ${FIRST_TRADE_CONTRACT.terms.paysCr} must clear ${TOLLS} tolls and leave a margin`);
  assert.match(FIRST_TRADE_CONTRACT.brief, /tolls/i,
    'the brief teaches that gate tolls come out of the run');
});

test('the guaranteed-beat ladder holds: raid d0, relighting d0, tail d1, towout d2', () => {
  const zones = zonesForSector('sector_helios_prime');
  const findAt = (seed, day, shapeId) => planEncountersDay(seed, 'sector_helios_prime', day,
    zones, null, undefined).find((row) => row.shapeId === shapeId) || null;
  for (let seed = 4242; seed < 4248; seed++) {
    const raid = findAt(seed, 0, 'opening_hauler_raid');
    const relight = findAt(seed, 0, 'candle_relighting');
    const tail = findAt(seed, 1, 'salvage_tail');
    const towout = findAt(seed, 2, 'yard_towout');
    assert.ok(raid, `raid guaranteed day 0 (seed ${seed})`);
    assert.ok(raid.delay <= 170, 'raid inside its authored window');
    assert.ok(relight && relight.delay <= 810, `relighting day 0, inside its window (seed ${seed})`);
    assert.ok(tail && tail.delay <= 420, `salvage tail day 1, inside its window (seed ${seed})`);
    assert.ok(towout && towout.delay <= 780, `yard towout day 2, inside its window (seed ${seed})`);
  }
});

test('Ceres can give a new pilot work: the refinery runs a contracts desk', () => {
  const ceres = SECTORS.find((row) => row.id === 'sector_ceres_belt')
    .stations.find((row) => row.id === 'station_ceres');
  assert.ok(ceres.services.includes('missions'),
    'the first gate destination posts work, not just a market');
  assert.match(ceres.chartNote, /desk|run/i,
    'the chart note mentions the work, not only the market');
});
