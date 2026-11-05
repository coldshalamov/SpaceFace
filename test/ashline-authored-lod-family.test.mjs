import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { ordinaryWholeShipVisualForEntity } from '../src/data/wholeShipVisualIdentity.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';
import { wholeShipLodFileForEntity } from '../src/render/partsLibrary.js';
import { inspectReleaseAssetPair } from '../src/contracts/assetReleaseValidation.js';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const hash = (a) => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
function geometry(n) { return n.getMesh()?.listPrimitives().map(p => ({
  material: p.getMaterial()?.getName(), indices: p.getIndices() ? hash(p.getIndices().getArray()) : null,
  attributes: Object.fromEntries(p.listSemantics().map(s => [s, hash(p.getAttribute(s).getArray())])),
})); }
function contractNode(n) { return { world: n.getWorldMatrix(), extras: n.getExtras(), parent: n.getParentNode()?.getName() || null }; }

for (const [ship, hostile] of [['dart', 'wasp_swarmer'], ['rig', 'reaver_pirate']]) test(`${hostile} resolves its own packaged authored tiers`, async () => {
  const entity = { type: 'ship', team: 1, data: { lootTableId: hostile } };
  const selected = ordinaryWholeShipVisualForEntity(entity, { requiredWholeShip: true });
  assert.equal(selected.file, `wholeships/ashline_${ship}.glb`);
  const source = await io.read(`assets/ships/parts/wholeships/ashline_${ship}.glb`);
  const release = await io.read(`assets/ships/release/parts/wholeships/ashline_${ship}.glb`);
  const sourceNodes = source.getRoot().listNodes();
  for (const tier of [1, 2]) {
    const file = `wholeships/ashline_${ship}_lod${tier}.glb`;
    assert.equal(selected.lodFamily[`lod${tier}`], file);
    assert.equal(wholeShipLodFileForEntity(entity, `lod${tier}`), file);
    const binding = renderPackagePilotForSourceUrl(`assets/ships/release/parts/${file}`);
    assert.ok(binding);
    assert.equal(binding.runtimeAssetId, source.getRoot().getAsset().extras.spacefaceAsset.assetId);
    const pkg = JSON.parse(await readFile(binding.metadataUrl));
    assert.equal(pkg.contentHash, binding.expectedContentHash);
    const authored = await io.read(`assets/ships/parts/${file}`);
    const authoredNodes = authored.getRoot().listNodes();
    const baseNames = sourceNodes.filter(n => n.getName().startsWith('LOD0_')).map(n => n.getName()).sort();
    assert.deepEqual(authoredNodes.filter(n => n.getName().startsWith('LOD0_')).map(n => n.getName()).sort(), baseNames);
    for (const n of authoredNodes) {
      let name = n.getName();
      if (name.startsWith('LOD0_')) {
        const preserve = ship === 'dart' ? name.endsWith('_Warning') : name.endsWith('_Livery');
        if (!preserve) name = name.replace(/^LOD0_/, `LOD${tier}_`);
      }
      const original = sourceNodes.find(x => x.getName() === name);
      assert.ok(original, name);
      assert.deepEqual(contractNode(n), contractNode(original), name);
      assert.deepEqual(geometry(n), geometry(original), name);
    }
    const path = `assets/ships/release/parts/${file}`;
    const pair = inspectReleaseAssetPair(`assets/ships/parts/${file}`, path, { root: process.cwd() });
    assert.equal(pair.ok, true, JSON.stringify(pair.issues));
    const decoded = await io.read(path);
    const collision = d => { const n = d.getRoot().listNodes().find(x => x.getName() === 'COLLISION_HULL'); return { node: contractNode(n), geometry: geometry(n) }; };
    assert.deepEqual(collision(decoded), collision(release), 'release collision unchanged from base');
  }
});

test('a faction-specific Rig keeps its own body and does not borrow the base family', () => {
  const visual = ordinaryWholeShipVisualForEntity({ type: 'ship', factionId: 'faction_quiet', data: { lootTableId: 'reaver_pirate' } }, { requiredWholeShip: true });
  assert.equal(visual.file, 'wholeships/ashline_rig_quiet.glb');
  assert.equal(visual.lodFamily, undefined);
});
