/** Source-preserving, reviewed rivet/ring refinement. Never publishes release assets.
 * node tools/art/refine_engine_ion_small.mjs --source INPUT --out OUTPUT --blender EXE [--merge-static yes]
 * Intentionally accepts only the reviewed prepared source; reduced inputs are rejected.
 * Recover the original after promotion with binary-safe Node spawnSync('git',
 * ['cat-file','blob','99a051c97a22c95907be99928f0909d79042a56e']) and write stdout
 * to a fresh scratch GLB. Blob is reachable from commit a0e41915419d71ec9201dd9d154abc0e3fffb619.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const reviewedHash = '08b52602319f0f2c6a86eb97be351bd3fce19786e9562c83401a34cd16fdc568';
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!['--source', '--out', '--blender', '--merge-static', '--albedo-source'].includes(key) || !process.argv[i + 1] || options[key]) throw Error('Expected unique --source, --out, --blender, optional --merge-static yes and --albedo-source PNG arguments');
  options[key] = process.argv[i + 1];
}
if (!options['--source'] || !options['--out'] || !options['--blender']) throw Error('Required: --source INPUT --out OUTPUT --blender EXE');
if (options['--merge-static'] && options['--merge-static'] !== 'yes') throw Error('--merge-static must be yes when supplied');
const sourcePath = await fs.realpath(options['--source']);
const out = path.join(await fs.realpath(path.dirname(path.resolve(options['--out']))), path.basename(options['--out']));
const sidecar = `${out}.provenance.json`;
const key = value => process.platform === 'win32' ? value.toLowerCase() : value;
for (const candidate of [out, sidecar]) {
  if (key(candidate) === key(sourcePath)) throw Error('Output/sidecar collides with source');
  try { await fs.lstat(candidate); throw Error(`Refusing to overwrite existing path: ${candidate}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const originalBytes = await fs.readFile(sourcePath);
let albedoImage, albedoProvenance;
if (options['--albedo-source']) {
  const albedoPath = await fs.realpath(options['--albedo-source']);
  const input = await fs.readFile(albedoPath);
  const expectedHash = 'bcd4a200cea381d8435be7da6164c0399974bdfe7c8674ab1a824b67547bf623';
  if (hash(input) !== expectedHash) throw Error('Unsupported albedo: use the reviewed retained generated original');
  const metadata = await sharp(input).metadata();
  assert.equal(metadata.width, 1254); assert.equal(metadata.height, 1254); assert.equal(metadata.channels, 3);
  const intermediate = await sharp(input).resize(1024, 1024, { kernel: 'lanczos3' }).removeAlpha().png().toBuffer();
  albedoImage = await sharp(intermediate).resize(256, 256, { kernel: 'lanczos3' }).png().toBuffer();
  assert.equal(hash(albedoImage), 'ab8a163b1c207998060b85f0a398190300e0553dfd281f01d63c43e3034f31fd', 'Derived albedo differs from the reviewed image');
  albedoProvenance = { source: albedoPath, sourceHash: expectedHash, derivedHash: hash(albedoImage), dimensions: [256, 256], format: 'RGB8 PNG', resize: 'sharp Lanczos3: 1254 to 1024 to 256', generationProvenance: 'tools/art/sources/engine_ion_small/provenance.json' };
}
if (hash(originalBytes) !== reviewedHash) throw Error('Unsupported source: use the reviewed original prepared engine, never a release or already reduced output');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.readBinary(originalBytes);
assert.equal(doc.getRoot().listScenes()[0].getExtras().spacefaceAsset.assetId, 'SF_ENGINE_ION_SMALL');
const node = doc.getRoot().listNodes().find(n => n.getName() === 'engine_ion_small_Material_Mechanical_Merged');
assert(node); assert.deepEqual(node.getScale(), [1, 1, 1]);
assert.equal(node.getMesh().listPrimitives().length, 1);
const primitive = node.getMesh().listPrimitives()[0], pos = primitive.getAttribute('POSITION'), idx = primitive.getIndices();
const keys = new Map(), parent = [], tris = [];
const root = start => { let i = start; while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
const join = (a, b) => { a = root(a); b = root(b); if (a !== b) parent[b] = a; };
for (let t = 0; t < idx.getCount(); t += 3) {
  const tri = [];
  for (let j = 0; j < 3; j++) {
    const k = pos.getElement(idx.getScalar(t + j), []).map(v => Math.round(v * 1e6)).join(',');
    let i = keys.get(k); if (i === undefined) { i = parent.length; keys.set(k, i); parent.push(i); } tri.push(i);
  }
  join(tri[0], tri[1]); join(tri[1], tri[2]); tris.push(tri);
}
const groups = new Map();
for (let t = 0; t < tris.length; t++) { const r = root(tris[t][0]); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); }
const components = [];
for (const list of groups.values()) if ([640, 960].includes(list.length)) {
  const vmap = new Map(), verts = [], uvs = {}, normals = [], faces = [];
  for (const s of primitive.listSemantics()) if (s.startsWith('TEXCOORD_')) uvs[s] = [];
  for (const t of list) {
    const face = [];
    for (let k = 0; k < 3; k++) {
      const old = idx.getScalar(t * 3 + k);
      if (!vmap.has(old)) {
        vmap.set(old, verts.length); verts.push(pos.getElement(old, [])); normals.push(primitive.getAttribute('NORMAL').getElement(old, []));
        for (const s in uvs) uvs[s].push(primitive.getAttribute(s).getElement(old, []));
      }
      face.push(vmap.get(old));
    }
    faces.push(face);
  }
  components.push({ name: (list.length === 640 ? 'rivet_' : 'ring_') + components.length, triangles: list, verts, faces, uvs, normals });
}
assert.equal(components.filter(c => c.name.startsWith('rivet')).length, 12);
assert.equal(components.filter(c => c.name.startsWith('ring')).length, 3);
// The exact source hash binds these triangle IDs and component placement to the reviewed source.
const scratch = await fs.mkdtemp(path.join(path.dirname(out), '.engine-refine-'));
await fs.writeFile(path.join(scratch, 'components-source.json'), JSON.stringify({ sourceHash: reviewedHash, components }));
const blender = await fs.realpath(options['--blender']);
const helper = fileURLToPath(new URL('./blender/refine_engine_ion_small.py', import.meta.url));
const run = spawnSync(blender, ['-b', '--python-exit-code', '1', '--python', helper, '--', scratch], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
if (run.status !== 0) throw Error(`Blender failed; intermediates retained at ${scratch}\n${run.stderr}\n${run.stdout}`);
const simplified = await io.read(path.join(scratch, 'rivets-rings-components.glb'));
const removed = new Set(components.flatMap(c => c.triangles)), semantics = primitive.listSemantics();
const arrays = Object.fromEntries(semantics.map(s => [s, []])), indices = [], used = new Map();
for (let t = 0; t < idx.getCount() / 3; t++) if (!removed.has(t)) for (let k = 0; k < 3; k++) {
  const old = idx.getScalar(t * 3 + k);
  if (!used.has(old)) { used.set(old, used.size); for (const s of semantics) arrays[s].push(...primitive.getAttribute(s).getElement(old, [])); }
  indices.push(used.get(old));
}
assert.equal(indices.length / 3, 2008);
let nextVertex = used.size;
assert.equal(simplified.getRoot().listNodes().length, 15);
for (const c of components) {
  const n = simplified.getRoot().listNodes().find(n => n.getName() === c.name); assert(n);
  assert.deepEqual(n.getMatrix(), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const p = n.getMesh().listPrimitives()[0]; assert.equal(p.getIndices().getCount() / 3, c.name.startsWith('rivet') ? 32 : 288);
  const sourceMin = [0, 1, 2].map(axis => Math.min(...c.verts.map(v => v[axis])));
  const sourceMax = [0, 1, 2].map(axis => Math.max(...c.verts.map(v => v[axis])));
  const targetPosition = p.getAttribute('POSITION');
  const targetMin = [Infinity, Infinity, Infinity], targetMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < targetPosition.getCount(); i++) {
    const v = targetPosition.getElement(i, []);
    for (let axis = 0; axis < 3; axis++) { targetMin[axis] = Math.min(targetMin[axis], v[axis]); targetMax[axis] = Math.max(targetMax[axis], v[axis]); }
  }
  for (let axis = 0; axis < 3; axis++) {
    // Reviewed collapse moves extremities outward by at most .000844 and inward by .005341 source units.
    assert(targetMin[axis] >= sourceMin[axis] - .001 && targetMax[axis] <= sourceMax[axis] + .001, `Component escaped bounds: ${c.name}`);
    assert(targetMin[axis] <= sourceMin[axis] + .006 && targetMax[axis] >= sourceMax[axis] - .006, `Component shrank beyond reviewed extent: ${c.name}`);
    assert(Math.abs(targetMin[axis] + targetMax[axis] - sourceMin[axis] - sourceMax[axis]) < .02, `Component shifted: ${c.name}`);
  }
  for (const s of semantics) {
    const a = p.getAttribute(s); assert(a); assert.equal(a.getCount(), p.getAttribute('POSITION').getCount());
    for (let i = 0; i < a.getCount(); i++) { const values = a.getElement(i, []); assert(values.every(Number.isFinite)); arrays[s].push(...values); }
  }
  for (const v of p.getIndices().getArray()) { assert(v < p.getAttribute('POSITION').getCount()); indices.push(v + nextVertex); }
  nextVertex += p.getAttribute('POSITION').getCount();
}
const oldAccessors = [idx, ...primitive.listAttributes()], buffer = doc.getRoot().listBuffers()[0];
primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer));
for (const s of semantics) primitive.setAttribute(s, doc.createAccessor().setType(primitive.getAttribute(s).getType()).setArray(new Float32Array(arrays[s])).setBuffer(buffer));
for (const a of oldAccessors) if (a.listParents().every(p => p === doc.getRoot())) a.dispose();
if (options['--merge-static'] === 'yes') mergeStaticDetails(doc);
if (albedoImage) {
  const color = doc.getRoot().listMaterials()[0].getBaseColorTexture();
  assert(color);
  for (const material of doc.getRoot().listMaterials()) {
    if (material.getBaseColorTexture()) assert.equal(material.getBaseColorTexture(), color);
    assert.notEqual(material.getNormalTexture(), color);
    assert.notEqual(material.getMetallicRoughnessTexture(), color);
  }
  color.setImage(albedoImage).setMimeType('image/png');
}
if (hash(await fs.readFile(sourcePath)) !== reviewedHash) throw Error('Source changed during build');
const bytes = await io.writeBinary(doc);
// Exclusive creation prevents a racing invocation from overwriting either output.
// Open first so cleanup only removes files this invocation actually created.
let outputHandle, provenanceHandle;
try {
  outputHandle = await fs.open(out, 'wx');
  await outputHandle.writeFile(bytes); await outputHandle.close();
  provenanceHandle = await fs.open(sidecar, 'wx');
  await provenanceHandle.writeFile(JSON.stringify({ recipe: options['--merge-static'] ? 'engine-ion-small-rivets-rings-static-merge-v1' : 'engine-ion-small-rivets-rings-v1', source: sourcePath, sourceHash: reviewedHash, sourceGitBlob: '99a051c97a22c95907be99928f0909d79042a56e', outputHash: hash(bytes), albedo: albedoProvenance, blender: blender, blenderVersion: '5.1', scratch, beforeTriangles: 14192, afterTriangles: 4880, primitives: options['--merge-static'] ? 7 : 12, untouchedMechanicalTriangles: 2008, repeatedReducedInput: 'rejected; rebuild from original source' }, null, 2));
  await provenanceHandle.close();
} catch (error) {
  if (provenanceHandle) { await provenanceHandle.close().catch(() => {}); await fs.unlink(sidecar); }
  if (outputHandle) { await outputHandle.close().catch(() => {}); await fs.unlink(out); }
  throw error;
}
console.log(JSON.stringify({ output: out, sha256: hash(bytes), scratch, sourceTriangles: 4880 }));

function mergeStaticDetails(document) {
  // Exact reviewed groups only. Never merge drive hooks, LOD hull or the untagged hull patch.
  const groups = [
    ['engine_ion_small_Material_Mechanical_Merged', 'DET_soot_vent_band', 'DET_jury_bolt', 'DET_jury_bolt.001', 'DET_cable_tie'],
    ['DET_owner_stencil', 'DET_heat_discolor'],
  ];
  for (const names of groups) {
    const nodes = names.map(name => document.getRoot().listNodes().find(n => n.getName() === name));
    assert(nodes.every(Boolean));
    const host = nodes[0], hp = host.getMesh().listPrimitives()[0], semantics = hp.listSemantics();
    const arrays = Object.fromEntries(semantics.map(s => [s, []])), indices = []; let offset = 0;
    for (const n of nodes) {
      assert.deepEqual(n.getMatrix(), host.getMatrix()); assert.equal(n.listChildren().length, 0);
      assert.deepEqual(n.getExtras(), { spaceface_chamfered: true });
      assert.equal(n.getMesh().listPrimitives().length, 1);
      const p = n.getMesh().listPrimitives()[0]; assert.equal(p.getMaterial(), hp.getMaterial());
      for (const s of semantics) {
        let a = p.getAttribute(s);
        if (!a) {
          assert.equal(s, 'TEXCOORD_1');
          for (const info of [p.getMaterial().getBaseColorTextureInfo(), p.getMaterial().getNormalTextureInfo(), p.getMaterial().getMetallicRoughnessTextureInfo()]) if (info) assert.equal(info.getTexCoord(), 0);
          a = p.getAttribute('TEXCOORD_0');
        }
        arrays[s].push(...a.getArray());
      }
      for (const i of p.getIndices().getArray()) indices.push(i + offset);
      offset += p.getAttribute('POSITION').getCount();
    }
    const buffer = document.getRoot().listBuffers()[0];
    hp.setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer));
    for (const s of semantics) hp.setAttribute(s, document.createAccessor().setType(hp.getAttribute(s).getType()).setArray(new Float32Array(arrays[s])).setBuffer(buffer));
    for (const n of nodes.slice(1)) { const mesh = n.getMesh(); n.dispose(); mesh.dispose(); }
  }
  for (const a of document.getRoot().listAccessors()) if (a.listParents().every(p => p === document.getRoot())) a.dispose();
}
