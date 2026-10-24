// SEED-SC-21 — Dione's cleared lane reads as a customs pylon, not a stock beacon.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { SOUTH_SECTORS } from '../src/data/frontierRegions/south.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { world } from '../src/systems/world.js';

const PYLON = 'place_customs_pylon';
const PIN = { x: 320, z: -420 };

function materialize(sector) {
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
    _stampHomeSector(ent, sectorId) {
      return world._stampHomeSector.call(this, ent, sectorId);
    },
  };
  world._spawnPOIs.call(host, sector, { pois: [] }, { pois: {} }, () => 0);
  return spawned;
}

test('Dione relay draws a customs pylon on the cleared lane, seed 4242', () => {
  const card = SOUTH_SECTORS.find((row) => row.id === 'sector_dione_lane');
  const sector = applySectorAnchors(card);
  const poi = sector.pois.find((row) => row.id === 'poi_dione_relay');
  assert.ok(poi, 'the relay is on the merged sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(poi.landmark, true);
  assert.equal(poi.landmarkGlb, PYLON);
  assert.notEqual(poi.landmarkGlb, 'place_lane_beacon');

  const drop = sector.pois.find((row) => row.id === 'poi_dione_deaddrop');
  assert.equal(drop.landmarkGlb, 'place_debris_chunk');

  const spawned = materialize(sector);
  const body = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_dione_relay');
  assert.ok(body, 'world._spawnPOIs places the relay');
  assert.equal(body.data.landmarkGlb, PYLON);
  assert.equal(body.data.placeId, PYLON);
  assert.equal(resolvePlaceFileForEntity(body), `places/${PYLON}.glb`);
  assert.equal(existsSync(`assets/ships/release/parts/places/${PYLON}.glb`), true);
});
