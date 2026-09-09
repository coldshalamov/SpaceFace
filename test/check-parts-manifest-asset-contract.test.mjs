import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  decodedAccessorBounds,
  manifestPartPathMatchesCategory,
  normalizeManifestAssetMetadata,
  resolveManifestAssetMetadata,
} from '../scripts/lib/partsManifestAssetContract.mjs';

function readGlbJson(path) {
  const bytes = readFileSync(path);
  let offset = 12;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (type === 0x4e4f534a) {
      return JSON.parse(bytes.subarray(start, end).toString('utf8').replace(/\0+$/, '').trim());
    }
    offset = end;
  }
  throw new Error(`missing JSON chunk: ${path}`);
}

test('runtime nested contract and legacy manifest fields are both visible', () => {
  const gltf = readGlbJson('assets/ships/parts/hulls/hull_starter.glb');
  const metadata = resolveManifestAssetMetadata(gltf);

  assert.equal(metadata.partId, 'hull_starter');
  assert.equal(metadata.category, 'hulls');
  assert.equal(metadata.priority, 'P0');
  assert.equal(metadata.slot, 'hull');
  assert.equal(metadata.forwardAxis, '+X');
  assert.equal(metadata.upAxis, '+Y');
  assert.equal(metadata.starboardAxis, '+Z');
  assert.equal(metadata.textureSize, 1024);
  assert.deepEqual(metadata.boundsDimensionsM, [10.9275, 1.5953, 3.1181]);

  const works = resolveManifestAssetMetadata(
    readGlbJson('assets/ships/parts/works/place_works_refinery.glb'),
  );
  assert.equal(works.category, 'works');
  assert.equal(works.slot, 'place');
  assert.equal(works.triangleCount, 7442);
  assert.equal(works.textureSize, 1024);

  const legacy = normalizeManifestAssetMetadata({
    partId: 'legacy_part',
    category: 'hulls',
    forwardAxis: '+X',
    upAxis: '+Y',
    starboardAxis: '+Z',
    unit: 'metre',
  });
  assert.equal(legacy.partId, 'legacy_part');
  assert.equal(legacy.forwardAxis, '+X');
});

test('works place rows match their published runtime path only', () => {
  assert.equal(manifestPartPathMatchesCategory({
    id: 'place_works_refinery',
    category: 'places',
    file: 'works/place_works_refinery.glb',
  }), true);
  assert.equal(manifestPartPathMatchesCategory({
    id: 'place_station_refinery',
    category: 'places',
    file: 'works/place_station_refinery.glb',
  }), false);
  assert.equal(manifestPartPathMatchesCategory({
    id: 'place_works_refinery',
    category: 'places',
    file: 'places/place_works_refinery.glb',
  }), true);
});

test('dequantizes the actual quantized trade-hub POSITION bounds', () => {
  const gltf = readGlbJson('assets/ships/parts/places/place_station_trade_hub.glb');
  const primitive = gltf.meshes.flatMap((mesh) => mesh.primitives).find((entry) => {
    const position = gltf.accessors[entry.attributes?.POSITION];
    return position?.componentType === 5122 && position.normalized;
  });
  const accessor = gltf.accessors[primitive?.attributes?.POSITION];
  assert.ok(accessor, 'trade hub should contain a quantized normalized POSITION accessor');

  const decoded = decodedAccessorBounds(gltf, accessor);
  const rawSpan = accessor.max[0] - accessor.min[0];
  const decodedSpan = decoded.max[0] - decoded.min[0];
  assert.equal(rawSpan, 65534);
  assert.ok(Math.abs(decoded.min[0] + 1) < 1e-9);
  assert.ok(Math.abs(decoded.max[0] - 1) < 1e-9);
  assert.ok(decodedSpan < 2.01, `decoded span should be physical normalized units, got ${decodedSpan}`);
});
