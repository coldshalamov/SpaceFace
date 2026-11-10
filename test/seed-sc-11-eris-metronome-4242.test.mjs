// SEED-SC-11 — the Metronome emitter is a comms array, not a seamed rock.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { NORTH_SECTORS } from '../src/data/frontierRegions/north.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { world } from '../src/systems/world.js';

const EMITTER = 'place_comms_array';
const PIN = { x: -60, z: 1700 };

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

test('Eris metronome draws a comms array at the beam anchor, seed 4242', () => {
  const card = NORTH_SECTORS.find((row) => row.id === 'sector_eris_margin');
  const sector = applySectorAnchors(card);
  const poi = sector.pois.find((row) => row.id === 'poi_eris_metronome');
  assert.ok(poi, 'the metronome is on the merged sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(poi.landmarkGlb, EMITTER);
  assert.notEqual(poi.landmarkGlb, 'place_asteroid_seamed');
  assert.notEqual(poi.landmarkGlb, 'place_sensor_mast');

  const spawned = materialize(sector);
  const body = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_eris_metronome');
  assert.ok(body, 'world._spawnPOIs places the emitter');
  assert.equal(body.data.landmark, true);
  assert.equal(body.data.landmarkGlb, EMITTER);
  assert.equal(body.data.placeId, EMITTER);
  assert.equal(body.pos.x !== PIN.x || body.pos.z !== PIN.z, true);
  assert.equal(resolvePlaceFileForEntity(body), `places/${EMITTER}.glb`);
  assert.equal(existsSync(`assets/ships/release/parts/places/${EMITTER}.glb`), true);
});
