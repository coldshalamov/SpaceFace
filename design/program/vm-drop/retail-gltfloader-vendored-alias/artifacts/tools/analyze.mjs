import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
const base = '/workspace/spaceface-scratch/r170-cap';
for (const name of process.argv.slice(2)) {
  const meta = JSON.parse(readFileSync(join(base, name, 'metafile.json'), 'utf8'));
  const gltfInputs = Object.keys(meta.inputs).filter((p) => /GLTFLoader|BufferGeometryUtils|SkeletonUtils|meshopt_decoder/.test(p));
  const dir = join(base, name, 'js');
  let total = 0, gz = 0, files = 0; const hits = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const buf = readFileSync(join(dir, f)); total += buf.length; gz += gzipSync(buf).length; files++;
    const t = buf.toString();
    for (const m of ['glbBodyRange', 'glbBodySliceRange', 'bodyByteOffset', 'KHR_binary_glTF']) if (t.includes(m)) (hits[m] ||= []).push(f);
  }
  // output chunk that owns the GLTFLoader input
  const owners = Object.entries(meta.outputs).filter(([, o]) => Object.keys(o.inputs).some((i) => /GLTFLoader\.js$/.test(i) && !/src\/render/.test(i))).map(([k, o]) => `${k.split('/').pop()} exports=[${o.exports.join(',')}] bytesFromLoader=${Object.entries(o.inputs).filter(([i]) => /loaders\/GLTFLoader\.js$/.test(i)).map(([i, v]) => i + ':' + v.bytesInOutput).join(' ')}`);
  console.log(JSON.stringify({ name, jsFiles: files, jsBytes: total, jsGzipBytes: gz, gltfInputs, markers: hits, owners }, null, 1));
}
