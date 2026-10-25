// SEED-SC-12 — Phoebe's postcard is sixty crystal fragments around the shrine, not one seamed rock.
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
import { NORTH_SECTORS } from '../src/data/frontierRegions/north.js';
import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';
import { world } from '../src/systems/world.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const SPHERE = 'place_phoebe_shard_sphere';
const SHARED = 'place_asteroid_seamed';
const PIN = { x: 280, z: -960 };

function host() {
  const spawned = [];
  let nextId = 1;
  return {
    spawned,
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
    _sectorOrigin(sectorId) {
      return world._sectorOrigin(sectorId);
    },
    _stampHomeSector(ent, sectorId) {
      return world._stampHomeSector.call(this, ent, sectorId);
    },
  };
}

function readGlb(releaseUrl) {
  const buf = readFileSync(resolve(ROOT, releaseUrl));
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `${releaseUrl} is a glTF binary`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const shards = json.meshes.map((mesh) => {
    const accessor = json.accessors[mesh.primitives[0].attributes.POSITION];
    const view = json.bufferViews[accessor.bufferView];
    const start = binStart + (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const positions = [];
    for (let i = 0; i < accessor.count; i += 1) {
      const offset = start + i * 12;
      positions.push([buf.readFloatLE(offset), buf.readFloatLE(offset + 4), buf.readFloatLE(offset + 8)]);
    }
    return { name: mesh.name, positions };
  });
  return { json, shards, sha: createHash('sha256').update(buf).digest('hex') };
}

test('Phoebe Echo shows a fragment sphere around the shrine heart, seed 4242', () => {
  const card = NORTH_SECTORS.find((row) => row.id === 'sector_phoebe_echo');
  const sector = applySectorAnchors(card);
  const poi = sector.pois.find((row) => row.id === 'poi_phoebe_echo');
  const station = sector.stations.find((row) => row.id === 'station_phoebe_echo');
  const vault = sector.pois.find((row) => row.id === 'poi_phoebe_vault');
  assert.ok(poi, 'the shard sphere is on the merged sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(station.pos.x, PIN.x);
  assert.equal(station.pos.z, PIN.z);
  assert.equal(station.archetypeGlb, 'place_station_research');
  assert.equal(poi.landmarkGlb, SPHERE);
  assert.notEqual(poi.landmarkGlb, SHARED);
  assert.equal(poi.landmark, true);
  assert.equal(vault.pos.x, -1480);
  assert.equal(vault.pos.z, 520);
  assert.equal(vault.landmarkGlb, 'place_debris_chunk');
  assert.ok(!EVERYDAY_SPACE_KIT_LEGAL_IDS.includes(SPHERE));

  const poiHost = host();
  world._spawnPOIs.call(poiHost, sector, { pois: [] }, { pois: {} }, () => 0);
  const body = poiHost.spawned.find((ent) => ent.data && ent.data.poiId === 'poi_phoebe_echo');
  assert.ok(body, 'world._spawnPOIs places the sphere on the live list');
  assert.equal(body.data.landmark, true);
  assert.equal(body.data.placeId, SPHERE);
  assert.equal(resolvePlaceFileForEntity(body), POSTCARD_LANDMARK_PLACE_FILE_BY_ID[SPHERE]);
  assert.equal(resolvePlaceFileForEntity({ type: 'fx', data: { placeId: SPHERE } }), null);

  const stationHost = host();
  world._spawnStations.call(stationHost, sector, { stations: [] }, () => 0);
  const shrine = stationHost.spawned.find((ent) => ent.data && ent.data.stationId === 'station_phoebe_echo');
  assert.ok(shrine, 'the Echo Shrine spawns at the sphere heart');
  assert.equal(shrine.data.archetypeGlb, 'place_station_research');
  assert.equal(shrine.pos.x, body.pos.x);
  assert.equal(shrine.pos.z, body.pos.z);

  const releaseUrl = POSTCARD_LANDMARK_RELEASE_URL_BY_ID[SPHERE];
  assert.ok(existsSync(resolve(ROOT, releaseUrl)));
  const pilot = renderPackagePilotForSourceUrl(releaseUrl);
  assert.ok(pilot, 'the sphere has a render-package pilot');
  assert.equal(pilot.sourceUrl, releaseUrl);

  const { json, shards, sha } = readGlb(releaseUrl);
  const sharedSha = createHash('sha256')
    .update(readFileSync(resolve(ROOT, `assets/ships/release/parts/places/${SHARED}.glb`)))
    .digest('hex');
  assert.notEqual(sha, sharedSha, 'the sphere is not the shared seamed asteroid');
  assert.deepEqual(json.materials.map((material) => material.name), ['ShardCrystal']);
  assert.equal(shards.length, 60, 'sixty crystal fragments hold the sphere');
  assert.deepEqual(shards.map((shard) => shard.name), shards.map((_, index) => `Shard${String(index).padStart(2, '0')}`));

  const positions = shards.flatMap((shard) => shard.positions);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minR = Infinity;
  for (const [x, y, z] of positions) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    minR = Math.min(minR, Math.hypot(x, y, z));
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;
  const longest = Math.max(spanX, spanY, spanZ);
  assert.ok(minR > 0.8, 'the shrine heart is empty');
  assert.ok(spanX > longest * 0.85 && spanY > longest * 0.85 && spanZ > longest * 0.85, 'fragments hold a sphere');
  assert.ok(positions.some(([x]) => x > 0.85) && positions.some(([x]) => x < -0.85));
  assert.ok(positions.some(([, y]) => y > 0.85) && positions.some(([, y]) => y < -0.85));
  assert.ok(positions.some(([, , z]) => z > 0.85) && positions.some(([, , z]) => z < -0.85));
  for (const shard of shards) {
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    for (const vertex of shard.positions) {
      for (let axis = 0; axis < 3; axis += 1) {
        low[axis] = Math.min(low[axis], vertex[axis]);
        high[axis] = Math.max(high[axis], vertex[axis]);
      }
    }
    const shardSpan = Math.max(high[0] - low[0], high[1] - low[1], high[2] - low[2]);
    assert.ok(shardSpan < 0.3, `${shard.name} is a fragment, not the whole sphere`);
  }
  const innerWorld = body.data.placeTargetRadius * 2 * minR / longest;
  assert.ok(innerWorld > shrine.data.dockRadius, 'the fragment shell sits outside the shrine');
});
