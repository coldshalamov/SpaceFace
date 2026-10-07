// Phase 2b system #4 sweep: NPC evasion + engagement spacing. Resumable and parallel, same shape as
// tetherSweep2a: each child appends one JSON line per (config, scenario, seed) to its own shard and
// skips keys already on disk.
//
//   node scripts/lab/sweeps/npcSweep4.mjs baseline --workers 6   # lab defaults (= master AI)
//   node scripts/lab/sweeps/npcSweep4.mjs grid     --workers 6   # knob grid, 3 seeds
//   node scripts/lab/sweeps/npcSweep4.mjs top      --workers 6   # best grid configs, 5 seeds
//   node scripts/lab/sweeps/npcSweep4.mjs verify   --workers 6   # on a production checkout (no seam)
//   node scripts/lab/sweeps/npcSweep4.mjs report
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runScenario, SCENARIOS, summarizeRuns } from '../benches/npcEvasion.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.LAB_OUT || path.resolve(HERE, '../../../design/program/lab/results/npc-2b');
fs.mkdirSync(OUT, { recursive: true });
const ALL = Object.keys(SCENARIOS);

// Knob grid. egressAwayCos: null = master (egress along current velocity, may point into the target).
export const GRID = {
  egressAwayCos: [0.6],
  strikeGate: [null, 1],
  orbitFarClosing: [null, 1],
  orbitThrottleFloor: [null, 0.6],
  jinkAuthority: [null, 0.7, 1],
  jinkCooldown: [null, 60],
};
export function gridConfigs() {
  const keys = Object.keys(GRID); const out = [{}]; // {} = master control
  const rec = (i, acc) => { if (i === keys.length) { out.push(acc); return; } for (const v of GRID[keys[i]]) rec(i + 1, { ...acc, [keys[i]]: v }); };
  rec(0, {});
  return out;
}
export const cfgId = (c) => c.shipped ? 'shipped' : Object.entries(c).filter(([, v]) => v != null).map(([k, v]) => `${k}=${v}`).join(',') || 'master';
const toLab = (c) => Object.fromEntries(Object.entries(c).filter(([k, v]) => v != null && k !== 'shipped'));

let EXTRA = [];
function jobsFor(phase) {
  const jobs = [];
  if (phase === 'baseline' || phase === 'verify') { for (const sc of ALL) for (const seed of [1, 2, 3, 4, 5]) jobs.push({ c: { shipped: true }, sc, seed }); return jobs; }
  if (phase === 'grid') { for (const c of gridConfigs()) for (const sc of ALL) for (const seed of [1, 2]) jobs.push({ c, sc, seed }); return jobs; }
  if (phase === 'top') {
    const E = { egressAwayCos: 0.6 };
    const cfgs = [{}, E,
      { ...E, strikeGate: 1, orbitFarClosing: 1 },
      { ...E, strikeGate: 1, orbitFarClosing: 1, jinkCooldown: 60 },
      { ...E, strikeGate: 1, orbitFarClosing: 1, jinkAuthority: 1 },
      { ...E, strikeGate: 1, orbitFarClosing: 1, jinkAuthority: 1, jinkCooldown: 60 },
      { ...E, strikeGate: 1, orbitFarClosing: 1, orbitThrottleFloor: 0.6, jinkAuthority: 0.7, jinkCooldown: 60 },
      { egressAwayCos: 0.8, strikeGate: 1, orbitFarClosing: 1, jinkAuthority: 1, jinkCooldown: 60 },
      { egressAwayCos: 0.8, strikeGate: 1, orbitFarClosing: 1, jinkAuthority: 0.7 },
    ];
    for (const c of [...cfgs, ...EXTRA]) for (const sc of ALL) for (const seed of [1, 2, 3, 4, 5]) jobs.push({ c, sc, seed });
    return jobs;
  }
  if (phase === 'top2') {
    const B = { egressTrack: 1, strikeGate: 1, orbitFarClosing: 1 };
    const cfgs = [];
    for (const egressAwayCos of [0.6, 0.8]) for (const jinkAuthority of [null, 0.7, 1]) for (const jinkCooldown of [null, 60]) cfgs.push({ egressAwayCos, ...B, jinkAuthority, jinkCooldown });
    for (const c of cfgs) for (const sc of ALL) for (const seed of [1, 2, 3, 4, 5]) jobs.push({ c, sc, seed });
    return jobs;
  }
  if (phase === 'top3') { // + longer swarm extend, re-scored with the turn-aware carry allowance
    const B = { egressTrack: 1, strikeGate: 1, orbitFarClosing: 1, swarmExtendMaxTicks: 150 };
    const cfgs = [{}];
    for (const egressAwayCos of [0.6, 0.8]) for (const jinkAuthority of [null, 0.7, 1]) cfgs.push({ egressAwayCos, ...B, jinkAuthority });
    for (const c of cfgs) for (const sc of ALL) for (const seed of [1, 2, 3, 4, 5]) jobs.push({ c, sc, seed });
    return jobs;
  }
  if (phase === 'probe') { // ad-hoc configs from PROBE_CFGS (JSON array)
    for (const c of JSON.parse(process.env.PROBE_CFGS || '[]')) for (const sc of ALL) for (const seed of [1, 2, 3]) jobs.push({ c, sc, seed });
    return jobs;
  }
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
function compact(r) {
  return { fired: r.fired, digest: r.digest, outcomes: r.outcomes, buckets: r.buckets,
    npc: r.npc.map((n) => ({ ...n, egressSegs: n.egressSegs.slice(0, 6) })) };
}
async function child(phase, i, n) {
  const jobs = jobsFor(phase).filter((_, k) => k % n === i);
  const done = new Set(loadRuns(phase).map((r) => r.key));
  const fd = fs.openSync(shard(phase, i), 'a');
  let ran = 0;
  for (const j of jobs) {
    const key = keyOf(j); if (done.has(key)) continue;
    const r = await runScenario(j.sc, { seed: j.seed, params: { npcLab: toLab(j.c) } });
    fs.writeSync(fd, JSON.stringify({ key, cfg: cfgId(j.c), config: j.c, scenario: j.sc, seed: j.seed, ...compact(r) }) + '\n');
    ran++;
  }
  fs.closeSync(fd);
  process.stdout.write(`worker ${i}: ran ${ran}\n`);
}

// Proof criteria (system #4). Hit bands are per hull class (unblocked hit%, hold + cruise pooled):
// light/agile hulls should make some shots miss for real, heavies should mostly get hit, nothing at
// ~100% and nothing near zero.
const CLASS = { wasp: 'agile', dart: 'agile', ghost: 'agile', corsair: 'agile', reaver: 'medium', lancer: 'medium', jackal: 'medium', bruiser: 'heavy', zealot: 'agile', lawman: 'medium' };
// Revised after top2 (decision, recorded in TUNING_LAB 10.x): the medium ceiling moved 92 -> 97 so the
// interceptor (reaver) is not forced into slippery territory; Robin wants shots to land.
export const BANDS = { agile: [60, 85], medium: [70, 97], heavy: [80, 97] };
// Robin (2026-10-07): the heavy/slow reaver and bruiser may be hit ~98% once the #3 turn rates land (PR #231).
export const TYPE_BANDS = { reaver: [70, 99], bruiser: [80, 99] };
const AGILE = new Set(['wasp', 'corsair', 'dart']);
export const CRITERIA = {
  egressOpenMin: 90,      // % of egress legs (>= 20 ticks) whose OWN radial motion is outward and heading out by the end
  egressDiveMaxPct: 1,    // % of legs whose own inward carry exceeds a quarter turn + braking distance at entry speed + 15 wu
  nearHitMin: 85,         // <= 130 wu: shots land
  agileFarManMin: 8,      // agile hulls at > 200 wu: some rounds miss for real (target manoeuvre)
};
export function judge(runs) {
  const rows = summarizeRuns(runs.map((r) => ({ ...r, variant: r.cfg })));
  const fails = []; const perType = {};
  for (const row of rows) {
    const type = row.scenario.split('-')[0];
    const t = perType[type] || (perType[type] = { n: 0, hit: 0, nearN: 0, nearHit: 0, farN: 0, farMan: 0, egN: 0, egOpen: 0, dive: 0 });
    const rs = runs.filter((r) => r.scenario === row.scenario);
    for (const r of rs) {
      for (const b of ['near', 'mid', 'far']) { t.n += r.buckets[b].unblocked; t.hit += r.buckets[b].hit; }
      t.nearN += r.buckets.near.unblocked; t.nearHit += r.buckets.near.hit; t.farN += r.buckets.far.unblocked; t.farMan += r.buckets.far.maneuver;
      for (const n of r.npc) { t.egN += n.egressN; const op = n.egressOwnOpenPct != null ? n.egressOwnOpenPct : n.egressOpenPct; t.egOpen += op != null ? op * n.egressN / 100 : 0; t.dive += n.egressOwnDiveN != null ? n.egressOwnDiveN : n.egressDiveN; }
    }
  }
  const summary = {};
  let egN = 0, egOpen = 0, dive = 0;
  for (const [type, t] of Object.entries(perType)) {
    const ub = t.n ? 100 * t.hit / t.n : null; const near = t.nearN ? 100 * t.nearHit / t.nearN : null; const farMan = t.farN ? 100 * t.farMan / t.farN : null;
    summary[type] = { ubHit: ub && +ub.toFixed(1), nearHit: near && +near.toFixed(1), farMan: farMan && +farMan.toFixed(1), farN: t.farN, egN: t.egN, egOpen: t.egN ? +(100 * t.egOpen / t.egN).toFixed(1) : null, dive: t.dive };
    egN += t.egN; egOpen += t.egOpen; dive += t.dive;
    const band = TYPE_BANDS[type] || BANDS[CLASS[type] || 'medium'];
    if (ub != null && (ub < band[0] || ub > band[1])) fails.push(`${type}:ubHit ${ub.toFixed(1)} not in ${band[0]}-${band[1]}`);
    if (near != null && t.nearN >= 20 && near < CRITERIA.nearHitMin) fails.push(`${type}:near ${near.toFixed(1)}`);
    if (AGILE.has(type) && t.farN >= 20 && farMan < CRITERIA.agileFarManMin) fails.push(`${type}:farMan ${farMan.toFixed(1)}`);
  }
  const egOpenPct = egN ? 100 * egOpen / egN : null;
  if (egOpenPct != null && egOpenPct < CRITERIA.egressOpenMin) fails.push(`egressOpen ${egOpenPct.toFixed(1)}`);
  if (egN && 100 * dive / egN > CRITERIA.egressDiveMaxPct) fails.push(`egressDive ${dive}/${egN}`);
  return { fails, egOpenPct: egOpenPct && +egOpenPct.toFixed(1), dive, egN, perType: summary };
}
export function rank(runs) {
  const groups = new Map();
  for (const r of runs) { if (!groups.has(r.cfg)) groups.set(r.cfg, { config: r.config, runs: [] }); groups.get(r.cfg).runs.push(r); }
  const out = [];
  for (const [cfg, g] of groups) out.push({ cfg, config: g.config, n: g.runs.length, ...judge(g.runs) });
  out.sort((a, b) => a.fails.length - b.fails.length || b.egOpenPct - a.egOpenPct || a.dive - b.dive);
  return out;
}
function report() {
  const res = {};
  for (const phase of ['baseline', 'grid', 'top', 'top2', 'top3', 'probe', 'verify']) {
    const runs = loadRuns(phase); if (!runs.length) continue;
    const ranked = rank(runs);
    res[phase] = { runs: runs.length, configs: ranked.length, passing: ranked.filter((r) => !r.fails.length).length, top: ranked.slice(0, 12) };
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 1).slice(0, 12000));
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
