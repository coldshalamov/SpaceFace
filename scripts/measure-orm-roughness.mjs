// Measure WITHIN-MATERIAL roughness variation for shipped GLBs, straight from the glTF material
// graph. No Blender required.
//
// Why this exists
// ---------------
// "The ship reads as flat plastic" is a claim about specular response. A constant roughness value
// across a surface gives a constant specular response, so the eye reads one uniform material no
// matter how good the base colour is. The diagnostic number is the standard deviation of the
// roughness channel WITHIN a single material — not the spread between materials.
//
// The previous audit of this got it wrong in a way worth recording: it matched ORM maps by
// FILENAME, so it counted normal maps as ORMs (the substring "orm" appears inside "n-ORM-al") and
// missed real ones whose names did not contain "orm". `engine_ion_small` was reported at stdev 0
// when its true value is non-zero. Every conclusion drawn from that table was withdrawn.
//
// This tool cannot repeat that mistake: it resolves
//   material.pbrMetallicRoughness.metallicRoughnessTexture -> texture -> image
// through the actual glTF graph. Filenames are never consulted.
//
// glTF packs the metallic-roughness texture as G = roughness, B = metallic (R is free, and is where
// ambient occlusion is usually packed). We measure G, weighted by nothing: every texel in the image
// counts, because we cannot know from the glTF alone which texels a given UV island actually uses.
// That makes the number a slight UNDER-estimate of perceived flatness for atlased materials, which
// is the safe direction — it can only make a flat surface look better than it is, never worse.
//
// Usage:
//   node scripts/measure-orm-roughness.mjs <glb...>
//   node scripts/measure-orm-roughness.mjs --json <glb...>
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import sharp from 'sharp';

// A surface at or below this stdev has effectively one specular response across its whole area.
// Chosen from the reviewer-visible threshold, not from theory: the Kestrel's ORMs measured ~0.06
// overall while the independent review still read "one matte gray material".
const FLAT_STDEV = 0.02;
const NEAR_FLAT_STDEV = 0.06;

function glbChunks(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buf.length) {
    const len = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const body = buf.slice(offset + 8, offset + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8'));
    else if (type === 0x004e4942) bin = body;
    offset += 8 + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error(`${path}: no JSON chunk`);
  return { json, bin };
}

// Resolve an image index to raw bytes, whether it is embedded in the BIN chunk via a bufferView or
// carried as a data: URI. External file references are reported rather than silently skipped —
// a texture we cannot read must never be scored as "fine".
function imageBytes(gltf, bin, imageIndex) {
  const image = gltf.images?.[imageIndex];
  if (!image) return null;
  if (image.bufferView !== undefined) {
    const view = gltf.bufferViews[image.bufferView];
    const start = view.byteOffset || 0;
    return bin.slice(start, start + view.byteLength);
  }
  if (typeof image.uri === 'string' && image.uri.startsWith('data:')) {
    return Buffer.from(image.uri.slice(image.uri.indexOf(',') + 1), 'base64');
  }
  return null; // external file
}

function stats(values) {
  const n = values.length;
  if (!n) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += values[i];
  const mean = sum / n;
  let acc = 0;
  for (let i = 0; i < n; i++) { const d = values[i] - mean; acc += d * d; }
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) { if (values[i] < min) min = values[i]; if (values[i] > max) max = values[i]; }
  return { mean, stdev: Math.sqrt(acc / n), min, max };
}

export async function measureGlb(path) {
  const { json: gltf, bin } = glbChunks(path);
  const rows = [];

  for (const material of gltf.materials || []) {
    const mrTexRef = material.pbrMetallicRoughness?.metallicRoughnessTexture;
    const row = { material: material.name || '(unnamed)', hasMrTexture: !!mrTexRef };

    if (!mrTexRef) {
      // No texture: roughness is a single scalar factor, so variation is exactly zero BY
      // CONSTRUCTION. That is a real flat surface, not missing data, and must be reported as such.
      row.roughness = material.pbrMetallicRoughness?.roughnessFactor ?? 1.0;
      row.stdev = 0;
      row.verdict = 'SCALAR';
      rows.push(row);
      continue;
    }

    const texture = gltf.textures?.[mrTexRef.index];
    const source = texture?.source
      ?? texture?.extensions?.KHR_texture_basisu?.source;
    const bytes = source === undefined ? null : imageBytes(gltf, bin, source);
    if (!bytes) { row.verdict = 'UNREADABLE'; rows.push(row); continue; }

    let raw;
    try {
      raw = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    } catch (err) {
      row.verdict = 'UNREADABLE';
      row.error = err.message;
      rows.push(row);
      continue;
    }

    const { data, info } = raw;
    const ch = info.channels;
    if (ch < 2) { row.verdict = 'UNREADABLE'; rows.push(row); continue; }

    // G channel = roughness, per the glTF metallic-roughness packing.
    const green = new Float64Array(info.width * info.height);
    for (let i = 0, p = 0; p < green.length; i += ch, p++) green[p] = data[i + 1] / 255;

    const s = stats(green);
    row.size = `${info.width}x${info.height}`;
    row.mean = s.mean;
    row.stdev = s.stdev;
    row.min = s.min;
    row.max = s.max;
    row.verdict = s.stdev <= FLAT_STDEV ? 'FLAT'
      : s.stdev <= NEAR_FLAT_STDEV ? 'NEAR-FLAT'
        : 'VARIED';
    rows.push(row);
  }
  return { asset: basename(path), path, materials: rows };
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const paths = args.filter((a) => !a.startsWith('--'));

if (!paths.length) {
  console.error('usage: node scripts/measure-orm-roughness.mjs [--json] <glb...>');
  process.exit(2);
}

const results = [];
for (const p of paths) {
  try { results.push(await measureGlb(p)); } catch (err) {
    results.push({ asset: basename(p), path: p, error: err.message });
  }
}

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    if (r.error) { console.log(`\n${r.asset}: ERROR ${r.error}`); continue; }
    console.log(`\n=== ${r.asset} ===`);
    const flat = r.materials.filter((m) => m.verdict === 'FLAT' || m.verdict === 'SCALAR');
    for (const m of r.materials) {
      const num = m.stdev === undefined ? '   -  ' : m.stdev.toFixed(4);
      const extra = m.verdict === 'SCALAR' ? `scalar roughness ${Number(m.roughness).toFixed(2)}`
        : m.size ? `${m.size} mean ${m.mean.toFixed(3)} range ${m.min.toFixed(2)}-${m.max.toFixed(2)}`
          : '';
      console.log(`  ${String(m.material).padEnd(32)} stdev ${num}  ${String(m.verdict).padEnd(10)} ${extra}`);
    }
    console.log(`  -> ${flat.length}/${r.materials.length} materials have no usable roughness variation`);
  }
}
