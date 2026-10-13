// Round-2 player-truth checks: gate strictness, round transitions, per-pixel combat VFX vs backdrop, compare table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runChecks, overall, checkRoundTransitions, checkRoundsReached, checkVfx, checkBackdrop } from '../scripts/player-truth/checks.mjs';
import { screensOverlayOpen } from '../src/testing/playerTruth/reader.js';
import { compareVerdicts, renderComparison, baselineAssetPlan, sharedAssetsLinkable, sharedTreeMatches, baselineExtractAllowed, baselineDiskMessage, baselineDiskError, BASELINE_EXTRACT_MIN_FREE_BYTES } from '../scripts/player-truth/compare.mjs';
import { systemChromeCandidates } from '../scripts/player-truth/browser.mjs';

const P = (o = {}) => ({ id: 1, alive: true, x: 0, y: 0, z: 0, vx: 0, vz: 0, rot: 0, angVel: 0, pitch: 0, bank: 0, hull: 50, hullMax: 100, mesh: true, vis: true, onScreen: true, box: [600, 330, 680, 390], lod: 'lod0', model: 'hornet', state: 'authored', tris: 4000, marker: false, meshId: 'aaaa', ...o });
function trace({ n = 200, player = () => P(), px = null, rounds = [], probes = [], meta = {} } = {}) {
  const samples = [];
  for (let i = 0; i < n; i++) samples.push({ f: i, t: i * 100, dt: 16, sim: 10 + i * 0.1, mode: 'flight', run: { ph: 'active', w: 1 }, vw: 1280, vh: 720, p: player(i), e: [], vfx: null, px: px ? px(i) : null });
  return { meta: { mode: 'swarm', rounds: true, ...meta }, samples, events: [], longTasks: [], keys: [], rounds, probes };
}

test('gate: UNKNOWN on core checks becomes FAIL, frame_time UNKNOWN on software GL stays UNKNOWN', () => {
  const t = trace({ n: 4, meta: { gate: 'active', softwareGl: true } });
  const r = Object.fromEntries(runChecks(t).map((x) => [x.id, x]));
  for (const id of ['player_control', 'tumble', 'player_ship', 'round_resolution', 'round_transitions']) {
    assert.equal(r[id].status, 'FAIL', id); assert.match(r[id].detail, /not measured/);
  }
  assert.equal(r.frame_time.status, 'UNKNOWN');
  const loose = Object.fromEntries(runChecks(trace({ n: 4 })).map((x) => [x.id, x]));
  assert.equal(loose.player_control.status, 'UNKNOWN');
});

test('round_transitions fails a round-2 start where the ship is a box and does not answer thrust', () => {
  const rounds = [{ wave: 1, startSim: 10, endSim: 14 }, { wave: 2, startSim: 15, endSim: null }];
  const probes = [{ label: 'round 2 thrust', kind: 'thrust', key: 'KeyW', startSim: 15.2, endSim: 16.4 }];
  const box = trace({ rounds, probes, player: (i) => (10 + i * 0.1 >= 15 ? P({ model: 'box', state: 'resolving', tris: 12, lod: 'placeholder' }) : P()) });
  const r = checkRoundTransitions(box);
  assert.equal(r.status, 'FAIL'); assert.match(r.offenders[0].line, /round 2 start \(hull 50%\)/);
  const good = trace({ rounds, probes, player: (i) => P({ vx: i, x: i * i }) });
  assert.equal(checkRoundTransitions(good).status, 'PASS');
  assert.equal(checkRoundTransitions(trace({ rounds: [rounds[0]] })).status, 'UNKNOWN');
});

test('rounds_reached grades the gate round', () => {
  assert.equal(checkRoundsReached(trace({ meta: { requireRounds: 3 }, rounds: [{ wave: 1 }, { wave: 2 }] })).status, 'FAIL');
  assert.equal(checkRoundsReached(trace({ meta: { requireRounds: 3 }, rounds: [{ wave: 1 }, { wave: 2 }, { wave: 3 }] })).status, 'PASS');
  assert.equal(checkRoundsReached(trace()).status, 'N/A');
});

test('per-pixel split: a lit backdrop does not fail combat VFX; it fails backdrop_coverage when threats sit on it', () => {
  const t = trace({ px: () => ({ c: 0.04, b: 0.9, cp: 0, bp: 0.9, ct: 0, bt: 0.8, nC: 3, nB: 4 }) });
  assert.equal(checkVfx(t).status, 'PASS'); assert.match(checkVfx(t).detail, /per-pixel/);
  assert.match(checkVfx(t).detail, /skipped 0/);
  assert.equal(checkBackdrop(t).status, 'FAIL');
  assert.match(checkBackdrop(t).detail, /skipped 0/);
  const column = trace({ px: () => ({ c: 0.4, b: 0.1, cp: 0.9, bp: 0, ct: 0.5, bt: 0, nC: 9, nB: 4 }) });
  assert.equal(checkVfx(column).status, 'FAIL'); assert.equal(checkBackdrop(column).status, 'PASS');
  assert.equal(checkBackdrop(trace()).status, 'UNKNOWN');
  assert.match(checkBackdrop(trace()).detail, /skipped 0/);
});

test('per-pixel splits skip a #screens overlay and anything before the flight phase', () => {
  const clean = () => ({ c: 0.02, b: 0.1, cp: 0, bp: 0, ct: 0, bt: 0, nC: 1, nB: 2 });
  const covered = () => ({ c: 0.9, b: 0.9, cp: 1, bp: 1, ct: 1, bt: 1, nC: 8, nB: 4 });
  const sample = (extra) => ({ f: 1, t: 1000, dt: 16, sim: 1.6, mode: 'flight', top: null, screens: false, run: { ph: 'active', w: 1 }, vw: 960, vh: 540, p: P(), e: [], px: covered(), vfx: { cov: 0.9, od: 4, pOcc: 1, tOcc: 1, top: [['flash', null, 0.9]], unb: 0 }, ...extra });
  const samples = [
    sample({ sim: 0, run: { ph: 'draft', w: 0 }, top: 'crucibleDraft' }),
    sample({ sim: 1.6, top: null, screens: true }),
    ...Array.from({ length: 6 }, (_, i) => sample({ f: 10 + i, t: 3000 + i * 100, sim: 3 + i * 0.4, px: clean(), vfx: null })),
  ];
  const t = { meta: { mode: 'swarm', rounds: true }, samples, events: [], longTasks: [], keys: [], rounds: [], probes: [] };
  const backdrop = checkBackdrop(t);
  const vfx = checkVfx(t);
  assert.equal(backdrop.status, 'PASS');
  assert.equal(vfx.status, 'PASS');
  assert.match(backdrop.detail, /skipped 2/);
  assert.match(vfx.detail, /skipped 2/);
  const onlyCovered = { meta: { mode: 'swarm', rounds: true }, samples: Array.from({ length: 8 }, (_, i) => sample({ f: i, sim: 1.6 + i, screens: true })), events: [], longTasks: [], keys: [], rounds: [], probes: [] };
  assert.equal(checkBackdrop(onlyCovered).status, 'UNKNOWN');
  assert.match(checkBackdrop(onlyCovered).detail, /skipped 8/);
  assert.equal(checkVfx(onlyCovered).status, 'UNKNOWN');
  assert.match(checkVfx(onlyCovered).detail, /skipped 8/);
  const root = (display, aria, rects = 0) => ({ style: { display }, getAttribute: (name) => (name === 'aria-hidden' ? aria : null), getClientRects: () => ({ length: rects }) });
  assert.equal(screensOverlayOpen(root('none', 'true')), false);
  assert.equal(screensOverlayOpen(root('flex', null)), true);
  assert.equal(screensOverlayOpen(root('', 'true', 1)), false);
  assert.equal(screensOverlayOpen(root('', null, 1)), true);
  assert.equal(screensOverlayOpen(null), false);
});

test('compare: before/after table marks regressions and improvements', () => {
  const base = { overall: 'FAIL', meta: { label: 'swarm-x', commit: 'aaa' }, results: [{ id: 'lod_churn', title: 'LOD', status: 'FAIL', value: '2.8/s' }, { id: 'tumble', title: 'Tumble', status: 'PASS', value: '0 s' }] };
  const head = { overall: 'FAIL', meta: { label: 'swarm-x', commit: 'bbb', mode: 'swarm', seed: 4242, resolution: '960x540' }, results: [{ id: 'lod_churn', title: 'LOD', status: 'PASS', value: '0.1/s' }, { id: 'tumble', title: 'Tumble', status: 'FAIL', value: '2 s' }] };
  const c = compareVerdicts(base, head);
  assert.equal(c.improved, 1); assert.equal(c.regressed, 1);
  const md = renderComparison(base, head);
  assert.match(md, /\| LOD \| FAIL · 2\.8\/s \| PASS · 0\.1\/s \| improved \|/);
  assert.match(md, /REGRESSED/);
  assert.equal(overall([{ status: 'PASS' }]), 'PASS');
});

test('chrome fallback honours CHROME_PATH when it exists', () => {
  assert.deepEqual(systemChromeCandidates({ CHROME_PATH: '/definitely/not/here' }).includes('/definitely/not/here'), false);
  assert.ok(systemChromeCandidates({ CHROME_PATH: process.execPath }).includes(process.execPath));
});

test('player_control: velocity without displacement is a pinned ship, not a working one', async () => {
  const { checkPlayerControl } = await import('../scripts/player-truth/checks.mjs');
  const probes = [{ label: 'round 2 thrust', kind: 'thrust', key: 'KeyW', startSim: 15, endSim: 16.4 }];
  const pinned = trace({ probes, player: (i) => P({ vx: i > 50 ? 138 : 0, vz: 0, x: 0 }) });
  const r = checkPlayerControl(pinned);
  assert.equal(r.status, 'FAIL'); assert.ok(r.offenders.some((o) => /pinned/.test(o.line)));
  const flying = trace({ probes, player: (i) => { const sim = 10 + i * 0.1; return P({ vx: sim > 15 ? 100 : 0, x: sim > 15 ? (sim - 15) * 100 : 0 }); } });
  assert.equal(checkPlayerControl(flying).status, 'PASS');
});

test('parseArgs keeps a bounded hull x viewport matrix, and --gate replaces its rounds and duration', async () => {
  const { parseArgs, gatePasses } = await import('../scripts/player-truth/run.mjs');
  const argv = ['--mode=swarm', '--arena=Ricochet Foundry', '--hull=all', '--viewports=960x540,1280x720,1920x1080', '--rounds=2', '--idle=3', '--duration=70', '--wall=12', '--evidence', '--tag=matrix'];
  const matrix = parseArgs(argv);
  assert.equal(matrix.gate, false);
  assert.equal(matrix.hull, 'all');
  assert.deepEqual(matrix.viewportList, ['960x540', '1280x720', '1920x1080']);
  assert.equal(matrix.seed, 4242);
  assert.equal(matrix.tag, 'matrix');
  assert.equal(matrix.evidence, true);
  assert.equal(matrix.rounds, 2);
  assert.equal(matrix.idle, 3);
  assert.equal(Number(matrix.duration), 70);
  assert.equal(Number(matrix.wall), 12);
  assert.deepEqual(gatePasses(matrix), [{}]);
  const gated = parseArgs([...argv, '--gate']);
  assert.equal(gated.gate, true);
  assert.equal(gated.hull, 'all');
  assert.deepEqual(gated.viewportList, matrix.viewportList);
  const passes = gatePasses(gated);
  assert.equal(passes[0].gatePass, 'idle');
  assert.equal(passes[0].rounds, 1);
  assert.equal(passes[0].duration, 45);
  assert.equal(passes[1].gatePass, 'active');
  assert.equal(passes[1].rounds, 3);
  assert.equal(passes[1].requireRounds, 3);
  assert.equal(passes[1].duration, 300);
  assert.deepEqual(gatePasses(parseArgs(['--mode=adventure', '--gate', '--tag=cruise'])), [{ gatePass: 'active', tag: 'cruise' }]);
  const activeOnly = parseArgs(['--mode=swarm', '--seed=4242', '--gate=active', '--tag=seed4242-r2']);
  assert.equal(activeOnly.gate, 'active');
  assert.equal(activeOnly.seed, 4242);
  const only = gatePasses(activeOnly);
  assert.equal(only.length, 1);
  assert.equal(only[0].gatePass, 'active');
  assert.equal(only[0].idle, 3);
  assert.equal(only[0].rounds, 3);
  assert.equal(only[0].requireRounds, 3);
  assert.equal(only[0].duration, 300);
  assert.equal(gatePasses(parseArgs(['--mode=swarm', '--gate=idle'])).length, 1);
  assert.throws(() => gatePasses(parseArgs(['--mode=swarm', '--gate=nope'])), /--gate must be/);
});

test('scratch frames stay unless --prune-frames is passed with --evidence', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { parseArgs, maybePruneFrames } = await import('../scripts/player-truth/run.mjs');
  assert.equal(parseArgs(['--evidence']).pruneFrames, false);
  assert.equal(parseArgs(['--evidence', '--prune-frames']).pruneFrames, true);
  assert.equal(parseArgs(['--prune-frames=false']).pruneFrames, false);
  const dir = mkdtempSync(join(tmpdir(), 'pt-frames-'));
  const frames = join(dir, 'frames');
  mkdirSync(frames);
  writeFileSync(join(frames, '0000.jpg'), 'frame');
  assert.equal(maybePruneFrames(dir, { evidence: true, pruneFrames: false }), false);
  assert.equal(existsSync(join(frames, '0000.jpg')), true);
  assert.equal(maybePruneFrames(dir, { evidence: false, pruneFrames: true }), false);
  assert.equal(existsSync(join(frames, '0000.jpg')), true);
  assert.equal(maybePruneFrames(dir, { evidence: true, pruneFrames: true }), true);
  assert.equal(existsSync(frames), false);
  rmSync(dir, { recursive: true, force: true });
});

test('the exit code is applied only after stdout and stderr flush', async () => {
  const { exitAfterFlush } = await import('../scripts/player-truth/run.mjs');
  const order = [];
  const stream = () => ({
    writable: true, destroyed: false, writableEnded: false,
    write(_chunk, cb) { order.push('flush'); cb(); return true; },
  });
  await exitAfterFlush(1, { stdout: stream(), stderr: stream(), exit: (code) => { order.push(`exit ${code}`); } });
  assert.deepEqual(order, ['flush', 'flush', 'exit 1']);
});

test('a closed browser records the chrome exit signal in the stop line', async () => {
  const { formatRouteFailure } = await import('../scripts/player-truth/run.mjs');
  const line = formatRouteFailure('page.evaluate: Target page, context or browser has been closed', { notes: ['page closed'], exitCode: null, signal: 'SIGKILL' });
  assert.match(line, /^harness\/route error: page\.evaluate: Target page/);
  assert.match(line, /page closed/);
  assert.match(line, /chrome exit null signal SIGKILL/);
  assert.equal(formatRouteFailure('menu missing'), 'harness/route error: menu missing');
});

test('gate process exits non-zero when any verdict is FAIL', async () => {
  const { gateExitCode } = await import('../scripts/player-truth/run.mjs');
  assert.equal(gateExitCode(['PASS']), 0);
  assert.equal(gateExitCode(['PASS', 'PASS']), 0);
  assert.equal(gateExitCode(['FAIL']), 1);
  assert.equal(gateExitCode(['PASS', 'FAIL']), 1);
  assert.equal(gateExitCode(['INCOMPLETE']), 2);
  assert.equal(gateExitCode(['PASS', 'INCOMPLETE']), 2);
  assert.equal(gateExitCode(['FAIL', 'INCOMPLETE']), 1);
  assert.equal(gateExitCode(['ENVIRONMENT']), 4);
  assert.equal(gateExitCode(['PASS', 'ENVIRONMENT']), 4);
  assert.equal(gateExitCode(['FAIL', 'ENVIRONMENT']), 1);
  assert.equal(gateExitCode(['ENVIRONMENT', 'FAIL']), 1);
  const { environmentReportLines, absorbBaselineEnvironment } = await import('../scripts/player-truth/run.mjs');
  const disk = baselineDiskError(1024, '/tmp/wt');
  const passed = [{ verdict: 'PASS', label: 'swarm' }];
  assert.equal(absorbBaselineEnvironment(passed, disk), true);
  assert.equal(gateExitCode(passed.map((o) => o.verdict)), 4);
  assert.equal(passed[1].label, 'baseline-assets');
  const failed = [{ verdict: 'FAIL', label: 'swarm' }];
  assert.equal(absorbBaselineEnvironment(failed, disk), true);
  assert.equal(gateExitCode(failed.map((o) => o.verdict)), 1);
  assert.equal(absorbBaselineEnvironment([], new Error('boom')), false);
  assert.deepEqual(environmentReportLines([
    { verdict: 'FAIL', label: 'swarm-active' },
    { verdict: 'ENVIRONMENT', label: 'adventure-idle' },
  ]), ['player-truth ENVIRONMENT: adventure-idle — harness environment, not a gameplay FAIL']);
});

test('an environment verdict is not a gameplay regression, and software frame time regrades against baseline', async () => {
  const { applyBaselineToHead } = await import('../scripts/player-truth/compare.mjs');
  const base = { overall: 'FAIL', meta: { commit: 'aaa' }, results: [{ id: 'route', title: 'Route', status: 'ENVIRONMENT', value: 'HARNESS ENVIRONMENT' }] };
  const head = { overall: 'PASS', meta: { commit: 'bbb' }, results: [{ id: 'route', title: 'Route', status: 'PASS', value: 'menu' }] };
  const c = compareVerdicts(base, head);
  assert.equal(c.regressed, 0);
  assert.equal(c.rows[0].change, 'cleared');
  const stale = compareVerdicts(head, base);
  assert.equal(stale.regressed, 0);
  assert.equal(stale.rows[0].change, 'environment');
  const recorded = {
    overall: 'INCOMPLETE',
    meta: { label: 'adv', mode: 'adventure', commit: 'head', seed: 1, renderer: 'sw', resolution: '960x540', softwareGl: true },
    results: [{ id: 'frame_time', title: 'Frame time / long tasks', status: 'UNKNOWN', value: 'software-renderer evidence · p50 94 ms · p99 904 ms · 962 long tasks ≥250 ms', threshold: 'no regression vs --baseline', detail: 'software-renderer evidence only; no --baseline to grade regression', frame: { p50: 94, p99: 904, longTasks: 962, softwareGl: true, samples: 400 } }, { id: 'readability', title: 'Readable', status: 'PASS', value: 'ok' }],
  };
  const baseline = { overall: 'INCOMPLETE', meta: { commit: 'd88f4d5881' }, results: [{ id: 'frame_time', frame: { p50: 94, p99: 904, longTasks: 962, softwareGl: true } }] };
  assert.equal(applyBaselineToHead(recorded, baseline), true);
  assert.equal(recorded.results[0].status, 'PASS');
  assert.equal(recorded.overall, 'PASS');
  const worse = structuredClone(recorded);
  worse.results[0].status = 'UNKNOWN';
  worse.results[0].frame = { p50: 94, p99: 904, longTasks: 962, softwareGl: true, samples: 400 };
  applyBaselineToHead(worse, { meta: { commit: 'old' }, results: [{ id: 'frame_time', frame: { p99: 200, longTasks: 10, softwareGl: true } }] });
  assert.equal(worse.results[0].status, 'FAIL');
  assert.equal(worse.overall, 'FAIL');
  const absent = { overall: 'INCOMPLETE', meta: { commit: 'head' }, results: [{ id: 'frame_time', status: 'UNKNOWN', frame: { p50: 94, p99: 904, longTasks: 962, softwareGl: true, samples: 10 }, value: 'x', threshold: 't', detail: 'software-renderer evidence only; no --baseline to grade regression' }] };
  applyBaselineToHead(absent, null, { baselineMissing: true });
  assert.match(absent.results[0].detail, /baseline baseline produced no frame-time measurement|produced no frame-time measurement/);
  assert.equal(absent.overall, 'INCOMPLETE');
  const noisyHead = structuredClone(recorded);
  noisyHead.results[0].status = 'UNKNOWN';
  noisyHead.results[0].frame = { p50: 94, p99: 904, longTasks: 962, softwareGl: true, samples: 400 };
  noisyHead.meta.loadavg = { start: [13, 12, 11], end: [13, 12, 11] };
  applyBaselineToHead(noisyHead, {
    meta: { commit: 'd88f4d5881', loadavg: { start: [8, 8, 8], end: [8, 8, 8] } },
    results: [{ id: 'frame_time', frame: { p99: 200, longTasks: 10, softwareGl: true } }],
  });
  assert.equal(noisyHead.results[0].status, 'ADVISORY');
  assert.match(noisyHead.results[0].detail, /not a FAIL/);
  assert.equal(noisyHead.overall, 'PASS');
  const cmp = compareVerdicts(
    { results: [{ id: 'frame_time', title: 'Frame time / long tasks', status: 'PASS', value: 'ok' }] },
    { results: [{ id: 'frame_time', title: 'Frame time / long tasks', status: 'ADVISORY', value: 'software-renderer evidence' }] },
  );
  assert.equal(cmp.regressed, 0);
  assert.equal(cmp.rows[0].change, 'advisory');
  const blowup = renderComparison(
    { overall: 'PASS', meta: { commit: 'd88f4d5881', label: 'swarm' }, results: [{ id: 'frame_time', title: 'Frame time / long tasks', status: 'PASS', value: 'software-renderer evidence · p99 200 ms · 10 long tasks' }] },
    { overall: 'PASS', meta: { commit: 'head', label: 'swarm', mode: 'swarm', seed: 4242, resolution: '960x540', softwareGl: true }, results: [{ id: 'frame_time', title: 'Frame time / long tasks', status: 'ADVISORY', value: 'software-renderer evidence · p50 94 ms · p99 904 ms · 962 long tasks ≥250 ms', detail: '400 play frames · baseline p99 200 ms · 10 long tasks — advisory, numbers would FAIL; not a FAIL' }] },
  );
  assert.match(blowup, /Advisory \(not a regression/);
  assert.match(blowup, /p99 904/);
  assert.match(blowup, /baseline p99 200/);
  assert.match(blowup, /962 long tasks/);
  assert.match(blowup, /1 advisory/);
  assert.doesNotMatch(blowup, /REGRESSED/);
});

test('baseline assets link a matching shared checkout and refuse a stale or partial one', () => {
  assert.equal(baselineAssetPlan({ manifestPresent: true, sharedMatches: true, canLink: true }), 'present');
  assert.equal(baselineAssetPlan({ manifestPresent: false, sharedMatches: true, canLink: true }), 'link');
  assert.equal(baselineAssetPlan({ manifestPresent: false, sharedMatches: false, canLink: true }), 'extract');
  assert.equal(baselineAssetPlan({ manifestPresent: false, sharedMatches: true, canLink: false }), 'extract');
  assert.equal(sharedAssetsLinkable({ treeMatches: true, assetsStatus: '' }), true);
  assert.equal(sharedAssetsLinkable({ treeMatches: true, assetsStatus: ' M assets/AGENTS.md\n' }), false);
  assert.equal(sharedAssetsLinkable({ treeMatches: false, assetsStatus: '' }), false);
  const min = BASELINE_EXTRACT_MIN_FREE_BYTES;
  assert.equal(baselineExtractAllowed(min), true);
  assert.equal(baselineExtractAllowed(min - 1), false);
  assert.equal(baselineExtractAllowed(null), false);
  assert.equal(baselineExtractAllowed(Number.NaN), false);
  const low = baselineDiskMessage(3.2 * 1024 * 1024 * 1024);
  assert.match(low, /HARNESS ENVIRONMENT: not enough disk to extract baseline assets/);
  assert.match(low, /not a gameplay FAIL/);
  assert.match(low, /3\.20 GB free/);
  assert.match(low, /8\.00 GB free/);
  assert.match(low, /was not started/);
  const err = baselineDiskError(1024, '/tmp/wt');
  assert.equal(err.environment, true);
  assert.match(err.message, /\/tmp\/wt has/);
});

test('sharedTreeMatches refuses a dirty assets worktree and ignores design dirt', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pt-share-'));
  try {
    execFileSync('git', ['init', '-q', '-b', 'main', dir]);
    execFileSync('git', ['-C', dir, 'config', 'user.email', 't@example.com']);
    execFileSync('git', ['-C', dir, 'config', 'user.name', 't']);
    mkdirSync(path.join(dir, 'assets'), { recursive: true });
    writeFileSync(path.join(dir, 'assets', 'a.txt'), 'v1\n');
    execFileSync('git', ['-C', dir, 'add', 'assets']);
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'a']);
    const sha = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    assert.equal(sharedTreeMatches(dir, sha, 'assets'), true);
    writeFileSync(path.join(dir, 'assets', 'a.txt'), 'v2\n');
    assert.equal(sharedTreeMatches(dir, sha, 'assets'), false);
    writeFileSync(path.join(dir, 'assets', 'a.txt'), 'v1\n');
    mkdirSync(path.join(dir, 'design'), { recursive: true });
    writeFileSync(path.join(dir, 'design', 'x.txt'), 'overlay\n');
    assert.equal(sharedTreeMatches(dir, sha, 'assets'), true);
    assert.equal(sharedTreeMatches(dir, sha, 'design'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pinned spans name the solid body the ship sits on', async () => {
  const { checkPlayerControl } = await import('../scripts/player-truth/checks.mjs');
  const t = trace({ probes: [{ label: 'round 2 thrust', kind: 'thrust', key: 'KeyW', startSim: 15, endSim: 16.4 }], player: () => P({ vx: 140, vz: 0, x: 0, z: 0 }) });
  t.keys = ['station:furnace', 'projectile:bullet'];
  for (const s of t.samples) s.e = [[901, 4, 1, 1, 0, 0, 0, 0, 30, 3, 0, 0], [902, 3, 0, 0, 0, 0, 0, 0, 2, 3, 0, 1]];
  const r = checkPlayerControl(t);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.offenders.some((o) => /pinned .* sits 1 u from station:furnace #901/.test(o.line)), r.offenders.map((o) => o.line).join('\n'));
});
