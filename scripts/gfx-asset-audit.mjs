// Blender-driven audit of the shipped visual assets, ranked by rendering defect.
//
// This is the asset-layer half of the modern-parity loop. The frame loop
// (scripts/gfx-parity-loop.mjs) scores whole frames; this scores the assets inside them, so a
// "material reads as plastic" verdict can be traced to the exact GLB and the exact number that
// causes it.
//
// It measures three things that were each found by hand first:
//   * LOD coverage      — an asset with no lod1/lod2 (tagged siblings OR _lod1/_lod2 files) renders
//                         at full detail at every distance, forever.
//   * roughness stdev   — WITHIN-material roughness variation. The Kestrel's ORMs measured ~0.06 on
//                         a 0-1 range: excellent material-to-material differentiation, almost no
//                         breakup inside each material. Uniform roughness => uniform specular =>
//                         reads as plastic no matter how good the material split is.
//   * primitive names   — meshes still called Cube.125 / Cylinder.043, the G1 "recognizable
//                         primitive origins" signal from VISUAL_ITERATION_PROTOCOL.
//
// Read-only. Never writes an asset. Safe to run while another lane holds the asset-manifest mutex,
// because it imports into a scratch Blender scene and saves nothing.
//
// Run: node scripts/gfx-asset-audit.mjs [--limit 40] [--filter wholeships]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';

const argv = parseArgs(process.argv.slice(2));
const ROOT = process.cwd();
const OUT_DIR = argv.out || '.devshots/gfx/assets';
const LIMIT = Number(argv.limit || 0);
const FILTER = argv.filter ? String(argv.filter) : null;
const BLENDER = process.env.BLENDER_EXE
  || 'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe';

if (!existsSync(BLENDER)) {
  console.error(`[assets] Blender not found at ${BLENDER}`);
  console.error('[assets] set BLENDER_EXE to override');
  process.exit(2);
}

// Prefer the SHIPPED asset roots. Candidate/backup/evidence trees are deliberately excluded — they
// are review inputs, not what the player renders, and auditing them buries the real rows.
const ASSET_ROOTS = [
  'assets/ships/parts/places',
  'assets/ships/parts/wholeships',
  'assets/ships/parts/hulls',
  'assets/ships/parts',
];
// Build temporaries and review trees are NOT shipped assets. `*_export_tmp.glb` and the
// revamp-evidence/blender scratch dirs polluted the first full sweep with rows nobody renders.
const EXCLUDE = /[\\/](evidence|revamp-evidence|release_candidates|pre_promote_backups|foundry|third_party|_archive|blender)[\\/]/i;
const EXCLUDE_FILE = /(_export_tmp|_tmp|\.bak)\.glb$/i;

const targets = [];
for (const root of ASSET_ROOTS) {
  const abs = join(ROOT, root);
  if (!existsSync(abs)) continue;
  for (const f of walkGlb(abs)) {
    if (EXCLUDE.test(f) || EXCLUDE_FILE.test(f)) continue;
    if (FILTER && !f.toLowerCase().includes(FILTER.toLowerCase())) continue;
    if (!targets.includes(f)) targets.push(f);
  }
}
if (!targets.length) { console.error('[assets] no GLBs matched'); process.exit(2); }
const selected = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;

mkdirSync(OUT_DIR, { recursive: true });
const targetsPath = join(OUT_DIR, 'audit-targets.json');
const rawPath = join(OUT_DIR, 'audit-raw.json');
writeFileSync(targetsPath, JSON.stringify(selected, null, 2));

console.log(`[assets] auditing ${selected.length} GLB(s) via ${basename(BLENDER)}`);
try {
  execFileSync(BLENDER, [
    '--background', '--python', join(ROOT, 'tools', 'blender', 'gfx_asset_audit.py'),
    '--', targetsPath, rawPath,
  ], { stdio: ['ignore', 'inherit', 'inherit'], timeout: Number(argv.timeoutMs || 1800000) });
} catch (e) {
  console.error(`[assets] blender run failed: ${e.message}`);
  if (!existsSync(rawPath)) process.exit(1);
}
if (!existsSync(rawPath)) { console.error('[assets] no audit output'); process.exit(1); }

const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
const rows = (raw.assets || []).filter((a) => a.ok);
const failed = (raw.assets || []).filter((a) => !a.ok);

// ---- rank by rendering defect ----------------------------------------------------------------
// Deliberately NOT a quality score. Each term is a concrete, checkable rendering fact.
const FLAT_ROUGHNESS = 0.10; // stdev below this reads as a constant specular response
for (const a of rows) {
  const findings = [];
  let severity = 0;

  if (!a.hasLod && a.totalTris > 4000) {
    // A sibling-tagged chain is one way to have LOD; whole-ships use separate files, so this is a
    // FLAG to verify rather than a proven defect — see the note printed below.
    findings.push(`no lod1/lod2 in-file at ${a.totalTris} tris`);
    severity += Math.min(4, a.totalTris / 8000);
  }
  if (a.roughnessStdevMax != null && a.roughnessStdevMax < FLAT_ROUGHNESS) {
    findings.push(`flat roughness (max stdev ${a.roughnessStdevMax})`);
    severity += 3;
  }
  if (a.primitiveNamedObjects > 0) {
    findings.push(`${a.primitiveNamedObjects} primitive-named OBJECT(s)`);
    severity += Math.min(2, a.primitiveNamedObjects / 8);
  }
  if (a.ormMaps === 0 && a.totalTris > 500) {
    findings.push('no ORM maps');
    severity += 2;
  }
  a.findings = findings;
  a.severity = Number(severity.toFixed(2));
}
rows.sort((x, y) => y.severity - x.severity);

const summary = {
  schema: 'spaceface.gfxAssetAudit.summary.v1',
  generatedAt: new Date().toISOString(),
  audited: rows.length,
  failed: failed.length,
  totalTris: rows.reduce((s, a) => s + (a.totalTris || 0), 0),
  withLod: rows.filter((a) => a.hasLod).length,
  withoutLod: rows.filter((a) => !a.hasLod).length,
  flatRoughness: rows.filter((a) => a.roughnessStdevMax != null && a.roughnessStdevMax < FLAT_ROUGHNESS).length,
  primitiveNamed: rows.filter((a) => a.primitiveNamedObjects > 0).length,
  worst: rows.slice(0, 25).map((a) => ({
    file: relative(ROOT, a.file).replace(/\\/g, '/'),
    tris: a.totalTris,
    lod: a.lodLevels,
    materials: a.materials,
    roughStdev: a.roughnessStdevMax,
    primitives: a.primitiveNamedObjects,
    severity: a.severity,
    findings: a.findings,
  })),
};
writeFileSync(join(OUT_DIR, 'SUMMARY.json'), JSON.stringify(summary, null, 2));

console.log('');
console.log(`audited ${summary.audited} assets (${failed.length} failed), ${summary.totalTris.toLocaleString()} tris total`);
console.log(`  with in-file LOD chain : ${summary.withLod}`);
console.log(`  without                : ${summary.withoutLod}   (whole-ships legitimately use separate _lod1/_lod2 FILES — verify before treating as a defect)`);
console.log(`  flat roughness (<${FLAT_ROUGHNESS}) : ${summary.flatRoughness}`);
console.log(`  primitive-named meshes : ${summary.primitiveNamed}`);
console.log('');
console.log('worst first:');
for (const w of summary.worst.slice(0, 12)) {
  console.log(`  ${String(w.severity).padStart(5)}  ${w.tris.toString().padStart(7)}t  ${w.file}`);
  console.log(`         ${w.findings.join('; ') || '—'}`);
}
console.log(`\n[assets] ${join(OUT_DIR, 'SUMMARY.json')}`);

function walkGlb(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) out.push(...walkGlb(p));
    else if (e.toLowerCase().endsWith('.glb')) out.push(p);
  }
  return out;
}

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; } else out[key] = true;
  }
  return out;
}
