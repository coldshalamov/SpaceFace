import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { buildRenderPackagePilots, parseRenderPackagePilotArgs } from '../scripts/build-render-package-pilots.mjs';
import { createPilotInputDescriptor, pilotInputDescriptorBytes, pilotInputDescriptorUri } from '../scripts/lib/renderPackageInputs.mjs';

const scratch = fileURLToPath(new URL('../.devshots/fleet/package-provenance-investigation/', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function put(root, path, value) {
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2));
}

async function fixture() {
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(resolve(scratch, 'inputs-test-'));
  const manifest = { schema: 'spaceface.renderPackagePilots.v1', releaseManifest: 'release.json', runtimeManifest: 'generated.js', pilots: [] };
  const release = { assets: [] };
  for (const key of ['kestrel', 'helios-span', 'debris-chunk']) {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 1])).setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute('POSITION', positions).setMaterial(document.createMaterial());
    const hull = document.createNode('Hull').setMesh(document.createMesh().addPrimitive(primitive));
    const rootNode = document.createNode('Root').addChild(hull);
    if (key === 'kestrel') rootNode.addChild(document.createNode('MOTION_Pivot'));
    document.createScene().setExtras({ spacefaceAsset: { assetId: key } }).addChild(rootNode);
    const bytes = Buffer.from(await new NodeIO().writeBinary(document));
    const pilot = { key, assetId: `sf.render.${key}`, runtimeAssetId: key, kind: 'ship', slot: 'body',
      releaseAssetId: key, sourceUrl: `sources/${key}.glb`, releaseSha256: hash(bytes), releaseBytes: bytes.length,
      rootNode: 'Root', dynamicNameIncludes: [], outputDir: `packages/${key}`, metadataUrl: `packages/${key}/render-package.json` };
    manifest.pilots.push(pilot);
    release.assets.push({ id: key, release: pilot.sourceUrl, releaseSha256: pilot.releaseSha256, releaseBytes: bytes.length });
    await put(root, pilot.sourceUrl, bytes);
  }
  await put(root, 'assets/ships/motions/kestrel.motion.json', { schema: 'spaceface.rigidMotionBank.v1', rigId: 'fixture', bindings: [{ node: 'MOTION_Pivot', restPose: {} }] });
  await put(root, 'assets/ships/render-packages/flight-static-v3.json', { schema: 'spaceface.flightRenderPackagePilots.v1', packages: [] });
  await put(root, 'pilots.json', manifest);
  await put(root, 'release.json', release);
  return { root, manifest, release, options: { repoRoot: root, manifestPath: 'pilots.json' } };
}

test('scoped pilot freshness binds its complete inputs and exact outputs, independent of other pilots', async (t) => {
  const { root, manifest, release, options } = await fixture();
  t.diagnostic(`Retained scratch fixture: ${root}`);
  await buildRenderPackagePilots({ ...options, scopedInputs: true });
  const selected = { ...options, onlyKeys: ['kestrel'], check: true };
  const metadataPath = resolve(root, manifest.pilots[0].metadataUrl);
  const originalMetadata = await readFile(metadataPath);
  const descriptorPath = resolve(root, pilotInputDescriptorUri('kestrel'));
  const originalDescriptor = await readFile(descriptorPath);
  const descriptor = JSON.parse(originalDescriptor);
  const metadata = JSON.parse(originalMetadata);
  assert.equal(metadata.provenance.sourceManifest.uri, pilotInputDescriptorUri('kestrel'));
  assert.equal(metadata.provenance.sourceManifest.sha256, hash(originalDescriptor));
  assert.equal(metadata.provenance.sourceManifest.bytes, originalDescriptor.length);
  assert.deepEqual(descriptor.runtime.motionBank, metadata.runtime.motionBank);
  await buildRenderPackagePilots(selected);

  // A real semantic edit in another row must not stale this pilot. --only does not
  // certify that unselected pilot; it still needs its own subsequent rebuild.
  manifest.pilots[1].dynamicNameIncludes = ['Hull'];
  await put(root, 'pilots.json', manifest);
  await buildRenderPackagePilots(selected);
  assert.deepEqual(await readFile(metadataPath), originalMetadata);
  await buildRenderPackagePilots({ ...options, onlyKeys: ['helios-span'] });
  await buildRenderPackagePilots(selected);
  release.assets[1].authoringRevision = 'unrelated-release-change';
  await put(root, 'release.json', release);
  // Formatting and object-key order are not inputs; selected values are.
  await writeFile(resolve(root, 'pilots.json'), JSON.stringify({ pilots: manifest.pilots, runtimeManifest: manifest.runtimeManifest,
    releaseManifest: manifest.releaseManifest, schema: manifest.schema }));
  await buildRenderPackagePilots(selected);

  manifest.pilots[0].dynamicNameIncludes = ['Hull'];
  await put(root, 'pilots.json', manifest);
  await assert.rejects(buildRenderPackagePilots(selected), /render(?:-package\.json|\.glb) is stale/);
  manifest.pilots[0].dynamicNameIncludes = [];
  manifest.pilots[0].authoringPolicy = 'future-field-must-be-bound';
  await put(root, 'pilots.json', manifest);
  await assert.rejects(buildRenderPackagePilots(selected), /render-package\.json is stale/);
  delete manifest.pilots[0].authoringPolicy;
  await put(root, 'pilots.json', manifest);

  release.assets[0].authoringRevision = 'changed-selected-release-record';
  await put(root, 'release.json', release);
  await assert.rejects(buildRenderPackagePilots(selected), /render-package\.json is stale/);
  delete release.assets[0].authoringRevision;
  await put(root, 'release.json', release);

  const bankPath = resolve(root, 'assets/ships/motions/kestrel.motion.json');
  const bank = await readFile(bankPath);
  await writeFile(bankPath, `${bank}\n`);
  await assert.rejects(buildRenderPackagePilots(selected), /render-package\.json is stale/);
  await writeFile(bankPath, bank);

  await writeFile(descriptorPath, `${originalDescriptor} `);
  await assert.rejects(buildRenderPackagePilots(selected), /input descriptor is stale/);
  await writeFile(descriptorPath, originalDescriptor);
  const renderPath = resolve(root, 'packages/kestrel/render.glb');
  const render = await readFile(renderPath);
  await writeFile(renderPath, Buffer.concat([render, Buffer.from([0])]));
  await assert.rejects(buildRenderPackagePilots(selected), /render\.glb is stale/);
  await writeFile(renderPath, render);
  const sourcePath = resolve(root, manifest.pilots[0].sourceUrl);
  const source = await readFile(sourcePath);
  await writeFile(sourcePath, Buffer.concat([source, Buffer.from([0])]));
  await assert.rejects(buildRenderPackagePilots(selected), /release bytes drifted/);
  await writeFile(sourcePath, source);
  await buildRenderPackagePilots(selected);

  // A migration request against a legacy live package must fail before touching it.
  metadata.provenance.sourceManifest.uri = 'pilots.json';
  await put(root, manifest.pilots[0].metadataUrl, metadata);
  const legacy = await readFile(metadataPath);
  await assert.rejects(buildRenderPackagePilots({ ...options, onlyKeys: ['kestrel'], scopedInputs: true }), /reviewed migration staged with --output-root/);
  assert.deepEqual(await readFile(metadataPath), legacy);
  await writeFile(metadataPath, originalMetadata);
});

test('descriptor URI rejects directory traversal', () => {
  assert.throws(() => pilotInputDescriptorUri('../other'), /Unsafe/);
});

test('legacy route keeps exact full-catalog freshness until an explicit staged transition', async () => {
  const { root, manifest, options } = await fixture();
  await buildRenderPackagePilots(options);
  const selected = { ...options, onlyKeys: ['kestrel'] };
  const metadataPath = resolve(root, manifest.pilots[0].metadataUrl);
  let metadata = JSON.parse(await readFile(metadataPath));
  assert.equal(metadata.provenance.sourceManifest.uri, 'pilots.json');
  assert.equal(metadata.provenance.sourceManifest.sha256, hash(await readFile(resolve(root, 'pilots.json'))));
  await buildRenderPackagePilots({ ...selected, check: true });
  manifest.pilots[1].note = 'legacy full-catalog change';
  await put(root, 'pilots.json', manifest);
  await assert.rejects(buildRenderPackagePilots({ ...selected, check: true }), /render-package\.json is stale/);
  await buildRenderPackagePilots(selected);
  await buildRenderPackagePilots({ ...selected, check: true });
  await assert.rejects(buildRenderPackagePilots({ ...selected, scopedInputs: true }), /reviewed migration/);
  const stage = resolve(root, '.devshots/transition');
  await buildRenderPackagePilots({ ...selected, scopedInputs: true, outputRoot: stage });
  await buildRenderPackagePilots({ ...selected, check: true, outputRoot: stage });
  metadata = JSON.parse(await readFile(resolve(stage, manifest.pilots[0].metadataUrl)));
  assert.equal(metadata.provenance.sourceManifest.uri, pilotInputDescriptorUri('kestrel'));
  assert.equal(JSON.parse(await readFile(metadataPath)).provenance.sourceManifest.uri, 'pilots.json');
  assert.equal(parseRenderPackagePilotArgs(['--scoped-inputs']).scopedInputs, true);
});

test('descriptor binds global policies, selected flight-static membership and resolved compiler settings', () => {
  const input = { manifest: { schema: 'catalog', pilots: [] }, flightStaticManifest: { schema: 'flight', packages: [] },
    pilot: { key: 'kestrel', runtimeAssetId: 'ship', slot: 'body', sourceUrl: 'ship.glb' },
    releaseRow: { id: 'source' }, sourceGlb: { uri: 'ship.glb', sha256: 'source-hash', bytes: 12 },
    semanticManifest: { schema: 'semantics' }, motionBank: null,
    compilerOptions: { sourceAssetId: 'source', positionPrecisionPolicy: 'standard', externalizeKtx2: false, externalizeKtx2Hashes: null } };
  const baseline = pilotInputDescriptorBytes(createPilotInputDescriptor(input));
  for (const mutate of [
    (value) => { value.flightStaticManifest.packages.push('kestrel'); },
    (value) => { value.flightStaticManifest.policy = 'new'; },
    (value) => { value.manifest.policy = 'new'; },
    (value) => { value.compilerOptions.positionPrecisionPolicy = 'strict-clearance'; },
    (value) => { value.compilerOptions.externalizeKtx2 = true; value.compilerOptions.externalizeKtx2Hashes = ['hash']; },
  ]) {
    const changed = structuredClone(input);
    mutate(changed);
    assert.notDeepEqual(pilotInputDescriptorBytes(createPilotInputDescriptor(changed)), baseline);
  }
});
