import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [inputPath, outputPath, reportPath] = process.argv.slice(2);
if (!inputPath || !outputPath || !reportPath) {
  throw new Error('usage: node sanitize-glb-tangents.mjs <input.glb> <output.glb> <report.json>');
}

const source = fs.readFileSync(inputPath);
if (source.toString('utf8', 0, 4) !== 'glTF' || source.readUInt32LE(4) !== 2) {
  throw new Error('input is not GLB 2.0');
}
const jsonLength = source.readUInt32LE(12);
if (source.toString('utf8', 16, 20) !== 'JSON') throw new Error('first GLB chunk is not JSON');
const gltf = JSON.parse(source.toString('utf8', 20, 20 + jsonLength));
const binaryHeader = 20 + jsonLength;
const binaryLength = source.readUInt32LE(binaryHeader);
if (source.toString('utf8', binaryHeader + 4, binaryHeader + 8) !== 'BIN\0') {
  throw new Error('second GLB chunk is not BIN');
}
const binaryOffset = binaryHeader + 8;
if (binaryOffset + binaryLength > source.length) throw new Error('invalid BIN chunk length');
const output = Buffer.from(source);

const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

function layout(accessorIndex) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor || accessor.bufferView == null) throw new Error(`accessor ${accessorIndex} has no bufferView`);
  if (accessor.componentType !== 5126) throw new Error(`accessor ${accessorIndex} is not FLOAT`);
  if (accessor.sparse) throw new Error(`sparse accessor ${accessorIndex} is unsupported`);
  const view = gltf.bufferViews?.[accessor.bufferView];
  if (!view || (view.buffer ?? 0) !== 0) throw new Error(`accessor ${accessorIndex} is not in GLB buffer 0`);
  const width = components[accessor.type];
  const packedStride = width * componentBytes[accessor.componentType];
  return {
    accessor,
    width,
    stride: view.byteStride ?? packedStride,
    offset: binaryOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
  };
}

function readVec(base, stride, index, width) {
  const offset = base + stride * index;
  return Array.from({ length: width }, (_, component) => output.readFloatLE(offset + component * 4));
}

function writeVec(base, stride, index, values) {
  const offset = base + stride * index;
  values.forEach((value, component) => output.writeFloatLE(value, offset + component * 4));
}

function normalize3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!Number.isFinite(length) || length < 1e-12) return null;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function fallbackTangent(normal) {
  const n = normalize3(normal) ?? [0, 0, 1];
  const reference = Math.abs(n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
  return normalize3([
    reference[1] * n[2] - reference[2] * n[1],
    reference[2] * n[0] - reference[0] * n[2],
    reference[0] * n[1] - reference[1] * n[0],
  ]) ?? [0, 1, 0];
}

let examined = 0;
let fallbackRepaired = 0;
let normalizedRepaired = 0;
const primitiveReceipts = [];
for (let meshIndex = 0; meshIndex < (gltf.meshes?.length ?? 0); meshIndex += 1) {
  const mesh = gltf.meshes[meshIndex];
  for (let primitiveIndex = 0; primitiveIndex < (mesh.primitives?.length ?? 0); primitiveIndex += 1) {
    const primitive = mesh.primitives[primitiveIndex];
    const tangentIndex = primitive.attributes?.TANGENT;
    const normalIndex = primitive.attributes?.NORMAL;
    if (tangentIndex == null) continue;
    if (normalIndex == null) throw new Error(`mesh ${meshIndex} primitive ${primitiveIndex} has tangent without normal`);
    const tangent = layout(tangentIndex);
    const normal = layout(normalIndex);
    if (tangent.width !== 4 || normal.width !== 3 || tangent.accessor.count !== normal.accessor.count) {
      throw new Error(`incompatible tangent/normal accessors on mesh ${meshIndex} primitive ${primitiveIndex}`);
    }
    let primitiveFallbacks = 0;
    let primitiveNormalizations = 0;
    for (let index = 0; index < tangent.accessor.count; index += 1) {
      examined += 1;
      const tangentValue = readVec(tangent.offset, tangent.stride, index, 4);
      const length = Math.hypot(tangentValue[0], tangentValue[1], tangentValue[2]);
      const handedness = Number.isFinite(tangentValue[3]) && Math.abs(tangentValue[3]) > 0.5
        ? (tangentValue[3] < 0 ? -1 : 1)
        : 1;
      if (!Number.isFinite(length) || length < 1e-6) {
        const normalValue = readVec(normal.offset, normal.stride, index, 3);
        writeVec(tangent.offset, tangent.stride, index, [...fallbackTangent(normalValue), handedness]);
        fallbackRepaired += 1;
        primitiveFallbacks += 1;
      } else if (Math.abs(length - 1) > 1e-4 || tangentValue[3] !== handedness) {
        const unit = normalize3(tangentValue);
        writeVec(tangent.offset, tangent.stride, index, [...unit, handedness]);
        normalizedRepaired += 1;
        primitiveNormalizations += 1;
      }
    }
    if (primitiveFallbacks || primitiveNormalizations) {
      primitiveReceipts.push({
        meshIndex,
        primitiveIndex,
        fallbackRepaired: primitiveFallbacks,
        normalizedRepaired: primitiveNormalizations,
      });
    }
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);
const report = {
  schema: 'spaceface.glbTangentSanitize.v1',
  input: {
    path: path.resolve(inputPath),
    bytes: source.length,
    sha256: crypto.createHash('sha256').update(source).digest('hex'),
  },
  output: {
    path: path.resolve(outputPath),
    bytes: output.length,
    sha256: crypto.createHash('sha256').update(output).digest('hex'),
  },
  examined,
  fallbackRepaired,
  normalizedRepaired,
  repaired: fallbackRepaired + normalizedRepaired,
  primitiveReceipts,
  invariant: 'JSON and all binary payload bytes remain unchanged except invalid tangent accessor XYZW components',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  outputPath,
  examined,
  fallbackRepaired,
  normalizedRepaired,
  sha256: report.output.sha256,
}));
