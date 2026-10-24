// SEED-SC-01 — Io's wreck cathedral is the cathedral hull, not a stock dead hulk.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

import { SECTORS } from '../src/data/sectors.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { world } from '../src/systems/world.js';

const CATHEDRAL = 'place_landmark_wreck_cathedral';
const PIN = { x: -1420, z: -780 };

function materializePois(sector) {
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

test('Io wreck cathedral draws the cathedral hull at its pin, seed 4242', () => {
  const sector = SECTORS.find((row) => row.id === 'sector_io_reach');
  const poi = sector.pois.find((row) => row.id === 'poi_cruiser');
  assert.ok(poi, 'the cruiser is on the live sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(poi.landmarkGlb, CATHEDRAL);
  assert.notEqual(poi.landmarkGlb, 'place_dead_hulk');

  const merc = sector.pois.find((row) => row.id === 'poi_merc');
  assert.equal(merc.landmarkGlb, 'place_nav_buoy');

  const spawned = materializePois(sector);
  const body = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_cruiser');
  assert.ok(body, 'world._spawnPOIs places the cathedral');
  assert.equal(body.data.landmark, true);
  assert.equal(body.data.landmarkGlb, CATHEDRAL);
  assert.equal(body.data.placeId, CATHEDRAL);
  assert.equal(resolvePlaceFileForEntity(body), `places/${CATHEDRAL}.glb`);
  assert.equal(existsSync(`assets/ships/release/parts/places/${CATHEDRAL}.glb`), true);
});
