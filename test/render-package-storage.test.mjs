import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder as RuntimeMeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { collectRepeatedKtx2PayloadHashes, encodeRenderPackageGlb, externalizeRenderPackageKtx2 } from '../scripts/lib/renderPackageStorage.mjs';

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

test('shared KTX2 extraction preserves exact bytes and emits a package-relative content URI', async () => {
  const { io } = await fixture();
  const doc = new Document();
  doc.createBuffer();
  const payload = Buffer.alloc(512, 0x37);
  payload.set([0xab, 0x4b, 0x54, 0x58, 1, 2, 3]);
  doc.createTexture('shared').setMimeType('image/ktx2').setImage(new Uint8Array(payload));
  const original = Buffer.from(await io.writeBinary(doc));
  const refused = externalizeRenderPackageKtx2(original, new Set());
  assert.deepEqual(refused.bytes, original, 'unique textures are left embedded under the shared-only policy');
  assert.deepEqual(refused.resources, []);
  const { bytes: externalizedBytes, resources: [resource] } = externalizeRenderPackageKtx2(original);
  assert.equal(resource.uri, `../_shared/images/${resource.sha256}.ktx2`);
  assert.deepEqual(resource.bytes, payload);
  const jsonLength = externalizedBytes.readUInt32LE(12);
  const json = JSON.parse(externalizedBytes.toString('utf8', 20, 20 + jsonLength));
  assert.equal(json.images.find((entry) => entry.name === 'shared').uri, resource.uri);
  assert.equal('bufferView' in json.images.find((entry) => entry.name === 'shared'), false);
  assert.ok(externalizedBytes.length < original.length, 'removing the image bufferView reduces the package body');
});

test('odd KTX2 bytes before retained float and meshopt data preserve four-byte alignment', () => {
  const image = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x09]);
  const binary = Buffer.alloc(28, 0);
  image.copy(binary, 0);
  const floatValues = Buffer.from(new Float32Array([1.25, -2.5, 9]).buffer);
  floatValues.copy(binary, 8);
  Buffer.from([11, 12, 13, 14, 15, 16, 17, 18]).copy(binary, 20);
  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: image.length },
      { buffer: 0, byteOffset: 8, byteLength: 12 },
      { buffer: 0, byteOffset: 20, byteLength: 8, extensions: {
        EXT_meshopt_compression: { buffer: 0, byteOffset: 20, byteLength: 8, byteStride: 4, count: 2, mode: 'ATTRIBUTES' },
      } },
    ],
    accessors: [{ bufferView: 1, componentType: 5126, count: 3, type: 'SCALAR' }],
    images: [{ mimeType: 'image/ktx2', bufferView: 0 }],
  };
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.length % 4) % 4, 0x20)]);
  const out = Buffer.alloc(12 + 8 + paddedJson.length + 8 + binary.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(paddedJson.length, 12); out.writeUInt32LE(0x4e4f534a, 16); paddedJson.copy(out, 20);
  const binHeader = 20 + paddedJson.length;
  out.writeUInt32LE(binary.length, binHeader); out.writeUInt32LE(0x004e4942, binHeader + 4);
  binary.copy(out, binHeader + 8);

  const result = externalizeRenderPackageKtx2(out);
  const jsonLength = result.bytes.readUInt32LE(12);
  const compactJson = JSON.parse(result.bytes.toString('utf8', 20, 20 + jsonLength));
  const compactBinHeader = 20 + jsonLength;
  const compactBinary = result.bytes.subarray(compactBinHeader + 8, compactBinHeader + 8 + result.bytes.readUInt32LE(compactBinHeader));
  assert.deepEqual(compactBinary, binary.subarray(8), 'only image bytes and their alignment padding are removed');
  assert.equal(compactJson.bufferViews[0].byteOffset, 0);
  assert.equal(compactJson.bufferViews[1].byteOffset, 12);
  assert.equal(compactJson.bufferViews[1].extensions.EXT_meshopt_compression.byteOffset, 12);
  assert.ok(compactJson.bufferViews.every((view) => view.byteOffset % 4 === 0));
  assert.equal(compactJson.accessors[0].bufferView, 0);
});

test('only exact KTX2 payloads explicitly shared by multiple packages are externalized', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'spaceface-ktx2-shared-'));
  const payload = Buffer.from([0xab, 0x4b, 0x54, 0x58, 9, 8, 7]);
  const sha = createHash('sha256').update(payload).digest('hex');
  const makeGlb = () => {
    const json = Buffer.from(JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ byteLength: payload.length }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: payload.length }],
      images: [{ mimeType: 'image/ktx2', bufferView: 0 }],
    }));
    const jsonPad = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
    const binPad = Buffer.concat([payload, Buffer.alloc((4 - payload.length % 4) % 4)]);
    const out = Buffer.alloc(12 + 8 + jsonPad.length + 8 + binPad.length);
    out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
    out.writeUInt32LE(jsonPad.length, 12); out.writeUInt32LE(0x4e4f534a, 16); jsonPad.copy(out, 20);
    const binHeader = 20 + jsonPad.length; out.writeUInt32LE(binPad.length, binHeader);
    out.writeUInt32LE(0x004e4942, binHeader + 4); binPad.copy(out, binHeader + 8);
    return out;
  };
  try {
    await writeFile(join(root, 'a.glb'), makeGlb());
    await writeFile(join(root, 'b.glb'), makeGlb());
    const hashes = await collectRepeatedKtx2PayloadHashes([join(root, 'a.glb'), join(root, 'b.glb')]);
    assert.deepEqual([...hashes], [sha]);
  } finally { await rm(root, { recursive: true, force: true }); }
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
