// Batch-author ORM roughness breakup into every shipped asset the audit flagged as flat.
//
// Reads the audit produced by scripts/gfx-asset-audit.mjs, selects assets whose measured ORM
// roughness stdev is below the flat threshold, and drives tools/blender/gfx_orm_breakup.py over
// each one. Writes CANDIDATES to .devshots/gfx/assets/candidates/ — never touches a live asset, so
// this is safe to run beside any asset lane and produces input for the ordinary
// candidate -> review -> guarded-promotion path.
//
// Twenty shipped assets measure a roughness stdev of EXACTLY ZERO — all eleven modular hulls (the
// kit every NPC ship is assembled from), all six engines, two cockpits and two dock interiors. Two
// renderer-side attempts to compensate were each disconfirmed at median-of-5, so the breakup has to
// live in the map.
//
// Run: node scripts/gfx-asset-breakup.mjs [--threshold 0.10] [--limit 8] [--filter hull]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const argv = parseArgs(process.argv.slice(2));
const ROOT = process.cwd().replace(/\\/g, '/');
const AUDIT = argv.audit || '.devshots/gfx/assets/audit-raw.json';
const OUT_DIR = argv.out || '.devshots/gfx/assets/candidates';
const THRESHOLD = Number(argv.threshold || 0.10);
const LIMIT = Number(argv.limit || 0);
const FILTER = argv.filter ? String(argv.filter).toLowerCase() : null;
const BLENDER = process.env.BLENDER_EXE
  || 'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe';

if (!existsSync(AUDIT)) {
  console.error(`[breakup] no audit at ${AUDIT} — run scripts/gfx-asset-audit.mjs first`);
  process.exit(2);
}
if (!existsSync(BLENDER)) {
  console.error(`[breakup] Blender not found at ${BLENDER} (set BLENDER_EXE)`);
  process.exit(2);
}

const audit = JSON.parse(readFileSync(AUDIT, 'utf8'));
let flat = (audit.assets || []).filter((a) => a.ok
  && a.ormMaps > 0
  && a.roughnessStdevMax != null
  && a.roughnessStdevMax < THRESHOLD);
if (FILTER) flat = flat.filter((a) => a.file.toLowerCase().includes(FILTER));
flat.sort((a, b) => (a.roughnessStdevMax - b.roughnessStdevMax) || (b.totalTris - a.totalTris));
const selected = LIMIT > 0 ? flat.slice(0, LIMIT) : flat;

if (!selected.length) { console.error('[breakup] nothing flagged flat'); process.exit(2); }
mkdirSync(OUT_DIR, { recursive: true });
console.log(`[breakup] ${selected.length} asset(s) below stdev ${THRESHOLD}`);

const results = [];
for (const [i, a] of selected.entries()) {
  const name = basename(a.file);
  const input = a.file.replace(/\\/g, '/');
  const output = `${ROOT}/${OUT_DIR}/${name}`;
  const jobPath = join(OUT_DIR, `job-${name}.json`);
  // Scale the amount to how flat the source is: a map at exactly 0 needs the full push, one already
  // near the threshold needs almost none, so assets that carry some authored variation keep their
  // character instead of being flattened toward a common look.
  const deficit = Math.max(0, THRESHOLD - a.roughnessStdevMax) / THRESHOLD;
  const roughnessAmount = Number((0.16 + 0.30 * deficit).toFixed(3));
  writeFileSync(jobPath, JSON.stringify({
    input, output, roughnessAmount, albedoAmount: 0, octaves: 3, baseFreq: 5.0,
  }, null, 2));

  process.stdout.write(`[breakup] ${i + 1}/${selected.length} ${name} (stdev ${a.roughnessStdevMax} -> amount ${roughnessAmount}) ... `);
  try {
    execFileSync(BLENDER, [
      '--background', '--python', join(ROOT, 'tools', 'blender', 'gfx_orm_breakup.py'),
      '--', jobPath,
    ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: Number(argv.timeoutMs || 600000) });
  } catch (e) {
    console.log(`FAILED (${e.message.slice(0, 60)})`);
    results.push({ asset: name, ok: false, error: e.message.slice(0, 200) });
    continue;
  }
  const reportPath = `${output}.report.json`;
  if (!existsSync(reportPath)) { console.log('no report'); results.push({ asset: name, ok: false }); continue; }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const imgs = report.images || [];
  const after = imgs.length ? Math.max(...imgs.map((x) => x.stdevAfter || 0)) : 0;
  console.log(`ok  ${imgs.length} map(s), stdev max -> ${after.toFixed(4)}`);
  results.push({ asset: name, ok: true, maps: imgs.length, stdevAfter: after, candidate: output });
}

const okCount = results.filter((r) => r.ok).length;
writeFileSync(join(OUT_DIR, 'BREAKUP_SUMMARY.json'), JSON.stringify({
  schema: 'spaceface.gfxAssetBreakup.v1',
  threshold: THRESHOLD,
  attempted: results.length,
  succeeded: okCount,
  note: 'Candidates only. No live asset is modified. Feed these through the ordinary candidate -> review -> guarded-promotion path.',
  results,
}, null, 2));

console.log('');
console.log(`[breakup] ${okCount}/${results.length} candidates written to ${OUT_DIR}`);
console.log('[breakup] live assets untouched — verify with: git status --porcelain assets/');
process.exit(okCount ? 0 : 1);

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
