import test from 'node:test';
import assert from 'node:assert/strict';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder as RuntimeMeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { encodeRenderPackageGlb } from '../scripts/lib/renderPackageStorage.mjs';

async function fixture() {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
  });
  const doc = new Document(), buffer = doc.createBuffer(), count = 4095;
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  const tangents = new Float32Array(count * 4), uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    positions.set([i % 29, Math.sin(i * 0.031), Math.floor(i / 29)], i * 3);
    const x = Math.sin(i * 0.27), y = Math.cos(i * 0.19), z = 0.5, length = Math.hypot(x, y, z);
    normals.set([x / length, y / length, z / length], i * 3);
    tangents.set([y / length, -x / length, z / length, i % 2 ? -1 : 1], i * 4);
    uv.set([i / count, i % 3 / 2], i * 2);
  }
  const attribute = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const material = doc.createMaterial('Lacquer').setExtras({ spacefaceRemasterGeometry: true });
  const primitive = doc.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', attribute('VEC3', positions)).setAttribute('NORMAL', attribute('VEC3', normals))
    .setAttribute('TANGENT', attribute('VEC4', tangents)).setAttribute('TEXCOORD_0', attribute('VEC2', uv))
    .setIndices(attribute('SCALAR', Uint16Array.from({ length: count }, (_, i) => i)));
  const node = doc.createNode('LOD0_Hull').setMesh(doc.createMesh('Hull').addPrimitive(primitive))
    .setExtras({ spacefaceLod: 0, semanticId: 'fixture-hull' });
  doc.createScene('Fixture').addChild(node);
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  return { io, doc, positions, normals, tangents, uv };
}

test('ordinary package output remains byte-identical', async () => {
  const { io, doc } = await fixture();
  const expected = Buffer.from(await io.writeBinary(doc));
  assert.deepEqual(await encodeRenderPackageGlb(io, doc), expected);
});

test('oversized float-normal package retains exact positions, UVs, topology and runtime markers', async () => {
  const { io, doc, positions, normals, tangents, uv } = await fixture();
  const original = Buffer.from(await io.writeBinary(doc));
  const compact = await encodeRenderPackageGlb(io, doc, { maxBytes: original.length - 1 });
  assert.ok(compact.length < original.length);
  const decoded = await io.readBinary(compact);
  const node = decoded.getRoot().listNodes()[0], primitive = node.getMesh().listPrimitives()[0];
  assert.deepEqual(primitive.getAttribute('POSITION').getArray(), positions);
  assert.deepEqual(primitive.getAttribute('TEXCOORD_0').getArray(), uv);
  assert.deepEqual(node.getExtras(), { spacefaceLod: 0, semanticId: 'fixture-hull' });
  assert.equal(primitive.getMaterial().getExtras().spacefaceRemasterGeometry, true);
  const indices = primitive.getIndices().getArray();
  for (let i = 0; i < indices.length; i++) assert.equal(indices[i], i);

  const gltf = await new GLTFLoader().setMeshoptDecoder(RuntimeMeshoptDecoder)
    .parseAsync(compact.buffer.slice(compact.byteOffset, compact.byteOffset + compact.byteLength), '');
  const mesh = gltf.scene.getObjectByName('LOD0_Hull');
  assert.equal(mesh.userData.semanticId, 'fixture-hull');
  assert.deepEqual(mesh.geometry.attributes.position.array, positions);
  const normal = mesh.geometry.attributes.normal, tangent = mesh.geometry.attributes.tangent;
  for (let i = 0; i < normal.count; i++) {
    const x = normal.getX(i), y = normal.getY(i), z = normal.getZ(i);
    const dot = (x * normals[i * 3] + y * normals[i * 3 + 1] + z * normals[i * 3 + 2]) / Math.hypot(x, y, z);
    assert.ok(Math.acos(Math.max(-1, Math.min(1, dot))) < 0.035, 'shipping normal filter exceeds two degrees');
    assert.equal(tangent.getW(i), tangents[i * 4 + 3]);
  }
});

test('an unachievable file limit fails without lowering geometric precision further', async () => {
  const { io, doc } = await fixture();
  await assert.rejects(encodeRenderPackageGlb(io, doc, { maxBytes: 1 }), /remains above.*file limit/);
});

test('static storage fallback never applies animation filters to authored motion', async () => {
  const { io, doc } = await fixture();
  const buffer = doc.getRoot().listBuffers()[0];
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1])).setBuffer(buffer);
  const output = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 0.1234567, 0, 0])).setBuffer(buffer);
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output);
  const channel = doc.createAnimationChannel().setSampler(sampler).setTargetNode(doc.getRoot().listNodes()[0]).setTargetPath('translation');
  doc.createAnimation().addSampler(sampler).addChannel(channel);
  const original = Buffer.from(await io.writeBinary(doc));
  await assert.rejects(encodeRenderPackageGlb(io, doc, { maxBytes: original.length - 1 }), /preserve animation precision/);
  assert.deepEqual(output.getArray(), new Float32Array([0, 0, 0, 0.1234567, 0, 0]));
});
