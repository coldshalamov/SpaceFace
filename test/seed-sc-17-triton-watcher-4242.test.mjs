// SEED-SC-17 — the Tide-Locked Watcher is an observation blister, not a seamed rock.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { EAST_SECTORS } from '../src/data/frontierRegions/east.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { world } from '../src/systems/world.js';

const WATCHER = 'place_observation_blister';
const PIN = { x: -1700, z: 1500 };

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

test('Triton watcher draws an observation blister, not the field-lab mast, seed 4242', () => {
  const card = EAST_SECTORS.find((row) => row.id === 'sector_triton_wake');
  const sector = applySectorAnchors(card);
  const poi = sector.pois.find((row) => row.id === 'poi_triton_watcher');
  assert.ok(poi, 'the watcher is on the merged sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(poi.landmarkGlb, WATCHER);
  assert.notEqual(poi.landmarkGlb, 'place_asteroid_seamed');
  assert.notEqual(poi.landmarkGlb, 'place_sensor_mast');

  const anomaly = sector.pois.find((row) => row.id === 'poi_triton_anomaly');
  assert.equal(anomaly.pos.x, 40);
  assert.equal(anomaly.pos.z, 120);
  assert.equal(anomaly.landmarkGlb, 'place_asteroid_seamed');
  const lab = sector.pois.find((row) => row.id === 'poi_triton_field_lab');
  assert.equal(lab.landmarkGlb, 'place_sensor_mast');

  const spawned = materialize(sector);
  const body = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_triton_watcher');
  assert.ok(body, 'world._spawnPOIs places the watcher');
  assert.equal(body.data.landmarkGlb, WATCHER);
  assert.equal(body.data.placeId, WATCHER);
  assert.equal(resolvePlaceFileForEntity(body), `places/${WATCHER}.glb`);
  assert.equal(existsSync(`assets/ships/release/parts/places/${WATCHER}.glb`), true);
  const labBody = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_triton_field_lab');
  if (labBody) assert.notEqual(resolvePlaceFileForEntity(labBody), `places/${WATCHER}.glb`);
});
