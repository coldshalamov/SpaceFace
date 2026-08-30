import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  wholeShipLodFileForEntity,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_ROOT = resolve(ROOT, 'assets/ships/parts/wholeships');
const RELEASE_ROOT = resolve(ROOT, 'assets/ships/release/parts/wholeships');
const PACKAGE_ROOT = resolve(ROOT, 'assets/ships/release/render-packages');

const MEMBERS = Object.freeze([
  Object.freeze({
    key: 'ironback-production-v1',
    file: 'ironback_production_v1.glb',
    lod: 'lod0',
    root: 'IRONBACK_LOD0_ROOT',
    sourceSha256: '34bcca4b35fbe0ea3f6784de56d172ab08413dfacc021ab26642a698e7d08361',
    releaseSha256: 'f895a9f35de067f45b96a97528869caf2325de43590e7022fb1627c2eb021444',
    releaseBytes: 6464492,
    packageSha256: '89425a91f5702658fac62face1018dc372ca941c505bf25206cbfae179d7e950',
    packageBytes: 7603676,
    contentHash: '313cd76e248136f08d3ad6c84b9b2c7e851edabf5a2c9315d3f6778e5902f0d6',
    runtimeHash: '5cd216f0c9c7714544d6049a8b3ac4481972d86990c22e60aea956ee6d3a2878',
    collisions: 1,
  }),
  Object.freeze({
    key: 'ironback-production-v1-lod1',
    file: 'ironback_production_v1_lod1.glb',
    lod: 'lod1',
    root: 'IRONBACK_LOD1_ROOT',
    sourceSha256: 'fde30f9912b3c222d1f8d5b5b37205a9c007566fe7e60dd8591a244ac0742c5b',
    releaseSha256: 'fd31f285c62e1dc74171d08b2c38fb66d775637f9954398e99b2da155e59fd45',
    releaseBytes: 6354520,
    packageSha256: '537edeb917ac644281f55fd59521573b04753c68b7b3349843ffa922cbba81ad',
    packageBytes: 7423132,
    contentHash: '8bbea0aadb0e13853281feb48529bdb1aab6cb82e7d348f8ca655305d15d27a7',
    runtimeHash: '0e9159ba81fd0ad5c3eea32fb90b8aaf403dd20e2a061f551e0d2cc98dc3f167',
    collisions: 0,
  }),
  Object.freeze({
    key: 'ironback-production-v1-lod2',
    file: 'ironback_production_v1_lod2.glb',
    lod: 'lod2',
    root: 'IRONBACK_LOD2_ROOT',
    sourceSha256: '5edb1e798cb6bc1acfb61db548e923e469ec1d01a8d952bbb3e7604d7b116fd5',
    releaseSha256: '7ad31d87e4716ca153ab9a56638ad6ee8a59cac999f75760b85b4c52fccd42c5',
    releaseBytes: 5912408,
    packageSha256: '8e6f142940603f84fc0947e1e512411d5d091627c6dcce33d5c9060b6eab2804',
    packageBytes: 6708192,
    contentHash: '71d01c5f9b3caae3f0d54c4da7855694ce7aa51e6a79b637dfd7e09d54144509',
    runtimeHash: '4b13e5af8f659eca0d7fecdb9842d8c860265a8f0db07546ae84320085fb4848',
    collisions: 0,
  }),
]);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readGlbJson(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, path);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
}

test('accepted Ironback source and three release members stay hash-bound', () => {
  const releaseManifest = JSON.parse(readFileSync(
    resolve(ROOT, 'assets/ships/release/release_manifest.json'),
    'utf8',
  ));
  for (const member of MEMBERS) {
    const sourcePath = resolve(SOURCE_ROOT, member.file);
    const releasePath = resolve(RELEASE_ROOT, member.file);
    assert.equal(sha256(sourcePath), member.sourceSha256, `${member.lod} accepted source`);
    assert.equal(sha256(releasePath), member.releaseSha256, `${member.lod} release`);
    assert.equal(readFileSync(releasePath).length, member.releaseBytes, `${member.lod} release bytes`);
    const row = releaseManifest.assets.filter(({ release }) => release.endsWith(`/wholeships/${member.file}`));
    assert.equal(row.length, 1, `${member.lod} one release row`);
    assert.equal(row[0].sourceSha256, member.sourceSha256);
    assert.equal(row[0].releaseSha256, member.releaseSha256);
    assert.equal(row[0].releaseBytes, member.releaseBytes);

    const contract = readGlbJson(releasePath).asset?.extras?.spacefaceAsset;
    assert.equal(contract?.assetId, 'SF_IRONBACK_PRODUCTION_V1');
    assert.equal(contract?.lod, member.lod);
    assert.equal(contract?.slot, 'hull');
    assert.equal(contract?.category, 'wholeships');
  }
});

test('roster 220 binds all three Ironback packages to the live runtime identity', () => {
  const pilots = JSON.parse(readFileSync(
    resolve(ROOT, 'assets/ships/render-packages/pilots.json'),
    'utf8',
  )).pilots;
  assert.equal(pilots.length, 220);
  for (const member of MEMBERS) {
    const pilot = pilots.filter(({ key }) => key === member.key);
    assert.equal(pilot.length, 1, member.key);
    assert.equal(pilot[0].runtimeAssetId, 'SF_IRONBACK_PRODUCTION_V1');
    assert.equal(pilot[0].rootNode, member.root);
    assert.equal(pilot[0].releaseSha256, member.releaseSha256);
    const generated = renderPackagePilotForSourceUrl(pilot[0].sourceUrl);
    assert.equal(generated?.key, member.key);
    assert.equal(generated?.expectedContentHash, member.contentHash);
  }
});

test('compiled Ironback packages retain exact runtime hashes and collision roles', () => {
  for (const member of MEMBERS) {
    const packageDir = resolve(PACKAGE_ROOT, member.key);
    const metadata = JSON.parse(readFileSync(resolve(packageDir, 'render-package.json'), 'utf8'));
    const packageGlb = resolve(packageDir, 'render.glb');
    assert.equal(sha256(packageGlb), member.packageSha256, member.key);
    assert.equal(readFileSync(packageGlb).length, member.packageBytes, `${member.key} bytes`);
    assert.equal(metadata.assetId, `sf.render.${member.key}`);
    assert.equal(metadata.contentHash, member.contentHash);
    assert.equal(metadata.runtimeHash, member.runtimeHash);
    assert.equal(metadata.collisions.length, member.collisions);
    assert.equal(metadata.nodes.length, 10);
    assert.equal(metadata.geometry.length, 9);
  }
});

test('live Ironback selection resolves LOD0/1/2 without changing role or identity', () => {
  const entity = { type: 'ship', data: { defId: 'ship_ironback' } };
  const selected = wholeShipVisualForEntity(entity, { requiredWholeShip: true });
  assert.deepEqual(selected, {
    file: 'wholeships/ironback_production_v1.glb',
    assetId: 'SF_IRONBACK_PRODUCTION_V1',
    roleId: 'ship_ironback',
    required: true,
    lodFamily: {
      lod0: 'wholeships/ironback_production_v1.glb',
      lod1: 'wholeships/ironback_production_v1_lod1.glb',
      lod2: 'wholeships/ironback_production_v1_lod2.glb',
    },
  });
  assert.equal(wholeShipLodFileForEntity(entity, 'lod0'), selected.lodFamily.lod0);
  assert.equal(wholeShipLodFileForEntity(entity, 'lod1'), selected.lodFamily.lod1);
  assert.equal(wholeShipLodFileForEntity(entity, 'lod2'), selected.lodFamily.lod2);
});
