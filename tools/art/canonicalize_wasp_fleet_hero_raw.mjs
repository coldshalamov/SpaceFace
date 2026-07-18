#!/usr/bin/env node
// Canonicalize scratch-only Wasp GLB primitive ordering after Blender export.
//
// Blender may emit semantically identical vertices and triangles in a different order between
// invocations. That is harmless at runtime but defeats reproducible receipts. This stage sorts the
// complete vertex tuples, remaps indices, and sorts triangles without changing winding or topology.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CANDIDATE_ROOT = resolve(ROOT, '.devshots/graphics/wasp-fleet-hero-v1/candidate');
const DEFAULT_INPUTS = [
  resolve(CANDIDATE_ROOT, 'wasp_production_v1_golden.glb'),
  resolve(CANDIDATE_ROOT, 'wasp_production_v1_golden_lod1.glb'),
  resolve(CANDIDATE_ROOT, 'wasp_production_v1_golden_lod2.glb'),
];
const inputs = process.argv.slice(2).length ? process.argv.slice(2).map((value) => resolve(value)) : DEFAULT_INPUTS;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const files = [];

for (const input of inputs) {
  assertWithin(input, CANDIDATE_ROOT);
  if (!input.toLowerCase().endsWith('.glb') || !existsSync(input)) throw new Error(`missing scratch GLB: ${input}`);
  const before = receipt(input);
  const document = await io.read(input);
  const primitiveReports = [];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const [primitiveIndex, primitive] of mesh.listPrimitives().entries()) {
      primitiveReports.push(canonicalizePrimitive(document, primitive, `${mesh.getName() || 'mesh'}:${primitiveIndex}`));
    }
  }
  const temporary = `${input}.canonical.tmp.glb`;
  if (existsSync(temporary)) unlinkSync(temporary);
  await io.write(temporary, document);
  renameSync(temporary, input);
  files.push({
    path: relative(ROOT, input).replaceAll('\\', '/'),
    before,
    after: receipt(input),
    primitives: primitiveReports,
  });
}

const report = {
  schema: 'spaceface.waspFleetHero.rawCanonicalization.v1',
  status: 'scratch_candidate_canonicalized',
  method: 'repair-isolated-degenerate-tangents-sort-complete-vertex-tuples-remap-indices-cyclic-triangle-minimum-sort-triangles',
  files,
};
const reportPath = resolve(CANDIDATE_ROOT, 'canonical-raw-report.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, report: reportPath, files: files.length }, null, 2)}\n`);

function canonicalizePrimitive(document, primitive, label) {
  const semantics = primitive.listSemantics().slice().sort();
  if (!semantics.length || !semantics.includes('POSITION')) throw new Error(`${label}: POSITION attribute missing`);
  const attributes = semantics.map((semantic) => {
    const accessor = primitive.getAttribute(semantic);
    const array = accessor?.getArray();
    if (!accessor || !array) throw new Error(`${label}: ${semantic} array missing`);
    return { semantic, accessor, array, size: accessor.getElementSize(), constructor: array.constructor };
  });
  const oldVertexCount = attributes[0].accessor.getCount();
  for (const attribute of attributes) {
    if (attribute.accessor.getCount() !== oldVertexCount) throw new Error(`${label}: attribute count mismatch`);
  }
  const repairedTangents = repairDegenerateTangents(attributes, label);

  const indicesAccessor = primitive.getIndices();
  const indicesArray = indicesAccessor?.getArray();
  if (!indicesAccessor || !indicesArray) throw new Error(`${label}: indexed triangles required`);
  if (primitive.getMode() !== 4 || indicesArray.length % 3 !== 0) throw new Error(`${label}: triangle primitive required`);

  const keyByOldIndex = new Array(oldVertexCount);
  const representativeByKey = new Map();
  for (let oldIndex = 0; oldIndex < oldVertexCount; oldIndex++) {
    const key = attributes.map(({ semantic, array, size }) => {
      const values = [];
      for (let component = 0; component < size; component++) values.push(numberKey(array[oldIndex * size + component]));
      return `${semantic}:${values.join(',')}`;
    }).join('|');
    keyByOldIndex[oldIndex] = key;
    if (!representativeByKey.has(key)) representativeByKey.set(key, oldIndex);
  }

  const sortedKeys = [...representativeByKey.keys()].sort();
  const canonicalIndexByKey = new Map(sortedKeys.map((key, index) => [key, index]));
  for (const attribute of attributes) {
    const canonical = new attribute.constructor(sortedKeys.length * attribute.size);
    for (let newIndex = 0; newIndex < sortedKeys.length; newIndex++) {
      const oldIndex = representativeByKey.get(sortedKeys[newIndex]);
      for (let component = 0; component < attribute.size; component++) {
        canonical[newIndex * attribute.size + component] = attribute.array[oldIndex * attribute.size + component];
      }
    }
    attribute.accessor.setArray(canonical);
  }

  const triangles = [];
  let maximumIndex = 0;
  for (let offset = 0; offset < indicesArray.length; offset += 3) {
    const remapped = [0, 1, 2].map((component) => {
      const oldIndex = indicesArray[offset + component];
      if (oldIndex >= oldVertexCount) throw new Error(`${label}: index ${oldIndex} out of range`);
      return canonicalIndexByKey.get(keyByOldIndex[oldIndex]);
    });
    const triangle = rotateTriangleToMinimum(remapped);
    maximumIndex = Math.max(maximumIndex, ...triangle);
    triangles.push(triangle);
  }
  triangles.sort(compareTriples);
  const IndexArray = maximumIndex <= 65535 ? Uint16Array : Uint32Array;
  const canonicalIndices = new IndexArray(triangles.length * 3);
  for (let index = 0; index < triangles.length; index++) canonicalIndices.set(triangles[index], index * 3);
  indicesAccessor.setArray(canonicalIndices);

  return {
    label,
    semantics,
    repairedTangents,
    verticesBefore: oldVertexCount,
    verticesAfter: sortedKeys.length,
    exactDuplicateVerticesRemoved: oldVertexCount - sortedKeys.length,
    triangles: triangles.length,
  };
}

function repairDegenerateTangents(attributes, label) {
  const tangent = attributes.find((attribute) => attribute.semantic === 'TANGENT');
  if (!tangent) return 0;
  const normal = attributes.find((attribute) => attribute.semantic === 'NORMAL');
  if (!normal || tangent.size !== 4 || normal.size !== 3) throw new Error(`${label}: tangent repair requires TANGENT vec4 and NORMAL vec3`);
  let repaired = 0;
  for (let index = 0; index < tangent.accessor.getCount(); index++) {
    const tangentOffset = index * 4;
    const tx = tangent.array[tangentOffset];
    const ty = tangent.array[tangentOffset + 1];
    const tz = tangent.array[tangentOffset + 2];
    const tangentLength = Math.hypot(tx, ty, tz);
    if (tangentLength > 1e-8) continue;

    const normalOffset = index * 3;
    let nx = normal.array[normalOffset];
    let ny = normal.array[normalOffset + 1];
    let nz = normal.array[normalOffset + 2];
    const normalLength = Math.hypot(nx, ny, nz);
    if (normalLength <= 1e-8) throw new Error(`${label}: vertex ${index} has both degenerate tangent and normal`);
    nx /= normalLength;
    ny /= normalLength;
    nz /= normalLength;

    // Choose the least-aligned cardinal axis, then cross it with the normal. This creates a
    // deterministic, unit-length fallback for isolated UV singularities without changing topology.
    let rx = 0;
    let ry = 0;
    let rz = 0;
    if (Math.abs(nx) <= Math.abs(ny) && Math.abs(nx) <= Math.abs(nz)) rx = 1;
    else if (Math.abs(ny) <= Math.abs(nz)) ry = 1;
    else rz = 1;
    let fx = ry * nz - rz * ny;
    let fy = rz * nx - rx * nz;
    let fz = rx * ny - ry * nx;
    const fallbackLength = Math.hypot(fx, fy, fz);
    fx /= fallbackLength;
    fy /= fallbackLength;
    fz /= fallbackLength;
    tangent.array[tangentOffset] = fx;
    tangent.array[tangentOffset + 1] = fy;
    tangent.array[tangentOffset + 2] = fz;
    tangent.array[tangentOffset + 3] = tangent.array[tangentOffset + 3] < 0 ? -1 : 1;
    repaired++;
  }
  return repaired;
}

function rotateTriangleToMinimum([a, b, c]) {
  if (a <= b && a <= c) return [a, b, c];
  if (b <= a && b <= c) return [b, c, a];
  return [c, a, b];
}

function compareTriples(left, right) {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function numberKey(value) {
  if (!Number.isFinite(value)) throw new Error(`non-finite vertex component: ${value}`);
  if (Object.is(value, -0)) return '-0';
  return String(value);
}

function receipt(path) {
  const bytes = readFileSync(path);
  return {
    bytes: statSync(path).size,
    sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase(),
  };
}

function assertWithin(path, parent) {
  const rel = relative(parent, path);
  if (!rel || rel.startsWith('..') || resolve(parent, rel) !== resolve(path)) {
    throw new Error(`refusing path outside scratch candidate: ${path}`);
  }
}
