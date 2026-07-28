#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectReleaseAssetPair } from '../src/contracts/assetReleaseValidation.js';
import { assertGltfMaterialContractParity } from '../tools/art/lib/gltfMaterialContract.mjs';
import {
  parseReleaseGlbPayload,
  validateKtx2MaterialRolePayloads,
} from '../tools/art/lib/ktx2MaterialRoleValidation.mjs';
import { parseStrictEmbeddedGlb } from '../tools/art/lib/strictGlbValidation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PARTS_MANIFEST = 'assets/ships/parts/parts_manifest.json';
const RELEASE_MANIFEST = 'assets/ships/release/release_manifest.json';
const IDS = Object.freeze([
  'place_debris_chunk',
  'place_dead_hulk',
  'place_dock_interior',
]);

export function evaluateOpeningPlaceRemaster({ root = ROOT } = {}) {
  const partsManifest = readJson(resolve(root, PARTS_MANIFEST));
  const releaseManifest = readJson(resolve(root, RELEASE_MANIFEST));
  const failures = [];
  const assets = [];

  for (const id of IDS) {
    const partRows = (partsManifest.parts || []).filter((row) => row.id === id);
    const releaseRows = (releaseManifest.assets || []).filter((row) => row.id === id);
    if (partRows.length !== 1 || releaseRows.length !== 1) {
      failures.push(`${id}: manifest rows parts=${partRows.length} release=${releaseRows.length}`);
      continue;
    }

    const part = partRows[0];
    const manifest = releaseRows[0];
    const expectedSource = `assets/ships/parts/${part.file}`;
    const expectedRelease = `assets/ships/release/parts/${part.file}`;
    if (manifest.source !== expectedSource) failures.push(`${id}: source path drift`);
    if (manifest.release !== expectedRelease) failures.push(`${id}: release path drift`);

    const sourcePath = resolve(root, manifest.source);
    const releasePath = resolve(root, manifest.release);
    const sourceBytes = readFileSync(sourcePath);
    const releaseBytes = readFileSync(releasePath);
    const sourceSha256 = sha256(sourceBytes);
    const releaseSha256 = sha256(releaseBytes);
    const pair = inspectReleaseAssetPair(manifest.source, manifest.release, { root });

    if (!pair.ok || !pair.release.releaseReady) {
      failures.push(`${id}: source/release pair ${JSON.stringify(pair.issues)}`);
    }
    if (part.bytes !== sourceBytes.length) failures.push(`${id}: parts-manifest bytes drift`);
    if (manifest.sourceBytes !== sourceBytes.length) failures.push(`${id}: source bytes drift`);
    if (manifest.releaseBytes !== releaseBytes.length) failures.push(`${id}: release bytes drift`);
    if (manifest.sourceSha256 !== sourceSha256) failures.push(`${id}: source hash drift`);
    if (manifest.releaseSha256 !== releaseSha256) failures.push(`${id}: release hash drift`);

    const parsedSource = parseStrictEmbeddedGlb(sourceBytes, `${id} source`);
    const parsedRelease = parseReleaseGlbPayload(releaseBytes, `${id} release`);
    assertGltfMaterialContractParity(
      parsedSource.gltf,
      parsedRelease.gltf,
      `${id} release`,
    );
    const payload = validateKtx2MaterialRolePayloads(
      parsedRelease.gltf,
      parsedRelease.binary,
      `${id} release`,
    );
    const metrics = pair.release.metrics;
    if (manifest.textures !== metrics.textureCount
      || manifest.ktx2Textures !== metrics.ktx2TextureCount
      || manifest.meshoptBufferViews !== metrics.meshoptBufferViewCount
      || manifest.contractNodeCount !== metrics.contractNodeNames.length) {
      failures.push(`${id}: release metrics drift`);
    }
    if (payload.textures.length !== metrics.ktx2TextureCount) {
      failures.push(`${id}: KTX2 role payload count drift`);
    }

    assets.push({
      id,
      sourceSha256,
      releaseSha256,
      sourceBytes: sourceBytes.length,
      releaseBytes: releaseBytes.length,
      primitives: metrics.primitiveCount,
      textureSlots: metrics.materialTextureSlotCount,
      ktx2Textures: metrics.ktx2TextureCount,
      meshoptBufferViews: metrics.meshoptBufferViewCount,
      contractNodes: metrics.contractNodeNames.length,
    });
  }

  return Object.freeze({
    schema: 'spaceface.opening-place-remaster-release.v1',
    ids: [...IDS],
    assets,
    pass: failures.length === 0 && assets.length === IDS.length,
    failures,
  });
}

if (resolve(process.argv[1] || '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const receipt = evaluateOpeningPlaceRemaster();
    console.log(
      `[check-opening-place-remaster] ${receipt.pass ? 'PASS' : 'FAIL'} `
      + `${JSON.stringify(receipt)}`,
    );
    process.exitCode = receipt.pass ? 0 : 1;
  } catch (error) {
    console.error(
      `[check-opening-place-remaster] FAIL ${error instanceof Error ? error.stack : String(error)}`,
    );
    process.exitCode = 1;
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
