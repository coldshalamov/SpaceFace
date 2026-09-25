import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { registerEmbeddedKtx2Textures, setEmbeddedKtx2DirectSliceForBench } from '/workspace/spaceface-scratch/master-20260924u/src/render/embeddedKtx2Textures.js';
await MeshoptDecoder.ready;
const files = process.argv.slice(2);
const glbs = files.map((f) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); });
// Measures only the KTX2 source hand-off lane: the time from the plugin requesting bytes to KTX2Loader.parse receiving them,
// summed over all images (sync main-thread work: bufferView slice + copy, or one direct slice).
let lane = 0;
async function parse(ab, on) {
  setEmbeddedKtx2DirectSliceForBench(on);
  const ktx2 = { parse(buffer, onLoad) { structuredClone(buffer, { transfer: [buffer] }); onLoad(new THREE.CompressedTexture([], 4, 4)); } };
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); loader.register(registerEmbeddedKtx2Textures); loader.setKTX2Loader(ktx2);
  const t = performance.now(); await loader.parseAsync(ab.slice(0), ''); return performance.now() - t;
}
const res = { on: [], off: [] };
for (let r = 0; r < 14; r++) {
  for (const on of (r % 2 ? [true, false] : [false, true])) {
    let s = 0; for (const ab of glbs) s += await parse(ab, on);
    if (r >= 4) res[on ? 'on' : 'off'].push(s);
  }
}
const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
console.log(JSON.stringify({ n: files.length, offMs: +med(res.off).toFixed(2), onMs: +med(res.on).toFixed(2), savedMs: +(med(res.off) - med(res.on)).toFixed(2), x: +(med(res.off) / med(res.on)).toFixed(3) }));
