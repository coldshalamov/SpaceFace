// THE NO-FREEZE GATE (owner bug 2026-11-21). Runs the desktop (Electron) build with dense,
// hand-like input for minutes in a busy Swarm round and in Adventure, plus the forced stalls
// (ACKs withheld, the reliable reply stream held, thousands of durable rows per reply), and FAILS on:
//   - any presented-pose age over 100 ms while unpaused (drawn ships that should be moving);
//   - world speed under 0.97 over any ten-second window;
//   - any entry in the lane's freeze log (window.__SF_FREEZE_LOG__).
// Newest-data age and the longest presented-frame gap are printed beside them.
//
//   npm run check:no-freeze              (7 min Swarm + 7 min Adventure + forced stalls)
//   node scripts/check-no-freeze.mjs --seconds=60 [--routes=swarm] [--legacy]
//
// The default is 420 s per route on purpose: the owner's 2026-11-21 00:21 session
// (pre-fix) hit its first world-motion hold 249 s after window-ready, and a
// 180 s gate quits before the bug ever shows. A duration shorter than the
// observed time-to-first-freeze is a stand-in, not a test.
//
// Boots the game under the machine's game lock (scripts/fleet/game-lock.mjs).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const SECONDS = Number(argv.seconds || 420);
const ROUTES = String(argv.routes || 'swarm,adventure').split(',').filter(Boolean);
const LEGACY = argv.legacy === true;
// The owner's freeze has only ever been seen from real play; --real-profile copies
// the owner's own settings/saves (read-only) into the isolated profile so the gate
// runs the same state a real session carries.
const REAL_PROFILE = argv['real-profile'] === true;
const POSE_AGE_LIMIT_MS = 100;
const WORLD_SPEED_FLOOR = 0.97;

const rows = [];
let failed = false;
for (const route of ROUTES) {
  const out = join(ROOT, '.devshots', 'no-freeze', `gate-${route}${LEGACY ? '-legacy' : ''}`);
  const args = ['scripts/fleet/game-lock.mjs', 'run', '--', process.execPath, 'scripts/probe-no-freeze-electron.mjs',
    `--route=${route}`, `--seconds=${SECONDS}`, '--forced', `--out=${out}`,
    ...(REAL_PROFILE ? ['--real-profile'] : []), ...(LEGACY ? ['--legacy'] : [])];
  console.log(`[no-freeze] ${route}: ${SECONDS} s dense input + forced stalls${REAL_PROFILE ? ' + real profile' : ''}${LEGACY ? ' (LEGACY: fix off)' : ''}`);
  const run = spawnSync(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: (SECONDS + 900) * 1000 });
  const text = `${run.stdout || ''}${run.stderr || ''}`;
  for (const line of text.split(/\r?\n/)) if (/no-freeze probe|^\s{2}\S|PROBE FAILED|realm|lane /.test(line)) console.log(`  ${line}`);
  let report = null;
  try { report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')); } catch (_) { /* reported below */ }
  if (!report || report.failed || !Array.isArray(report.rows) || !report.rows.length) {
    rows.push({ route, phase: '(probe did not reach flight)', verdict: 'FAIL', why: report?.failed || 'no report' });
    failed = true;
    continue;
  }
  for (const r of report.rows) {
    const why = [];
    if (r.poseAgeMaxMs == null || r.poseAgeMaxMs > POSE_AGE_LIMIT_MS) why.push(`pose age ${r.poseAgeMaxMs} ms > ${POSE_AGE_LIMIT_MS}`);
    if (r.worstWindow10s != null && r.worstWindow10s < WORLD_SPEED_FLOOR) why.push(`world x${r.worstWindow10s} < ${WORLD_SPEED_FLOOR} over 10 s`);
    if (r.worstWindow10s == null && r.worldSpeed != null && r.wallS >= 5 && r.worldSpeed < WORLD_SPEED_FLOOR) {
      why.push(`world x${r.worldSpeed} < ${WORLD_SPEED_FLOOR} (phase shorter than 10 s)`);
    }
    if (r.silentHoldMs > 0) why.push(`world held at time scale 0 for ${r.silentHoldMs} ms with no pause plate or screen`);
    if (r.freezeLog > 0) why.push(`${r.freezeLog} freeze-log entr${r.freezeLog === 1 ? 'y' : 'ies'}`);
    if (!(r.wallS > 0)) why.push('no unpaused flight samples');
    rows.push({ route, ...r, verdict: why.length ? 'FAIL' : 'pass', why: why.join('; ') });
    if (why.length) failed = true;
  }
}

const pad = (v, n) => String(v ?? '-').padEnd(n);
console.log('\nNO-FREEZE GATE');
console.log(`${pad('route', 10)}${pad('phase', 33)}${pad('poseAge', 9)}${pad('player', 8)}${pad('dataAge', 9)}${pad('frameGap', 10)}${pad('world', 8)}${pad('worst10s', 10)}${pad('freeze', 8)}${pad('workP95', 9)}verdict`);
for (const r of rows) {
  console.log(`${pad(r.route, 10)}${pad(r.phase, 33)}${pad(r.poseAgeMaxMs, 9)}${pad(r.playerPoseAgeMaxMs, 8)}${pad(r.dataAgeMaxMs, 9)}${pad(r.frameGapMaxMs, 10)}${pad(r.worldSpeed, 8)}${pad(r.worstWindow10s, 10)}${pad(r.freezeLog, 8)}${pad(r.workP95, 9)}${r.verdict}${r.why ? ` — ${r.why}` : ''}`);
}
console.log(failed ? '\nNO-FREEZE GATE: FAIL' : '\nNO-FREEZE GATE: PASS');
process.exitCode = failed ? 1 : 0;
