import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  PLACE_TEXTURE_PROFILES,
  assertPlaceSourceHashesUnchanged,
  buildPlacePublicationBindings,
  buildPlacePublicationGuardDescriptors,
  ensureAssetContractMetadata,
  parseSelectedPlaceIds,
  patchPlaceManifestRows,
  resolveSelectedPlaceAssets,
  stampReleaseContractMetadata,
  validatePatchedPlaceManifest,
  validateSelectedPlaceBuild,
} from '../scripts/build-place-release-assets.mjs';
import { publishFileSetTransaction } from '../tools/art/lib/multiFileTransaction.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function builtEntry(id, index = 0) {
  const sourcePayload = Buffer.from(`source:${id}`);
  const releasePayload = Buffer.from(`release:${id}`);
  return {
    id,
    kind: 'part:places',
    source: `assets/ships/parts/places/${id}.glb`,
    release: `assets/ships/release/parts/places/${id}.glb`,
    sourceAbs: `C:/repo/assets/ships/parts/places/${id}.glb`,
    releaseAbs: `C:/repo/assets/ships/release/parts/places/${id}.glb`,
    sourceSha256: sha256(sourcePayload),
    releaseSha256: sha256(releasePayload),
    sourceBytes: sourcePayload.length,
    sourcePayload,
    releaseBytes: releasePayload.length,
    releasePayload,
    textures: 3 + index,
    ktx2Textures: 3 + index,
    meshoptBufferViews: 8 + index,
    contractNodeCount: 2,
    materialContractSignature: sha256(Buffer.from(`materials:${id}`)),
    ktx2PayloadValidation: {
      textureCount: 3 + index,
      textures: [],
    },
  };
}

const PART_MANIFEST = {
  parts: [
    {
      id: 'place_debris_chunk',
      category: 'places',
      file: 'places/place_debris_chunk.glb',
    },
    {
      id: 'place_dead_hulk',
      category: 'places',
      file: 'places/place_dead_hulk.glb',
    },
    {
      id: 'place_blocked',
      category: 'places',
      file: 'places/place_blocked.glb',
      status: 'blocked',
    },
    {
      id: 'hull_starter',
      category: 'hulls',
      file: 'hulls/hull_starter.glb',
    },
  ],
};

test('CLI parser requires an explicit, unique list of place ids', () => {
  assert.deepEqual(
    parseSelectedPlaceIds([
      '--ids=place_debris_chunk',
      '--ids',
      'place_dead_hulk',
    ]),
    ['place_debris_chunk', 'place_dead_hulk'],
  );
  assert.throws(() => parseSelectedPlaceIds([]), /requires --ids/);
  assert.throws(
    () => parseSelectedPlaceIds(['--ids', 'place_debris_chunk,place_debris_chunk']),
    /duplicate place id/,
  );
  assert.throws(
    () => parseSelectedPlaceIds(['--ids', '../place_debris_chunk']),
    /invalid place id/,
  );
  assert.throws(() => parseSelectedPlaceIds(['--all']), /unknown argument/);
});

test('selected assets resolve only canonical, unblocked place rows', () => {
  assert.deepEqual(
    resolveSelectedPlaceAssets(
      PART_MANIFEST,
      ['place_debris_chunk', 'place_dead_hulk'],
    ),
    [
      {
        id: 'place_debris_chunk',
        kind: 'part:places',
        source: 'assets/ships/parts/places/place_debris_chunk.glb',
        release: 'assets/ships/release/parts/places/place_debris_chunk.glb',
      },
      {
        id: 'place_dead_hulk',
        kind: 'part:places',
        source: 'assets/ships/parts/places/place_dead_hulk.glb',
        release: 'assets/ships/release/parts/places/place_dead_hulk.glb',
      },
    ],
  );
  assert.throws(
    () => resolveSelectedPlaceAssets(PART_MANIFEST, ['place_missing']),
    /unknown place asset id/,
  );
  assert.throws(
    () => resolveSelectedPlaceAssets(PART_MANIFEST, ['hull_starter']),
    /not a place asset/,
  );
  assert.throws(
    () => resolveSelectedPlaceAssets(PART_MANIFEST, ['place_blocked']),
    /blocked place asset/,
  );
  assert.throws(
    () => resolveSelectedPlaceAssets({
      parts: [{ id: 'place_escape', category: 'places', file: '../escape.glb' }],
    }, ['place_escape']),
    /invalid place source path/,
  );
});

test('selected build and manifest patch preserve membership, order, and untouched rows', () => {
  const selected = resolveSelectedPlaceAssets(
    PART_MANIFEST,
    ['place_debris_chunk', 'place_dead_hulk'],
  );
  const built = selected.map((asset, index) => ({
    ...builtEntry(asset.id, index),
    ...asset,
  }));
  assert.doesNotThrow(() => validateSelectedPlaceBuild(selected, built));

  const originalRows = [
    { id: 'unrelated-before', marker: { keep: true } },
    { id: 'place_debris_chunk', stale: true },
    { id: 'unrelated-middle', marker: ['keep', 2] },
    { id: 'place_dead_hulk', stale: true },
    { id: 'unrelated-after', marker: 'keep' },
  ];
  const manifest = {
    schemaVersion: 1,
    releaseRoot: 'assets/ships/release',
    assets: originalRows,
  };

  const patched = patchPlaceManifestRows(manifest, built);
  assert.deepEqual(
    patched.assets.map((row) => row.id),
    originalRows.map((row) => row.id),
  );
  assert.deepEqual(patched.assets[0], originalRows[0]);
  assert.deepEqual(patched.assets[2], originalRows[2]);
  assert.deepEqual(patched.assets[4], originalRows[4]);
  assert.equal(manifest.assets[1].stale, true, 'input manifest remains immutable');
  assert.equal(patched.assets[1].stale, undefined);
  assert.equal(patched.assets[1].releaseSha256, built[0].releaseSha256);
  assert.match(patched.assets[1].textureProfiles.baseColorTexture, /^ETC1S /);
  assert.match(patched.assets[1].textureProfiles.normalTexture, /^UASTC /);
  assert.doesNotThrow(() => validatePatchedPlaceManifest(manifest, patched, built));

  assert.throws(
    () => patchPlaceManifestRows(
      { ...manifest, assets: originalRows.filter((row) => row.id !== 'place_dead_hulk') },
      built,
    ),
    /exactly one row for place_dead_hulk; found 0/,
  );
  assert.throws(
    () => patchPlaceManifestRows(
      { ...manifest, assets: [...originalRows, { id: 'place_debris_chunk' }] },
      built,
    ),
    /exactly one row for place_debris_chunk; found 2/,
  );
});

test('publication bindings pin current release and manifest hashes exactly', () => {
  const built = [
    builtEntry('place_debris_chunk'),
    builtEntry('place_dead_hulk', 1),
  ];
  const manifestSha256 = sha256(Buffer.from('current manifest'));
  const partManifestSha256 = sha256(Buffer.from('current parts manifest'));
  const debrisReleaseSha256 = sha256(Buffer.from('current debris release'));

  assert.deepEqual(
    buildPlacePublicationBindings(built, {
      manifestPath: 'C:/repo/assets/ships/release/release_manifest.json',
      manifestSha256,
      partManifestPath: 'C:/repo/assets/ships/parts/parts_manifest.json',
      partManifestSha256,
      currentReleaseSha256ById: {
        place_debris_chunk: debrisReleaseSha256,
        place_dead_hulk: null,
      },
    }),
    {
      releases: [
        {
          id: 'place_debris_chunk',
          path: built[0].releaseAbs,
          expectedCurrentSha256: debrisReleaseSha256,
        },
        {
          id: 'place_dead_hulk',
          path: built[1].releaseAbs,
          expectedCurrentSha256: null,
        },
      ],
      manifest: {
        path: 'C:/repo/assets/ships/release/release_manifest.json',
        expectedCurrentSha256: manifestSha256,
      },
      sources: [
        {
          id: 'place_debris_chunk',
          path: built[0].sourceAbs,
          expectedCurrentSha256: built[0].sourceSha256,
        },
        {
          id: 'place_dead_hulk',
          path: built[1].sourceAbs,
          expectedCurrentSha256: built[1].sourceSha256,
        },
      ],
      partManifest: {
        path: 'C:/repo/assets/ships/parts/parts_manifest.json',
        expectedCurrentSha256: partManifestSha256,
      },
    },
  );
  assert.throws(
    () => buildPlacePublicationBindings(built, {
      manifestPath: 'C:/repo/manifest.json',
      manifestSha256,
      partManifestPath: 'C:/repo/parts.json',
      partManifestSha256,
      currentReleaseSha256ById: { place_debris_chunk: debrisReleaseSha256 },
    }),
    /missing current release hash binding for place_dead_hulk/,
  );
});

test('release metadata replaces source-pending state on asset, scene, and canonical root', () => {
  const sourceContract = {
    assetId: 'place_debris_chunk',
    deliverableRole: 'production_source_checkpoint',
    wiringStatus: 'source_checkpoint_release_pending',
    textureCompression: 'PNG-source',
    lods: ['lod0', 'lod1', 'lod2'],
  };
  const carrier = () => ({
    extras: { spacefaceAsset: structuredClone(sourceContract) },
    getExtras() { return this.extras; },
    setExtras(value) { this.extras = value; },
  });
  const scene = carrier();
  const canonicalRoot = carrier();
  const unrelatedNode = {
    extras: { role: 'socket' },
    getExtras() { return this.extras; },
    setExtras(value) { this.extras = value; },
  };
  const asset = { extras: { spacefaceAsset: structuredClone(sourceContract) } };
  const document = {
    getRoot: () => ({
      getAsset: () => asset,
      listScenes: () => [scene],
      listNodes: () => [canonicalRoot, unrelatedNode],
    }),
  };

  assert.deepEqual(stampReleaseContractMetadata(document, 21), {
    assetContracts: 1,
    sceneContracts: 1,
    nodeContracts: 1,
  });
  for (const extras of [
    asset.extras,
    scene.getExtras(),
    canonicalRoot.getExtras(),
  ]) {
    assert.equal(extras.spacefaceAsset.deliverableRole, 'production_multi_lod');
    assert.equal(extras.spacefaceAsset.wiringStatus, 'promoted_live_place');
    assert.equal(extras.spacefaceAsset.textureCompression, 'KTX2/BasisU+mips');
    assert.equal(extras.spacefaceAsset.textureProfiles, 'ETC1S-color+ORM/UASTC-normal');
  }
  assert.deepEqual(unrelatedNode.getExtras(), { role: 'socket' });
  assert.throws(
    () => stampReleaseContractMetadata({
      getRoot: () => ({
        getAsset: () => ({ extras: {} }),
        listScenes: () => [],
        listNodes: () => [],
      }),
    }, 0),
    /asset-level spacefaceAsset contract/,
  );
});

test('release build hydrates a missing asset contract only from one matching scene/root pair', () => {
  const contract = {
    assetId: 'place_works_inclusion_kit',
    partId: 'place_works_inclusion_kit',
    deliverableRole: 'source_kit_unwired',
  };
  const carrier = (value) => ({
    extras: value ? { spacefaceAsset: structuredClone(value) } : {},
    getExtras() { return this.extras; },
  });
  const asset = { extras: { generatorNote: 'preserved' } };
  const scene = carrier(contract);
  const canonicalRoot = carrier({
    deliverableRole: contract.deliverableRole,
    partId: contract.partId,
    assetId: contract.assetId,
  });
  const document = {
    getRoot: () => ({
      getAsset: () => asset,
      listScenes: () => [scene],
      listNodes: () => [canonicalRoot, carrier(null)],
    }),
  };

  assert.deepEqual(ensureAssetContractMetadata(document), { source: 'scene+canonical-root' });
  assert.deepEqual(asset.extras, {
    generatorNote: 'preserved',
    spacefaceAsset: contract,
  });
  assert.deepEqual(ensureAssetContractMetadata(document), { source: 'asset' });

  assert.throws(
    () => ensureAssetContractMetadata({
      getRoot: () => ({
        getAsset: () => ({ extras: {} }),
        listScenes: () => [carrier(contract)],
        listNodes: () => [carrier({ ...contract, assetId: 'different' })],
      }),
    }),
    /scene and canonical-root spacefaceAsset contracts disagree/,
  );
  assert.throws(
    () => ensureAssetContractMetadata({
      getRoot: () => ({
        getAsset: () => ({ extras: {} }),
        listScenes: () => [carrier(contract)],
        listNodes: () => [],
      }),
    }),
    /one matching scene and canonical-root spacefaceAsset contract/,
  );
});

test('release metadata preserves a source-declared single-LOD preview topology', () => {
  const sourceContract = {
    assetId: 'place_dock_interior',
    deliverableRole: 'production_single_lod_preview',
    wiringStatus: 'candidate_not_promoted',
    textureCompression: 'PNG-source',
    exportedLods: ['lod0'],
  };
  const carrier = () => ({
    extras: { spacefaceAsset: structuredClone(sourceContract) },
    getExtras() { return this.extras; },
    setExtras(value) { this.extras = value; },
  });
  const scene = carrier();
  const canonicalRoot = carrier();
  const asset = { extras: { spacefaceAsset: structuredClone(sourceContract) } };
  const document = {
    getRoot: () => ({
      getAsset: () => asset,
      listScenes: () => [scene],
      listNodes: () => [canonicalRoot],
    }),
  };

  stampReleaseContractMetadata(document, 30);
  for (const extras of [
    asset.extras,
    scene.getExtras(),
    canonicalRoot.getExtras(),
  ]) {
    assert.deepEqual(extras.spacefaceAsset.exportedLods, ['lod0']);
    assert.equal(extras.spacefaceAsset.deliverableRole, 'production_single_lod_preview');
    assert.equal(extras.spacefaceAsset.wiringStatus, 'promoted_live_place');
    assert.equal(extras.spacefaceAsset.textureCompression, 'KTX2/BasisU+mips');
  }
});

test('source and parts-manifest guards roll back outputs on post-validation drift', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-place-release-guard-test-'));
  try {
    const releasePath = join(root, 'release.glb');
    const releaseManifestPath = join(root, 'release_manifest.json');
    const sourcePath = join(root, 'source.glb');
    const partManifestPath = join(root, 'parts_manifest.json');
    const oldRelease = Buffer.from('old release');
    const oldReleaseManifest = Buffer.from('old release manifest');
    const oldSource = Buffer.from('old source');
    const changedSource = Buffer.from('external source edit');
    const oldPartManifest = Buffer.from('{"parts":[]}');
    await Promise.all([
      writeFile(releasePath, oldRelease),
      writeFile(releaseManifestPath, oldReleaseManifest),
      writeFile(sourcePath, oldSource),
      writeFile(partManifestPath, oldPartManifest),
    ]);

    const guards = buildPlacePublicationGuardDescriptors([{
      id: 'place_debris_chunk',
      sourceAbs: sourcePath,
      sourceSha256: sha256(oldSource),
      sourcePayload: oldSource,
    }], {
      partManifestPath,
      partManifestSha256: sha256(oldPartManifest),
      partManifestPayload: oldPartManifest,
    });
    let injectedDrift = false;
    const rename = async (from, to) => {
      if (!injectedDrift && from === releasePath) {
        injectedDrift = true;
        await writeFile(sourcePath, changedSource);
      }
      const { rename: renameFile } = await import('node:fs/promises');
      await renameFile(from, to);
    };

    await assert.rejects(
      () => publishFileSetTransaction({
        files: [
          {
            path: releasePath,
            bytes: Buffer.from('new release'),
            expectedCurrentSha256: sha256(oldRelease),
            validate: async () => {},
          },
          {
            path: releaseManifestPath,
            bytes: Buffer.from('new release manifest'),
            expectedCurrentSha256: sha256(oldReleaseManifest),
            validate: async () => {},
          },
          ...guards,
        ],
        fileOps: { rename },
      }),
      /current SHA-256 changed/,
    );
    assert.deepEqual(await readFile(releasePath), oldRelease);
    assert.deepEqual(await readFile(releaseManifestPath), oldReleaseManifest);
    assert.deepEqual(await readFile(sourcePath), changedSource);
    assert.deepEqual(await readFile(partManifestPath), oldPartManifest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('parts-manifest guard also rolls back outputs on post-validation drift', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-place-manifest-guard-test-'));
  try {
    const releasePath = join(root, 'release.glb');
    const releaseManifestPath = join(root, 'release_manifest.json');
    const sourcePath = join(root, 'source.glb');
    const partManifestPath = join(root, 'parts_manifest.json');
    const oldRelease = Buffer.from('old release');
    const oldReleaseManifest = Buffer.from('old release manifest');
    const oldSource = Buffer.from('old source');
    const oldPartManifest = Buffer.from('{"parts":[]}');
    const changedPartManifest = Buffer.from('{"parts":[{"id":"external"}]}');
    await Promise.all([
      writeFile(releasePath, oldRelease),
      writeFile(releaseManifestPath, oldReleaseManifest),
      writeFile(sourcePath, oldSource),
      writeFile(partManifestPath, oldPartManifest),
    ]);

    const guards = buildPlacePublicationGuardDescriptors([{
      id: 'place_debris_chunk',
      sourceAbs: sourcePath,
      sourceSha256: sha256(oldSource),
      sourcePayload: oldSource,
    }], {
      partManifestPath,
      partManifestSha256: sha256(oldPartManifest),
      partManifestPayload: oldPartManifest,
    });
    let injectedDrift = false;
    const rename = async (from, to) => {
      if (!injectedDrift && from === releasePath) {
        injectedDrift = true;
        await writeFile(partManifestPath, changedPartManifest);
      }
      const { rename: renameFile } = await import('node:fs/promises');
      await renameFile(from, to);
    };

    await assert.rejects(
      () => publishFileSetTransaction({
        files: [
          {
            path: releasePath,
            bytes: Buffer.from('new release'),
            expectedCurrentSha256: sha256(oldRelease),
            validate: async () => {},
          },
          {
            path: releaseManifestPath,
            bytes: Buffer.from('new release manifest'),
            expectedCurrentSha256: sha256(oldReleaseManifest),
            validate: async () => {},
          },
          ...guards,
        ],
        fileOps: { rename },
      }),
      /current SHA-256 changed/,
    );
    assert.deepEqual(await readFile(releasePath), oldRelease);
    assert.deepEqual(await readFile(releaseManifestPath), oldReleaseManifest);
    assert.deepEqual(await readFile(sourcePath), oldSource);
    assert.deepEqual(await readFile(partManifestPath), changedPartManifest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('source drift and incomplete release payloads fail closed', () => {
  const selected = resolveSelectedPlaceAssets(PART_MANIFEST, ['place_debris_chunk']);
  const built = [{ ...builtEntry('place_debris_chunk'), ...selected[0] }];

  assert.doesNotThrow(() => assertPlaceSourceHashesUnchanged(built, {
    place_debris_chunk: built[0].sourceSha256,
  }));
  assert.throws(
    () => assertPlaceSourceHashesUnchanged(built, {
      place_debris_chunk: sha256(Buffer.from('changed source')),
    }),
    /source changed during release build/,
  );
  assert.throws(
    () => validateSelectedPlaceBuild(selected, [{
      ...built[0],
      ktx2Textures: built[0].textures - 1,
    }]),
    /non-KTX2 textures/,
  );
  assert.throws(
    () => validateSelectedPlaceBuild(selected, [{
      ...built[0],
      meshoptBufferViews: 0,
    }]),
    /no Meshopt buffer views/,
  );
  assert.throws(
    () => validateSelectedPlaceBuild(selected, [{
      ...built[0],
      releasePayload: Buffer.from('tampered'),
    }]),
    /release byte count mismatch|release digest mismatch/,
  );
  assert.throws(
    () => validateSelectedPlaceBuild(selected, [{
      ...built[0],
      sourcePayload: Buffer.from('tampered source'),
    }]),
    /source byte count mismatch|source digest mismatch/,
  );
  assert.throws(
    () => validateSelectedPlaceBuild(selected, [{
      ...built[0],
      source: 'assets/ships/parts/places/place_dead_hulk.glb',
    }]),
    /source binding mismatch/,
  );
});

test('release texture profiles keep normals UASTC and color plus ORM ETC1S', () => {
  assert.equal(PLACE_TEXTURE_PROFILES.color.codec, 'ETC1S');
  assert.equal(PLACE_TEXTURE_PROFILES.color.options.isUASTC, false);
  assert.equal(PLACE_TEXTURE_PROFILES.normal.codec, 'UASTC');
  assert.equal(PLACE_TEXTURE_PROFILES.normal.options.isUASTC, true);
  assert.equal(PLACE_TEXTURE_PROFILES.normal.options.needSupercompression, true);
  assert.equal(PLACE_TEXTURE_PROFILES.orm.codec, 'ETC1S');
  assert.equal(PLACE_TEXTURE_PROFILES.orm.options.isUASTC, false);
});
