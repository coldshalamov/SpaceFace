// Compare two capture-gameplay JSON reports. This is deliberately strict about quality metadata:
// a speedup only counts if the compared run keeps the same quality settings and does not obviously
// drop content counters. Usage:
//   node scripts/compare-perf-baseline.mjs baseline.json after.json --min-improvement 30
import { readFileSync } from 'node:fs';

const argv = parseArgs(process.argv.slice(2));
const [basePath, afterPath] = argv._;
if (!basePath || !afterPath) {
  console.error('Usage: node scripts/compare-perf-baseline.mjs baseline.json after.json --min-improvement 30');
  process.exit(2);
}

const minImprovement = Number(argv['min-improvement'] || argv.minImprovement || 30);
const tolerance = Number(argv.tolerance || 0.02);
const baseline = JSON.parse(readFileSync(basePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));
const failures = [];

const baseP95 = num(baseline.frameMs && baseline.frameMs.p95);
const afterP95 = num(after.frameMs && after.frameMs.p95);
const improvement = baseP95 > 0 ? ((baseP95 - afterP95) / baseP95) * 100 : 0;
if (!(improvement >= minImprovement)) {
  failures.push(`p95 improvement ${improvement.toFixed(1)}% < required ${minImprovement}% (${baseP95.toFixed(2)}ms -> ${afterP95.toFixed(2)}ms)`);
}

same('scenario.name', baseline.scenario && baseline.scenario.name, after.scenario && after.scenario.name);
same('scenario.seed', baseline.scenario && baseline.scenario.seed, after.scenario && after.scenario.seed);

for (const key of ['renderScale', 'pixelRatioCap', 'bloom', 'bloomStrength', 'bloomThreshold', 'shadows', 'particleQuality', 'fov', 'motionReduce']) {
  same(`settings.video.${key}`, video(baseline)[key], video(after)[key]);
}

notLower('render.triangles', baseline.render && baseline.render.triangles, after.render && after.render.triangles, tolerance);
notLower('counts.particles', baseline.counts && baseline.counts.particles, after.counts && after.counts.particles, tolerance);
notLower('counts.entities', baseline.counts && baseline.counts.entities, after.counts && after.counts.entities, tolerance);

if (!(after.scenario && after.scenario.screenshotBytes > 2000 && after.scenario.screenshotSha256)) {
  failures.push('after report is missing screenshot quality evidence');
}
if (after.memory && baseline.memory && after.memory.programs > baseline.memory.programs + 2) {
  failures.push(`shader program count grew unexpectedly (${baseline.memory.programs} -> ${after.memory.programs})`);
}

const summary = {
  baseline: basePath,
  after: afterPath,
  p95: { baseline: baseP95, after: afterP95, improvementPct: improvement },
  minImprovement,
  pass: failures.length === 0,
  failures,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.pass ? 0 : 1);

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

function video(report) {
  return (report.settings && report.settings.video)
    || (report.perf && report.perf.settings && report.perf.settings.video)
    || (report.capture && report.capture.settings && report.capture.settings.video)
    || {};
}

function same(label, a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b)) failures.push(`${label} changed (${JSON.stringify(a)} -> ${JSON.stringify(b)})`);
}

function notLower(label, a, b, frac) {
  const av = num(a);
  const bv = num(b);
  if (av <= 0) return;
  if (bv < av * (1 - frac)) failures.push(`${label} dropped more than ${(frac * 100).toFixed(1)}% (${av} -> ${bv})`);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
