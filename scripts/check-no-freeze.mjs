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
// swarm-pad: Swarm with a connected gamepad whose axes drift (a device that reports as a pad).
const ROUTES = String(argv.routes || 'swarm,adventure,swarm-pad').split(',').filter(Boolean);
// The focus-steal case is the one run that takes the foreground on purpose (another window over the
// game, then back). --no-focus-steal skips it when someone is using the machine.
const FOCUS_STEAL = argv['no-focus-steal'] !== true;
const LEGACY = argv.legacy === true;
// The owner's freeze has only ever been seen from real play; --real-profile copies
// the owner's own settings/saves (read-only) into the isolated profile so the gate
// runs the same state a real session carries.
const REAL_PROFILE = argv['real-profile'] === true;
const POSE_AGE_LIMIT_MS = 100;
const WORLD_SPEED_FLOOR = 0.97;

const rows = [];
// Each gate run keeps its own evidence (two runs in a row must not overwrite each other).
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
let failed = false;
let focusNotJudged = null;
for (const routeName of ROUTES) {
  const route = routeName === 'swarm-pad' ? 'swarm' : routeName;
  const out = join(ROOT, '.devshots', 'no-freeze', `gate-${RUN_STAMP}-${routeName}${LEGACY ? '-legacy' : ''}`);
  const args = ['scripts/fleet/game-lock.mjs', 'run', '--', process.execPath, 'scripts/probe-no-freeze-electron.mjs',
    `--route=${route}`, `--seconds=${routeName === 'swarm-pad' ? Math.min(SECONDS, 120) : SECONDS}`,
    ...(routeName === 'swarm-pad' ? ['--pad=noisy'] : ['--forced']), `--out=${out}`,
    ...(REAL_PROFILE ? ['--real-profile'] : []), ...(LEGACY ? ['--legacy'] : [])];
  console.log(`[no-freeze] ${route}: ${SECONDS} s dense input + forced stalls${REAL_PROFILE ? ' + real profile' : ''}${LEGACY ? ' (LEGACY: fix off)' : ''}`);
  const run = spawnSync(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: (SECONDS + 900) * 1000 });
  const text = `${run.stdout || ''}${run.stderr || ''}`;
  for (const line of text.split(/\r?\n/)) if (/no-freeze probe|^\s{2}\S|PROBE FAILED|realm|lane /.test(line)) console.log(`  ${line}`);
  let report = null;
  try { report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')); } catch (_) { /* reported below */ }
  if (!report || report.failed || !Array.isArray(report.rows) || !report.rows.length) {
    rows.push({ route: routeName, phase: '(probe did not reach flight)', verdict: 'FAIL', why: report?.failed || 'no report' });
    failed = true;
    continue;
  }
  for (const r of report.rows) {
    const why = [];
    // Ruling: the freeze is judged on pose age net of the main-thread frame gap; a gap over 250 ms
    // fails separately as a rendering hitch.
    if (r.netPoseAgeMs == null || r.netPoseAgeMs > POSE_AGE_LIMIT_MS) why.push(`pose age (net of frame gap) ${r.netPoseAgeMs} ms > ${POSE_AGE_LIMIT_MS}`);
    if (r.frameGapMaxMs > 250) why.push(`rendering hitch: a ${r.frameGapMaxMs} ms frame gap`);
    if (r.worstWindow10s != null && r.worstWindow10s < WORLD_SPEED_FLOOR) why.push(`world x${r.worstWindow10s} < ${WORLD_SPEED_FLOOR} over 10 s`);
    if (r.worstWindow10s == null && r.worldSpeed != null && r.wallS >= 2 && r.worldSpeed < WORLD_SPEED_FLOOR) {
      why.push(`world x${r.worldSpeed} < ${WORLD_SPEED_FLOOR} (phase shorter than 10 s)`);
    }
    if (r.uncoveredStopMs > 300) why.push(`simulation stopped ${r.uncoveredStopMs} ms in live flight with no hold plate`);
    if (r.silentHoldMs > 0) why.push(`world held at time scale 0 for ${r.silentHoldMs} ms with no pause plate or screen`);
    if (r.freezeLog > 0) why.push(`${r.freezeLog} freeze-log entr${r.freezeLog === 1 ? 'y' : 'ies'}`);
    if (!(r.wallS > 0)) why.push('no unpaused flight samples');
    // A run that sat on its loading screen for a minute (a new Swarm run that never started) is
    // the world stopping for the player as surely as a freeze in flight.
    if (r.phase === 'dense input' && report.stuckLoads > 0) why.push(`${report.stuckLoads} new run(s) stuck on the loading screen over 60 s`);
    rows.push({ route: routeName, ...r, verdict: why.length ? 'FAIL' : 'pass', why: why.join('; ') });
    if (why.length) failed = true;
  }
}

if (FOCUS_STEAL) {
  const out = join(ROOT, '.devshots', 'no-freeze', `gate-${RUN_STAMP}-focus-steal`);
  console.log('[no-freeze] focus steal + held key across the blur (THIS RUN TAKES FOCUS ON PURPOSE, then hands it back)');
  const run = spawnSync(process.execPath, ['scripts/fleet/game-lock.mjs', 'run', '--', process.execPath,
    'scripts/probe-focus-steal-electron.mjs', `--out=${out}`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 900000 });
  const text = `${run.stdout || ''}${run.stderr || ''}`;
  for (const line of text.split(/\r?\n/)) if (/focus-steal probe|PROBE FAILED/.test(line)) console.log(`  ${line.slice(0, 900)}`);
  let report = null;
  try { report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')); } catch (_) { /* below */ }
  const ok = report && report.verdict === 'pass';
  // "The steal did not happen" (Windows kept the foreground where it was) is not "the game did not
  // pause": it is reported as NOT JUDGED, never as a pass and never as a failure of the game.
  const notJudged = !!report && report.verdict === 'inconclusive';
  if (notJudged) focusNotJudged = report.why || 'the steal did not happen';
  rows.push({ route: 'swarm', phase: 'focus steal + held W across blur', verdict: ok ? 'pass' : notJudged ? 'NOT JUDGED' : 'FAIL',
    why: ok ? `paused with plate; resume ahead of wall ${report.summary.returned.simAheadOfWallS} s; speed ${Math.round(report.summary.returned.speedAtSteal)} -> ${Math.round(report.summary.returned.speedEnd)}` : (report?.why || 'no report') });
  if (!ok && !notJudged) failed = true;
}

const pad = (v, n) => String(v ?? '-').padEnd(n);
console.log('\nNO-FREEZE GATE');
console.log(`${pad('route', 10)}${pad('phase', 33)}${pad('netPose', 9)}${pad('player', 8)}${pad('dataAge', 9)}${pad('frameGap', 10)}${pad('gaps>100', 10)}${pad('world', 8)}${pad('worst10s', 10)}${pad('freeze', 8)}${pad('workP95', 9)}verdict`);
for (const r of rows) {
  console.log(`${pad(r.route, 10)}${pad(r.phase, 33)}${pad(r.netPoseAgeMs, 9)}${pad(r.playerPoseAgeMaxMs, 8)}${pad(r.dataAgeMaxMs, 9)}${pad(r.frameGapMaxMs, 10)}${pad(r.frameGapsOver100, 10)}${pad(r.worldSpeed, 8)}${pad(r.worstWindow10s, 10)}${pad(r.freezeLog, 8)}${pad(r.workP95, 9)}${r.verdict}${r.why ? ` — ${r.why}` : ''}`);
}
for (const r of rows) {
  if (!Array.isArray(r.frameGapList) || !r.frameGapList.length) continue;
  const list = r.frameGapList.slice(0, 8).map((g) => `${g.gapMs} ms (${g.attribution
    ? g.attribution.owner + (g.attribution.simSystem ? `:${g.attribution.simSystem}` : '') : 'unattributed'})`);
  console.log(`  frame gaps >100 ms in ${r.route} / ${r.phase}: ${list.join(', ')}`);
}
console.log(failed ? '\nNO-FREEZE GATE: FAIL' : focusNotJudged
  ? `\nNO-FREEZE GATE: PASS on everything it could judge. FOCUS STEAL NOT JUDGED: ${focusNotJudged}`
  : '\nNO-FREEZE GATE: PASS');
process.exitCode = failed ? 1 : 0;
