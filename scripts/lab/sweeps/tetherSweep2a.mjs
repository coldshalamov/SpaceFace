// Phase 2a tether sweep around v4 (v3 core + live-line dash cap + aim-direction latch + absolute
// yaw-cap governor). Resumable and parallel: the parent splits the job list over N child
// processes; each child appends one JSON line per (config, scenario, seed) to its own shard and
// skips anything already on disk, so a killed sweep simply restarts where it stopped.
//
//   node scripts/lab/sweeps/tetherSweep2a.mjs grid --workers 4      # 243 configs x 15 scen x 3 seeds
//   node scripts/lab/sweeps/tetherSweep2a.mjs top  --workers 4      # top 10 x 19 scen x 5 seeds
//   node scripts/lab/sweeps/tetherSweep2a.mjs helm --workers 4      # direction-latch modes
//   node scripts/lab/sweeps/tetherSweep2a.mjs report                # rank everything on disk
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScenario, V4, SCENARIOS } from '../benches/tetherSpin.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../../design/program/lab/results/tether-2a');
fs.mkdirSync(OUT, { recursive: true });

export const MAIN_SCENARIOS = ['spin-plain', 'spin-plain-left', 'spin-boost-hold', 'spin-boost-taps', 'spin-short-line',
  'spin-long-line', 'spin-heavy-anchor', 'spin-light-anchor', 'latch-moving-with', 'latch-moving-against',
  'release-regrab', 'helm-cursor-spin', 'spin-then-coast', 'spin-dash-spam', 'spin-reverse'];
export const HELM_SCENARIOS = ['helm-cursor-spin', 'helm-cursor-anchor', 'helm-cursor-far-left', 'helm-boost'];
const ALL_SCENARIOS = [...MAIN_SCENARIOS, ...HELM_SCENARIOS.filter((s) => !MAIN_SCENARIOS.includes(s))];

export const GRID = {
  lineLockMargin: [1.05, 1.1, 1.25],
  alignTimeS: [0.25, 0.4, 0.55],
  lendYawAccelMult: [1, 2, 4],
  lockGovernorMargin: [0.9, 0.95, 0.98],
  dashCapMult: [0.8, 1.0, 1.2],
};
export function gridConfigs() {
  const keys = Object.keys(GRID); const out = [];
  const rec = (i, acc) => {
    if (i === keys.length) { out.push(acc); return; }
    for (const v of GRID[keys[i]]) rec(i + 1, { ...acc, [keys[i]]: v });
  };
  rec(0, {});
  return out;
}
/** Phase 2a production pick (see helm phase note). */
export const CHOSEN = Object.freeze({ lineLockMargin: 1.25, alignTimeS: 0.25, lendYawAccelMult: 1, lockGovernorMargin: 0.95, dashCapMult: 1 });
export const cfgId = (c) => `lm${c.lineLockMargin}_a${c.alignTimeS}_y${c.lendYawAccelMult}_g${c.lockGovernorMargin}_d${c.dashCapMult}${c.directionLatch && c.directionLatch !== 'aim' ? '_L' + c.directionLatch : ''}${c.forwardCommit === false ? '_noFC' : ''}${c.thrustGate === false ? '_noTG' : ''}`;

function jobsFor(phase) {
  if (phase === 'grid') {
    const jobs = [];
    for (const c of gridConfigs()) for (const sc of MAIN_SCENARIOS) for (const seed of [1, 2, 3]) jobs.push({ c, sc, seed });
    return jobs;
  }
  if (phase === 'top') {
    const ranked = rank(loadRuns('grid'), MAIN_SCENARIOS).slice(0, 10);
    const jobs = [];
    for (const r of ranked) for (const sc of ALL_SCENARIOS) for (const seed of [1, 2, 3, 4, 5]) jobs.push({ c: r.config, sc, seed });
    return jobs;
  }
  if (phase === 'helm') {
    // All ten finalists pass every criterion on 5 seeds and differ by <0.03 s settle; the shipped
    // pick is the simplest of them (CHOSEN): no yaw-accel lending beyond the rate ratio, dash cap
    // at exactly the boosted speed cap.
    const base = CHOSEN;
    const jobs = [];
    for (const latch of ['off', 'aim', 'all']) {
      const c = { ...base, directionLatch: latch };
      for (const sc of [...HELM_SCENARIOS, 'spin-reverse', 'spin-plain-left', 'latch-moving-against']) for (const seed of [1, 2, 3, 4, 5]) jobs.push({ c, sc, seed });
    }
    return jobs;
  }
  if (phase === 'ablate') {
    // Which pieces of the pick are load-bearing? Master removed heading direction-commit (R2), so
    // forwardCommit must earn its place; thrustGate likewise touches thrust from the yaw helper.
    const jobs = [];
    const variants = [
      { ...CHOSEN, forwardCommit: false }, { ...CHOSEN, thrustGate: false }, { ...CHOSEN, forwardCommit: false, thrustGate: false },
      { ...CHOSEN, alignTimeS: 0.55 }, { ...CHOSEN, alignTimeS: 0.55, forwardCommit: false, thrustGate: false },
    ];
    for (const c of variants) for (const sc of ALL_SCENARIOS) for (const seed of [1, 2, 3, 4, 5]) jobs.push({ c, sc, seed });
    return jobs;
  }
  if (phase === 'verify') {
    // Same as baseline, but meant to run on a production checkout (no lab seam): proves the
    // shipped code itself, not the lab switches.
    const jobs = [];
    for (const sc of ALL_SCENARIOS) for (const seed of [1, 2, 3, 4, 5]) jobs.push({ c: { shipped: true }, sc, seed });
    return jobs;
  }
  if (phase === 'baseline') {
    const jobs = [];
    for (const sc of ALL_SCENARIOS) for (const seed of [1, 2, 3, 4, 5]) jobs.push({ c: { shipped: true }, sc, seed });
    return jobs;
  }
  throw new Error(`unknown phase ${phase}`);
}

const shard = (phase, i) => path.join(OUT, `${phase}.w${i}.jsonl`);
const keyOf = (j) => `${j.c.shipped ? 'shipped' : cfgId(j.c)}|${j.sc}|${j.seed}`;

export function loadRuns(phase) {
  const out = [];
  if (!fs.existsSync(OUT)) return out;
  for (const f of fs.readdirSync(OUT)) {
    if (!f.startsWith(`${phase}.w`) || !f.endsWith('.jsonl')) continue;
    for (const line of fs.readFileSync(path.join(OUT, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch (_) { /* torn last line from a kill: ignore */ }
    }
  }
  return out;
}

function compact(r) {
  return {
    omega: r.omegaPlain && r.omegaPlain.p50, omegaBoost: r.omegaBoost && r.omegaBoost.p50,
    effPhys: r.effPhysPlain, effPhysBoost: r.effPhysBoost, effYaw: r.efficiencyPlain,
    theoryPhys: r.theoryPhysPlain, period: r.periodS && r.periodS.p50,
    noseP50: r.noseErrDeg && r.noseErrDeg.p50, noseP95: r.noseErrDeg && r.noseErrDeg.p95, noseMax: r.noseErrMax,
    settle: r.settleS && r.settleS.max, wrongTurn: r.wrongTurnPct, reversed: r.reversedPct, off90: r.noseOff90Pct,
    orbitFlips: r.orbitFlips, selFlips: r.selectedFlips, expectFlips: r.expectFlips, pump: r.pumpRatio,
    active: r.assistActivePct, followsIntent: r.followsIntent, steadyTicks: r.steadyTicks, digest: r.digest,
  };
}

async function child(phase, i, n) {
  const jobs = jobsFor(phase).filter((_, k) => k % n === i);
  const done = new Set(loadRuns(phase).map((r) => r.key));
  const fd = fs.openSync(shard(phase, i), 'a');
  let ran = 0;
  for (const j of jobs) {
    const key = keyOf(j);
    if (done.has(key)) continue;
    const params = j.c.shipped ? {} : { orbitLab: V4(j.c) };
    const r = await runScenario(j.sc, { seed: j.seed, params });
    fs.writeSync(fd, JSON.stringify({ key, cfg: j.c.shipped ? 'shipped' : cfgId(j.c), config: j.c, scenario: j.sc, seed: j.seed, ...compact(r) }) + '\n');
    ran++;
  }
  fs.closeSync(fd);
  process.stdout.write(`worker ${i}: ran ${ran}\n`);
}

/** Proof criteria (Phase 2a brief). Returns failures for one config's runs. */
export function judge(runs, scenarios) {
  const fails = [];
  const byScen = new Map();
  for (const r of runs) { if (!byScen.has(r.scenario)) byScen.set(r.scenario, []); byScen.get(r.scenario).push(r); }
  let worstNose = 0; let minEff = Infinity; let maxPump = 0; let settleSum = 0; let settleN = 0; let effSum = 0; let effN = 0;
  for (const sc of scenarios) {
    const rs = byScen.get(sc) || [];
    if (!rs.length) { fails.push(`${sc}:missing`); continue; }
    const mean = (k) => { const v = rs.map((r) => r[k]).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const maxOf = (k) => rs.reduce((m, r) => Math.max(m, Number.isFinite(r[k]) ? r[k] : 0), 0);
    const eff = mean('effPhys');
    if (sc !== 'spin-dash-spam') {
      if (!(eff >= 0.97)) fails.push(`${sc}:eff ${eff == null ? '-' : eff.toFixed(3)}`);
      if (Number.isFinite(eff)) { minEff = Math.min(minEff, eff); effSum += eff; effN++; }
      // Sustained boost must reach the boosted best too (6-tick taps physically cannot).
      if (sc === 'spin-boost-hold' || sc === 'helm-boost') {
        const eb = mean('effPhysBoost');
        if (!(eb >= 0.97)) fails.push(`${sc}:effBoost ${eb == null ? '-' : eb.toFixed(3)}`);
      }
    }
    const nm = maxOf('noseMax'); worstNose = Math.max(worstNose, nm);
    if (nm > 5) fails.push(`${sc}:nose ${nm.toFixed(1)}`);
    if (maxOf('wrongTurn') > 0) fails.push(`${sc}:wrongTurn`);
    const ex = rs[0].expectFlips || 0;
    if (maxOf('orbitFlips') > ex || maxOf('selFlips') > ex) fails.push(`${sc}:flips`);
    const pm = maxOf('pump'); maxPump = Math.max(maxPump, pm);
    if (pm > 1.8) fails.push(`${sc}:pump ${pm.toFixed(2)}`);
    if (rs.some((r) => r.followsIntent === false)) fails.push(`${sc}:ignoresIntent`);
    const st = mean('settle'); if (Number.isFinite(st)) { settleSum += st; settleN++; }
  }
  return { fails, worstNose, minEff: minEff === Infinity ? null : minEff, meanEff: effN ? effSum / effN : null, maxPump, meanSettle: settleN ? settleSum / settleN : null };
}

export function rank(runs, scenarios) {
  const groups = new Map();
  for (const r of runs) { if (!groups.has(r.cfg)) groups.set(r.cfg, { config: r.config, runs: [] }); groups.get(r.cfg).runs.push(r); }
  const out = [];
  for (const [cfg, g] of groups) out.push({ cfg, config: g.config, n: g.runs.length, ...judge(g.runs, scenarios) });
  out.sort((a, b) => a.fails.length - b.fails.length || a.worstNose - b.worstNose
    || (b.minEff || 0) - (a.minEff || 0) || (a.meanSettle || 0) - (b.meanSettle || 0));
  return out;
}

function report() {
  const res = {};
  for (const [phase, scen] of [['baseline', ALL_SCENARIOS], ['grid', MAIN_SCENARIOS], ['top', ALL_SCENARIOS], ['ablate', ALL_SCENARIOS], ['verify', ALL_SCENARIOS]]) {
    const runs = loadRuns(phase);
    if (!runs.length) continue;
    const ranked = rank(runs, scen);
    if (phase === 'grid') {
      // Every grid config, ranked (the raw grid shards are large and regenerable; this is the record).
      const lines = ['rank,cfg,lineLockMargin,alignTimeS,lendYawAccelMult,lockGovernorMargin,dashCapMult,fails,worstNoseDeg,minEffPhys,meanEffPhys,maxPump,meanSettleS,failList'];
      ranked.forEach((r, i) => lines.push([i + 1, r.cfg, r.config.lineLockMargin, r.config.alignTimeS, r.config.lendYawAccelMult,
        r.config.lockGovernorMargin, r.config.dashCapMult, r.fails.length, r.worstNose.toFixed(2), r.minEff && r.minEff.toFixed(4),
        r.meanEff && r.meanEff.toFixed(4), r.maxPump.toFixed(3), r.meanSettle && r.meanSettle.toFixed(3), `"${r.fails.join('; ')}"`].join(',')));
      fs.writeFileSync(path.join(OUT, 'grid-ranked.csv'), lines.join('\n') + '\n');
    }
    res[phase] = { runs: runs.length, configs: ranked.length, passing: ranked.filter((r) => !r.fails.length).length,
      top: ranked.slice(0, 15).map((r) => ({ cfg: r.cfg, n: r.n, fails: r.fails, worstNose: +r.worstNose.toFixed(2),
        minEff: r.minEff && +r.minEff.toFixed(4), meanEff: r.meanEff && +r.meanEff.toFixed(4), maxPump: +r.maxPump.toFixed(3), meanSettle: r.meanSettle && +r.meanSettle.toFixed(3) })) };
  }
  const helm = loadRuns('helm');
  if (helm.length) {
    const byLatch = {};
    for (const r of helm) {
      const L = r.config.directionLatch; (byLatch[L] = byLatch[L] || []).push(r);
    }
    res.helm = {};
    for (const [L, rs] of Object.entries(byLatch)) {
      const per = {};
      for (const r of rs) { (per[r.scenario] = per[r.scenario] || []).push(r); }
      res.helm[L] = Object.fromEntries(Object.entries(per).map(([sc, xs]) => [sc, {
        effPhys: +(xs.reduce((a, x) => a + (x.effPhys || 0), 0) / xs.length).toFixed(4),
        noseMax: +Math.max(...xs.map((x) => x.noseMax || 0)).toFixed(2),
        orbitFlips: Math.max(...xs.map((x) => x.orbitFlips || 0)), selFlips: Math.max(...xs.map((x) => x.selFlips || 0)),
        followsIntent: xs.every((x) => x.followsIntent !== false), active: +(xs.reduce((a, x) => a + (x.active || 0), 0) / xs.length).toFixed(1),
      }]));
    }
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 1).slice(0, 6000));
}

const [phase, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
if (phase === 'report') report();
else if (opt('child')) await child(phase, Number(opt('child')), Number(opt('n')));
else if (phase) {
  const n = Number(opt('workers', 4));
  const total = jobsFor(phase).length;
  console.log(`${phase}: ${total} jobs on ${n} workers -> ${OUT}`);
  const t0 = Date.now();
  await Promise.all(Array.from({ length: n }, (_, i) => new Promise((resolve) => {
    const p = spawn(process.execPath, [fileURLToPath(import.meta.url), phase, '--child', String(i - 0), '--n', String(n)], { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', resolve);
  })));
  console.log(`${phase}: done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  report();
}
