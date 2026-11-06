import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { authoredPreloadPlanForEntity } from '../src/render/partsLibrary.js';
import { sealMotionBankRef } from '../scripts/lib/renderPackageRuntimeTable.mjs';
import { inspectReleaseAssetPair } from '../src/contracts/assetReleaseValidation.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const json = path => JSON.parse(read(path));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pilots = json('assets/ships/render-packages/pilots.json').pilots;
const release = json('assets/ships/release/release_manifest.json').assets;
const cases = [['warden', 'warden_escort', 'ship_bastion'], ['jackal', 'mine_layer_jackal', 'ship_drifter'],
  ['anchor', 'field_anchor_controller', 'ship_bastion']];

for (const [kind, enemyId, defId] of cases) test(`${kind}: hostile admission selects a sealed authored hull and every LOD keeps its mechanisms`, async () => {
  const path = `wholeships/swarm_${kind}.glb`;
  const plan = authoredPreloadPlanForEntity({ id: 55, type: 'ship', defId, isPlayer: false, team: 1,
    data: { lootTableId: enemyId } }, { releaseMode: true });
  assert.deepEqual(plan.hull, [path], 'ordinary hostile identity resolves its own body');
  const pilot = pilots.find(row => row.key === `swarm-${kind}`);
  const released = release.find(row => row.id === pilot.releaseAssetId);
  const compression = inspectReleaseAssetPair(`assets/ships/parts/${path}`, pilot.sourceUrl, { root: fileURLToPath(root) });
  assert.equal(compression.ok, true, JSON.stringify(compression.issues));
  const bytes = read(pilot.sourceUrl);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.equal(gltf.scenes[0].extras.spacefaceAsset.assetId, pilot.runtimeAssetId);
  for (const name of ['SOCKET_Retro_Port', 'SOCKET_Retro_Starboard']) {
    const index = gltf.nodes.findIndex(node => node.name === name);
    assert.ok(index >= 0, `${name} owns the fixed authored brake port instead of a moving-wing skin fit`);
    for (let child = index, parent; (parent = gltf.nodes.findIndex(node => node.children?.includes(child))) >= 0; child = parent) {
      assert.ok(!gltf.nodes[parent].name?.startsWith('MOTION_'), `${name} stays on the fixed body`);
    }
  }
  assert.equal(hash(bytes), pilot.releaseSha256);
  assert.equal(bytes.length, pilot.releaseBytes);
  assert.equal(released.releaseSha256, pilot.releaseSha256);
  const metadata = json(pilot.metadataUrl);
  assert.equal(metadata.provenance.sourceGlb.sha256, pilot.releaseSha256);
  const renderBytes = read(pilot.metadataUrl.replace(/[^/]+$/, metadata.render.uri));
  assert.equal(hash(renderBytes), metadata.render.sha256, 'the compiled payload matches its metadata');
  assert.equal(renderBytes.length, metadata.render.bytes);
  assert.deepEqual(await sealMotionBankRef(pilot, metadata, { repoRoot: fileURLToPath(root) }), metadata.runtime.motionBank);
  const bank = json(metadata.runtime.motionBank.uri);
  assert.equal(bank.sourceAssetId, pilot.runtimeAssetId);
  assert.equal(bank.sourceGlbSha256, hash(read(`assets/ships/parts/${path}`)));
  assert.ok(bank.bindings.length >= 2, 'the authored body has independently animated mechanisms');
  const descendantNames = index => {
    const node = gltf.nodes[index];
    return [node.name || '', ...(node.children || []).flatMap(descendantNames)];
  };
  for (const binding of bank.bindings) {
    const index = gltf.nodes.findIndex(node => node.name === binding.node);
    assert.ok(index >= 0, 'bank binds an actual released node');
    const names = descendantNames(index);
    for (let lod = 0; lod < 3; lod++) assert.ok(names.some(name => name.startsWith(`LOD${lod}_`)),
      `${binding.node} owns visible meshes at LOD${lod}`);
  }
});
