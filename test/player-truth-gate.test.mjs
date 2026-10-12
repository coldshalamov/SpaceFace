// Round-2 player-truth checks: gate strictness, round transitions, per-pixel combat VFX vs backdrop, compare table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runChecks, overall, checkRoundTransitions, checkRoundsReached, checkVfx, checkBackdrop } from '../scripts/player-truth/checks.mjs';
import { compareVerdicts, renderComparison } from '../scripts/player-truth/compare.mjs';
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
  assert.equal(checkBackdrop(t).status, 'FAIL');
  const column = trace({ px: () => ({ c: 0.4, b: 0.1, cp: 0.9, bp: 0, ct: 0.5, bt: 0, nC: 9, nB: 4 }) });
  assert.equal(checkVfx(column).status, 'FAIL'); assert.equal(checkBackdrop(column).status, 'PASS');
  assert.equal(checkBackdrop(trace()).status, 'UNKNOWN');
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
  assert.equal(gateExitCode(['FAIL', 'ENVIRONMENT']), 4);
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
