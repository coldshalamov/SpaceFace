import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

import { RENDER_PACKAGE_SOURCE_SCHEMA } from '../src/contracts/renderPackage.js';
import { compileRenderPackage, normalizeFinWedgeRuntimeDefaults } from '../scripts/lib/renderPackageCompiler.mjs';

const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6x8AAAAASUVORK5CYII=', 'base64'));
const ASSET_ID = 'sf.render.fin-wedge';

function fixture() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const texture = (name) => doc.createTexture(name).setMimeType('image/png').setImage(PNG);
  const base = texture('base'), normal = texture('normal'), orm = texture('orm');
  const positions = doc.createAccessor('position').setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer);
  const normals = doc.createAccessor('normal').setType('VEC3')
    .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])).setBuffer(buffer);
  const uvs = doc.createAccessor('uv').setType('VEC2')
    .setArray(new Float32Array([0, 0, 1, 0, 0, 1])).setBuffer(buffer);
  const indices = doc.createAccessor('index').setType('SCALAR').setArray(new Uint16Array([0, 1, 2])).setBuffer(buffer);
  const scene = doc.createScene('fin');
  const semanticNodes = [];
  for (const name of ['Material_Hull', 'Material_Mechanical', 'Material_Accent']) {
    const accent = name === 'Material_Accent';
    const material = doc.createMaterial(name).setBaseColorTexture(base).setNormalTexture(normal)
      .setNormalScale(0).setMetallicRoughnessTexture(orm).setOcclusionTexture(orm).setOcclusionStrength(0)
      .setMetallicFactor(accent ? 0.6 : 0.5).setRoughnessFactor(accent ? 0.35 : 0.7)
      .setExtras({ spacefaceFinWedgeSourceDefaults: accent
        ? ['normal', 'metallicRoughness', 'occlusion'] : ['normal', 'occlusion'] });
    const primitive = doc.createPrimitive().setAttribute('POSITION', positions).setAttribute('NORMAL', normals)
      .setAttribute('TEXCOORD_0', uvs).setIndices(indices).setMaterial(material);
    const nodeName = `mesh_${name}`;
    scene.addChild(doc.createNode(nodeName).setMesh(doc.createMesh(name).addPrimitive(primitive)));
    semanticNodes.push({ id: `fin.${name}`, node: nodeName, role: 'immutable', mergeBoundary: name,
      pipelineKey: 'opaque', transparency: 'opaque', cullingGroup: 'fin', spatialClusterId: 'fin' });
  }
  const semanticManifest = { schema: RENDER_PACKAGE_SOURCE_SCHEMA, assetId: ASSET_ID, kind: 'part',
    semanticNodes, anchors: [], dynamicGroups: [], mergeGroups: [], lods: [], hlods: [], collisions: [] };
  return { doc, semanticManifest };
}

test('compiled fin keeps neutral normal coverage but restores the original accent fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-fin-defaults-'));
  try {
    const { doc, semanticManifest } = fixture();
    const source = join(root, 'source.glb'), output = join(root, 'compiled');
    await new NodeIO().write(source, doc);
    await compileRenderPackage({ assetId: ASSET_ID, sourceGlbPath: source, sourceUri: 'source.glb',
      semanticManifest, outputDir: output });
    await MeshoptDecoder.ready;
    const result = await new NodeIO().registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(join(output, 'render.glb'));
    const materials = new Map(result.getRoot().listMaterials().map((material) => [material.getName(), material]));
    for (const name of ['Material_Hull', 'Material_Mechanical']) {
      const material = materials.get(name);
      assert.ok(material.getBaseColorTexture() && material.getNormalTexture() && material.getMetallicRoughnessTexture());
      assert.equal(material.getNormalScale(), 0);
      assert.equal(material.getOcclusionTexture(), null);
      assert.ok(Math.abs(material.getMetallicFactor() - 0.5) < 1e-6);
    }
    const accent = materials.get('Material_Accent');
    assert.ok(accent.getBaseColorTexture());
    assert.equal(accent.getNormalTexture(), null);
    assert.equal(accent.getMetallicRoughnessTexture(), null);
    assert.equal(accent.getOcclusionTexture(), null);
    assert.ok(Math.abs(accent.getMetallicFactor() - 0.6) < 1e-6);
    assert.ok(Math.abs(accent.getRoughnessFactor() - 0.35) < 1e-6);
  } finally {
    const tempRoot = resolve(tmpdir()).toLowerCase() + sep;
    if (!resolve(root).toLowerCase().startsWith(tempRoot)) throw new Error('Refusing to remove a non-temporary fixture');
    await rm(root, { recursive: true, force: true });
  }
});

test('default stripping is scoped and refuses non-neutral or incomplete markers', () => {
  const other = fixture().doc;
  normalizeFinWedgeRuntimeDefaults(other, 'sf.render.other');
  assert.ok(other.getRoot().listMaterials().every((material) => material.getOcclusionTexture()));
  const oldFin = fixture().doc;
  oldFin.getRoot().listMaterials().forEach((material) => material.setExtras({}));
  normalizeFinWedgeRuntimeDefaults(oldFin, ASSET_ID);
  assert.ok(oldFin.getRoot().listMaterials().every((material) => material.getOcclusionTexture()));
  const altered = fixture().doc;
  altered.getRoot().listMaterials()[0].setOcclusionStrength(0.5);
  assert.throws(() => normalizeFinWedgeRuntimeDefaults(altered, ASSET_ID), /unexpected source defaults/);
  assert.ok(altered.getRoot().listMaterials().every((material) => material.getOcclusionTexture()),
    'validation fails before any material is altered');
  const incomplete = fixture().doc;
  incomplete.getRoot().listMaterials()[0].setExtras({});
  assert.throws(() => normalizeFinWedgeRuntimeDefaults(incomplete, ASSET_ID), /incomplete source-default/);
  const malformed = fixture().doc;
  malformed.getRoot().listMaterials().forEach((material) => material.setExtras({ spacefaceFinWedgeSourceDefaults: 'invalid' }));
  assert.throws(() => normalizeFinWedgeRuntimeDefaults(malformed, ASSET_ID), /incomplete source-default/);
});

test('shipped fin uses a block-aligned neutral normal without reintroducing AO', () => {
  const glb = readFileSync(new URL('../assets/ships/release/render-packages/fin-wedge/render.glb', import.meta.url));
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength));
  const materials = new Map(json.materials.map((material) => [material.name, material]));
  const normalIndices = [];
  for (const name of ['Material_Hull', 'Material_Mechanical']) {
    const material = materials.get(name);
    assert.equal(material.normalTexture.scale, 0);
    assert.equal(material.occlusionTexture, undefined);
    normalIndices.push(material.normalTexture.index);
  }
  assert.equal(normalIndices[0], normalIndices[1], 'the two materials share one placeholder');
  const texture = json.textures[normalIndices[0]];
  const image = json.images[texture.extensions.KHR_texture_basisu.source];
  const view = json.bufferViews[image.bufferView];
  const start = 28 + jsonLength + (view.byteOffset || 0);
  const ktx = glb.subarray(start, start + view.byteLength);
  assert.deepEqual([...ktx.subarray(0, 12)],
    [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const offset of [20, 24]) {
    const size = ktx.readUInt32LE(offset);
    assert.ok(size > 0 && size % 4 === 0, 'the compressed texture base must be block-aligned');
  }
  const accent = materials.get('Material_Accent');
  assert.equal(accent.normalTexture, undefined);
  assert.equal(accent.occlusionTexture, undefined);
});
