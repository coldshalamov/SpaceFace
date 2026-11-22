// IS IT SMOOTH? (referee, 2026-11-22). One command that plays the desktop build the way the owner
// does, in his configuration, and says in plain numbers whether it is smooth.
//
//   npm run check:smooth                 five routes, about 75 s each plus load
//   npm run check:smooth -- --quick      Swarm round 6 in his room only, about 45 s plus load
//   npm run check:smooth -- --routes=swarm-r6,adventure-helios [--seconds=60] [--cap=60] [--trace]
//   npm run check:smooth -- --routes=swarm-r2 --census      also a draw census after the judged window
//       (<evidence>/census.txt: WebGL calls by name, every draw by owner/material/program, scene size)
//   npm run check:smooth -- --routes=swarm-r2 --trace       also what the browser does around the
//       game's JavaScript, per thread (<evidence>/trace-breakdown.txt)
//   npm run check:smooth -- --routes=swarm-r2 --eval-file=x.js   an experiment: x.js runs in the page
//       before the route starts (history marks the row; never a scoreboard row)
//   npm run check:smooth -- --routes=swarm-r2 --profile     also a per-function main-thread profile,
//       live world only, in ms per presented frame (<evidence>/profile.txt). A profiled run carries
//       the sampler's own cost: it finds owners, it is not a scoreboard row (history marks it).
//
// Each route runs scripts/probe-smooth-electron.mjs under the machine's game lock: his one-file sim
// worker, a 1920x1080 drawing buffer, his saved video settings, a window that never takes focus,
// dense hand-like input. Every route is measured two ways in the same run, in alternating 10 s
// segments: AS HE HAS IT (the game's own frame cap) and CAP LIFTED (--cap, default 60).
//
// THE SHIP BAR (judged on the cap-lifted row, the room the game has to spare):
//   frame time p50 <= 16.7 ms, p95 <= 33 ms, no frame over 100 ms while the world is live,
//   no main-thread task over 50 ms, world speed >= 0.97, zero freeze-log entries.
// The as-he-has-it row reads "at cap N" when it sits on the cap (p50 within 1 ms, p95 <= cap + 7 ms).
//
// Evidence: .devshots/smooth/<stamp>-<route>/ ; one line per route appended to
// .devshots/smooth/history.jsonl (time, commit, numbers). This machine's load swings: compare two
// runs only when "other load" is similar, and do not call a change under ~10 % progress.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const QUICK = argv.quick === true;
const CAP = Number(argv.cap ?? 60);
// The Foundry (helios_core) is the default room and the only room in the owner's 199 recorded runs.
const ROUTES = {
  'swarm-r2': { label: 'Swarm round 2, Foundry', args: ['--route=swarm', '--round=2'] },
  'swarm-r6': { label: 'Swarm round 6, Foundry', args: ['--route=swarm', '--round=6'] },
  'swarm-r12': { label: 'Swarm round 12, Foundry', args: ['--route=swarm', '--round=12'] },
  'swarm-r6-mill': { label: 'Swarm round 6, Asteroid Mill', args: ['--route=swarm', '--round=6', '--arena=asteroid_mill'] },
  'swarm-r6-hornet': { label: 'Swarm round 6, Foundry, Hornet', args: ['--route=swarm', '--round=6', '--hull=ship_hornet'] },
  'adventure-helios': { label: 'Adventure, Helios + sector edge', args: ['--route=adventure', '--sector=sector_helios_prime', '--seed=4242'] },
};
const DEFAULT_ROUTES = ['swarm-r2', 'swarm-r6', 'swarm-r12', 'swarm-r6-mill', 'adventure-helios'];
const names = argv.routes ? String(argv.routes).split(',').filter(Boolean) : QUICK ? ['swarm-r6'] : DEFAULT_ROUTES;
const SECONDS = Number(argv.seconds || (QUICK ? 45 : 75));
const BAR = { p50: 16.7, p95: 33, over100: 0, longTask: 50, world: 0.97, freeze: 0 };

const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (_) { return ''; } };
const commit = git('rev-parse', '--short=10', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no').split(/\r?\n/).filter(Boolean).length;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const SMOOTH = join(ROOT, '.devshots', 'smooth');
mkdirSync(SMOOTH, { recursive: true });

const results = [];
for (const name of names) {
  const route = ROUTES[name];
  if (!route) { console.log(`[smooth] unknown route ${name}; known: ${Object.keys(ROUTES).join(', ')}`); process.exitCode = 2; continue; }
  const out = join(SMOOTH, `${STAMP}-${name}`);
  console.log(`[smooth] ${route.label}: ${SECONDS} s of dense input (waiting for the game lock)...`);
  const run = spawnSync(process.execPath, ['scripts/fleet/game-lock.mjs', 'run', '--', process.execPath, 'scripts/probe-smooth-electron.mjs',
    ...route.args, `--seconds=${SECONDS}`, `--cap=${CAP}`, ...(argv.trace ? [`--trace${argv.trace === true ? '' : `=${argv.trace}`}`] : []),
    ...(argv.census === true ? ['--census'] : []), ...(typeof argv['eval-file'] === 'string' ? [`--eval-file=${argv['eval-file']}`] : []),
    ...(argv.profile ? [`--profile${argv.profile === true ? '' : `=${argv.profile}`}`] : []), ...(argv['profile-interval'] ? [`--profile-interval=${argv['profile-interval']}`] : []), `--out=${out}`],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', // The wait for the game lock can be long (first come, first served); it is not part of the run budget.
    timeout: (SECONDS + 900) * 1000 + 4 * 3600 * 1000 });
  const text = `${run.stdout || ''}${run.stderr || ''}`;
  for (const line of text.split(/\r?\n/)) if (/^smooth probe|PROBE (FAILED|REFUSED)|game-lock\]/.test(line)) console.log(`  ${line.slice(0, 400)}`);
  let report = null;
  try { report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')); } catch (_) { /* below */ }
  try { writeFileSync(join(out, 'probe-output.txt'), text); } catch (_) { /* evidence only */ }
  results.push({ name, label: route.label, out, report });
}

// ---- judgement ----
function judge(report) {
  const lift = report.modes.lift || null;
  const asis = report.modes.asis || null;
  const checks = [];
  const add = (what, value, limit, pass, unit = '') => checks.push({ what, value, limit, pass, unit });
  if (lift) {
    add('frame p50 (cap lifted)', lift.all.p50, `<= ${BAR.p50}`, lift.all.p50 <= BAR.p50, ' ms');
    add('frame p95 (cap lifted)', lift.all.p95, `<= ${BAR.p95}`, lift.all.p95 <= BAR.p95, ' ms');
  } else add('cap-lifted row', 'missing', 'present', false);
  const over100 = (lift ? lift.all.over100 : 0) + (asis ? asis.all.over100 : 0);
  const worst = Math.max(lift ? lift.all.max : 0, asis ? asis.all.max : 0);
  add('frames over 100 ms (live)', over100, '0', over100 === 0, over100 ? ` (worst ${worst} ms)` : '');
  add('longest main-thread task', report.longTasks.longestMs, `<= ${BAR.longTask}`, report.longTasks.longestMs <= BAR.longTask, ' ms');
  add('world speed', report.world.speed, `>= ${BAR.world}`, report.world.speed >= BAR.world);
  if (report.world.worst10s != null) add('world speed, worst 10 s', report.world.worst10s, `>= ${BAR.world}`, report.world.worst10s >= BAR.world);
  add('freeze-log entries', report.freeze.logEntries, '0', report.freeze.logEntries === 0);
  if (report.freeze.silentHoldMs > 0) add('silent hold (no pause plate)', report.freeze.silentHoldMs, '0', false, ' ms');
  return { pass: checks.every((c) => c.pass), checks };
}
// MILESTONE 1 (director, 2026-11-22), judged on the as-he-has-it row: a locked 30.
function judgeMilestone1(report) {
  const asis = report.modes.asis || null;
  const checks = [];
  const add = (what, value, limit, pass, unit = '') => checks.push({ what, value, limit, pass, unit });
  if (asis) {
    add('frame p95 as presented', asis.all.p95, '<= 33', asis.all.p95 <= 33.9, ' ms');
    add('frames over 100 ms (live)', asis.all.over100, '0', asis.all.over100 === 0, asis.all.over100 ? ` (worst ${asis.all.max} ms)` : '');
  } else add('as-he-has-it row', 'missing', 'present', false);
  add('world speed', report.world.speed, '>= 0.97', report.world.speed >= 0.97);
  add('freeze-log entries', report.freeze.logEntries, '0', report.freeze.logEntries === 0);
  return { pass: checks.every((c) => c.pass), checks };
}
function capWord(report) {
  const asis = report.modes.asis; if (!asis) return '';
  const cap = Number(Object.entries(report.capChosen || {}).sort((a, b) => b[1] - a[1])[0]?.[0]) || 0;
  if (!cap) return 'no cap';
  const interval = 1000 / cap;
  return Math.abs(asis.all.p50 - interval) <= 1 && asis.all.p95 <= interval + 7 ? `at cap ${cap}` : `under cap ${cap}`;
}

const pad = (v, n) => String(v ?? '-').padEnd(n);
const lines = [];
let failed = false;
let m1Failed = false;
lines.push('');
lines.push(`IS IT SMOOTH?   commit ${commit}${dirty ? ` (+${dirty} uncommitted files)` : ''}   ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z   1920x1080, his settings, his worker bundle`);
lines.push(`${pad('route', 31)}${pad('row', 14)}${pad('fps', 7)}${pad('p50', 7)}${pad('p95', 7)}${pad('p99', 7)}${pad('max', 8)}${pad('>50', 5)}${pad('>100', 6)}${pad('cb p50/95', 12)}${pad('busy', 6)}note`);
for (const r of results) {
  const rep = r.report;
  if (!rep || rep.ok !== true) {
    failed = true;
    lines.push(`${pad(r.label, 31)}NOT MEASURED: ${rep ? rep.failed : 'no report (probe crashed or timed out)'}`);
    continue;
  }
  const verdict = judge(rep);
  r.verdict = verdict;
  r.m1 = judgeMilestone1(rep);
  if (!verdict.pass) failed = true;
  if (!r.m1.pass) m1Failed = true;
  for (const [mode, word] of [['asis', 'as he has it'], ['lift', `cap lifted ${rep.liftCap}`]]) {
    const m = rep.modes[mode]; if (!m) continue;
    const a = m.all;
    lines.push(`${pad(mode === 'asis' ? r.label : '', 31)}${pad(word, 14)}${pad(a.fps, 7)}${pad(a.p50, 7)}${pad(a.p95, 7)}${pad(a.p99, 7)}${pad(a.max, 8)}${pad(a.over50, 5)}${pad(a.over100, 6)}${pad(`${a.cbP50}/${a.cbP95}`, 12)}${pad(m.busy ? Math.round(m.busy.fraction * 100) + '%' : '-', 6)}${mode === 'asis' ? capWord(rep) : ''}`);
    const t = m.transitions;
    if (t.frames) lines.push(`${pad('', 31)}${pad('  transitions', 14)}${pad(t.fps, 7)}${pad(t.p50, 7)}${pad(t.p95, 7)}${pad(t.p99, 7)}${pad(t.max, 8)}${pad(t.over50, 5)}${pad(t.over100, 6)}(${t.seconds} s after run start, pick, shop or pause)`);
  }
  const g = rep.gpu && rep.gpu.passes ? Object.entries(rep.gpu.passes).map(([k, v]) => `${k} ${v.avg}`).join(', ') : null;
  lines.push(`${pad('', 31)}world x${rep.world.speed}${rep.world.worst10s != null ? ` (worst 10 s x${rep.world.worst10s})` : ''}; worker step p50 ${rep.worker.stepP50} p95 ${rep.worker.stepP95} ms; longest task ${rep.longTasks.longestMs} ms (${rep.longTasks.over50} over 50); freeze log ${rep.freeze.logEntries}; data age ${rep.freeze.dataAgeMaxMs} ms; GPU ms ${g || (rep.gpu && rep.gpu.status) || 'n/a'}`);
  lines.push(`${pad('', 31)}fight: round ${rep.fight.wave.join('-')}, ${rep.fight.shipsMedian} ships (max ${rep.fight.shipsMax}), ${rep.fight.drawCallsMedian} draw calls, live ${Math.round(rep.fight.liveFraction * 100)} %${rep.fight.sectors.length > 1 ? `, sectors ${rep.fight.sectors.join(' -> ')}` : ''}; other load on the machine ${rep.machine.otherLoadFraction != null ? Math.round(rep.machine.otherLoadFraction * 100) + ' %' : '?'}${rep.machine.otherLoadFraction > 0.4 ? '  ** LOADED: a worst-case number, not a verdict **' : ''}`);
}
for (const r of results) for (const n of (r.report && r.report.notes) || []) lines.push(`note (${r.label}): ${n}`);
lines.push('');
lines.push('MILESTONE 1: A LOCKED 30 (as he has it: p95 <= 33 ms as presented, no frame over 100 ms, world >= 0.97, no freeze)');
for (const r of results) {
  if (!r.m1) continue;
  lines.push(`${pad(r.label, 31)}${r.m1.pass ? 'PASS' : 'FAIL'}`);
  for (const c of r.m1.checks) lines.push(`   ${c.pass ? 'pass' : 'FAIL'}  ${pad(c.what, 30)}${c.value}${c.unit}  (bar ${c.limit})`);
}
lines.push('');
lines.push('THE SHIP BAR: 60 (cap-lifted row)');
for (const r of results) {
  if (!r.verdict) continue;
  lines.push(`${pad(r.label, 31)}${r.verdict.pass ? 'PASS' : 'FAIL'}`);
  for (const c of r.verdict.checks) {
    lines.push(`   ${c.pass ? 'pass' : 'FAIL'}  ${pad(c.what, 30)}${c.value}${c.unit}  (bar ${c.limit})`);
  }
}
lines.push('');
lines.push('LONG FRAMES AND THEIR OWNERS (over 50 ms while the world is live; worst first)');
for (const r of results) {
  const rep = r.report; if (!rep || rep.ok !== true) continue;
  const all = [...(rep.modes.asis ? rep.modes.asis.hitches : []), ...(rep.modes.lift ? rep.modes.lift.hitches : [])].sort((a, b) => b.ms - a.ms);
  const byOwner = new Map();
  for (const h of all) {
    const key = `${h.owner.kind}: ${String(h.owner.what).replace(/ \d+ ms/g, '').slice(0, 110)}`;
    const o = byOwner.get(key) || { n: 0, worst: 0, over100: 0, transition: 0 };
    o.n++; o.worst = Math.max(o.worst, h.ms); if (h.ms > 100) o.over100++; if (h.kind === 'transition') o.transition++;
    byOwner.set(key, o);
  }
  lines.push(`${r.label}: ${all.length} long frames, ${all.filter((h) => h.ms > 100).length} over 100 ms`);
  for (const [key, o] of [...byOwner.entries()].sort((a, b) => b[1].worst - a[1].worst).slice(0, 6)) {
    lines.push(`   x${pad(o.n, 4)} worst ${pad(Math.round(o.worst) + ' ms', 8)} ${o.over100 ? `(${o.over100} over 100) ` : ''}${o.transition ? `[${o.transition} in transitions] ` : ''}${key}`);
  }
  const lt = rep.longTasks.top[0];
  if (lt) lines.push(`   longest main-thread task ${lt.ms} ms: ${lt.owner.kind}: ${String(lt.owner.what).slice(0, 120)}`);
  if (rep.timerHoles && rep.timerHoles.length) lines.push(`   a 50 ms timer on the main thread went unserved (timers starve while frames and worker messages run): ${rep.timerHoles.slice(0, 4).map((h) => `${h.ms} ms at ${(h.at / 1000).toFixed(1)} s`).join(', ')}`);
}
for (const r of results) {
  const pr = r.report && r.report.profile; if (!pr) continue;
  lines.push('');
  if (!pr.ok) { lines.push(`PROFILE (${r.label}): not made: ${pr.why}`); continue; }
  const b = pr.buckets; const n = (v) => String(v.toFixed(2)).padStart(8);
  lines.push(`PROFILE (${r.label}), main thread, live world only, ms per presented frame: all ${b.all.frames} frames | ${b.made30.frames} that made 30 | ${b.three.frames} at 3 refreshes | ${b.long.frames} at 4+`);
  lines.push(`   busy ${b.all.busyMs} | ${b.made30.busyMs} | ${b.three.busyMs} | ${b.long.busyMs}    idle ${b.all.idleMs} | ${b.made30.idleMs} | ${b.three.idleMs} | ${b.long.idleMs}    full tables: ${join(r.out, 'profile.txt').replace(ROOT, '').replace(/\\/g, '/')}`);
  lines.push(`   ${'all'.padStart(8)}${'made30'.padStart(8)}${'3'.padStart(8)}${'4+'.padStart(8)}  by entry point, then self time by file, then by function`);
  for (const row of [...pr.entryPoints.slice(0, 6), ...pr.byFile.slice(0, 10), ...pr.self.slice(0, 22)]) lines.push(`   ${n(row.all)}${n(row.made30)}${n(row.three)}${n(row.long)}  ${row.fn}`);
}
for (const r of results) {
  const c = r.report && r.report.census; if (!c) continue;
  lines.push('');
  lines.push(`CENSUS (${r.label}), per presented frame: ${c.drawsPerFrame} draws, ${c.materialChangesPerFrame} material changes, ${c.programChangesPerFrame} program changes, ${c.uniformCallsPerFrame} uniform calls, ${c.bufferSubDataPerFrame} buffer uploads; scene ${c.sceneNodes} nodes (${c.visibleNodes} visible); full: ${join(r.out, 'census.txt').replace(ROOT, '').replace(/\\/g, '/')}`);
}
for (const r of results) {
  const tb = r.report && r.report.traceBreakdown; if (!tb) continue;
  lines.push('');
  if (!tb.ok) { lines.push(`TRACE (${r.label}): not made: ${tb.why}`); continue; }
  lines.push(`TRACE (${r.label}), live world only, ms per presented frame, self time by browser event; full: ${join(r.out, 'trace-breakdown.txt').replace(ROOT, '').replace(/\\/g, '/')}`);
  for (const t of tb.threads.slice(0, 5)) lines.push(`   ${String(t.busyMsPerFrame).padStart(7)} busy  ${t.thread}: ${t.self.slice(0, 9).map((x) => `${x.name} ${x.ms}`).join(', ')}`);
}
lines.push('');
lines.push(`MILESTONE 1 (locked 30): ${results.some((r) => !r.m1) || m1Failed ? 'NOT MET' : 'MET'}    SHIP BAR (60): ${failed ? 'NOT MET' : 'MET'}`);
if (results.some((r) => r.report && r.report.machine && r.report.machine.otherLoadFraction > 0.4)) lines.push('LOADED: other work was using more than 40 % of the machine during at least one route. Worst case, not a verdict.');
if (results.some((r) => r.report && r.report.experiment)) lines.push(`EXPERIMENT RUN: ${results.map((r) => r.report && r.report.experiment && r.report.experiment.file).filter(Boolean)[0]} was run in the page. Not the shipped game; not a scoreboard row.`);
if (results.some((r) => r.report && (r.report.profiled || r.report.traced))) lines.push('PROFILED OR TRACED RUN: the instrument was on. Use it to find owners; judge the bars on a run without --profile or --trace.');
lines.push(failed ? 'IS IT SMOOTH: NO' : 'IS IT SMOOTH: YES');
console.log(lines.join('\n'));
try { writeFileSync(join(SMOOTH, `${STAMP}-summary.txt`), lines.join('\n')); } catch (_) { /* evidence only */ }

for (const r of results) {
  const rep = r.report;
  const row = { at: new Date().toISOString(), commit, dirty, route: r.name, seconds: SECONDS, evidence: r.out.replace(ROOT, '').replace(/\\/g, '/') };
  if (!rep || rep.ok !== true) Object.assign(row, { ok: false, why: rep ? rep.failed : 'no report' });
  else {
    const pick = (m) => (m ? { fps: m.all.fps, p50: m.all.p50, p95: m.all.p95, p99: m.all.p99, max: m.all.max, over50: m.all.over50, over100: m.all.over100,
      cbP50: m.all.cbP50, cbP95: m.all.cbP95, busy: m.busy && m.busy.fraction, transP95: m.transitions.p95, transMax: m.transitions.max } : null);
    Object.assign(row, { ok: true, pass: r.verdict.pass, milestone1: r.m1.pass, asis: pick(rep.modes.asis), lift: pick(rep.modes.lift), liftCap: rep.liftCap, cap: rep.capChosen,
      world: rep.world.speed, worst10s: rep.world.worst10s, stepP50: rep.worker.stepP50, stepP95: rep.worker.stepP95,
      longestTask: rep.longTasks.longestMs, tasksOver50: rep.longTasks.over50, freezeLog: rep.freeze.logEntries, dataAge: rep.freeze.dataAgeMaxMs,
      gpu: rep.gpu && rep.gpu.passes ? Object.fromEntries(Object.entries(rep.gpu.passes).map(([k, v]) => [k, v.avg])) : null,
      profiled: rep.profiled === true || rep.traced === true, experiment: rep.experiment ? rep.experiment.file : undefined, ships: rep.fight.shipsMedian, calls: rep.fight.drawCallsMedian, otherLoad: rep.machine.otherLoadFraction, loaded: rep.machine.otherLoadFraction > 0.4, loadS: rep.loadS });
  }
  appendFileSync(join(SMOOTH, 'history.jsonl'), `${JSON.stringify(row)}\n`);
}
process.exitCode = failed ? 1 : 0;
