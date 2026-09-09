// PQ-136.00 — every promoted wreck/aftermath and source-only everyday-space-kit
// body carries a legal release identity, belongs to the generated release
// manifest, and binds through the shipping loader's headless runtime-table seam.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { inspectGlbReleaseCompression } from '../src/contracts/assetReleaseValidation.js';
import {
  deriveAuthoredRuntimeTable,
  prepareRenderPackageBlueprint,
} from '../src/render/assetLoader.js';
import { PACK_RELEASE_ASSETS } from '../scripts/build-pack-release-assets.mjs';
import { derivePilotSemanticManifest } from '../scripts/build-render-package-pilots.mjs';
import {
  readGlbJson,
  sceneFromGlbJson,
} from '../scripts/lib/renderPackageRuntimeTable.mjs';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const RELEASE_MANIFEST = 'assets/ships/release/release_manifest.json';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sourceHasIdentity(json) {
  const scene = (json.scenes || [])[json.scene ?? 0];
  return Boolean(
    json.asset?.extras?.spacefaceAsset
    || scene?.extras?.spacefaceAsset
    || (scene?.nodes || []).some((index) => json.nodes?.[index]?.extras?.spacefaceAsset),
  );
}

function assertReleaseContract(contract, asset, sourceHash, label) {
  assert.equal(contract?.contractVersion, 2, `${label}: contractVersion`);
  assert.equal(contract?.assetId, asset.id, `${label}: assetId`);
  assert.equal(contract?.partId, asset.id, `${label}: partId`);
  assert.equal(contract?.slot, 'place', `${label}: slot`);
  assert.equal(contract?.forward, '+X', `${label}: forward`);
  assert.equal(contract?.up, '+Y', `${label}: up`);
  assert.equal(contract?.starboard, '+Z', `${label}: starboard`);
  assert.equal(contract?.unit, 'metre', `${label}: unit`);
  assert.equal(contract?.normalConvention, 'OpenGL', `${label}: normal convention`);
  assert.equal(
    contract?.ormChannels,
    'R=AO,G=Roughness,B=Metallic',
    `${label}: ORM channels`,
  );
  assert.equal(contract?.textureCompression, 'KTX2/BasisU+mips', `${label}: compression`);
  assert.equal(contract?.wiringStatus, 'promoted_release_unrouted', `${label}: wiring status`);
  assert.equal(contract?.sourceIdentity?.path, asset.source, `${label}: source path`);
  assert.equal(contract?.sourceIdentity?.sha256, sourceHash, `${label}: source SHA-256`);
  assert.equal(contract?.claims?.technicalRelease, true, `${label}: technical release claim`);
  assert.equal(contract?.claims?.routed, false, `${label}: routing stays deferred`);
  assert.equal(contract?.claims?.placed, false, `${label}: placement stays deferred`);
}

function flatPlan(scene) {
  const entries = [];
  const indexByObject = new Map();
  scene.traverse((source) => {
    const parentIndex = source.parent ? (indexByObject.get(source.parent) ?? -1) : -1;
    const planIndex = entries.length;
    entries.push({ source, parentIndex });
    indexByObject.set(source, planIndex);
  });
  return { entries };
}

function packagePilot(asset, json) {
  const scene = (json.scenes || [])[json.scene ?? 0];
  const roots = scene?.nodes || [];
  const rootName = roots.length === 1 ? json.nodes?.[roots[0]]?.name : null;
  return {
    key: asset.id,
    assetId: `sf.render.pq136.${asset.id}`,
    runtimeAssetId: asset.id,
    kind: 'place',
    slot: 'place',
    sourceUrl: asset.release,
    dynamicNameIncludes: [],
    ...(rootName ? { rootNode: rootName } : { sceneRoot: true }),
  };
}

test('all 74 release bodies pass the identity, manifest, compression, and headless loader seam', async () => {
  assert.equal(PACK_RELEASE_ASSETS.length, 74);
  assert.equal(
    PACK_RELEASE_ASSETS.filter((asset) => asset.family === 'wreck_aftermath_pack').length,
    44,
  );
  assert.equal(
    PACK_RELEASE_ASSETS.filter((asset) => asset.family === 'everyday_space_kit').length,
    30,
  );

  const manifest = JSON.parse(readFileSync(resolve(ROOT, RELEASE_MANIFEST), 'utf8'));
  const manifestRows = new Map();
  for (const row of manifest.assets || []) {
    assert.equal(manifestRows.has(row.id), false, `duplicate release-manifest row ${row.id}`);
    manifestRows.set(row.id, row);
  }

  for (const asset of PACK_RELEASE_ASSETS) {
    const sourceAbs = resolve(ROOT, asset.source);
    const releaseAbs = resolve(ROOT, asset.release);
    assert.ok(existsSync(sourceAbs), `missing read-only source ${asset.source}`);
    assert.ok(existsSync(releaseAbs), `missing release body ${asset.release}`);

    const sourceBytes = readFileSync(sourceAbs);
    const releaseBytes = readFileSync(releaseAbs);
    const sourceJson = readGlbJson(sourceBytes);
    const releaseJson = readGlbJson(releaseBytes);
    const sourceHash = sha256(sourceBytes);
    assert.equal(
      sourceHasIdentity(sourceJson),
      false,
      `${asset.source} was stamped instead of remaining immutable source`,
    );

    const row = manifestRows.get(asset.id);
    assert.ok(row, `release manifest missing ${asset.id}`);
    assert.equal(row.kind, 'part:places', `${asset.id}: manifest kind`);
    assert.equal(row.source, asset.source, `${asset.id}: manifest source`);
    assert.equal(row.release, asset.release, `${asset.id}: manifest release`);
    assert.equal(row.sourceSha256, sourceHash, `${asset.id}: source hash binding`);
    assert.equal(row.releaseSha256, sha256(releaseBytes), `${asset.id}: release hash binding`);
    assert.equal(row.sourceBytes, sourceBytes.length, `${asset.id}: source byte binding`);
    assert.equal(row.releaseBytes, releaseBytes.length, `${asset.id}: release byte binding`);

    const releaseContract = releaseJson.asset?.extras?.spacefaceAsset;
    assertReleaseContract(releaseContract, asset, sourceHash, `${asset.id} asset extras`);
    const sceneDef = (releaseJson.scenes || [])[releaseJson.scene ?? 0];
    assertReleaseContract(
      sceneDef?.extras?.spacefaceAsset,
      asset,
      sourceHash,
      `${asset.id} scene extras`,
    );
    assert.ok((sceneDef?.nodes || []).length > 0, `${asset.id}: no default-scene roots`);
    for (const nodeIndex of sceneDef.nodes) {
      assertReleaseContract(
        releaseJson.nodes?.[nodeIndex]?.extras?.spacefaceAsset,
        asset,
        sourceHash,
        `${asset.id} root ${nodeIndex} extras`,
      );
    }

    const compression = inspectGlbReleaseCompression(asset.release, {
      root: ROOT,
      releaseMode: true,
    });
    assert.equal(
      compression.ok && compression.releaseReady,
      true,
      `${asset.id}: ${JSON.stringify(compression.issues)}`,
    );
    assert.equal(compression.metrics.ktx2TextureCount, compression.metrics.textureCount);
    assert.ok(compression.metrics.meshoptBufferViewCount > 0, `${asset.id}: no Meshopt views`);

    // The fail-closed shipping loader admits release assets through render packages. This invokes
    // the package generator's real semantic derivation without writing a pilot or routing row, so
    // duplicate/empty node names or a mismatched embedded identity fail this promotion test now.
    const pilot = packagePilot(asset, releaseJson);
    const semantics = await derivePilotSemanticManifest(pilot, releaseAbs);
    assert.equal(semantics.assetId, pilot.assetId, `${asset.id}: package semantic identity`);
    assert.ok(semantics.semanticNodes.length > 0, `${asset.id}: no package semantic nodes`);

    // Reconstruct the same graph GLTFLoader produces without decoding KTX2 pixels, derive the
    // runtime table with the live loader's own function, then bind it through the shipping
    // prepareRenderPackageBlueprint seam. This is the project's established headless equivalent
    // for a package load; the later placement/routing leaf owns package generation and selection.
    const scene = sceneFromGlbJson(releaseJson);
    const runtime = deriveAuthoredRuntimeTable(scene, {
      url: asset.release,
      slot: 'place',
      legacyPart: releaseContract.legacyPart === true,
      assetId: asset.id,
    });
    const prepared = prepareRenderPackageBlueprint(pilot, {
      scene,
      asset: releaseJson.asset,
      parser: { json: releaseJson },
    }, {
      runtime,
    }, {
      plan: flatPlan(scene),
    });
    assert.equal(prepared.assetId, asset.id, `${asset.id}: loader-bound identity`);
    assert.equal(prepared.slot, 'place', `${asset.id}: loader-bound slot`);
    assert.ok(prepared.primitives.length > 0, `${asset.id}: loader bound no primitives`);
    assert.equal(prepared.primitives.length, runtime.primitives.length);
    assert.equal(prepared.markers.length, runtime.markers.length);
  }
});
