// SEED-SC-15 — Proteus Well's postcard is a freighter cut into a violet-lit
// single-file throat, not the shared dead hulk.
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
const FUNNEL = 'place_proteus_funnel';
const SHARED = 'place_dead_hulk';
const PIN = { x: 1120, z: 860 };
const PARTS_URL = `assets/ships/parts/places/${FUNNEL}.glb`;

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

test('Proteus Funnel is a cut-throat freighter with violet guide strips, seed 4242', () => {
  const card = EAST_SECTORS.find((row) => row.id === 'sector_proteus_well');
  const sector = applySectorAnchors(card);
  const poi = sector.pois.find((row) => row.id === 'poi_proteus_hulk');
  assert.ok(poi, 'the Funnel is on the merged sector');
  assert.equal(poi.pos.x, PIN.x);
  assert.equal(poi.pos.z, PIN.z);
  assert.equal(poi.landmarkGlb, FUNNEL);
  assert.notEqual(poi.landmarkGlb, SHARED);
  assert.equal(poi.landmark, true);
  assert.ok(!EVERYDAY_SPACE_KIT_LEGAL_IDS.includes(FUNNEL));
  // The Below-Deck Cache beside the Funnel and the range buoy are untouched.
  const stash = sector.pois.find((row) => row.id === 'poi_proteus_stash');
  const buoy = sector.pois.find((row) => row.id === 'poi_proteus_buoy');
  assert.equal(stash.pos.x, 1120);
  assert.equal(stash.pos.z, 935);
  assert.equal(stash.landmarkGlb, 'place_debris_chunk');
  assert.equal(buoy.landmarkGlb, 'place_lane_beacon');

  const spawned = materialize(sector);
  const body = spawned.find((ent) => ent.data && ent.data.poiId === 'poi_proteus_hulk');
  assert.ok(body, 'world._spawnPOIs places the Funnel on the live list');
  assert.equal(body.data.landmark, true);
  assert.equal(body.data.placeId, FUNNEL);
  assert.equal(resolvePlaceFileForEntity(body), POSTCARD_LANDMARK_PLACE_FILE_BY_ID[FUNNEL]);
  assert.equal(resolvePlaceFileForEntity({ type: 'fx', data: { placeId: FUNNEL } }), null);

  const releaseUrl = POSTCARD_LANDMARK_RELEASE_URL_BY_ID[FUNNEL];
  assert.ok(existsSync(resolve(ROOT, releaseUrl)));
  const pilot = renderPackagePilotForSourceUrl(releaseUrl);
  assert.ok(pilot, 'the Funnel has a render-package pilot');
  assert.equal(pilot.sourceUrl, releaseUrl);

  const releaseSha = createHash('sha256').update(readFileSync(resolve(ROOT, releaseUrl))).digest('hex');
  const sharedSha = createHash('sha256')
    .update(readFileSync(resolve(ROOT, `assets/ships/release/parts/places/${SHARED}.glb`)))
    .digest('hex');
  assert.notEqual(releaseSha, sharedSha, 'the postcard is not the shared dead hulk');

  const { json, byNode } = readPartsGlb();
  const nodeNames = [...byNode.keys()];
  const sockets = json.nodes.filter((n) => /^SOCKET_/.test(n.name || '')).map((n) => n.name);
  for (const name of ['SOCKET_Hazard_Core', 'SOCKET_Salvage_Core', 'SOCKET_Camera_Focus']) {
    assert.ok(sockets.includes(name), `carries ${name}`);
  }
  // The cut read: faded-ivory skin, dark interior, bare cut lips — and the violet
  // guide strips as the only lit material in the wreck.
  const materials = json.materials.map((m) => m.name);
  for (const name of ['Material_Hull_faded', 'Material_Hull', 'Material_BrushedMetal',
    'Material_Emissive_Cyan_violet', 'Material_Stone']) {
    assert.ok(materials.includes(name), `carries ${name}`);
  }
  assert.ok(!materials.some((m) => /^Material_Emissive_(Warm|Amber|NavRed|NavGreen|Thruster)/.test(m)),
    'no other light lives aboard — only the guide strips burn');

  // The throat: two wall bands flank the keel axis the full cut length while the
  // corridor between them stays a clear single-file deck. glTF maps Blender
  // (x,y,z) -> (x, z, -y): wall offset is |gltf_z|, deck height is gltf_y.
  const all = [...byNode.values()].flat();
  for (const side of [-1, 1]) {
    const wall = all.filter(([px, , pz]) => px > -17 && px < 13 && side * pz > 2.4 && side * pz < 3.6);
    const covered = new Set(wall.map(([px]) => Math.round(px / 4))).size;
    assert.ok(covered >= 6, `the ${side < 0 ? 'starboard' : 'port'} wall runs the cut length`);
  }
  const throat = all.filter(([px, py, pz]) => px > -16 && px < 12 && Math.abs(pz) < 1.8 && py > 0.2 && py < 1.2);
  assert.ok(throat.length >= 30, 'the corridor floor is a clear single-file deck');

  // The violet guide strips run the corridor to the debris floor: the
  // Lights_Cyan_violet mesh spans the cut from mouth to heap.
  const guideMesh = nodeNames.find((n) => n === 'LOD0_Lights_Cyan_violet');
  assert.ok(guideMesh, 'the violet guide-strip mesh exists');
  const stripXs = byNode.get(guideMesh).map(([x]) => x);
  assert.ok(Math.min(...stripXs) < -8 && Math.max(...stripXs) > 12,
    'the guide strips run from the mouth to the debris floor');
  // The debris floor and the sealed-bow pit: heap rocks near x -12, the dark
  // mass pit fore of them, the intact bow capping the far end.
  const heap = all.filter(([px]) => px > -14 && px < -7);
  assert.ok(heap.length >= 60, 'a debris plug closes the corridor');
  const bow = all.filter(([px]) => px < -19);
  assert.ok(bow.length >= 40, 'the sealed bow hull caps the far end');
  const mouth = all.filter(([px]) => px > 13 && px < 18);
  assert.ok(mouth.length >= 10, 'the amputated stern mouth frames the cut end');
});
