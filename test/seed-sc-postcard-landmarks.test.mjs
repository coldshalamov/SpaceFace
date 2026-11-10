// SEED-SC-18 / SEED-SC-20 — the Hush and the Ringworld Arc are postcards, not stock rocks.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveLandmarkBleed } from '../src/data/bandRadio.js';
import {
  EVERYDAY_SPACE_KIT_LEGAL_IDS,
  POSTCARD_LANDMARK_PLACE_FILE_BY_ID,
  POSTCARD_LANDMARK_RELEASE_URL_BY_ID,
  everydaySpaceKitDressingForSector,
} from '../src/data/everydaySpaceKitDressing.js';
import { SOUTH_SECTORS } from '../src/data/frontierRegions/south.js';
import { RINGWORLD_GRID_READING } from '../src/data/landmarkMissions.js';
import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));

function mergedSector(id) {
  return applySectorAnchors(SOUTH_SECTORS.find((sector) => sector.id === id));
}

function landmarkFile(placeId) {
  return resolvePlaceFileForEntity({
    type: 'fx',
    data: {
      poi: true,
      landmark: true,
      landmarkGlb: placeId,
      placeId,
    },
  });
}

function readPostcard(releaseUrl) {
  const buf = readFileSync(resolve(ROOT, releaseUrl));
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `${releaseUrl} is a glTF binary`);
  assert.equal(buf.readUInt32LE(4), 2);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const positions = [];
  for (const primitive of json.meshes[0].primitives) {
    const accessor = json.accessors[primitive.attributes.POSITION];
    const view = json.bufferViews[accessor.bufferView];
    const start = binStart + (view.byteOffset || 0);
    for (let i = 0; i < accessor.count; i += 1) {
      const offset = start + i * 12;
      positions.push([buf.readFloatLE(offset), buf.readFloatLE(offset + 4), buf.readFloatLE(offset + 8)]);
    }
  }
  return { json, positions };
}

function extents(positions) {
  const box = {
    minX: Infinity, minY: Infinity, minZ: Infinity,
    maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
  };
  for (const [x, y, z] of positions) {
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.minZ = Math.min(box.minZ, z);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
    box.maxZ = Math.max(box.maxZ, z);
  }
  return box;
}

function largestAngularGap(positions, minRadius) {
  const angles = [];
  for (const [x, , z] of positions) {
    if (Math.hypot(x, z) < minRadius) continue;
    let angle = Math.atan2(z, x);
    if (angle < 0) angle += Math.PI * 2;
    angles.push(angle);
  }
  assert.ok(angles.length > 24, 'outer rim has enough samples to judge the plan');
  angles.sort((a, b) => a - b);
  let gap = angles[0] + Math.PI * 2 - angles[angles.length - 1];
  for (let i = 1; i < angles.length; i += 1) gap = Math.max(gap, angles[i] - angles[i - 1]);
  return gap;
}

test('SEED-SC-18 The Hush is a dark occluding disc at the same world site', () => {
  const sector = mergedSector('sector_eunomia_gulf');
  const poi = sector.pois.find((row) => row.id === 'poi_hush');
  assert.equal(poi.pos.x, 0);
  assert.equal(poi.pos.z, -1800);
  assert.equal(poi.landmark, true);
  assert.equal(poi.landmarkGlb, 'place_hush_gap');
  assert.notEqual(poi.landmarkGlb, 'place_asteroid_rock_a');
  assert.equal(poi.visualRadius, 420);
  assert.equal(poi.bandProximityRadius, 2400);
  assert.equal(poi.placeTargetRadius, 420);
  assert.equal(poi.scanRange, 1400);
  assert.equal(poi.flavorSourceId, 'planet_hush');

  const bleed = resolveLandmarkBleed({ planet_hush: 0.8, landmark_quiessence: 0.9 });
  assert.equal(bleed.sourceId, 'planet_hush');
  assert.equal(bleed.silence, true);

  const file = landmarkFile(poi.landmarkGlb);
  assert.equal(file, 'places/place_hush_gap.glb');
  assert.equal(file, POSTCARD_LANDMARK_PLACE_FILE_BY_ID.place_hush_gap);
  assert.equal(
    resolvePlaceFileForEntity({ type: 'fx', data: { placeId: 'place_hush_gap' } }),
    null,
  );

  const releaseUrl = POSTCARD_LANDMARK_RELEASE_URL_BY_ID.place_hush_gap;
  assert.ok(existsSync(resolve(ROOT, releaseUrl)), releaseUrl);
  const { json, positions } = readPostcard(releaseUrl);
  assert.equal(json.materials.length, 1);
  assert.equal(json.materials[0].name, 'HushVoidDisc');
  assert.ok(json.materials[0].pbrMetallicRoughness.baseColorFactor[0] < 0.05);
  const box = extents(positions);
  const spanX = box.maxX - box.minX;
  const spanZ = box.maxZ - box.minZ;
  const spanY = box.maxY - box.minY;
  assert.ok(spanY / Math.max(spanX, spanZ) < 0.2, 'the Hush is a disc, not a boulder');
  assert.ok(spanX > 1.8 && spanX < 2.15 && spanZ > 1.8 && spanZ < 2.15);
  assert.ok(positions.some(([x, , z]) => Math.hypot(x, z) < 0.05), 'the disc is filled, not a ring');
  assert.ok(positions.filter(([x, , z]) => Math.hypot(x, z) > 0.9).length > 40);
  const rimBins = new Set();
  for (const [x, , z] of positions) {
    if (Math.hypot(x, z) < 0.9) continue;
    const angle = Math.atan2(z, x);
    const bin = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 24) % 24;
    rimBins.add(bin);
  }
  assert.equal(rimBins.size, 24, 'the disc closes all the way around');
});

test('SEED-SC-20 the Ringworld Arc is a megastructure curve at the same world site', () => {
  const sector = mergedSector('sector_sedna_dark');
  const poi = sector.pois.find((row) => row.id === 'poi_sedna_ringworld');
  assert.equal(poi.pos.x, 1600);
  assert.equal(poi.pos.z, 1100);
  assert.equal(poi.landmark, true);
  assert.equal(poi.landmarkGlb, 'place_sedna_ringworld_arc');
  assert.notEqual(poi.landmarkGlb, 'place_asteroid_seamed');
  assert.equal(poi.placeTargetRadius, 420);
  assert.equal(poi.visualRadius, 420);
  assert.equal(poi.flavorTargetRef, 'landmark_c11_ringworld_arc');
  assert.equal(poi.scanRange, undefined);
  assert.deepEqual({ ...RINGWORLD_GRID_READING.targetLocalPos }, { x: 0, z: 0 });
  assert.equal(RINGWORLD_GRID_READING.maxRangeWu, 300);
  assert.equal(RINGWORLD_GRID_READING.poiId, 'poi_sedna_ringworld');
  const station = sector.stations.find((row) => row.id === 'station_sedna');
  assert.ok(!station.services.includes('refuel'), 'Sedna stays fuel-free');

  const file = landmarkFile(poi.landmarkGlb);
  assert.equal(file, 'places/place_sedna_ringworld_arc.glb');
  assert.equal(file, POSTCARD_LANDMARK_PLACE_FILE_BY_ID.place_sedna_ringworld_arc);
  assert.equal(
    resolvePlaceFileForEntity({ type: 'fx', data: { placeId: 'place_sedna_ringworld_arc' } }),
    null,
  );

  const releaseUrl = POSTCARD_LANDMARK_RELEASE_URL_BY_ID.place_sedna_ringworld_arc;
  assert.ok(existsSync(resolve(ROOT, releaseUrl)), releaseUrl);
  const { json, positions } = readPostcard(releaseUrl);
  assert.deepEqual(
    json.materials.map((material) => material.name).sort(),
    ['RingworldArcShell', 'RingworldCityGrid'],
  );
  const box = extents(positions);
  const spanX = box.maxX - box.minX;
  const spanZ = box.maxZ - box.minZ;
  const spanY = box.maxY - box.minY;
  assert.ok(spanY / Math.max(spanX, spanZ) < 0.25, 'the arc lies in the world plane, not a rock pile');
  const nearOrigin = positions.filter(([x, , z]) => Math.hypot(x, z) < 0.3).length;
  assert.ok(nearOrigin / positions.length < 0.05, 'the arc leaves an interior, it is not a filled rock');
  const gap = largestAngularGap(positions, 0.85);
  assert.ok(gap > 1.2 && gap < 2.8, `arc gap ${gap} is one opening, not a circle and not a pebble`);
  assert.ok(positions.some(([x, , z]) => Math.hypot(x, z) > 0.9));
  assert.ok(positions.some(([x, , z]) => {
    const radius = Math.hypot(x, z);
    return radius > 0.5 && radius < 0.75;
  }), 'city-grid pads sit on the inner face');
});

test('postcard landmarks stay out of ordinary yard dressing', () => {
  for (const id of Object.keys(POSTCARD_LANDMARK_PLACE_FILE_BY_ID)) {
    assert.ok(!EVERYDAY_SPACE_KIT_LEGAL_IDS.includes(id), id);
  }
  let n = 0;
  const rng = () => {
    n += 1;
    return ((n * 17) % 100) / 100;
  };
  const rows = everydaySpaceKitDressingForSector('sector_vesta_forge', 'belt', rng, {
    stations: [{ pos: { x: 0, z: 0 } }],
    gates: [{ pos: { x: 40, z: -20 } }],
    fields: [{ center: { x: -80, z: 60 } }],
    wrecks: [{ id: 'wreck_sample', pos: { x: 120, z: 40 } }],
  });
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((row) => !Object.hasOwn(POSTCARD_LANDMARK_PLACE_FILE_BY_ID, row.placeId)));
});

test('SEED-SC-18 and SEED-SC-20 release landmarks resolve a render-package pilot', () => {
  for (const releaseUrl of Object.values(POSTCARD_LANDMARK_RELEASE_URL_BY_ID)) {
    const pilot = renderPackagePilotForSourceUrl(releaseUrl);
    assert.ok(pilot, `${releaseUrl} has a render-package pilot`);
    assert.equal(pilot.sourceUrl, releaseUrl);
  }
});
