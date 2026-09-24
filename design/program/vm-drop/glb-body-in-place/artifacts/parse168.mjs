// #168 lane bench: stock r184 GLTFLoader (node_modules copy == pre-patch vendor) vs patched vendor copy,
// same plugins as production render packages (meshopt + embedded KTX2 plugin; KTX2Loader stubbed to
// transfer like the real one). Reports the synchronous parse() block (where the GLB body memcpy lived)
// and the whole parse, summed over the given packages; interleaved, JIT-warmed.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader as Orig } from '/workspace/spaceface-scratch/master-20260924u/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFLoader as Patched } from '/workspace/spaceface-scratch/master-20260924u/vendor/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '/workspace/spaceface-scratch/master-20260924u/vendor/addons/libs/meshopt_decoder.module.js';
import { registerEmbeddedKtx2Textures } from '/workspace/spaceface-scratch/master-20260924u/src/render/embeddedKtx2Textures.js';
await MeshoptDecoder.ready;
const files = process.argv.slice(2);
const glbs = files.map((f) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); });
function parse(L, ab) {
  const ktx2 = { parse(buffer, onLoad) { structuredClone(buffer, { transfer: [buffer] }); onLoad(new THREE.CompressedTexture([], 4, 4)); } };
  const loader = new L(); loader.setMeshoptDecoder(MeshoptDecoder); loader.register(registerEmbeddedKtx2Textures); loader.setKTX2Loader(ktx2);
  return new Promise((resolve, reject) => {
    const t0 = performance.now(); let sync = 0;
    loader.parse(ab, '', () => resolve({ sync, whole: performance.now() - t0 }), reject);
    sync = performance.now() - t0;
  });
}
const res = { orig: { sync: [], whole: [] }, patched: { sync: [], whole: [] } };
const ROUNDS = +(process.env.ROUNDS || 14), WARM = +(process.env.WARM || 4);
for (let r = 0; r < ROUNDS; r++) {
  for (const k of (r % 2 ? ['patched', 'orig'] : ['orig', 'patched'])) {
    let s = 0, w = 0;
    for (const ab of glbs) { const copy = ab.slice(0); const x = await parse(k === 'orig' ? Orig : Patched, copy); s += x.sync; w += x.whole; }
    if (r >= WARM) { res[k].sync.push(s); res[k].whole.push(w); }
  }
}
const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
const out = { n: files.length, MB: +(glbs.reduce((a, b) => a + b.byteLength, 0) / 1e6).toFixed(1) };
for (const m of ['sync', 'whole']) { const o = med(res.orig[m]), p = med(res.patched[m]); Object.assign(out, { [m + 'Orig']: +o.toFixed(2), [m + 'Patched']: +p.toFixed(2), [m + 'Saved']: +(o - p).toFixed(2), [m + 'X']: +(o / p).toFixed(2) }); }
console.log(JSON.stringify(out));
