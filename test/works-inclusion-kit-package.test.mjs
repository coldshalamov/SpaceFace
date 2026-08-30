// PQ-131.10 — exact release/render-package binding for the accepted Inclusion Kit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  renderPackagePilotForAssetId,
  renderPackagePilotForSourceUrl,
} from '../src/render/renderPackageManifest.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RELEASE = resolve(ROOT, 'assets/ships/release/parts/works/place_works_inclusion_kit.glb');
const PACKAGE_GLB = resolve(ROOT, 'assets/ships/release/render-packages/works-inclusion-kit/render.glb');
const PACKAGE_JSON = resolve(ROOT, 'assets/ships/release/render-packages/works-inclusion-kit/render-package.json');
const PILOTS_JSON = resolve(ROOT, 'assets/ships/render-packages/pilots.json');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');

const RELEASE_SHA256 = 'd635ffd87d38e14092ec38b2f63fb830965f0ccb57f33db83d83da2ea97ce88b';
const PACKAGE_SHA256 = 'e496267d4ddcc551c8336ceed18660d746bb44cf931528287dba9e5389c643f5';
const CONTENT_HASH = '17f1d2c0d45fdd8251023cc4744650e4b95bd3101ec9d432fc9370d4bbe2152e';

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('the Inclusion Kit release and package stay bound to the accepted source', () => {
  const releaseManifest = JSON.parse(readFileSync(RELEASE_MANIFEST, 'utf8'));
  const packageMetadata = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  const rows = releaseManifest.assets.filter(({ id }) => id === 'place_works_inclusion_kit');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceSha256, 'e690aea63108d697a2d53fe8ba6ea5136f4e7a1f725572df6fb5d73f9101cd83');
  assert.equal(rows[0].releaseSha256, RELEASE_SHA256);
  assert.equal(rows[0].releaseBytes, 1630564);
  assert.equal(sha256(RELEASE), RELEASE_SHA256);
  assert.equal(sha256(PACKAGE_GLB), PACKAGE_SHA256);
  assert.equal(readFileSync(PACKAGE_GLB).length, 2604488);
  assert.equal(packageMetadata.assetId, 'sf.render.works-inclusion-kit');
  assert.equal(packageMetadata.contentHash, CONTENT_HASH);
  assert.deepEqual(packageMetadata.provenance.sourceGlb, {
    bytes: 1630564,
    sha256: RELEASE_SHA256,
    uri: 'place_works_inclusion_kit.glb',
  });
});

test('roster 217 contains one combined Inclusion Kit pilot and generated runtime binding', () => {
  const pilots = JSON.parse(readFileSync(PILOTS_JSON, 'utf8')).pilots;
  const matching = pilots.filter(({ key }) => key === 'works-inclusion-kit');
  assert.equal(pilots.length, 217);
  assert.equal(matching.length, 1);
  assert.equal(matching[0].rootNode, 'SF_WORKS_INCLUSION_KIT_V1');
  assert.equal(matching[0].releaseSha256, RELEASE_SHA256);
  const byAsset = renderPackagePilotForAssetId('sf.render.works-inclusion-kit');
  const byUrl = renderPackagePilotForSourceUrl(
    'assets/ships/release/parts/works/place_works_inclusion_kit.glb',
  );
  assert.equal(byAsset, byUrl);
  assert.equal(byAsset.expectedContentHash, CONTENT_HASH);
  assert.equal(byAsset.runtimeAssetId, 'place_works_inclusion_kit');
});

test('compiled package retains all 18 named variants and every LOD mesh', () => {
  const packageMetadata = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  const names = new Set(packageMetadata.nodes.map(({ nodeName }) => nodeName).filter(Boolean));
  const variants = [
    'SILVER_WIRE', 'SILVER_SHEET', 'GOLD_LEAF', 'GOLD_RIBBON',
    'IRON_CHIP_RIDGE', 'IRON_SPECULAR', 'NICKEL_CUBIC', 'NICKEL_DENDRITE',
    'EXOTIC_OCTAHEDRAL_CAGE', 'EXOTIC_PRISMATIC_TRUSS', 'EXOTIC_HOPPER_CUBE',
    'ICE_SHEEN_PLATE', 'ICE_FRACTURE_VEIN', 'GAS_FISSURE_RADIAL',
    'GAS_FISSURE_BRANCH', 'GAS_FISSURE_SHEAR', 'VENTED_SCAR', 'MK_LOCK_PLATE',
  ];
  for (const variant of variants) {
    for (const lod of [0, 1, 2]) {
      assert.equal(names.has(`LOD${lod}_SF_INCL_${variant}_V1`), true, `${variant} LOD${lod}`);
    }
  }
  assert.equal(packageMetadata.nodes.length, 55);
  assert.equal(packageMetadata.geometry.length, 54);
  assert.equal(packageMetadata.collisions.length, 0);
});
