// SEED-SC-03 — Hyperion's caved shaft is the cold drill, not a stock dead hulk.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { getWestRegion } from '../src/data/frontierRegions/west.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { world } from '../src/systems/world.js';

const DRILL = 'place_drill_platform_cold';
const PIN = { x: 240, z: -1180 };

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

test('Hyperion caved shaft draws the cold drill at the quest pin, seed 4242', () => {
  const region = getWestRegion('sector_hyperion_cut');
  const sector = applySectorAnchors(region.sector);
  const poi = sector.pois.find((row) => row.id === 'poi_hyperion_driller');
  assert.ok(poi, 'the shaft is on the merged sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(poi.landmarkGlb, DRILL);
  assert.notEqual(poi.landmarkGlb, 'place_dead_hulk');

  const spawned = materialize(sector);
  const body = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_hyperion_driller');
  assert.ok(body, 'world._spawnPOIs places the shaft on the live list');
  assert.equal(body.data.landmark, true);
  assert.equal(body.data.landmarkGlb, DRILL);
  assert.equal(body.data.placeId, DRILL);
  assert.equal(resolvePlaceFileForEntity(body), `places/${DRILL}.glb`);
  assert.equal(
    existsSync(`assets/ships/release/parts/places/${DRILL}.glb`),
    true,
    'the cold drill release body is on disk',
  );

  const beacon = sector.pois.find((row) => row.id === 'poi_hyperion_beacon');
  assert.equal(beacon.landmarkGlb, 'place_lane_beacon');
});
