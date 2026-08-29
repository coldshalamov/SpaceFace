import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  isPackagedLiveWholeShipFile,
  wholeShipLodFileForEntity,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';
import { TRAFFIC_ROLES } from '../src/systems/traffic.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_ID = 'SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1';
const FILE = 'wholeships/massline_express_liner_v1.glb';
const LOD1 = 'wholeships/massline_express_liner_v1_lod1.glb';
const LOD2 = 'wholeships/massline_express_liner_v1_lod2.glb';
const FROZEN = Object.freeze({
  lod0: 'AAF714ABF24EF5F7B92AE47818C9CEF2C0512065F405AE9A4BFF0E2D43E1AFEB',
  lod1: '7FBB3B272962C17D07396CBB90A7594C111CD621431B7955F4AD796A0780158E',
  lod2: 'B201060C52819F9F0B2A9416A8FE4915E41D19D2263BFE32EF76E221D141CA50',
  blend: 'A7AB8524935C312F8550ED70DF99593CBDD3C6D74FA87EF69296B2B9A88FAC36',
});
const SOCKETS = Object.freeze([
  'SOCKET_Weapon_Front',
  'SOCKET_Engine_Main',
  'SOCKET_Trail_Main',
  'SOCKET_Trail_Port',
  'SOCKET_Trail_Starboard',
  'SOCKET_Utility_Dorsal',
  'SOCKET_Cargo_Ventral',
  'SOCKET_Camera_Focus',
  'SOCKET_RCS_Port',
  'SOCKET_RCS_Starboard',
  'SOCKET_Dock_Port',
  'SOCKET_Service_Starboard',
  'SOCKET_Tether_Keel',
]);
const UNCHANGED = Object.freeze({
  courier: { file: 'wholeships/helios_lark.glb', assetId: 'SF_WHOLESHIP_HELIOS_LARK' },
  miner: { file: 'wholeships/helios_cradle.glb', assetId: 'SF_WHOLESHIP_HELIOS_CRADLE' },
  hauler: { file: 'wholeships/helios_span.glb', assetId: 'SF_WHOLESHIP_HELIOS_SPAN' },
  shuttle: { file: 'wholeships/apron_shuttle.glb', assetId: 'SF_WHOLESHIP_APRON_SHUTTLE' },
});

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function parseGlbJson(path) {
  const buf = readFileSync(path);
  if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error(`not a GLB: ${path}`);
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''));
}

function readAssetId(path) {
  const extras = parseGlbJson(path).asset?.extras || {};
  return extras.spacefaceAsset?.assetId || extras.assetId || null;
}

function nodeNames(path) {
  return (parseGlbJson(path).nodes || []).map((node) => node.name).filter(Boolean);
}

function glazingTransmission(path) {
  const material = (parseGlbJson(path).materials || [])
    .find((entry) => entry.name === 'MAT_SF_Massline_Glazing_SmokedSafety');
  return material?.extensions?.KHR_materials_transmission?.transmissionFactor ?? null;
}

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('Cycle 36 family source bytes stay frozen', () => {
  const family = resolve(ROOT, 'assets/ships/massline_express_liner_v1');
  assert.equal(sha256(resolve(family, 'source/wholeships/massline_express_liner_v1_lod0.glb')), FROZEN.lod0);
  assert.equal(sha256(resolve(family, 'source/wholeships/massline_express_liner_v1_lod1.glb')), FROZEN.lod1);
  assert.equal(sha256(resolve(family, 'source/wholeships/massline_express_liner_v1_lod2.glb')), FROZEN.lod2);
  assert.equal(sha256(resolve(family, 'blender/massline_express_liner_v1.blend')), FROZEN.blend);
});

test('express traffic selects the authored liner and unrelated roles stay put', () => {
  const express = wholeShipVisualForEntity({
    type: 'ship',
    data: { trafficRole: 'express', defId: 'ship_mule' },
  });
  assert.equal(express.file, FILE);
  assert.equal(express.assetId, ASSET_ID);
  assert.equal(express.roleId, 'express');
  assert.deepEqual(express.lodFamily, { lod0: FILE, lod1: LOD1, lod2: LOD2 });

  assert.equal(TRAFFIC_ROLES.express.ship, 'ship_mule', 'express simulation still uses ship_mule');
  assert.equal(TRAFFIC_ROLES.express.label, 'Express Liner');
  assert.equal(TRAFFIC_ROLES.courier.ship, 'ship_kestrel');

  for (const [role, expected] of Object.entries(UNCHANGED)) {
    const visual = wholeShipVisualForEntity({ data: { trafficRole: role, defId: 'ship_kestrel' } });
    assert.equal(visual.file, expected.file, `${role} file drifted`);
    assert.equal(visual.assetId, expected.assetId, `${role} assetId drifted`);
  }

  const mule = wholeShipVisualForEntity(
    { type: 'ship', data: { defId: 'ship_mule' } },
    { requiredWholeShip: true },
  );
  assert.equal(mule.file, 'wholeships/mule_production_v1.glb', 'mule without express must not become the liner');
  assert.notEqual(mule.assetId, ASSET_ID);
});

test('express LOD family stays on packaged live files', () => {
  const entity = { type: 'ship', data: { trafficRole: 'express', defId: 'ship_mule' } };
  assert.equal(wholeShipLodFileForEntity(entity, 'lod0'), FILE);
  assert.equal(wholeShipLodFileForEntity(entity, 'lod1'), LOD1);
  assert.equal(wholeShipLodFileForEntity(entity, 'lod2'), LOD2);
  assert.equal(isPackagedLiveWholeShipFile(FILE), true);
  assert.equal(isPackagedLiveWholeShipFile(LOD1), true);
  assert.equal(isPackagedLiveWholeShipFile(LOD2), true);
});

test('parts, release, and render-package rows bind the exact liner identity', () => {
  const partsManifest = json(resolve(ROOT, 'assets/ships/parts/parts_manifest.json'));
  const releaseManifest = json(resolve(ROOT, 'assets/ships/release/release_manifest.json'));
  const pilots = json(resolve(ROOT, 'assets/ships/render-packages/pilots.json'));
  const family = [
    { partId: 'wholeship_massline_express_liner_v1', file: FILE, lod: 'lod0' },
    { partId: 'wholeship_massline_express_liner_v1_lod1', file: LOD1, lod: 'lod1' },
    { partId: 'wholeship_massline_express_liner_v1_lod2', file: LOD2, lod: 'lod2' },
  ];

  for (const row of family) {
    const sourceAbs = resolve(ROOT, 'assets/ships/parts', row.file);
    const releaseAbs = resolve(ROOT, 'assets/ships/release/parts', row.file);
    assert.ok(existsSync(sourceAbs), `missing parts GLB ${row.file}`);
    assert.ok(existsSync(releaseAbs), `missing release GLB ${row.file}`);

    const names = nodeNames(sourceAbs);
    for (const socket of SOCKETS) {
      assert.ok(names.includes(socket), `${row.file} missing ${socket}`);
    }
    assert.ok(names.includes('COLLISION_HULL'), `${row.file} missing COLLISION_HULL`);
    assert.ok(Math.abs(glazingTransmission(sourceAbs) - 0.3) < 1e-4, `${row.file} glazing is not 0.30`);
    assert.equal(readAssetId(sourceAbs), ASSET_ID);
    assert.equal(readAssetId(releaseAbs), ASSET_ID);

    const partRow = (partsManifest.parts || []).find((part) => part.id === row.partId);
    assert.ok(partRow, `parts_manifest missing ${row.partId}`);
    assert.equal(partRow.file, row.file);
    for (const socket of SOCKETS) {
      assert.ok(partRow.sockets.includes(socket), `${row.partId} manifest missing ${socket}`);
    }

    const releaseRow = (releaseManifest.assets || []).find((asset) => asset.id === row.partId);
    assert.ok(releaseRow, `release_manifest missing ${row.partId}`);
    assert.equal(sha256(sourceAbs).toLowerCase(), String(releaseRow.sourceSha256).toLowerCase());
    assert.equal(sha256(releaseAbs).toLowerCase(), String(releaseRow.releaseSha256).toLowerCase());
    assert.equal(statBytes(sourceAbs), releaseRow.sourceBytes);
    assert.equal(statBytes(releaseAbs), releaseRow.releaseBytes);
    assert.ok(releaseRow.ktx2Textures > 0, `${row.partId} release must carry KTX2`);
    assert.ok(releaseRow.meshoptBufferViews > 0, `${row.partId} release must carry meshopt`);

    const releaseUrl = `assets/ships/release/parts/${row.file}`;
    const pilot = (pilots.pilots || []).find((entry) => entry.sourceUrl === releaseUrl);
    assert.ok(pilot, `missing render-package pilot for ${releaseUrl}`);
    assert.equal(pilot.runtimeAssetId, ASSET_ID);
    assert.ok(existsSync(resolve(ROOT, pilot.metadataUrl)), `missing package ${pilot.metadataUrl}`);
    assert.ok(existsSync(resolve(ROOT, pilot.outputDir, 'render.glb')));
  }
});

function statBytes(path) {
  return readFileSync(path).length;
}
