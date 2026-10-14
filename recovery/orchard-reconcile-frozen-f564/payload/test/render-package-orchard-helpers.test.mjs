import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { derivePilotSemanticManifest } from '../scripts/build-render-package-pilots.mjs';

for (const sceneRoot of [false, true]) {
  test(`explicit non-render helpers retain collision identity in ${sceneRoot ? 'scene' : 'named'} root packages`, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'sf-orchard-helper-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const document = new Document(), scene = document.createScene('Source');
    document.getRoot().setDefaultScene(scene);
    scene.setExtras({ spacefaceAsset: { assetId: 'ORCHARD_HELPER_FIXTURE' } });
    const buffer = document.createBuffer();
    const positions = document.createAccessor().setType('VEC3')
      .setArray(new Float32Array([0,0,0, 1,0,0, 0,1,0])).setBuffer(buffer);
    const root = document.createNode('ROOT'); scene.addChild(root);
    const specs = [
      ['COLLISION_HULL', {}],
      ['COLLISION_JAW', { nonRender: true, collision: true }],
      ['NestedHelper', { spaceface: { nonRender: true }, collision: true }],
      ['Marker', { nonRender: true }],
      ['COLLISION_LOOKALIKE', {}],
      ['StringHelper', { nonRender: 'true', collision: true }],
      ['NumericHelper', { nonRender: 1, collision: true }],
    ];
    for (const [name, extras] of specs) root.addChild(document.createNode(name).setExtras(extras)
      .setMesh(document.createMesh().addPrimitive(document.createPrimitive().setAttribute('POSITION', positions))));
    const path = join(directory, 'source.glb'); await new NodeIO().write(path, document);
    const manifest = await derivePilotSemanticManifest({ key: 'orchard-helper', assetId: 'sf.render.helper',
      runtimeAssetId: 'ORCHARD_HELPER_FIXTURE', rootNode: 'ROOT', sceneRoot, dynamicNameIncludes: [] }, path);
    const byName = new Map(manifest.semanticNodes.map(row => [row.node, row]));
    assert.deepEqual(manifest.collisions.map(row => row.reference), ['COLLISION_HULL', 'COLLISION_JAW', 'NestedHelper']);
    assert.equal(manifest.collisions[0].id, 'sf.render.helper.collision', 'legacy hull identity stays unchanged');
    for (const name of ['COLLISION_HULL', 'COLLISION_JAW', 'NestedHelper', 'Marker']) assert.equal(byName.get(name).pipelineKey, 'non-render');
    for (const name of ['COLLISION_LOOKALIKE', 'StringHelper', 'NumericHelper']) assert.notEqual(byName.get(name).pipelineKey, 'non-render');
  });
}
