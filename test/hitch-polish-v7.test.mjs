import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = process.cwd();
const FAMILY = resolve(ROOT, 'assets/ships/kestrel_borrowed_time_v4');
const BUILD_REPORT = resolve(FAMILY, 'evidence/hitch_polish_v7/build_report.json');
const FINALIZE_REPORT = resolve(FAMILY, 'evidence/hitch_polish_v7/finalize_report.json');
const REQUIRED_SOCKETS = [
  'SOCKET_Weapon_Front',
  'SOCKET_Mining_Front',
  'SOCKET_Engine_Main',
  'SOCKET_Trail_Main',
  'SOCKET_Utility_Dorsal',
  'SOCKET_Cargo_Ventral',
  'SOCKET_Camera_Focus',
  'SOCKET_RCS_Port',
  'SOCKET_RCS_Starboard',
];
const REQUIRED_HOOKS = [
  'HOOK_NAV_PORT',
  'HOOK_NAV_STARBOARD',
  'HOOK_DRIVE_CORE',
  'HOOK_SENSOR_DISH',
  'HOOK_ARMOR_PORT',
  'HOOK_SECONDARY_POD',
];

const sha256 = (path) => createHash('sha256')
  .update(readFileSync(path))
  .digest('hex')
  .toUpperCase();

function report(path) {
  assert.ok(existsSync(path), `${path} must exist`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function nodeNames(document) {
  return document.getRoot().listNodes().map((node) => node.getName() || '');
}

test('Hitch V7 polish build is one hash-coherent isolated generation', () => {
  const build = report(BUILD_REPORT);
  assert.equal(build.status, 'complete');
  assert.equal(build.candidateOnly, true);
  assert.equal(build.livePromotion, false);
  assert.equal(build.polishPassId, 'kestrel-hitch-polish-v7');
  assert.equal(build.surfaceRemasterId, 'kestrel-hitch-polish-v7-surface');
  assert.equal(build.polish.heroMarking, 'DIE LAUGHING');
  assert.equal(build.polish.heroMarkingContract.generatedPixelsShipped, false);
  assert.equal(build.polish.heroMarkingContract.method, 'conventionally-authored-vector-stencil-v7');
  assert.ok(build.polish.hooks.length >= 6);
  assert.equal(build.generationFingerprint, build.generation.generationFingerprint);

  for (const [relativePath, expected] of Object.entries(build.generation.scriptSha256)) {
    assert.equal(sha256(resolve(FAMILY, relativePath)), expected, relativePath);
  }
  const productionBlend = resolve(FAMILY, build.productionBlend);
  assert.equal(sha256(productionBlend), build.productionBlendSha256);
  assert.equal(statSync(productionBlend).size, build.productionBlendBytes);
  for (const row of build.lods) {
    const path = resolve(FAMILY, row.path);
    assert.equal(sha256(path), row.sha256, row.path);
    assert.equal(statSync(path).size, row.bytes, row.path);
    assert.equal(row.generationFingerprint, build.generationFingerprint);
  }
  assert.ok(build.lods[0].triangles > build.lods[1].triangles);
  assert.ok(build.lods[1].triangles > build.lods[2].triangles);
});

test('Hitch V7 source LODs keep sockets, identity, canopy, hooks, and no plume', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const build = report(BUILD_REPORT);
  const document = await io.read(resolve(FAMILY, build.lods[0].path));
  const names = nodeNames(document);
  for (const socket of REQUIRED_SOCKETS) {
    assert.ok(names.includes(socket), socket);
  }
  for (const hook of REQUIRED_HOOKS) {
    assert.ok(names.some((name) => name.includes(hook)), hook);
  }
  assert.equal(names.some((name) => /plume/i.test(name)), false);
  assert.ok(names.some((name) => name.includes('CANOPY') || name.includes('Glass_Canopy')));
  const materials = new Set(document.getRoot().listMaterials().map((material) => material.getName()));
  assert.equal(materials.has('Material_Decal_BorrowedTime'), false);
  assert.equal(materials.has('Material_V6_MarkingIvory'), true);
});

test('Hitch V7 finalize is hash-coherent and isolated', () => {
  const build = report(BUILD_REPORT);
  const finalize = report(FINALIZE_REPORT);
  assert.equal(finalize.status, 'complete');
  assert.equal(finalize.candidateOnly, true);
  assert.equal(finalize.livePromotion, false);
  assert.equal(finalize.generationFingerprint, build.generationFingerprint);
  for (let lod = 0; lod < 3; lod += 1) {
    assert.equal(finalize.sources[lod].sha256, build.lods[lod].sha256);
    assert.equal(finalize.sources[lod].identityMaterial, true);
    assert.equal(finalize.releases[lod].identityMaterial, true);
    assert.equal(finalize.releases[lod].allImagesKtx2, true);
  }
});

test('Hitch V7 live promotion replaces the player whole-ship family', () => {
  const build = report(BUILD_REPORT);
  const finalize = report(FINALIZE_REPORT);
  const promote = report(resolve(FAMILY, 'evidence/hitch_polish_v7/promote_report.json'));
  assert.equal(promote.status, 'complete');
  assert.equal(promote.assetId, 'SF_K0_KESTREL_BORROWED_TIME_V4');
  assert.equal(promote.generationFingerprint, build.generationFingerprint);
  assert.equal(promote.playerOnly, true);
  assert.equal(promote.members.length, 3);
  for (let lod = 0; lod < 3; lod += 1) {
    const member = promote.members[lod];
    assert.equal(member.acceptedCandidateSha256, finalize.sources[lod].sha256);
    assert.equal(sha256(resolve(ROOT, member.liveSource)), member.liveSourceSha256);
    assert.equal(sha256(resolve(ROOT, member.liveRelease)), member.liveReleaseSha256);
  }
});
