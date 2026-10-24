// SEED-SC-03 — Hyperion's caved shaft is a hollow bore with a fallen mast, not a shared drill.
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
const SHAFT = 'place_hyperion_caved_shaft';
const SHARED = 'place_drill_platform_cold';
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

test('Hyperion caved shaft is a hollow bore with a fallen mast, seed 4242', () => {
  const region = getWestRegion('sector_hyperion_cut');
  const sector = applySectorAnchors(region.sector);
  const poi = sector.pois.find((row) => row.id === 'poi_hyperion_driller');
  assert.ok(poi, 'the shaft is on the merged sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(poi.landmarkGlb, SHAFT);
  assert.notEqual(poi.landmarkGlb, SHARED);
  assert.notEqual(poi.landmarkGlb, 'place_dead_hulk');
  assert.equal(poi.landmark, true);
  assert.ok(!EVERYDAY_SPACE_KIT_LEGAL_IDS.includes(SHAFT));

  const beacon = sector.pois.find((row) => row.id === 'poi_hyperion_beacon');
  assert.equal(beacon.landmarkGlb, 'place_lane_beacon');

  const spawned = materialize(sector);
  const body = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_hyperion_driller');
  assert.ok(body, 'world._spawnPOIs places the shaft on the live list');
  assert.equal(body.data.landmark, true);
  assert.equal(body.data.placeId, SHAFT);
  assert.equal(resolvePlaceFileForEntity(body), POSTCARD_LANDMARK_PLACE_FILE_BY_ID[SHAFT]);
  assert.equal(resolvePlaceFileForEntity({ type: 'fx', data: { placeId: SHAFT } }), null);

  const releaseUrl = POSTCARD_LANDMARK_RELEASE_URL_BY_ID[SHAFT];
  assert.ok(existsSync(resolve(ROOT, releaseUrl)));
  const pilot = renderPackagePilotForSourceUrl(releaseUrl);
  assert.ok(pilot, 'the shaft has a render-package pilot');
  assert.equal(pilot.sourceUrl, releaseUrl);

  const { json, positions, sha } = readGlb(releaseUrl);
  const sharedSha = createHash('sha256').update(readFileSync(resolve(ROOT, `assets/ships/release/parts/places/${SHARED}.glb`))).digest('hex');
  assert.notEqual(sha, sharedSha, 'the shaft is not the shared cold-drill mesh');
  assert.deepEqual(json.materials.map((material) => material.name).sort(), ['FallenMast', 'ShaftRim']);
  const bins = new Set();
  for (const [x, , z] of positions) {
    if (Math.hypot(x, z) < 0.9) continue;
    const angle = Math.atan2(z, x);
    bins.add(Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 24) % 24);
  }
  assert.equal(bins.size, 24, 'the bore rim closes all the way around');
  const bore = positions.filter(([x, , z]) => Math.hypot(x, z) < 0.4);
  assert.ok(bore.length >= 12, 'the fallen mast crosses into the hole');
  assert.ok(bore.every(([, , z]) => Math.abs(z) < 0.08), 'the bore is hollow aside from the mast');
});
