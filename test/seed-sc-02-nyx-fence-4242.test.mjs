// SEED-SC-02 — Nyx's arrival station is the welded false gate, not a shared claim fence.
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
const GATE = 'place_nyx_false_gate';
const SHARED = 'place_claim_outpost_fence';
const PIN = { x: -880, z: 540 };

function materializeStations(sector) {
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
    _sectorOrigin(sectorId) {
      return world._sectorOrigin(sectorId);
    },
    _stampHomeSector(ent, sectorId) {
      return world._stampHomeSector.call(this, ent, sectorId);
    },
  };
  world._spawnStations.call(host, sector, { stations: [] }, () => 0);
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

test('Nyx false gate is a barred ring on the arrival station, seed 4242', () => {
  const region = getWestRegion('sector_nyx_march');
  const sector = applySectorAnchors(region.sector);
  const station = sector.stations.find((row) => row.id === 'station_nyx_march');
  assert.ok(station, 'the arrival station is on the merged sector');
  assert.equal(station.pos.x, PIN.x);
  assert.equal(station.pos.z, PIN.z);
  assert.equal(station.archetypeGlb, GATE);
  assert.notEqual(station.archetypeGlb, SHARED);
  assert.notEqual(station.archetypeGlb, 'place_gate_jump_ring');
  assert.notEqual(station.archetypeGlb, 'place_station_blackmarket');
  assert.ok(!EVERYDAY_SPACE_KIT_LEGAL_IDS.includes(GATE));

  const wreck = sector.pois.find((row) => row.id === 'poi_nyx_wreck');
  assert.equal(wreck.pos.x, 1120);
  assert.equal(wreck.pos.z, 760);
  assert.equal(wreck.landmarkGlb, 'place_dead_hulk');
  assert.equal(sector.pois.some((row) => row.id === 'poi_nyx_false_gate'), false);

  const spawned = materializeStations(sector);
  const body = spawned.find((ent) => ent.data && ent.data.stationId === 'station_nyx_march');
  assert.ok(body, 'world._spawnStations places the false gate');
  assert.equal(body.type, 'station');
  assert.equal(body.data.archetypeGlb, GATE);
  assert.equal(body.data.everydaySpaceKit, true);
  assert.equal(resolvePlaceFileForEntity(body), POSTCARD_LANDMARK_PLACE_FILE_BY_ID[GATE]);
  assert.equal(resolvePlaceFileForEntity({ type: 'station', data: { archetypeGlb: GATE } }), null);
  assert.equal(resolvePlaceFileForEntity({ type: 'fx', data: { placeId: GATE } }), null);

  const releaseUrl = POSTCARD_LANDMARK_RELEASE_URL_BY_ID[GATE];
  assert.ok(existsSync(resolve(ROOT, releaseUrl)));
  const pilot = renderPackagePilotForSourceUrl(releaseUrl);
  assert.ok(pilot, 'the false gate has a render-package pilot');
  assert.equal(pilot.sourceUrl, releaseUrl);

  const { json, positions, sha } = readGlb(releaseUrl);
  const sharedSha = createHash('sha256').update(readFileSync(resolve(ROOT, `assets/ships/release/parts/places/${SHARED}.glb`))).digest('hex');
  assert.notEqual(sha, sharedSha, 'the gate is not the shared claim fence');
  assert.deepEqual(json.materials.map((material) => material.name).sort(), ['GateRing', 'WeldBar']);
  const bins = new Set();
  for (const [x, , z] of positions) {
    if (Math.hypot(x, z) < 0.9) continue;
    const angle = Math.atan2(z, x);
    bins.add(Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 24) % 24);
  }
  assert.equal(bins.size, 24, 'the ring closes all the way around');
  const center = positions.filter(([x, , z]) => Math.hypot(x, z) < 0.5);
  assert.ok(center.length >= 12, 'the weld bar crosses the open center');
  assert.ok(center.every(([, , z]) => Math.abs(z) < 0.06), 'the center is a bar, not a disc');
});
