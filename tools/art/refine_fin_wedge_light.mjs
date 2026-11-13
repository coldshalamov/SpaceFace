// Called by export_fin_wedge.py --light-only-from. Preserve the prepared source's
// authored body, UVs, materials, markers and transforms; replace only the light mesh.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const [sourcePath, geometryPath, outputPath] = process.argv.slice(2);
if (!sourcePath || !geometryPath || !outputPath) {
  throw new Error('Usage: refine_fin_wedge_light.mjs <prepared-source.glb> <light-geometry.glb> <output.glb>');
}
const pathKey = async path => {
  const absolute = resolve(path);
  let canonical;
  try { canonical = await realpath(absolute); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    canonical = join(await realpath(dirname(absolute)), basename(absolute));
  }
  return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
};
const inputs = new Set(await Promise.all([sourcePath, geometryPath].map(pathKey)));
for (const path of [outputPath, `${outputPath}.provenance.json`]) {
  assert(!inputs.has(await pathKey(path)), 'Output or sidecar path would overwrite an input');
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const sourceBytes = await readFile(sourcePath);
const source = await io.readBinary(sourceBytes);
const geometry = await io.read(geometryPath);
assert.equal(source.getRoot().getDefaultScene()?.getExtras()?.spacefaceAsset?.assetId, 'SF_FIN_WEDGE');
const nodes = source.getRoot().listNodes().filter(node => node.getName() === 'Wedge_Edge_Light');
assert.equal(nodes.length, 1, 'Expected one authored wedge light');
const node = nodes[0];
// Release nodes carry quantization transforms. Accept the unquantized authoring
// source only, so new source-space vertices cannot accidentally be scaled twice.
assert.deepEqual(node.getScale(), [1, 1, 1], 'Use the prepared source, not a quantized release GLB');
assert.equal(node.getMesh()?.listPrimitives().length, 1);
const primitive = node.getMesh().listPrimitives()[0];
assert.equal(primitive.getMaterial()?.getName(), 'Material_Accent');
const replacement = geometry.getRoot().listNodes()
  .find(candidate => candidate.getName() === 'FinLight_Refinement')?.getMesh()?.listPrimitives()[0];
assert(replacement, 'Missing generated light geometry');
assert.equal(replacement.getIndices().getCount() / 3, 28);
for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT']) {
  assert(replacement.getAttribute(semantic), `Missing generated ${semantic}`);
}
const beforeTriangles = primitive.getIndices().getCount() / 3;
const obsolete = [primitive.getIndices(), ...primitive.listAttributes()];
const buffer = source.getRoot().listBuffers()[0];
const copy = accessor => source.createAccessor()
  .setType(accessor.getType()).setNormalized(accessor.getNormalized())
  .setArray(accessor.getArray().slice()).setBuffer(buffer);
primitive.setIndices(copy(replacement.getIndices()));
for (const semantic of primitive.listSemantics()) primitive.setAttribute(semantic, null);
for (const semantic of replacement.listSemantics()) {
  primitive.setAttribute(semantic, copy(replacement.getAttribute(semantic)));
}
// Avoid accumulating dead light buffers when the same source is refined again.
for (const accessor of obsolete) {
  if (accessor.listParents().every(parent => parent === source.getRoot())) accessor.dispose();
}
const outputBytes = await io.writeBinary(source);
await writeFile(outputPath, outputBytes);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await writeFile(`${outputPath}.provenance.json`, `${JSON.stringify({
  recipe: 'fin-wedge-narrow-octagonal-light-v1',
  sourcePath, sourceSha256: hash(sourceBytes),
  geometryPath, geometrySha256: hash(await readFile(geometryPath)),
  outputSha256: hash(outputBytes), beforeTriangles, afterTriangles: 28,
  scope: 'Only Wedge_Edge_Light primitive attributes and indices; no root tab, materials or placement edits.',
}, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, beforeTriangles, afterTriangles: 28, bytes: outputBytes.length }));
