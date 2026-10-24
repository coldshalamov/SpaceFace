// SEED-SC-01 — Io's approach wreck is a broken nave that exists only here, not the Ceres cathedral.
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
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { WORLD_SITE_MANIFESTS } from '../src/data/worldSiteManifests.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';
import { world } from '../src/systems/world.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const WRECK = 'place_io_reach_wreck';
const CERES = 'place_landmark_wreck_cathedral';
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

test('Io reach wreck is a broken nave that only Io uses, seed 4242', () => {
  const sector = SECTORS.find((row) => row.id === 'sector_io_reach');
  const poi = sector.pois.find((row) => row.id === 'poi_cruiser');
  assert.ok(poi, 'the cruiser is on the live sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(poi.landmarkGlb, WRECK);
  assert.notEqual(poi.landmarkGlb, CERES);
  assert.notEqual(poi.landmarkGlb, 'place_dead_hulk');
  assert.equal(poi.landmark, true);
  assert.ok(!EVERYDAY_SPACE_KIT_LEGAL_IDS.includes(WRECK));

  const merc = sector.pois.find((row) => row.id === 'poi_merc');
  assert.equal(merc.landmarkGlb, 'place_nav_buoy');

  const users = [];
  for (const [sectorId, anchor] of Object.entries(SECTOR_ANCHORS)) {
    for (const row of anchor.pois || []) {
      if (row.landmarkGlb === WRECK) users.push(`${sectorId}:${row.id}`);
    }
    for (const row of anchor.stations || []) {
      if (row.archetypeGlb === WRECK) users.push(`${sectorId}:${row.id}`);
    }
  }
  assert.deepEqual(users, ['sector_io_reach:poi_cruiser']);
  const ceres = WORLD_SITE_MANIFESTS.find((site) => site.id === 'world_site_wreck_cathedral');
  assert.equal(ceres.sectorId, 'sector_ceres_belt');
  assert.equal(ceres.visualRoot.placeId, CERES);
  assert.notEqual(ceres.visualRoot.placeId, WRECK);

  const spawned = materializePois(sector);
  const body = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_cruiser');
  assert.ok(body, 'world._spawnPOIs places the wreck');
  assert.equal(body.data.landmark, true);
  assert.equal(body.data.placeId, WRECK);
  assert.equal(resolvePlaceFileForEntity(body), POSTCARD_LANDMARK_PLACE_FILE_BY_ID[WRECK]);
  assert.equal(resolvePlaceFileForEntity({ type: 'fx', data: { placeId: WRECK } }), null);

  const releaseUrl = POSTCARD_LANDMARK_RELEASE_URL_BY_ID[WRECK];
  assert.ok(existsSync(resolve(ROOT, releaseUrl)));
  const pilot = renderPackagePilotForSourceUrl(releaseUrl);
  assert.ok(pilot, 'the Io wreck has a render-package pilot');
  assert.equal(pilot.sourceUrl, releaseUrl);

  const { json, positions, sha } = readGlb(releaseUrl);
  const cathedralSha = createHash('sha256').update(readFileSync(resolve(ROOT, `assets/ships/release/parts/places/${CERES}.glb`))).digest('hex');
  assert.notEqual(sha, cathedralSha, 'the Io wreck is not the Ceres cathedral mesh');
  assert.deepEqual(json.materials.map((material) => material.name).sort(), ['NaveHull', 'TranseptStub']);
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const [x, y, z] of positions) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  const spanX = maxX - minX; const spanY = maxY - minY; const spanZ = maxZ - minZ;
  assert.ok(spanZ > spanX && spanX > spanY, 'the nave is long along Z');
  assert.equal(positions.some(([, y, z]) => z > 0.45 && y > 0.2), false, 'one short end is missing');
  assert.equal(positions.some(([, , z]) => z < -1.2), true, 'the other short end is still there');
  const plus = positions.filter(([x]) => x > 0.4);
  const minus = positions.filter(([x]) => x < -0.4);
  assert.ok(plus.length > 0 && minus.length > 0, 'both transept stubs exist');
  const meanZ = (rows) => rows.reduce((sum, [, , z]) => sum + z, 0) / rows.length;
  assert.ok(meanZ(plus) < 0 && meanZ(minus) > 0, 'the stubs sit on opposite ends of the nave');
  assert.ok(Math.abs(Math.min(...minus.map(([x]) => x))) > Math.max(...plus.map(([x]) => x)), 'the stubs are unequal');
});
