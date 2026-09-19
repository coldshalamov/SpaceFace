import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  PACK_RELEASE_ASSETS,
  buildPackReleaseAssets,
  parsePackReleaseArgs,
  patchPackManifestRows,
  selectPackReleaseAssets,
  validateCompletePackBuild,
  validatePatchedPackManifest,
} from '../scripts/build-pack-release-assets.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function builtEntry(asset) {
  const sourcePayload = Buffer.from(`source:${asset.id}`);
  const releasePayload = Buffer.from(`release:${asset.id}`);
  return {
    ...asset, sourcePayload, releasePayload,
    sourceBytes: sourcePayload.length, releaseBytes: releasePayload.length,
    sourceSha256: hash(sourcePayload), releaseSha256: hash(releasePayload),
    textures: 1, ktx2Textures: 1, meshoptBufferViews: 1, contractNodeCount: 1,
    materialContractSignature: hash(Buffer.from('material contract')),
    ktx2PayloadValidation: { textureCount: 1 },
  };
}

test('default retains the full pack; explicit selection uses canonical order', () => {
  assert.equal(selectPackReleaseAssets(), PACK_RELEASE_ASSETS);
  assert.equal(selectPackReleaseAssets().length, 74);
  const ids = [PACK_RELEASE_ASSETS[8].id, PACK_RELEASE_ASSETS[2].id];
  assert.deepEqual(selectPackReleaseAssets(ids), [PACK_RELEASE_ASSETS[2], PACK_RELEASE_ASSETS[8]]);
  assert.deepEqual(parsePackReleaseArgs([]), {});
  assert.deepEqual(parsePackReleaseArgs([`--only=${ids.join(',')}`]), { onlyIds: [...ids].reverse() });
  assert.deepEqual(parsePackReleaseArgs(['--only', ids.join(',')]), { onlyIds: [...ids].reverse() });
});

test('invalid selections fail before manifests or build outputs are touched', async () => {
  const id = PACK_RELEASE_ASSETS[0].id;
  for (const onlyIds of [[], [''], [' '], ['missing-pack-asset'], [id, id], [id, ` ${id} `], [id, ''], null, id]) {
    assert.throws(() => selectPackReleaseAssets(onlyIds));
    await assert.rejects(buildPackReleaseAssets({ onlyIds, root: 'this-path-must-never-be-opened' }),
      /asset ID|onlyIds/);
  }
  for (const args of [['--only='], ['--only'], [`--only=${id},`], [`--only=${id}`, `--only=${id}`], ['--other']]) {
    assert.throws(() => parsePackReleaseArgs(args));
  }
});

test('partial publication changes selected rows only and preserves unrelated order/content', () => {
  const selected = [PACK_RELEASE_ASSETS[1], PACK_RELEASE_ASSETS[4]];
  const built = selected.map(builtEntry);
  const untouched = { ...PACK_RELEASE_ASSETS[2], releaseSha256: 'old-hash', nested: { preserve: true } };
  const before = { version: 1, assets: [untouched, { ...selected[1], releaseSha256: 'old-selected' }] };
  const snapshot = structuredClone(before);
  const after = patchPackManifestRows(before, built, selected);
  assert.deepEqual(before, snapshot, 'input manifest is immutable');
  assert.deepEqual(after.assets[0], untouched);
  assert.deepEqual(after.assets.map((row) => row.id), [untouched.id, selected[1].id, selected[0].id]);
  assert.equal(validatePatchedPackManifest(before, after, built, selected), true);
  const foreignEdit = structuredClone(after);
  foreignEdit.assets[0].nested.preserve = false;
  assert.throws(() => validatePatchedPackManifest(before, foreignEdit, built, selected), /untouched row/);
  const removedRow = structuredClone(after);
  removedRow.assets.shift();
  assert.throws(() => validatePatchedPackManifest(before, removedRow, built, selected), /order|membership/);
});

test('subset validation cannot silently replace the full-build default or alter canonical bindings', () => {
  const selected = [PACK_RELEASE_ASSETS[1], PACK_RELEASE_ASSETS[4]];
  const built = selected.map(builtEntry);
  assert.equal(validateCompletePackBuild(built, selected), true);
  assert.throws(() => validateCompletePackBuild(built), /74 selected assets/);
  assert.throws(() => validateCompletePackBuild(built.slice(0, 1), selected), /2 selected assets/);
  assert.throws(() => validateCompletePackBuild([...built].reverse(), selected), /order|membership/);
  assert.throws(() => validateCompletePackBuild(built, [...selected].reverse()), /canonical order/);
  assert.throws(() => validateCompletePackBuild(built, [{ ...selected[0], release: 'other.glb' }, selected[1]]), /bindings/);
});
