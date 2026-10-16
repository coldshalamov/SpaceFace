import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { derivePilotSemanticManifest } from '../scripts/build-render-package-pilots.mjs';
import { computeRenderPackageContentHash, computeRenderPackageRuntimeHash } from '../src/contracts/renderPackage.js';
import { readGlbJson } from '../scripts/lib/renderPackageRuntimeTable.mjs';
import { validateMotionBank } from '../src/contracts/motionBank.js';
import { RENDER_PACKAGE_PILOTS } from '../src/render/renderPackageManifest.js';

const json = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const bytes = path => readFile(new URL('../' + path, import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

for (const [key, id, runtimeAssetId, collisionCount] of [
  ['anvil-storm-orchard', 'place_anvil_storm_orchard', 'SF_PLACE_ANVIL_STORM_ORCHARD', 31],
  ['anvil-condensate-pod', 'place_anvil_condensate_pod', 'SF_PLACE_ANVIL_CONDENSATE_POD', 1],
]) test(`${key}: normal registered source, release, pilot and package retain exact identity`, async () => {
  await MeshoptDecoder.ready;
  const parts = await json('assets/ships/parts/parts_manifest.json');
  const fleet = await json('tools/blender/forge/fleet.json');
  const pilotsBytes = await bytes('assets/ships/render-packages/pilots.json');
  const pilots = JSON.parse(pilotsBytes);
  const release = await json('assets/ships/release/release_manifest.json');
  const pilot = pilots.pilots.find(p => p.key === key);
  const releaseRow = release.assets.find(p => p.id === id);
  const part = parts.parts.find(p => p.id === id);
  assert.equal(part.file, `places/${id}.glb`);
  assert.ok(parts.runtimeSlots.place.includes(part.file));
  assert.equal(fleet.ships[id].asset_id, runtimeAssetId);
  assert.equal(pilot.runtimeAssetId, runtimeAssetId);
  assert.equal(pilot.sceneRoot, true, 'all authored parents, pivots and LODs belong to the package');
  const sourceBytes = await bytes(releaseRow.source);
  const releaseBytes = await bytes(releaseRow.release);
  assert.equal(sha(sourceBytes), releaseRow.sourceSha256);
  assert.equal(sha(releaseBytes), releaseRow.releaseSha256);
  assert.equal(pilot.releaseSha256, releaseRow.releaseSha256);
  assert.equal(pilot.releaseBytes, releaseBytes.length);
  const sourceJson = readGlbJson(sourceBytes);
  const releaseJson = readGlbJson(releaseBytes);
  assert.equal(sourceJson.scenes[sourceJson.scene ?? 0].extras.spacefaceAsset.assetId, runtimeAssetId);
  assert.equal(releaseJson.scenes[releaseJson.scene ?? 0].extras.spacefaceAsset.assetId, runtimeAssetId);
  const metadata = await json(pilot.metadataUrl);
  const renderBytes = await bytes(pilot.outputDir + '/render.glb');
  assert.equal(metadata.render.sha256, sha(renderBytes));
  assert.equal(metadata.provenance.sourceGlb.sha256, pilot.releaseSha256);
  assert.equal(metadata.provenance.sourceManifest.sha256, sha(pilotsBytes), 'packages retain the exact current-public compiler manifest input');
  assert.equal(metadata.provenance.sourceManifest.bytes, pilotsBytes.length);
  assert.equal(metadata.contentHash, await computeRenderPackageContentHash(metadata, { digest: sha }));
  assert.equal(metadata.runtimeHash, await computeRenderPackageRuntimeHash(metadata, { digest: sha }));
  const binding = RENDER_PACKAGE_PILOTS.find(p => p.key === key);
  assert.equal(binding.expectedContentHash, metadata.contentHash);
  assert.equal(binding.runtimeAssetId, runtimeAssetId);
  const semantics = await derivePilotSemanticManifest(pilot, new URL('../' + pilot.sourceUrl, import.meta.url).pathname);
  assert.equal(semantics.collisions.length, collisionCount);
  assert.equal(metadata.runtime.hidden.length, collisionCount);
  assert.ok(metadata.runtime.primitives.every(p => !p.name.startsWith('COLLISION_')));
  const sourceDoc = await io.readBinary(new Uint8Array(sourceBytes));
  const compiledDoc = await io.readBinary(new Uint8Array(renderBytes));
  if (key === 'anvil-storm-orchard') {
    const bankBytes = await bytes('assets/ships/motions/anvil-storm-orchard.motion.json');
    const bank = validateMotionBank(JSON.parse(bankBytes));
    assert.equal(bank.sourceGlbSha256, sha(sourceBytes));
    assert.equal(bank.sourceAssetId, runtimeAssetId);
    assert.deepEqual(bank.events, {}, 'no bank event may take authority over native jaw travel');
    assert.equal(bank.bindings.length, 6);
    assert.equal(metadata.runtime.motionBank.sha256, sha(bankBytes));
    assert.equal(metadata.runtime.motionBank.bytes, bankBytes.length);
    assert.equal(metadata.runtime.motionBank.rigId, bank.rigId);
  }
  const sourcePivots = sourceDoc.getRoot().listNodes().filter(n => n.getName().startsWith('MOTION_ORCHARD_'));
  assert.equal(sourcePivots.length, key === 'anvil-storm-orchard' ? 6 : 0);
  const compiledNodes = new Map(compiledDoc.getRoot().listNodes().map(n => [n.getName(), n]));
  for (const sourcePivot of sourcePivots) {
    const name = sourcePivot.getName();
    const pivot = compiledNodes.get(name);
    assert.ok(pivot, name);
    assert.deepEqual(pivot.getMatrix(), sourcePivot.getMatrix(), `${name} keeps authored local pivot`);
    assert.deepEqual(pivot.getWorldMatrix(), sourcePivot.getWorldMatrix(), `${name} keeps authored world basis`);
    for (const lod of [0, 1, 2]) {
      assert.ok(pivot.listChildren().some(n => n.getName().startsWith(`LOD${lod}_MOTION_ORCHARD_`)), `${name} keeps LOD${lod} under pivot`);
    }
    const semanticNode = semantics.semanticNodes.find(n => n.node === name);
    assert.equal(semanticNode.role, 'dynamic');
    assert.ok(semantics.dynamicGroups.some(g => g.nodeId === semanticNode.id && g.kind === 'moving-part'));
  }
});
