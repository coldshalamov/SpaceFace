// SEED-SC-06 — the Shadow Plinth is a memorial array, not a nav buoy.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { getWestRegion } from '../src/data/frontierRegions/west.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { world } from '../src/systems/world.js';

const PLINTH = 'place_memorial_array';
const PIN = { x: 980, z: -540 };

function materialize(sector) {
  const state = {};
  const spawned = [];
  let nextId = 1;
  const host = {
    state,
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
  const dressed = state.world && state.world.dressing && state.world.dressing.rows || [];
  return spawned.concat(dressed);
}

test('Orcus plinth draws a memorial array facing the signal, seed 4242', () => {
  const region = getWestRegion('sector_orcus_shadow');
  const sector = applySectorAnchors(region.sector);
  const poi = sector.pois.find((row) => row.id === 'poi_orcus_plinth');
  assert.ok(poi, 'the plinth is on the merged sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(poi.landmarkGlb, PLINTH);
  assert.notEqual(poi.landmarkGlb, 'place_nav_buoy');

  const signal = sector.pois.find((row) => row.id === 'poi_orcus_anomaly');
  assert.equal(signal.pos.x, 0);
  assert.equal(signal.pos.z, 0);
  assert.equal(signal.landmarkGlb, 'place_asteroid_seamed');
  const vault = sector.pois.find((row) => row.id === 'poi_orcus_vault');
  assert.equal(vault.landmarkGlb, 'place_debris_chunk');

  const spawned = materialize(sector);
  const body = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_orcus_plinth');
  assert.ok(body, 'world._spawnPOIs places the plinth');
  assert.equal(body.data.landmarkGlb, PLINTH);
  assert.equal(body.data.placeId, PLINTH);
  assert.equal(resolvePlaceFileForEntity(body), `places/${PLINTH}.glb`);
  assert.equal(existsSync(`assets/ships/release/parts/places/${PLINTH}.glb`), true);
});
