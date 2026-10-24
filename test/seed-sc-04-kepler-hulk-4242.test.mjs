// SEED-SC-04 — Kepler's flight deck is an upturned liner bow, not a stock dead hulk.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { getWestRegion } from '../src/data/frontierRegions/west.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { world } from '../src/systems/world.js';

const HULL = 'place_aftermath_wreck_liner_bow_authored_down';
const PIN = { x: 40, z: 720 };

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
          radius: spec.radius,
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

test('Kepler flight deck draws the upturned liner bow beside the bazaar, seed 4242', () => {
  const region = getWestRegion('sector_kepler_scar');
  const sector = applySectorAnchors(region.sector);
  const poi = sector.pois.find((row) => row.id === 'poi_kepler_hulk');
  assert.ok(poi, 'the flight deck is on the merged sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(poi.landmarkGlb, HULL);
  assert.notEqual(poi.landmarkGlb, 'place_dead_hulk');

  const spawned = materialize(sector);
  const body = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_kepler_hulk');
  assert.ok(body, 'world._spawnPOIs places the carrier hull');
  assert.equal(body.data.landmark, true);
  assert.equal(body.data.landmarkGlb, HULL);
  assert.equal(body.data.placeId, HULL);
  const file = resolvePlaceFileForEntity(body);
  assert.equal(file, `places/${HULL}.glb`);
  assert.equal(file.includes('place_dead_hulk'), false);
  assert.equal(
    existsSync(`assets/ships/release/parts/places/${HULL}.glb`),
    true,
    'the liner bow release body is on disk',
  );

  const stash = sector.pois.find((row) => row.id === 'poi_kepler_stash');
  assert.equal(stash.landmarkGlb, 'place_debris_chunk');
});
