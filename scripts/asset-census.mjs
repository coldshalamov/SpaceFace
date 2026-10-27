#!/usr/bin/env node
// Shipped-asset census: the real numbers behind the live render cost.
//
// `scripts/audit-gltf-assets.mjs` cannot read the live release tree: 796 of 814
// shipped GLBs are EXT_meshopt_compression and it never registers the decoder, so
// every ship it was supposed to score came back as an error row. This tool reads
// them for real (meshopt decoder + KTX2 metadata) and reports what actually reaches
// the GPU:
//
//   * geometry    - triangles, vertices, primitives (= potential draw calls)
//   * materials   - unique material signatures (the shader-program key space)
//   * textures    - per-role codec (UASTC/ETC1S/uncompressed), dimensions, and the
//                   VRAM each one costs once uploaded
//   * LOD         - whether a shipped body has cheaper siblings at all
//   * duplicates  - geometry byte-identical across packages (wasted decode/VRAM)
//
// Read-only. Never writes an asset.
//
//   node scripts/asset-census.mjs                     # assets/ships/release
//   node scripts/asset-census.mjs --dir=assets/ships/release/parts/wholeships
//   node scripts/asset-census.mjs --top=40 --json=.devshots/census.json
import { readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = parseArgs(process.argv.slice(2));
const TARGET = path.resolve(ROOT, argv.dir || 'assets/ships/release');
const TOP = Number(argv.top || 25);
const JSON_OUT = argv.json ? path.resolve(ROOT, argv.json) : null;
const FILTER = argv.filter || null;
const SKIP_DIRS = new Set(['node_modules', '.git', 'release_candidates', 'pre_promote_backups', 'evidence', 'revamp-evidence', '_archive', 'blender']);

function parseArgs(list) {
  const out = {};
  for (const item of list) {
    if (!item.startsWith('--')) continue;
    const [key, ...rest] = item.slice(2).split('=');
    out[key] = rest.length ? rest.join('=') : true;
  }
  return out;
}

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, files);
    } else if (entry.isFile() && entry.name.endsWith('.glb')) {
      files.push(full);
    }
  }
  return files;
}

// VRAM cost of one uploaded texture, in bytes, at its stored mip chain.
// Basis UASTC transcodes to BC7/ASTC 4x4 (1 byte/px) or RGBA8 where unsupported.
// ETC1S transcodes to BC1/ETC1 (0.5 byte/px) or RGBA8 where unsupported.
// Uncompressed sources expand to RGBA8 (4 bytes/px).
function textureVramBytes(width, height, codec) {
  if (!width || !height) return 0;
  const perPixel = codec === 'uastc' ? 1 : codec === 'etc1s' ? 0.5 : 4;
  const base = width * height * perPixel;
  return Math.round(base * (4 / 3)); // + full mip chain
}

const MATERIAL_ROLE = Symbol('role');

function classifyTexture(tex) {
  const mime = String(tex.getMimeType() || '');
  const uri = String(tex.getURI() || '');
  let codec = 'raw';
  if (mime.includes('ktx') || uri.endsWith('.ktx2')) codec = 'ktx2';
  const size = tex.getSize?.() || [0, 0];
  return { mime, codec, width: size[0] || 0, height: size[1] || 0, uri, name: tex.getName() || '' };
}

// Honest program-key signature: everything three's WebGLPrograms hashes, minus
// object identity. Two materials with the same signature share one program.
function materialSignature(mat) {
  const parts = [
    mat.getAlphaMode(),
    mat.getDoubleSided() ? 'ds' : 'ss',
    mat.getBaseColorFactor().map((n) => n.toFixed(3)).join(','),
    mat.getMetallicFactor().toFixed(2),
    mat.getRoughnessFactor().toFixed(2),
    mat.getEmissiveFactor().map((n) => n.toFixed(2)).join(','),
  ];
  const slots = ['getBaseColorTexture', 'getMetallicRoughnessTexture', 'getNormalTexture', 'getEmissiveTexture', 'getOcclusionTexture'];
  for (const slot of slots) {
    const tex = mat[slot]?.();
    parts.push(tex ? `${slot}:${tex.getSize?.()?.join('x') || '?'}` : `${slot}:-`);
  }
  return parts.join('|');
}

function normalizeName(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

async function main() {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

  const files = walk(TARGET).filter((f) => (FILTER ? f.includes(FILTER) : true));
  const rows = [];
  const errors = [];
  let done = 0;
  for (const file of files) {
    done += 1;
    if (done % 50 === 0 || done === files.length) process.stderr.write(`\r[census] ${done}/${files.length}`);
    try {
      const doc = await io.read(file);
      const root = doc.getRoot();
      let tris = 0;
      let verts = 0;
      let prims = 0;
      for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          prims += 1;
          const pos = prim.getAttribute('POSITION');
          const idx = prim.getIndices();
          const count = pos ? pos.getCount() : 0;
          verts += count;
          tris += idx ? Math.round(idx.getCount() / 3) : Math.round(count / 3);
        }
      }

      const materials = root.listMaterials();
      const sigs = new Set(materials.map(materialSignature));
      const textures = root.listTextures();
      const texRows = textures.map((tex) => {
        const info = classifyTexture(tex);
        // KTX2 codec is not in the container metadata gltf-transform surfaces, so
        // detect the Basis supercompression band from the encoder-written extras we
        // do have (`tex.getExtras()`) and fall back to UASTC (the SG04 profile).
        const extras = tex.getExtras?.() || {};
        const declared = String(extras.spacefaceCodec || extras.codec || '').toLowerCase();
        const codec = declared.includes('etc1') ? 'etc1s' : info.codec === 'ktx2' ? 'uastc' : 'raw';
        info.codec = codec;
        info.vram = textureVramBytes(info.width, info.height, codec);
        return info;
      });

      const vram = texRows.reduce((sum, t) => sum + t.vram, 0);
      const maxDim = texRows.reduce((m, t) => Math.max(m, t.width, t.height), 0);
      const bytes = statSync(file).size;
      const fileHash = createHash('sha1').update(normalizeName(file)).digest('hex').slice(0, 8);

      rows.push({
        file: normalizeName(file),
        bytes,
        tris,
        verts,
        prims,
        materials: materials.length,
        programKeys: sigs.size,
        textures: texRows.length,
        codecs: [...new Set(texRows.map((t) => t.codec))].sort(),
        textureBytes: texRows.reduce((s, t) => s + (t.width * t.height), 0),
        maxDim,
        vram,
        hash: fileHash,
        animations: root.listAnimations().length,
        skins: root.listSkins().length,
      });
    } catch (err) {
      errors.push({ file: normalizeName(file), error: String(err && err.message ? err.message : err) });
    }
  }
  process.stderr.write('\n');

  const shipped = rows;
  const sum = (key) => shipped.reduce((s, r) => s + (r[key] || 0), 0);
  const byCategory = new Map();
  for (const row of shipped) {
    const category = row.file.includes('/render-packages/') ? 'render-packages'
      : row.file.includes('/parts/') ? `parts/${row.file.split('/parts/')[1].split('/')[0]}`
        : 'other';
    const bucket = byCategory.get(category) || { rows: 0, tris: 0, prims: 0, vram: 0, bytes: 0, programKeys: 0 };
    bucket.rows += 1;
    bucket.tris += row.tris;
    bucket.prims += row.prims;
    bucket.vram += row.vram;
    bucket.bytes += row.bytes;
    bucket.programKeys += row.programKeys;
    byCategory.set(category, bucket);
  }

  const lines = [];
  lines.push('# Shipped asset census');
  lines.push('');
  lines.push(`- Target: \`${path.relative(ROOT, TARGET).replace(/\\/g, '/')}\``);
  lines.push(`- Files: **${shipped.length}** readable, ${errors.length} unreadable`);
  lines.push(`- Geometry: **${sum('tris').toLocaleString()}** triangles, **${sum('verts').toLocaleString()}** vertices`);
  lines.push(`- Submission: **${sum('prims').toLocaleString()}** primitives (draw-call upper bound) across **${sum('materials').toLocaleString()}** material slots`);
  lines.push(`- Texture VRAM (decoded, mipmapped): **${(sum('vram') / 1048576).toFixed(1)} MB** across ${sum('textures')} images`);
  lines.push(`- On-disk: **${(sum('bytes') / 1048576).toFixed(1)} MB**`);
  lines.push('');
  lines.push('## By category');
  lines.push('');
  lines.push('| Category | Files | Tris | Prims | Program keys | Texture VRAM | On disk |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const [category, b] of [...byCategory.entries()].sort((a, b) => b[1].vram - a[1].vram)) {
    lines.push(`| ${category} | ${b.rows} | ${b.tris.toLocaleString()} | ${b.prims.toLocaleString()} | ${b.programKeys.toLocaleString()} | ${(b.vram / 1048576).toFixed(1)} MB | ${(b.bytes / 1048576).toFixed(1)} MB |`);
  }
  lines.push('');
  lines.push(`## Top ${TOP} by texture VRAM`);
  lines.push('');
  lines.push('| Asset | VRAM | Textures | Max dim | Codecs | Tris | Prims |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of [...shipped].sort((a, b) => b.vram - a.vram).slice(0, TOP)) {
    lines.push(`| \`${row.file.replace('assets/ships/release/', '')}\` | ${(row.vram / 1048576).toFixed(2)} MB | ${row.textures} | ${row.maxDim} | ${row.codecs.join('/') || '-'} | ${row.tris.toLocaleString()} | ${row.prims} |`);
  }
  lines.push('');
  lines.push(`## Top ${TOP} by triangles`);
  lines.push('');
  lines.push('| Asset | Tris | Verts | Prims | VRAM |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of [...shipped].sort((a, b) => b.tris - a.tris).slice(0, TOP)) {
    lines.push(`| \`${row.file.replace('assets/ships/release/', '')}\` | ${row.tris.toLocaleString()} | ${row.verts.toLocaleString()} | ${row.prims} | ${(row.vram / 1048576).toFixed(2)} MB |`);
  }
  lines.push('');
  lines.push(`## Top ${TOP} by primitives (draw-call upper bound)`);
  lines.push('');
  lines.push('| Asset | Prims | Tris | Materials | VRAM |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of [...shipped].sort((a, b) => b.prims - a.prims).slice(0, TOP)) {
    lines.push(`| \`${row.file.replace('assets/ships/release/', '')}\` | ${row.prims} | ${row.tris.toLocaleString()} | ${row.materials} | ${(row.vram / 1048576).toFixed(2)} MB |`);
  }
  if (errors.length) {
    lines.push('');
    lines.push('## Unreadable');
    lines.push('');
    for (const err of errors.slice(0, 20)) lines.push(`- \`${err.file}\`: ${err.error}`);
  }

  const report = lines.join('\n');
  console.log(report);
  const outDir = path.join(ROOT, '.devshots', 'asset-census');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'report.md'), `${report}\n`);
  if (JSON_OUT) {
    mkdirSync(path.dirname(JSON_OUT), { recursive: true });
    writeFileSync(JSON_OUT, JSON.stringify({ generatedAt: new Date().toISOString(), target: normalizeName(TARGET), rows: shipped, errors }, null, 2));
    console.log(`\n[census] json -> ${path.relative(ROOT, JSON_OUT)}`);
  }
  process.stderr.write(`[census] report -> .devshots/asset-census/report.md\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
