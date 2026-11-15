import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

// Add the service-pylon support to the pinned source without a full Forge re-export.
const here = path.dirname(fileURLToPath(import.meta.url));
const baseline = fs.readFileSync(path.join(here, 'baseline.glb'));
if (createHash('sha256').update(baseline).digest('hex') !== '45a72f3d578576159aa7b9e2c7cde8adce155e5a58b0d80eaa6ab9df979a14c3') throw Error('unexpected baseline');
const output = process.argv[2];
if (!output) throw Error('usage: node finalize.mjs OUTPUT.glb');
const scratch = fs.realpathSync(path.resolve('.devshots')), target = path.resolve(output);
for (const p of [target, fs.realpathSync(path.dirname(target))]) {
  const rel = path.relative(scratch, p);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw Error('output must be inside .devshots');
}
if (target === scratch) throw Error('output must be a file');
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const d = await io.readBinary(baseline), buffer = d.getRoot().listBuffers()[0];
const g = new THREE.BoxGeometry(7.5, .8, .8);
g.translate(71.5, -1.2, 0);
g.computeTangents();
const attrs = { POSITION: g.attributes.position.array, NORMAL: g.attributes.normal.array,
  TEXCOORD_0: g.attributes.uv.array, TANGENT: g.attributes.tangent.array };
for (const lod of [0, 1, 2]) {
  const n = d.getRoot().listNodes().find(n => n.getName() === `LOD${lod}_Armor`);
  if (!n || n.getMesh().listPrimitives().length !== 1) throw Error('unexpected armor node');
  const p = n.getMesh().listPrimitives()[0], base = p.getAttribute('POSITION').getCount();
  if (p.getMaterial()?.getName() !== 'Material_Armor') throw Error('unexpected armor material');
  for (const [semantic, addition] of Object.entries(attrs)) {
    const old = p.getAttribute(semantic);
    if (!old || !(old.getArray() instanceof Float32Array)) throw Error(`unexpected attribute ${semantic}`);
    const out = new Float32Array(old.getArray().length + addition.length);
    out.set(old.getArray()); out.set(addition, old.getArray().length);
    p.setAttribute(semantic, d.createAccessor().setType(old.getType()).setArray(out).setBuffer(buffer));
  }
  const old = p.getIndices().getArray();
  if (!(old instanceof Uint16Array) || base + g.attributes.position.count > 65535) throw Error('unexpected index capacity');
  const out = new Uint16Array(old.length + g.index.array.length);
  out.set(old); out.set(Array.from(g.index.array, x => x + base), old.length);
  p.setIndices(d.createAccessor().setType('SCALAR').setArray(out).setBuffer(buffer));
}
fs.writeFileSync(target, await io.writeBinary(d), { flag: 'wx' });
console.log(`wrote ${target}`);
