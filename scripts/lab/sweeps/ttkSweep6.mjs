// Phase 2b system #6 sweep: weapon time-to-kill + heat. Resumable parallel shards (same shape as
// slingSweep5): one JSON line per (config, scenario, seed); keys already on disk are skipped.
//
//   node scripts/lab/sweeps/ttkSweep6.mjs baseline --workers 6   # 14 weapons x 17 enemies dummy (seed 1) + live x 3 seeds
//   node scripts/lab/sweeps/ttkSweep6.mjs probe    --workers 6   # PROBE_CFGS='[{"weaponLab":{...}}]'
//   node scripts/lab/sweeps/ttkSweep6.mjs verify   --workers 6   # production checkout (no seam)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScenario, SCENARIOS } from '../benches/ttk.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.LAB_OUT || path.resolve(HERE, '../../../design/program/lab/results/ttk-2b');
fs.mkdirSync(OUT, { recursive: true });
const ALL = Object.keys(SCENARIOS);
const cfgId = (c) => (c.shipped ? 'shipped' : JSON.stringify(c));
function jobsFor(phase) {
  const jobs = [];
  const add = (c) => { for (const sc of ALL) for (const seed of (sc.endsWith('|live') ? [1, 2, 3] : [1])) jobs.push({ c, sc, seed }); };
  if (phase === 'baseline' || phase === 'verify') add({ shipped: true });
  else if (phase === 'probe') for (const c of JSON.parse(process.env.PROBE_CFGS || '[]')) add(c);
  else throw new Error(`unknown phase ${phase}`);
  if (process.env.ONLY) return jobs.filter((j) => new RegExp(process.env.ONLY).test(j.sc));
  return jobs;
}
const shard = (phase, i) => path.join(OUT, `${phase}.w${i}.jsonl`);
const keyOf = (j) => `${cfgId(j.c)}|${j.sc}|${j.seed}`;
export function loadRuns(phase, dir = OUT) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith(`${phase}.w`) || !f.endsWith('.jsonl')) continue;
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch (_) { /* torn */ } }
  }
  return out;
}
async function child(phase, i, n) {
  const jobs = jobsFor(phase).filter((_, k) => k % n === i);
  const done = new Set(loadRuns(phase).map((r) => r.jobKey));
  const fd = fs.openSync(shard(phase, i), 'a');
  let ran = 0;
  for (const j of jobs) {
    const key = keyOf(j); if (done.has(key)) continue;
    let r;
    try { r = await runScenario(j.sc, { seed: j.seed, params: j.c.shipped ? {} : j.c }); } catch (e) { r = { error: String(e && e.message || e) }; }
    fs.writeSync(fd, JSON.stringify({ jobKey: key, cfg: cfgId(j.c), scenario: j.sc, ...r }) + '\n');
    ran++;
  }
  fs.closeSync(fd);
  process.stdout.write(`worker ${i}: ran ${ran}\n`);
}
const [phase, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
if (rest.includes('--child')) await child(phase, Number(opt('child', 0)), Number(opt('n', 1)));
else if (phase) {
  const n = Number(opt('workers', 6));
  const t0 = Date.now();
  process.stdout.write(`${phase}: ${jobsFor(phase).length} jobs on ${n} workers -> ${OUT}\n`);
  await Promise.all([...Array(n).keys()].map((i) => new Promise((res) => {
    const c = spawn(process.execPath, [fileURLToPath(import.meta.url), phase, '--child', String(i), '--n', String(n)], { stdio: 'inherit' });
    c.on('exit', res);
  })));
  process.stdout.write(`${phase}: done in ${((Date.now() - t0) / 60000).toFixed(1)} min\n`);
}
