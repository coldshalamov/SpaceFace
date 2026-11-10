import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { inspectReleaseAssetPair } from '../src/contracts/assetReleaseValidation.js';
import { assertGltfMaterialContractParity } from '../tools/art/lib/gltfMaterialContract.mjs';
import {
  parseReleaseGlbPayload,
  validateKtx2MaterialRolePayloads,
} from '../tools/art/lib/ktx2MaterialRoleValidation.mjs';
import { auditEmbeddedTextureChannels } from '../tools/art/lib/textureChannelAudit.mjs';
import { validateSourceTextureRoleCoverage } from '../tools/art/lib/sourceTextureRoleValidation.mjs';
import { parseStrictEmbeddedGlb } from '../tools/art/lib/strictGlbValidation.mjs';
import { repairNormalMappedTangents } from '../tools/art/lib/tangentAccessorRepair.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IDS = [
  'hull_starter',
  'hull_fighter',
  'hull_miner',
  'hull_freighter',
  'hull_interceptor',
  'hull_corvette',
  'hull_frigate',
  'hull_capital',
  'hull_multirole',
  'hull_gunship',
];
const TRANSFORMS = {
  hull_fighter: { offset: [0, -2], scale: [3, 3] },
  hull_miner: { offset: [0, -1.2], scale: [2.2, 2.2] },
  hull_freighter: { offset: [0, -1.5], scale: [2.5, 2.5] },
  hull_interceptor: { offset: [0, -2.2], scale: [3.2, 3.2] },
  hull_corvette: { offset: [0, -1.8], scale: [2.8, 2.8] },
};

const partsManifest = JSON.parse(readFileSync(
  resolve(ROOT, 'assets/ships/parts/parts_manifest.json'),
  'utf8',
));
const releaseManifest = JSON.parse(readFileSync(
  resolve(ROOT, 'assets/ships/release/release_manifest.json'),
  'utf8',
));

test('all ten published modular hull pairs are hash-bound, compressed, and role-correct', async () => {
  for (const id of IDS) {
    const source = `assets/ships/parts/hulls/${id}.glb`;
    const release = `assets/ships/release/parts/hulls/${id}.glb`;
    const sourceBytes = readFileSync(resolve(ROOT, source));
    const releaseBytes = readFileSync(resolve(ROOT, release));
    const parsed = parseStrictEmbeddedGlb(sourceBytes, id);
    const parsedRelease = parseReleaseGlbPayload(releaseBytes, `${id} release`);
    const finalizer = parsed.gltf.asset?.extras?.sourceProvenance?.modularHullFinalizer;
    const partRow = partsManifest.parts.find((part) => part.id === id);
    const releaseRow = releaseManifest.assets.find((asset) => asset.id === id);

    assert.ok(partRow, `${id} parts-manifest row`);
    assert.equal(partRow.file, `hulls/${id}.glb`);
    assert.equal(partRow.bytes, sourceBytes.length, `${id} source byte count`);
    assert.match(partRow.note, /neutral OpenGL normal/);
    assert.match(partRow.note, /Blender AO bake on untransformed UV0 when valid/);
    assert.equal(
      parsed.gltf.asset?.generator,
      'SpaceFace tools/art/repair_modular_hull_texture_roles.mjs v2',
      `${id} truthful generator`,
    );
    assert.match(finalizer?.priorGenerator, /SpaceFace/, `${id} prior generator provenance`);

    assert.ok(releaseRow, `${id} release-manifest row`);
    assert.equal(releaseRow.source, source);
    assert.equal(releaseRow.release, release);
    assert.equal(releaseRow.sourceBytes, sourceBytes.length);
    assert.equal(releaseRow.releaseBytes, releaseBytes.length);
    assert.equal(releaseRow.sourceSha256, sha256(sourceBytes));
    assert.equal(releaseRow.releaseSha256, sha256(releaseBytes));
    assert.match(releaseRow.textureProfiles.baseColorTexture, /^ETC1S /);
    assert.match(releaseRow.textureProfiles.normalTexture, /^UASTC /);
    assert.match(releaseRow.textureProfiles.materialTextures, /^ETC1S /);

    validateSourceTextureRoleCoverage(parsed.gltf, id);
    const audit = await auditEmbeddedTextureChannels(parsed, id);
    assert.equal(audit.summary.errors, 0, `${id} texture audit errors`);
    assert.equal(audit.summary.warnings, 0, `${id} texture audit warnings`);

    const tangentCheck = repairNormalMappedTangents(parsed.gltf, parsed.binary, id);
    assert.equal(tangentCheck.changedTangentCount, 0, `${id} tangent payload`);

    const pair = inspectReleaseAssetPair(source, release, { root: ROOT });
    assert.equal(pair.ok, true, `${id}: ${JSON.stringify(pair.issues)}`);
    assert.equal(pair.release.metrics.ktx2TextureCount, pair.release.metrics.textureCount);
    assert.ok(pair.release.metrics.meshoptBufferViewCount > 0);
    assert.match(
      assertGltfMaterialContractParity(parsed.gltf, parsedRelease.gltf, id),
      /^[0-9a-f]{64}$/,
    );
    assert.equal(
      validateKtx2MaterialRolePayloads(
        parsedRelease.gltf,
        parsedRelease.binary,
        `${id} release`,
      ).textureCount,
      parsedRelease.gltf.textures.length,
    );
  }
});

test('atlas transforms stay on tiled roles while raw AO remains on UV0 identity sampling', () => {
  for (const [id, expected] of Object.entries(TRANSFORMS)) {
    const parsed = parseStrictEmbeddedGlb(
      readFileSync(resolve(ROOT, `assets/ships/parts/hulls/${id}.glb`)),
      id,
    );
    for (const material of parsed.gltf.materials) {
      const infos = [
        material.pbrMetallicRoughness.baseColorTexture,
        material.normalTexture,
        material.pbrMetallicRoughness.metallicRoughnessTexture,
      ];
      for (const info of infos) {
        const transform = info.extensions?.KHR_texture_transform;
        assertVectorClose(transform?.offset, expected.offset, `${id} ${material.name} offset`);
        assertVectorClose(transform?.scale, expected.scale, `${id} ${material.name} scale`);
      }
      assert.equal(material.occlusionTexture.texCoord ?? 0, 0);
      assert.equal(
        material.occlusionTexture.extensions?.KHR_texture_transform,
        undefined,
        `${id} ${material.name} AO must not inherit atlas tiling`,
      );
    }
  }
});

function assertVectorClose(actual, expected, label) {
  assert.equal(actual?.length, expected.length, `${label} length`);
  actual.forEach((value, index) => {
    assert.ok(
      Math.abs(value - expected[index]) <= 1e-6,
      `${label}[${index}] expected ${expected[index]}, received ${value}`,
    );
  });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
