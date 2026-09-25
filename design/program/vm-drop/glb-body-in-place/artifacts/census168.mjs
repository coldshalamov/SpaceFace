import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const files = execSync(`git ls-files "${process.argv[2] || '*render.glb'}"`).toString().trim().split('\n');
const agg = { files: 0, fileBytes: 0, bodyBytes: 0, bvBytes: {}, bvCount: {}, extUsed: {}, buffers: {} , alignBad:0};
for (const f of files) {
  const b = readFileSync(f); const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const jl = dv.getUint32(12, true); const json = JSON.parse(b.subarray(20, 20 + jl).toString());
  let bodyOff = 20 + jl; const bl = dv.getUint32(bodyOff, true); bodyOff += 8;
  if (bodyOff % 4) agg.alignBad++;
  agg.files++; agg.fileBytes += b.byteLength; agg.bodyBytes += bl;
  for (const e of json.extensionsUsed || []) agg.extUsed[e] = (agg.extUsed[e] || 0) + 1;
  agg.buffers[json.buffers.length] = (agg.buffers[json.buffers.length]||0)+1;
  const role = new Map();
  (json.images || []).forEach((im) => { if (im.bufferView !== undefined) role.set(im.bufferView, 'image:' + (im.mimeType || '?')); });
  (json.accessors || []).forEach((a) => { if (a.bufferView !== undefined && !role.has(a.bufferView)) role.set(a.bufferView, 'accessor'); if (a.sparse) { role.set(a.sparse.indices.bufferView,'sparse'); role.set(a.sparse.values.bufferView,'sparse'); } });
  json.bufferViews.forEach((bv, i) => {
    let k = role.get(i) || 'unref';
    if (bv.extensions?.EXT_meshopt_compression) k += '+meshopt(src buf ' + bv.extensions.EXT_meshopt_compression.buffer + ')';
    else k += '(buf ' + bv.buffer + ')';
    if (bv.byteStride) k += '+stride';
    agg.bvBytes[k] = (agg.bvBytes[k] || 0) + (bv.extensions?.EXT_meshopt_compression ? bv.extensions.EXT_meshopt_compression.byteLength : bv.byteLength);
    agg.bvCount[k] = (agg.bvCount[k] || 0) + 1;
  });
}
agg.fileMB = +(agg.fileBytes / 1e6).toFixed(1); agg.bodyMB = +(agg.bodyBytes / 1e6).toFixed(1);
for (const k in agg.bvBytes) agg.bvBytes[k] = +(agg.bvBytes[k] / 1e6).toFixed(2) + ' MB';
console.log(JSON.stringify(agg, null, 1));
