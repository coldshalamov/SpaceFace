// SEED-SC-08 — Rhea Cinder's postcard is a burned pot-line slag hauler, not the shared dead hulk.
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
const HAULER = 'place_rhea_slag_hauler';
const SHARED = 'place_dead_hulk';
const PIN = { x: 1180, z: 640 };
const PARTS_URL = `assets/ships/parts/places/${HAULER}.glb`;

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

function readPartsGlb() {
  // The committed parts GLB (pre-KTX2/meshopt) carries the same authored geometry
  // the release build compressed — POSITION accessors stay plain float3 here.
  const buf = readFileSync(resolve(ROOT, PARTS_URL));
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `${PARTS_URL} is a glTF binary`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const byNode = new Map();
  for (const node of json.nodes) {
    if (node.mesh == null || !/^LOD0_/.test(node.name || '')) continue;
    const positions = [];
    for (const primitive of json.meshes[node.mesh].primitives) {
      const accessor = json.accessors[primitive.attributes.POSITION];
      const view = json.bufferViews[accessor.bufferView];
      const start = binStart + (view.byteOffset || 0) + (accessor.byteOffset || 0);
      const stride = view.byteStride || 12;
      for (let i = 0; i < accessor.count; i += 1) {
        const offset = start + i * stride;
        positions.push([
          buf.readFloatLE(offset),
          buf.readFloatLE(offset + 4),
          buf.readFloatLE(offset + 8),
        ]);
      }
    }
    byNode.set(node.name, positions);
  }
  return { json, byNode };
}

test('Rhea Slag Hauler Hulk is a burned pot-line hauler, seed 4242', () => {
  const card = NORTH_SECTORS.find((row) => row.id === 'sector_rhea_cinder');
  const sector = applySectorAnchors(card);
  const poi = sector.pois.find((row) => row.id === 'poi_rhea_slag');
  assert.ok(poi, 'the slag hulk is on the merged sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(poi.landmarkGlb, HAULER);
  assert.notEqual(poi.landmarkGlb, SHARED);
  assert.equal(poi.landmark, true);
  assert.ok(!EVERYDAY_SPACE_KIT_LEGAL_IDS.includes(HAULER));
  // The lantern memorial, claim cache and radiation hazard rows are untouched.
  const memorial = sector.pois.find((row) => row.id === 'poi_rhea_slag_memorial');
  const claim = sector.pois.find((row) => row.id === 'poi_rhea_claim');
  assert.equal(memorial.landmarkGlb, 'place_nav_buoy');
  assert.equal(claim.landmarkGlb, 'place_debris_chunk');
  assert.ok(sector.hazards.some((h) => h.type === 'radiation'), 'the radiation row stays');

  const spawned = materialize(sector);
  const body = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_rhea_slag');
  assert.ok(body, 'world._spawnPOIs places the hulk on the live list');
  assert.equal(body.data.landmark, true);
  assert.equal(body.data.placeId, HAULER);
  assert.equal(resolvePlaceFileForEntity(body), POSTCARD_LANDMARK_PLACE_FILE_BY_ID[HAULER]);
  assert.equal(resolvePlaceFileForEntity({ type: 'fx', data: { placeId: HAULER } }), null);

  const releaseUrl = POSTCARD_LANDMARK_RELEASE_URL_BY_ID[HAULER];
  assert.ok(existsSync(resolve(ROOT, releaseUrl)));
  const pilot = renderPackagePilotForSourceUrl(releaseUrl);
  assert.ok(pilot, 'the hulk has a render-package pilot');
  assert.equal(pilot.sourceUrl, releaseUrl);

  const releaseSha = createHash('sha256').update(readFileSync(resolve(ROOT, releaseUrl))).digest('hex');
  const sharedSha = createHash('sha256')
    .update(readFileSync(resolve(ROOT, `assets/ships/release/parts/places/${SHARED}.glb`)))
    .digest('hex');
  assert.notEqual(releaseSha, sharedSha, 'the postcard is not the shared dead hulk');

  const { json, byNode } = readPartsGlb();
  const nodeNames = [...byNode.keys()];
  // The derelict-place socket contract survives (hazard + salvage + camera focus).
  const sockets = json.nodes.filter((n) => /^SOCKET_/.test(n.name || '')).map((n) => n.name);
  for (const name of ['SOCKET_Hazard_Core', 'SOCKET_Salvage_Core', 'SOCKET_Camera_Focus']) {
    assert.ok(sockets.includes(name), `carries ${name}`);
  }
  // Burned work-fleet palette: deadmetal hull family, ceramic slag crust, bare
  // torn rims, the ochre company band, one ember and one dying beacon.
  const materials = json.materials.map((m) => m.name);
  for (const name of ['Material_Hull', 'Material_Hull_rust', 'Material_Ceramic',
    'Material_BrushedMetal', 'Material_Warning', 'Material_Accent',
    'Material_Emissive_NavRed', 'Material_Emissive_Amber']) {
    assert.ok(materials.includes(name), `carries ${name}`);
  }
  assert.ok(nodeNames.some((n) => /^LOD0_/.test(n)), 'LOD0 meshes exist');

  // The pot line is the postcard: crucible rims stand at spaced X stations, and
  // the missing pot's station stays empty above cradle height. glTF space maps
  // Blender (x,y,z) -> (x, z, -y), so rim height is gltf_y and beam span gltf_x.
  const all = [...byNode.values()].flat();
  const potStations = [-14, -6.5, 1, 16.5];
  let rimmedStations = 0;
  for (const x of potStations) {
    const rim = all.filter(([px, py, pz]) => Math.abs(px - x) < 2.2
      && py > 2.3 && py < 4.0 && Math.hypot(pz, py - 2.9) > 1.6);
    if (rim.length >= 8) rimmedStations += 1;
  }
  assert.ok(rimmedStations >= 3, `crucible rims stand at the pot line (got ${rimmedStations})`);
  const emptyStation = all.filter(([px, py]) => Math.abs(px - 9) < 1.8 && py > 2.4);
  assert.equal(emptyStation.length, 0, 'the blown-out pot station has no rim — only the cradle');
  // The keel runs long: an open spine, not a closed hull — geometry spans the
  // full length while the mid gap between pot stations drops to frame height.
  const xs = all.map(([x]) => x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 45, 'the hauler is a long keel');
  // One ember in the pot crack and the dying cab beacon are the only lights.
  assert.ok(nodeNames.some((n) => n === 'LOD0_HOOK_NAV_PORT'), 'the ember light mesh exists');
  assert.ok(nodeNames.some((n) => n === 'LOD0_Beacon_Amber'), 'the dying beacon mesh exists');
});
