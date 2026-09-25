import { readFileSync } from 'node:fs';
const files = process.argv.slice(2); const per = [];
for (const f of files) { const b = readFileSync(f); const len = b.readUInt32LE(12); const j = JSON.parse(b.subarray(20, 20 + len).toString());
  let s = 0, n = 0; for (const im of j.images || []) { if (im.bufferView == null || !/ktx2/.test(im.mimeType||'')) continue; const bv = j.bufferViews[im.bufferView]; if (bv.extensions && Object.keys(bv.extensions).length) continue; s += bv.byteLength; n++; }
  per.push({ f, s, n, glb: b.length }); }
per.sort((a, b) => a.s - b.s); const S = per.map(p => p.s); const tot = S.reduce((a, b) => a + b, 0); const glb = per.reduce((a,p)=>a+p.glb,0);
console.log(JSON.stringify({ packages: per.length, withKtx: per.filter(p => p.n).length, ktxMedian: S[S.length >> 1], ktxP90: S[Math.floor(S.length * 0.9)], ktxMax: S[S.length - 1], ktxTotalMB: +(tot / 1048576).toFixed(1), glbTotalMB: +(glb/1048576).toFixed(1), images: per.reduce((a, p) => a + p.n, 0) }));
