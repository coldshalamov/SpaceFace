// Parallel aim runner (Phase 2b interaction checks): node scripts/lab/sweeps/aimRun.mjs <outDir> <variant: baseline|half> [workers]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
const [outDir, variant = 'baseline', workersArg = '6', childArg, nArg] = process.argv.slice(2);
const bench = await import(`${ROOT}/scripts/lab/benches/autoAim.mjs`);
const jobs = []; for (const sc of bench.DEFAULT_SCENARIOS) for (const seed of [1, 2, 3]) jobs.push({ sc, seed });
const params = variant === 'baseline' ? {} : bench.VARIANTS[variant];
if (childArg === '--child') {
  const i = +nArg, n = +workersArg;
  const fd = fs.openSync(path.join(outDir, `${variant}.w${i}.jsonl`), 'w');
  for (const [k, j] of jobs.entries()) { if (k % n !== i) continue; const r = await bench.runScenario(j.sc, { seed: j.seed, bundle: 'focused', params }); delete r.missLog; fs.writeSync(fd, JSON.stringify(r) + '\n'); }
  fs.closeSync(fd); process.exit(0);
}
fs.mkdirSync(outDir, { recursive: true });
const n = +workersArg;
await Promise.all([...Array(n).keys()].map((i) => new Promise((res) => spawn(process.execPath, [process.argv[1], outDir, variant, String(n), '--child', String(i)], { stdio: 'inherit' }).on('exit', res))));
const runs = []; for (let i = 0; i < n; i++) for (const l of fs.readFileSync(path.join(outDir, `${variant}.w${i}.jsonl`), 'utf8').split('\n')) if (l.trim()) runs.push(JSON.parse(l));
const oc = {}; let fired = 0, aimMax = 0, over = 0;
for (const r of runs) { fired += r.fired; for (const [o, c] of Object.entries(r.outcomes)) oc[o] = (oc[o] || 0) + c; aimMax = Math.max(aimMax, r.aimErrDeg && r.aimErrDeg.max || 0); over += (r.bigAimErr || []).length; }
const blocked = (oc.occluded || 0) + (oc['pd-intercepted'] || 0) + (oc['target-contact'] || 0) + (oc.unreachable || 0) + (oc['out-of-range'] || 0);
const sum = { variant, runs: runs.length, fired, outcomes: oc, hitPct: +(100 * (oc.hit || 0) / fired).toFixed(2), unblockedHitPct: +(100 * (oc.hit || 0) / (fired - blocked)).toFixed(2), aimErrDegMax: +aimMax.toFixed(4), roundsOver0p5deg: over, leadErrorPct: +(100 * (oc['lead-error'] || 0) / fired).toFixed(2) };
fs.writeFileSync(path.join(outDir, `${variant}.summary.json`), JSON.stringify(sum, null, 1));
console.log(JSON.stringify(sum));
