#!/usr/bin/env node
// Material-collapse potential census over the shipped release tree.
//
// Three.js pays per material bind and, worse, per shader-program switch. Most of
// the fleet's "many materials" are the same texture set with a different base
// colour factor - an authored tint. A tint is a uniform, not a material family:
// collapsed into one material + per-vertex colour it costs one bind instead of N
// and lets same-material geometry batch.
//
// This reports, per asset:
//   materials        - slots in the file
//   textureSets      - distinct (baseColor, normal, orm, emissive) tuples
//   tintVariants     - materials that would collapse into an existing texture set
//   collapsible      - how many slots a tint->vertex-colour pass would remove
//
//   node scripts/asset-material-census.mjs [--dir=...] [--top=30]
import { readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, ...rel] = a.slice(2).split('=');
  return [k, rel.length ? rel.join('=') : true];
}));
const TARGET = path.resolve(ROOT, argv.dir || 'assets/ships/release');
const TOP = Number(argv.top || 30);
const SKIP = new Set(['node_modules', '.git', 'release_candidates', 'pre_promote_backups', 'evidence', 'revamp-evidence', '_archive', 'blender']);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(full, out); }
    else if (e.isFile() && e.name.endsWith('.glb')) out.push(full);
  }
  return out;
}

function texKey(tex) {
  if (!tex) return '-';
  const size = tex.getSize?.() || [];
  return `${tex.getURI?.() || tex.getName() || 'tex'}:${size.join('x')}`;
}

function textureSetKey(mat) {
  return [
    texKey(mat.getBaseColorTexture()),
    texKey(mat.getNormalTexture()),
    texKey(mat.getMetallicRoughnessTexture()),
    texKey(mat.getEmissiveTexture()),
    texKey(mat.getOcclusionTexture()),
  ].join('|');
}

function tintKey(mat) {
  return `${mat.getBaseColorFactor().map((n) => n.toFixed(3)).join(',')}|${mat.getEmissiveFactor().map((n) => n.toFixed(3)).join(',')}|${mat.getAlphaMode()}|${mat.getDoubleSided()}`;
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const files = walk(TARGET);
const rows = [];
let n = 0;
for (const file of files) {
  n += 1;
  if (n % 50 === 0) process.stderr.write(`\r[material-census] ${n}/${files.length}`);
  try {
    const doc = await io.read(file);
    const mats = doc.getRoot().listMaterials();
    const sets = new Map();
    for (const m of mats) {
      const key = textureSetKey(m);
      if (!sets.has(key)) sets.set(key, { count: 0, tints: new Set() });
      const bucket = sets.get(key);
      bucket.count += 1;
      bucket.tints.add(tintKey(m));
    }
    const collapsible = [...sets.values()].reduce((sum, b) => sum + Math.max(0, b.count - 1), 0);
    rows.push({
      file: path.relative(ROOT, file).replace(/\\/g, '/'),
      materials: mats.length,
      textureSets: sets.size,
      tints: mats.length - sets.size,
      collapsible,
      textureSetNames: [...sets.keys()].slice(0, 6),
    });
  } catch (err) {
    rows.push({ file: path.relative(ROOT, file).replace(/\\/g, '/'), error: String(err.message || err) });
  }
}
process.stderr.write('\n');

const ok = rows.filter((r) => !r.error);
const totalMats = ok.reduce((s, r) => s + r.materials, 0);
const totalSets = ok.reduce((s, r) => s + r.textureSets, 0);
const totalCollapse = ok.reduce((s, r) => s + r.collapsible, 0);
const lines = [];
lines.push('# Material collapse census');
lines.push('');
lines.push(`- Files: **${ok.length}** (${rows.length - ok.length} unreadable)`);
lines.push(`- Material slots: **${totalMats.toLocaleString()}**`);
lines.push(`- Distinct texture sets: **${totalSets.toLocaleString()}**`);
lines.push(`- Tint-only duplicates: **${totalCollapse.toLocaleString()}** (${(totalCollapse / Math.max(1, totalMats) * 100).toFixed(1)}% of slots)`);
lines.push('');
lines.push(`## Top ${TOP} by collapsible slots`);
lines.push('');
lines.push('| Asset | Materials | Texture sets | Collapsible |');
lines.push('| --- | --- | --- | --- |');
for (const r of [...ok].sort((a, b) => b.collapsible - a.collapsible).slice(0, TOP)) {
  lines.push(`| \`${r.file.replace('assets/ships/release/', '')}\` | ${r.materials} | ${r.textureSets} | ${r.collapsible} |`);
}
const report = lines.join('\n');
console.log(report);
mkdirSync(path.join(ROOT, '.devshots', 'asset-census'), { recursive: true });
writeFileSync(path.join(ROOT, '.devshots', 'asset-census', 'materials.md'), `${report}\n`);
if (argv.json) writeFileSync(path.resolve(ROOT, argv.json), JSON.stringify({ rows }, null, 2));
