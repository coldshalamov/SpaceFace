// Phase 2b system #5 sweep: massline throw / sling release. Same resumable, parallel shape as
// npcSweep4: each child appends one JSON line per (config, scenario, seed) and skips keys on disk.
//
//   node scripts/lab/sweeps/slingSweep5.mjs baseline --workers 7   # master throw + PR #227 tether
//   node scripts/lab/sweeps/slingSweep5.mjs grid     --workers 7
//   node scripts/lab/sweeps/slingSweep5.mjs verify   --workers 7   # production checkout (no seam)
//   node scripts/lab/sweeps/slingSweep5.mjs report
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runScenario, SCENARIOS, summarizeRuns } from '../benches/slingThrow.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.LAB_OUT || path.resolve(HERE, '../../../design/program/lab/results/sling-2b');
fs.mkdirSync(OUT, { recursive: true });
const ALL = Object.keys(SCENARIOS);
export const cfgId = (c) => c.shipped ? 'shipped' : Object.entries(c).filter(([, v]) => v != null).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(',') || 'master';
const toParams = (c) => (c.shipped ? {} : { throwLab: Object.fromEntries(Object.entries(c).filter(([k, v]) => v != null && k !== 'assist')), assist: c.assist });

function jobsFor(phase) {
  const jobs = [];
  const seeds = [1, 2, 3];
  if (phase === 'baseline' || phase === 'verify') { for (const sc of ALL) for (const seed of seeds) jobs.push({ c: { shipped: true }, sc, seed }); return jobs; }
  if (phase === 'grid') {
    for (const snapWindowMs of [90, 120, 150, 200]) for (const deadlineFromEnter of [null, 1]) for (const sc of ALL) for (const seed of seeds) jobs.push({ c: { snapWindowMs, deadlineFromEnter }, sc, seed });
    return jobs;
  }
  if (phase === 'probe') { for (const c of JSON.parse(process.env.PROBE_CFGS || '[]')) for (const sc of ALL) for (const seed of seeds) jobs.push({ c, sc, seed }); return jobs; }
  throw new Error(`unknown phase ${phase}`);
}
const shard = (phase, i) => path.join(OUT, `${phase}.w${i}.jsonl`);
const keyOf = (j) => `${cfgId(j.c)}|${j.sc}|${j.seed}`;
export function loadRuns(phase) {
  const out = [];
  for (const f of fs.readdirSync(OUT)) {
    if (!f.startsWith(`${phase}.w`) || !f.endsWith('.jsonl')) continue;
    for (const line of fs.readFileSync(path.join(OUT, f), 'utf8').split('\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch (_) { /* torn */ } }
  }
  return out;
}
async function child(phase, i, n) {
  const jobs = jobsFor(phase).filter((_, k) => k % n === i);
  const done = new Set(loadRuns(phase).map((r) => r.key));
  const fd = fs.openSync(shard(phase, i), 'a');
  let ran = 0;
  for (const j of jobs) {
    const key = keyOf(j); if (done.has(key)) continue;
    const r = await runScenario(j.sc, { seed: j.seed, params: toParams(j.c) });
    fs.writeSync(fd, JSON.stringify({ key, cfg: cfgId(j.c), config: j.c, ...r }) + '\n');
    ran++;
  }
  fs.closeSync(fd);
  process.stdout.write(`worker ${i}: ran ${ran}\n`);
}
export function table(phase) {
  const runs = loadRuns(phase).map((r) => ({ ...r, variant: r.cfg }));
  return summarizeRuns(runs);
}
function report() {
  const res = {};
  for (const phase of ['baseline', 'grid', 'probe', 'verify']) { const runs = loadRuns(phase); if (runs.length) res[phase] = table(phase); }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 1).slice(0, 6000));
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
const [phase, ...rest] = isMain ? process.argv.slice(2) : [];
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
if (phase === 'report') report();
else if (opt('child')) await child(phase, Number(opt('child')), Number(opt('n')));
else if (phase) {
  const n = Number(opt('workers', 6));
  console.log(`${phase}: ${jobsFor(phase).length} jobs on ${n} workers -> ${OUT}`);
  const t0 = Date.now();
  await Promise.all(Array.from({ length: n }, (_, i) => new Promise((resolve) => {
    const p = spawn(process.execPath, [fileURLToPath(import.meta.url), phase, '--child', String(i), '--n', String(n)], { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
    p.on('exit', resolve);
  })));
  console.log(`${phase}: done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  report();
}
