import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

// Apply the reviewed display to the pinned source export, without a Forge re-export.
const here = path.dirname(fileURLToPath(import.meta.url));
const baseline = path.join(here, 'baseline.glb');
const artwork = path.join(here, 'artwork-512.png');
const output = process.argv[2];
if (!output) throw Error('usage: node finalize.mjs OUTPUT.glb');
const scratch = fs.realpathSync(path.resolve('.devshots'));
const target = path.resolve(output);
const relative = path.relative(scratch, target);
if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
  throw Error('output must be a file inside .devshots');
}
const parent = fs.realpathSync(path.dirname(target));
const parentRelative = path.relative(scratch, parent);
if (parentRelative === '..' || parentRelative.startsWith(`..${path.sep}`) || path.isAbsolute(parentRelative)) {
  throw Error('output parent resolves outside .devshots');
}
const baselineBytes = fs.readFileSync(baseline);
const artworkBytes = fs.readFileSync(artwork);
for (const [file, bytes, expected] of [
  [baseline, baselineBytes, '4e144ef124fe9759d083cb2d50a4933824a5dbb259d72f7a92b4a4f93eba2e3f'],
  [artwork, artworkBytes, '0d4469309f47039c4137bc7627df2c8a745a38d4ffe9e4ea304b486e356cc91e'],
]) {
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw Error(`unexpected input hash ${file}: ${actual}`);
}
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.readBinary(baselineBytes);
const root = doc.getRoot().listScenes()[0].listChildren()[0];
if (root.getName() !== 'SF_M4_HELIOS_DOCK_ARM_ROOT') throw Error('unexpected root');
const buffer = doc.getRoot().listBuffers()[0];
const texture = doc.createTexture('station_information_art')
  .setImage(artworkBytes).setMimeType('image/png');
const material = doc.createMaterial('Material_StationInformationArtwork')
  .setBaseColorTexture(texture).setEmissiveTexture(texture)
  .setEmissiveFactor([.12, .12, .12]).setMetallicFactor(0).setRoughnessFactor(1)
  .setDoubleSided(true).setExtras({ spacefaceMaterialRole: 'signal', spacefaceFinish: 'forge-v1',
    forgeFinish: 'display_art', forgeShip: 'place_station_billboard', forgeKey: 'display_art' });
const positions = [], normals = [], uvs = [], indices = [];
const C = Math.cos(Math.PI * 35 / 180), S = Math.sin(Math.PI * 35 / 180), pivot = 4.2;
function point(x, y, z) {
  const dz = z - pivot;
  return [x, pivot + y * S + dz * C, -(y * C - dz * S)];
}
for (const side of [-1, 1]) {
  const corners = [[-6.05, -3.3], [6.05, -3.3], [6.05, 3.3], [-6.05, 3.3]];
  const texcoords = side === 1 ? [[0, 1], [1, 1], [1, 0], [0, 0]] : [[1, 1], [0, 1], [0, 0], [1, 0]];
  const base = positions.length / 3;
  corners.forEach(([x, z], i) => {
    positions.push(...point(x, side * .78, z));
    normals.push(0, side * S, -side * C);
    uvs.push(...texcoords[i]);
  });
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
const attr = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
const primitive = doc.createPrimitive()
  .setAttribute('POSITION', attr('VEC3', new Float32Array(positions)))
  .setAttribute('NORMAL', attr('VEC3', new Float32Array(normals)))
  .setAttribute('TEXCOORD_0', attr('VEC2', new Float32Array(uvs)))
  .setIndices(attr('SCALAR', new Uint16Array(indices))).setMaterial(material);
const mesh = doc.createMesh('StationInformationArtwork').addPrimitive(primitive);
for (const level of [0, 1, 2]) root.addChild(doc.createNode(`LOD${level}_StationInformationArtwork`).setMesh(mesh));

// Transform back to the untilted sign plane. Remove only triangles wholly inside
// the two covered emissive mosaics; corner navigation and other lamps remain.
function screenPoint(x, y, z) {
  const by = -z, bz = y - pivot;
  return { x, z: pivot - by * S + bz * C, y: by * C + bz * S };
}
const removed = [];
for (const level of [0, 1, 2]) for (const finish of ['Cyan', 'Warm', 'Warm_ivory']) {
  const name = `LOD${level}_Lights_${finish}`;
  const node = doc.getRoot().listNodes().find(n => n.getName() === name);
  if (!node) throw Error(`missing ${name}`);
  const p = node.getMesh().listPrimitives()[0];
  const positions = p.getAttribute('POSITION').getArray(), indices = p.getIndices().getArray(), kept = [];
  let count = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const vertices = [0, 1, 2].map(k => screenPoint(
      positions[indices[i + k] * 3], positions[indices[i + k] * 3 + 1], positions[indices[i + k] * 3 + 2]));
    const covered = vertices.every(v => Math.abs(v.x) <= 6.051 && Math.abs(v.z) <= 3.301
      && Math.abs(v.y) >= .64 && Math.abs(v.y) <= .721);
    if (covered) count++; else kept.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  const expected = level === 2 ? (finish === 'Warm' ? 16 : 8) : (finish === 'Warm' ? 48 : 24);
  if (count !== expected) throw Error(`unexpected screen triangles ${name}: ${count}, expected ${expected}`);
  removed.push({ name, removed: count, kept: kept.length / 3 });
  if (kept.length) p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new indices.constructor(kept)).setBuffer(buffer));
  else node.setMesh(null);
}
const result = await io.writeBinary(doc);
fs.writeFileSync(target, result, { flag: 'wx' });
console.log(JSON.stringify({ output, removed }));
