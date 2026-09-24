// #170 retail identity harness (derived from #168 id168.mjs). Original header: Identity harness for #168: parses each GLB with the untouched three r184 GLTFLoader (node_modules copy,
// byte-identical to the pre-patch vendor file) and with the patched vendor copy, and compares everything
// handed downstream: every KTX2 buffer given to KTX2Loader, every resolved bufferView, every geometry
// attribute / index (bytes + layout), node/mesh/material structure; and records whether the patched
// run ever materialized the GLB body.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '/workspace/spaceface-scratch/bare-20260926/node_modules/three/build/three.module.js';
import { readdirSync } from 'node:fs';
globalThis.self ??= globalThis;
// Loaders are taken from the ACTUAL retail esbuild output (captured from scripts/build-bundle.mjs):
// A = bare-master retail bundle (stock node_modules GLTFLoader), B = #168+#170 retail bundle (vendored loader).
const CAP = '/workspace/spaceface-scratch/r170-cap';
const chunk = (b, prefix) => `${CAP}/${b}/js/` + readdirSync(`${CAP}/${b}/js`).find((f) => f.startsWith(prefix + '-') && f.endsWith('.js'));
const A = process.env.R170_A || 'master', B = process.env.R170_B || 'p170';
const aMo = await import(chunk(A, 'meshopt_decoder.module')), bMo = await import(chunk(B, 'meshopt_decoder.module'));
// src/render/GLTFLoader.js is also emitted as a GLTFLoader-* chunk; pick the one owning the three addon.
function pickLoader(b) {
  const meta = JSON.parse(readFileSync(`${CAP}/${b}/metafile.json`, 'utf8'));
  const [out] = Object.entries(meta.outputs).find(([, o]) => Object.keys(o.inputs).some((i) => /(examples\/jsm|vendor\/addons)\/loaders\/GLTFLoader\.js$/.test(i)));
  return `${CAP}/${b}/js/` + out.split('/').pop();
}
const Orig = (await import(pickLoader(A))).GLTFLoader;
const Patched = (await import(pickLoader(B))).GLTFLoader;
// Production embedded-KTX2 plugin, also taken from each retail bundle (dynamic-import chunk keeps its export names).
const pluginA = (await import(chunk(A, 'embeddedKtx2Textures'))).registerEmbeddedKtx2Textures;
const pluginB = (await import(chunk(B, 'embeddedKtx2Textures'))).registerEmbeddedKtx2Textures;
const MeshoptDecoderA = aMo.MeshoptDecoder, MeshoptDecoderB = bMo.MeshoptDecoder;
await MeshoptDecoderA.ready;
const MeshoptDecoder = MeshoptDecoderB;
console.error('A', A, pickLoader(A), 'B', B, pickLoader(B));
await MeshoptDecoder.ready;
// PNG/JPEG path: record the bytes of every Blob handed to the image decoder (node cannot decode them).
let blobSink = null;
URL.createObjectURL = (blob) => { if (blobSink) blobSink.push(blob.arrayBuffer().then((b) => h(new Uint8Array(b)) + ':' + b.byteLength + ':' + blob.type)); return 'data:,'; };
URL.revokeObjectURL = () => {};
const h = (u8) => createHash('sha256').update(u8).digest('hex').slice(0, 24);
const bytesOf = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
async function run(L, ab, MeshoptDecoder, registerEmbeddedKtx2Textures) {
  const ktx = [];
  const bvs = {};
  const blobs = []; blobSink = blobs;
  const ktx2 = { parse(buffer, onLoad) { ktx.push(h(new Uint8Array(buffer)) + ':' + buffer.byteLength); structuredClone(buffer, { transfer: [buffer] }); onLoad(new THREE.CompressedTexture([], 4, 4)); } };
  const loader = new L(); loader.setMeshoptDecoder(MeshoptDecoder); loader.register(registerEmbeddedKtx2Textures); loader.setKTX2Loader(ktx2);
  let parserRef = null;
  loader.register((parser) => {
    parserRef = parser;
    const base = parser.getDependency.bind(parser);
    parser.getDependency = (type, index) => {
      const p = base(type, index);
      if (type === 'bufferView' && p && typeof p.then === 'function' && !bvs[index]) bvs[index] = p.then((b) => b ? h(new Uint8Array(b)) + ':' + b.byteLength : String(b));
      return p;
    };
    return { name: 'id168-probe' };
  });
  const origWarn = console.warn; const origErr = console.error; console.warn = () => {}; console.error = () => {};
  let gltf, err = null;
  try { gltf = await loader.parseAsync(ab, ''); } catch (e) { err = String(e && e.message || e); }
  console.warn = origWarn; console.error = origErr;
  const blobHashes = (await Promise.all(blobs)).sort();
  const bv = {}; for (const k of Object.keys(bvs).sort((a, b) => a - b)) bv[k] = await bvs[k];
  const geo = [];
  if (gltf) gltf.scene.traverse((o) => {
    const row = [o.type, o.name, o.matrix.elements.join(',')];
    if (o.geometry) {
      const g = o.geometry;
      for (const [name, a] of Object.entries(g.attributes).sort()) {
        if (a.isInterleavedBufferAttribute) row.push(`${name}:I:${a.itemSize}:${a.offset}:${a.normalized}:${a.data.stride}:${a.data.array.constructor.name}:${h(bytesOf(a.data.array))}`);
        else row.push(`${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}:${a.array.length}:${h(bytesOf(a.array))}`);
      }
      if (g.index) row.push(`index:${g.index.array.constructor.name}:${h(bytesOf(g.index.array))}`);
      row.push(JSON.stringify(g.groups), JSON.stringify(g.boundingBox), JSON.stringify(g.boundingSphere));
    }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) row.push(m.type + ':' + m.name + ':' + Object.keys(m).filter((k) => m[k] && m[k].isTexture).sort().join('|'));
    geo.push(row.join(';'));
  });
  const bin = parserRef && parserRef.extensions && parserRef.extensions.KHR_binary_glTF;
  const materialized = bin ? (('_body' in bin) ? bin._body !== null : 'n/a') : 'no-bin';
  return { err, ktx: ktx.sort(), blobs: blobHashes, bv, geo, materialized };
}
const files = process.argv.slice(2);
let nBlob = 0, same = 0, diff = 0, materialized = 0, errs = 0, nKtx = 0, nBv = 0, nGeo = 0;
for (const f of files) {
  const b = readFileSync(f); const ab = () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const o = await run(Orig, ab(), MeshoptDecoderA, pluginA); const p = await run(Patched, ab(), MeshoptDecoderB, pluginB);
  const pm = p.materialized; const po = { ...p }; delete po.materialized; delete o.materialized;
  // R170_IGNORE_BV=1: #167 stops routing embedded KTX2 images through getDependency('bufferView'), so the probe's
  // bufferView map legitimately shrinks across a #167 boundary; KTX2 bytes, blobs and geometry are still compared.
  const oc = { ...o };
  if (process.env.R170_IGNORE_BV === '1') { delete po.bv; delete oc.bv; }
  const eq = JSON.stringify(oc) === JSON.stringify(po);
  if (eq) same++; else { diff++; console.log('DIFF', f, JSON.stringify(o).length, JSON.stringify(po).length, o.err, p.err); }
  if (pm === true) materialized++;
  if (o.err) errs++;
  nKtx += o.ktx.length; nBlob += o.blobs.length; nBv += Object.keys(o.bv).length; nGeo += o.geo.length;
  console.log(`${eq ? 'SAME' : 'DIFF'} ktx=${o.ktx.length} blobs=${o.blobs.length} bv=${Object.keys(o.bv).length} nodes=${o.geo.length} bodyMaterialized=${pm} err=${o.err || '-'} ${f}`);
}
console.log(JSON.stringify({ files: files.length, same, diff, bodyMaterialized: materialized, errs, ktxBuffers: nKtx, imageBlobs: nBlob, bufferViews: nBv, nodeRows: nGeo }));
