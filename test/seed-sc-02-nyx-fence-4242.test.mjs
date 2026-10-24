// SEED-SC-02 — Nyx's fence reads as the claim-outpost fence, not the shared black-market kit.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { getWestRegion } from '../src/data/frontierRegions/west.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { world } from '../src/systems/world.js';

const FENCE = 'place_claim_outpost_fence';
const PIN = { x: -880, z: 540 };

function materializeStations(sector) {
  const spawned = [];
  let nextId = 1;
  const host = {
    state: {},
    helpers: {
      spawnEntity(spec) {
        const ent = {
          id: nextId++,
          type: spec.type,
          pos: { x: spec.pos.x, z: spec.pos.z },
          data: spec.data,
          alive: true,
        };
        spawned.push(ent);
        return ent;
      },
    },
    _toGlobal(local, sectorId, out) {
      return world._toGlobal(local, sectorId, out);
    },
    _sectorOrigin(sectorId) {
      return world._sectorOrigin(sectorId);
    },
    _stampHomeSector(ent, sectorId) {
      return world._stampHomeSector.call(this, ent, sectorId);
    },
  };
  world._spawnStations.call(host, sector, { stations: [] }, () => 0);
  return spawned;
}

test('Nyx fence draws the claim-outpost fence on the arrival station, seed 4242', () => {
  const region = getWestRegion('sector_nyx_march');
  const sector = applySectorAnchors(region.sector);
  const station = sector.stations.find((row) => row.id === 'station_nyx_march');
  assert.ok(station, 'the fence station is on the merged sector');
  assert.equal(station.pos.x, PIN.x);
  assert.equal(station.pos.z, PIN.z);
  assert.equal(station.archetypeGlb, FENCE);
  assert.notEqual(station.archetypeGlb, 'place_station_blackmarket');

  const wreck = sector.pois.find((row) => row.id === 'poi_nyx_wreck');
  assert.equal(wreck.pos.x, 1120);
  assert.equal(wreck.pos.z, 760);
  assert.equal(wreck.landmarkGlb, 'place_dead_hulk');
  assert.equal(sector.pois.some((row) => row.id === 'poi_nyx_false_gate'), false);

  const spawned = materializeStations(sector);
  const body = spawned.find((ent) => ent.data && ent.data.stationId === 'station_nyx_march');
  assert.ok(body, 'world._spawnStations places the fence');
  assert.equal(body.type, 'station');
  assert.equal(body.data.archetypeGlb, FENCE);
  assert.equal(resolvePlaceFileForEntity(body), `places/${FENCE}.glb`);
  assert.equal(existsSync(`assets/ships/release/parts/places/${FENCE}.glb`), true);
});
