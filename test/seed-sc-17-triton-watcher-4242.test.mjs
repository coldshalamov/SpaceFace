// SEED-SC-17 — the Tide-Locked Watcher is an aperture monolith facing the wake, not a shared blister.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EVERYDAY_SPACE_KIT_LEGAL_IDS,
  POSTCARD_LANDMARK_PLACE_FILE_BY_ID,
  POSTCARD_LANDMARK_RELEASE_URL_BY_ID,
} from '../src/data/everydaySpaceKitDressing.js';
import { EAST_SECTORS } from '../src/data/frontierRegions/east.js';
import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';
import { world } from '../src/systems/world.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const WATCHER = 'place_triton_aperture_monolith';
const SHARED = 'place_observation_blister';
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
          rot: spec.rot || 0,
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

function readGlb(releaseUrl) {
  const buf = readFileSync(resolve(ROOT, releaseUrl));
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `${releaseUrl} is a glTF binary`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const byMaterial = new Map();
  for (const mesh of json.meshes) {
    const materialName = json.materials[mesh.primitives[0].material].name;
    const accessor = json.accessors[mesh.primitives[0].attributes.POSITION];
    const view = json.bufferViews[accessor.bufferView];
    const start = binStart + (view.byteOffset || 0);
    const positions = byMaterial.get(materialName) || [];
    for (let i = 0; i < accessor.count; i += 1) {
      const offset = start + i * 12;
      positions.push([buf.readFloatLE(offset), buf.readFloatLE(offset + 4), buf.readFloatLE(offset + 8)]);
    }
    byMaterial.set(materialName, positions);
  }
  return { json, byMaterial, sha: createHash('sha256').update(buf).digest('hex') };
}

test('Triton watcher is an aperture monolith facing the wake, seed 4242', () => {
  const card = EAST_SECTORS.find((row) => row.id === 'sector_triton_wake');
  const sector = applySectorAnchors(card);
  const poi = sector.pois.find((row) => row.id === 'poi_triton_watcher');
  assert.ok(poi, 'the watcher is on the merged sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(poi.landmarkGlb, WATCHER);
  assert.notEqual(poi.landmarkGlb, SHARED);
  assert.notEqual(poi.landmarkGlb, 'place_asteroid_seamed');
  assert.notEqual(poi.landmarkGlb, 'place_sensor_mast');
  assert.equal(poi.landmark, true);
  assert.ok(!EVERYDAY_SPACE_KIT_LEGAL_IDS.includes(WATCHER));

  const anomaly = sector.pois.find((row) => row.id === 'poi_triton_anomaly');
  assert.equal(anomaly.pos.x, 40);
  assert.equal(anomaly.pos.z, 120);
  assert.equal(anomaly.landmarkGlb, 'place_asteroid_seamed');
  const lab = sector.pois.find((row) => row.id === 'poi_triton_field_lab');
  assert.equal(lab.landmarkGlb, 'place_sensor_mast');
  const facing = Math.atan2(anomaly.pos.z - poi.pos.z, anomaly.pos.x - poi.pos.x);
  assert.ok(Math.abs(poi.rot - facing) < 1e-9, 'the monolith rot faces the anomaly');

  const spawned = materialize(sector);
  const body = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_triton_watcher');
  assert.ok(body, 'world._spawnPOIs places the watcher');
  assert.equal(body.data.placeId, WATCHER);
  assert.ok(Math.abs(body.rot - facing) < 1e-9, 'the spawned monolith keeps the facing');
  assert.equal(resolvePlaceFileForEntity(body), POSTCARD_LANDMARK_PLACE_FILE_BY_ID[WATCHER]);
  assert.equal(resolvePlaceFileForEntity({ type: 'fx', data: { placeId: WATCHER } }), null);
  const labBody = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_triton_field_lab');
  if (labBody) assert.notEqual(resolvePlaceFileForEntity(labBody), POSTCARD_LANDMARK_PLACE_FILE_BY_ID[WATCHER]);

  const releaseUrl = POSTCARD_LANDMARK_RELEASE_URL_BY_ID[WATCHER];
  assert.ok(existsSync(resolve(ROOT, releaseUrl)));
  const pilot = renderPackagePilotForSourceUrl(releaseUrl);
  assert.ok(pilot, 'the monolith has a render-package pilot');
  assert.equal(pilot.sourceUrl, releaseUrl);

  const { json, byMaterial, sha } = readGlb(releaseUrl);
  const sharedSha = createHash('sha256').update(readFileSync(resolve(ROOT, `assets/ships/release/parts/places/${SHARED}.glb`))).digest('hex');
  assert.notEqual(sha, sharedSha, 'the monolith is not the shared observation blister');
  assert.deepEqual(json.materials.map((material) => material.name).sort(), ['ApertureLamp', 'MonolithStone']);
  const positions = [...byMaterial.values()].flat();
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const [x, y, z] of positions) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  const spanX = maxX - minX; const spanY = maxY - minY; const spanZ = maxZ - minZ;
  assert.ok(spanY > spanX && spanY > spanZ, 'the monolith is a tall slab');
  const hole = positions.filter(([, y, z]) => Math.abs(z) < 0.28 && y > 0.28 && y < 1.55);
  assert.equal(hole.length, 0, 'the aperture is an open window');
  const lamp = byMaterial.get('ApertureLamp');
  const stone = byMaterial.get('MonolithStone');
  assert.ok(Math.min(...lamp.map(([x]) => x)) > Math.max(...stone.map(([x]) => x)), 'the lamp sits on local +X');
});
