import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  HULLS,
  HULL_TEXTURE_PROFILES,
  patchHullManifestRows,
  validateCompleteBuild,
} from '../scripts/build-hull-release-assets.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function buildEntry(id, index) {
  const releasePayload = Buffer.from(`release:${id}`);
  const sourcePayload = Buffer.from(`source:${id}`);
  return {
    id,
    kind: 'part:hulls',
    source: `assets/ships/parts/hulls/${id}.glb`,
    release: `assets/ships/release/parts/hulls/${id}.glb`,
    sourceSha256: sha256(sourcePayload),
    releaseSha256: sha256(releasePayload),
    sourceBytes: sourcePayload.length,
    releaseBytes: releasePayload.length,
    releasePayload,
    textures: 4 + (index % 2),
    ktx2Textures: 4 + (index % 2),
    meshoptBufferViews: 10 + index,
    contractNodeCount: 3,
    materialContractSignature: sha256(Buffer.from(`material:${id}`)),
    ktx2PayloadValidation: {
      textureCount: 4 + (index % 2),
      textures: [],
    },
  };
}

test('modular hull release batch is exactly the ten canonical hull ids', () => {
  assert.equal(HULLS.length, 10);
  assert.equal(new Set(HULLS).size, 10);
  assert.doesNotThrow(() => validateCompleteBuild(HULLS.map(buildEntry)));
  assert.throws(
    () => validateCompleteBuild(HULLS.slice(1).map(buildEntry)),
    /must contain all 10 assets/,
  );
});

test('manifest patch preserves row order and every untouched row', () => {
  const built = HULLS.map(buildEntry);
  const originalRows = [
    { id: 'unrelated-before', marker: { keep: true } },
    ...HULLS.slice(0, 4).map((id) => ({ id, stale: true })),
    { id: 'unrelated-middle', marker: ['keep', 2] },
    ...HULLS.slice(4).map((id) => ({ id, stale: true })),
    { id: 'unrelated-after', marker: 'keep' },
  ];
  const manifest = {
    schemaVersion: 1,
    releaseRoot: 'assets/ships/release',
    assets: originalRows,
  };

  const patched = patchHullManifestRows(manifest, built);

  assert.deepEqual(
    patched.assets.map((row) => row.id),
    originalRows.map((row) => row.id),
  );
  assert.deepEqual(patched.assets[0], originalRows[0]);
  assert.deepEqual(patched.assets[5], originalRows[5]);
  assert.deepEqual(patched.assets.at(-1), originalRows.at(-1));
  assert.equal(manifest.assets[1].stale, true, 'input manifest remains immutable');
  assert.equal(patched.assets[1].stale, undefined);
  assert.equal(patched.assets[1].releaseSha256, built[0].releaseSha256);
  assert.match(patched.assets[1].textureProfiles.baseColorTexture, /^ETC1S /);
  assert.match(patched.assets[1].textureProfiles.normalTexture, /^UASTC /);
  assert.match(patched.assets[1].textureProfiles.materialTextures, /^ETC1S /);
});

test('manifest patch fails closed on missing or duplicate hull rows', () => {
  const built = HULLS.map(buildEntry);
  const completeRows = HULLS.map((id) => ({ id }));

  assert.throws(
    () => patchHullManifestRows({ assets: completeRows.slice(1) }, built),
    /exactly one row for hull_starter; found 0/,
  );
  assert.throws(
    () => patchHullManifestRows({ assets: [...completeRows, { id: HULLS[0] }] }, built),
    /exactly one row for hull_starter; found 2/,
  );
});

test('release texture profiles keep normals UASTC and color plus ORM ETC1S', () => {
  assert.equal(HULL_TEXTURE_PROFILES.color.codec, 'ETC1S');
  assert.equal(HULL_TEXTURE_PROFILES.color.options.isUASTC, false);
  assert.ok(HULL_TEXTURE_PROFILES.color.options.qualityLevel >= 200);
  assert.equal(HULL_TEXTURE_PROFILES.normal.codec, 'UASTC');
  assert.equal(HULL_TEXTURE_PROFILES.normal.options.isUASTC, true);
  assert.equal(HULL_TEXTURE_PROFILES.normal.options.needSupercompression, true);
  assert.equal(HULL_TEXTURE_PROFILES.orm.codec, 'ETC1S');
  assert.equal(HULL_TEXTURE_PROFILES.orm.options.isUASTC, false);
  assert.equal(HULL_TEXTURE_PROFILES.orm.options.qualityLevel, 255);
});
