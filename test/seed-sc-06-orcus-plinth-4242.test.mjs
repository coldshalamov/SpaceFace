// SEED-SC-06 — the Shadow Plinth is a lamped pillar facing the signal, not a shared memorial.
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
import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { getWestRegion } from '../src/data/frontierRegions/west.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';
import { world } from '../src/systems/world.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const PLINTH = 'place_orcus_signal_plinth';
const SHARED = 'place_memorial_array';
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
  const dressed = state.world && state.world.dressing && state.world.dressing.rows || [];
  return spawned.concat(dressed);
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

test('Orcus plinth is a lamped pillar facing the signal, seed 4242', () => {
  const region = getWestRegion('sector_orcus_shadow');
  const sector = applySectorAnchors(region.sector);
  const poi = sector.pois.find((row) => row.id === 'poi_orcus_plinth');
  assert.ok(poi, 'the plinth is on the merged sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(poi.landmarkGlb, PLINTH);
  assert.notEqual(poi.landmarkGlb, SHARED);
  assert.notEqual(poi.landmarkGlb, 'place_nav_buoy');
  assert.notEqual(poi.landmarkGlb, 'place_asteroid_seamed');
  assert.equal(poi.landmark, true);
  assert.ok(!EVERYDAY_SPACE_KIT_LEGAL_IDS.includes(PLINTH));

  const signal = sector.pois.find((row) => row.id === 'poi_orcus_anomaly');
  assert.equal(signal.pos.x, 0);
  assert.equal(signal.pos.z, 0);
  assert.equal(signal.landmarkGlb, 'place_asteroid_seamed');
  const vault = sector.pois.find((row) => row.id === 'poi_orcus_vault');
  assert.equal(vault.landmarkGlb, 'place_debris_chunk');
  const facing = Math.atan2(signal.pos.z - poi.pos.z, signal.pos.x - poi.pos.x);
  assert.ok(Math.abs(poi.rot - facing) < 1e-9, 'the plinth rot faces the signal');

  const spawned = materialize(sector);
  const body = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_orcus_plinth');
  assert.ok(body, 'world._spawnPOIs places the plinth');
  assert.equal(body.data.landmark, true);
  assert.equal(body.data.placeId, PLINTH);
  assert.ok(Math.abs(body.rot - facing) < 1e-9, 'the spawned plinth keeps the facing');
  assert.equal(resolvePlaceFileForEntity(body), POSTCARD_LANDMARK_PLACE_FILE_BY_ID[PLINTH]);
  assert.equal(resolvePlaceFileForEntity({ type: 'fx', data: { placeId: PLINTH } }), null);

  const releaseUrl = POSTCARD_LANDMARK_RELEASE_URL_BY_ID[PLINTH];
  assert.ok(existsSync(resolve(ROOT, releaseUrl)));
  const pilot = renderPackagePilotForSourceUrl(releaseUrl);
  assert.ok(pilot, 'the plinth has a render-package pilot');
  assert.equal(pilot.sourceUrl, releaseUrl);

  const { json, byMaterial, sha } = readGlb(releaseUrl);
  const sharedSha = createHash('sha256').update(readFileSync(resolve(ROOT, `assets/ships/release/parts/places/${SHARED}.glb`))).digest('hex');
  assert.notEqual(sha, sharedSha, 'the plinth is not the shared memorial array');
  assert.deepEqual(json.materials.map((material) => material.name).sort(), ['PlinthStone', 'SignalLamp']);
  const positions = [...byMaterial.values()].flat();
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const [x, y, z] of positions) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  const spanX = maxX - minX; const spanY = maxY - minY; const spanZ = maxZ - minZ;
  assert.ok(spanY > spanX && spanY > spanZ, 'the plinth stands taller than its base');
  const lamp = byMaterial.get('SignalLamp');
  const stone = byMaterial.get('PlinthStone').filter(([, y]) => y > 0.3);
  assert.ok(Math.min(...lamp.map(([x]) => x)) > Math.max(...stone.map(([x]) => x)), 'the lamp is the local +X face');
});
