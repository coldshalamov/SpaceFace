// SEED-SC-09 — Haumea's fissure is a cracked ice sheet, not a shared seamed rock.
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
import { NORTH_SECTORS, NORTH_ZONES } from '../src/data/frontierRegions/north.js';
import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';
import { world } from '../src/systems/world.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const MOUTH = 'place_haumea_fracture_mouth';
const SHARED = 'place_asteroid_seamed';
const PIN = { x: 0, z: 180 };

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

function readGlb(releaseUrl) {
  const buf = readFileSync(resolve(ROOT, releaseUrl));
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `${releaseUrl} is a glTF binary`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const positions = [];
  for (const mesh of json.meshes) {
    const accessor = json.accessors[mesh.primitives[0].attributes.POSITION];
    const view = json.bufferViews[accessor.bufferView];
    const start = binStart + (view.byteOffset || 0);
    for (let i = 0; i < accessor.count; i += 1) {
      const offset = start + i * 12;
      positions.push([buf.readFloatLE(offset), buf.readFloatLE(offset + 4), buf.readFloatLE(offset + 8)]);
    }
  }
  return { json, positions, sha: createHash('sha256').update(buf).digest('hex') };
}

test('Haumea fissure is a cracked ice sheet with an open mouth, seed 4242', () => {
  const card = NORTH_SECTORS.find((row) => row.id === 'sector_haumea_rift');
  const sector = applySectorAnchors(card);
  const poi = sector.pois.find((row) => row.id === 'poi_haumea_fissure');
  assert.ok(poi, 'the fissure is on the merged sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(poi.landmarkGlb, MOUTH);
  assert.notEqual(poi.landmarkGlb, SHARED);
  assert.equal(poi.landmark, true);
  assert.ok(!EVERYDAY_SPACE_KIT_LEGAL_IDS.includes(MOUTH));

  const buoy = sector.pois.find((row) => row.id === 'poi_haumea_buoy');
  const probe = sector.pois.find((row) => row.id === 'poi_haumea_probe');
  assert.equal(buoy.landmarkGlb, 'place_lane_beacon');
  assert.equal(probe.landmarkGlb, 'place_debris_chunk');
  const zone = NORTH_ZONES.sector_haumea_rift.find((row) => row.id === 'zone_haumea_fissure');
  assert.equal(zone.center.x, PIN.x);
  assert.equal(zone.center.z, PIN.z);

  const spawned = materialize(sector);
  const body = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_haumea_fissure');
  assert.ok(body, 'world._spawnPOIs places the fissure on the live list');
  assert.equal(body.data.landmark, true);
  assert.equal(body.data.placeId, MOUTH);
  assert.equal(resolvePlaceFileForEntity(body), POSTCARD_LANDMARK_PLACE_FILE_BY_ID[MOUTH]);
  assert.equal(resolvePlaceFileForEntity({ type: 'fx', data: { placeId: MOUTH } }), null);

  const releaseUrl = POSTCARD_LANDMARK_RELEASE_URL_BY_ID[MOUTH];
  assert.ok(existsSync(resolve(ROOT, releaseUrl)));
  const pilot = renderPackagePilotForSourceUrl(releaseUrl);
  assert.ok(pilot, 'the fissure has a render-package pilot');
  assert.equal(pilot.sourceUrl, releaseUrl);

  const { json, positions, sha } = readGlb(releaseUrl);
  const sharedSha = createHash('sha256')
    .update(readFileSync(resolve(ROOT, `assets/ships/release/parts/places/${SHARED}.glb`)))
    .digest('hex');
  assert.notEqual(sha, sharedSha, 'the fissure is not the shared seamed asteroid');
  assert.deepEqual(json.materials.map((material) => material.name).sort(), ['FractureMouth', 'IceSheet']);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, y, z] of positions) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  assert.ok(maxY - minY < maxX - minX && maxY - minY < maxZ - minZ, 'the body is a sheet, not a boulder');
  assert.equal(positions.some(([x, y]) => Math.abs(x) < 0.15 && y > 0), false, 'the fracture mouth is open');
  assert.ok(positions.some(([x, y]) => Math.abs(x) < 0.15 && y < 0), 'a darker floor sits in the crack');
  assert.ok(positions.some(([x]) => x < -0.5) && positions.some(([x]) => x > 0.5), 'ice flanks both sides');
});
