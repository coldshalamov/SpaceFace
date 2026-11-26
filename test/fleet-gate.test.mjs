import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSwarmBootStep } from '../scripts/fleet/gate.mjs';

const criticalIds = ['route', 'player_ship', 'player_control', 'spawn_motion', 'crucible_realm', 'sim_stalled', 'play_interrupted'];

function tempRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'spaceface fleet gate test '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function fixture(t) {
  const root = tempRoot(t);
  return (candidateSource) => createSwarmBootStep(root, candidateSource);
}

test('the game lock still protects a live owner after thirty minutes', (t) => {
  const root = tempRoot(t);
  const scripts = join(root, 'scripts', 'fleet');
  const locks = join(root, '.devshots', 'fleet');
  mkdirSync(scripts, { recursive: true });
  mkdirSync(locks, { recursive: true });
  const entry = join(scripts, 'game-lock.mjs');
  copyFileSync(new URL('../scripts/fleet/game-lock.mjs', import.meta.url), entry);
  const lock = join(locks, 'game.lock');
  const at = Date.now() - 31 * 60 * 1000;
  const label = 'long-running screen capture';
  const status = (pid) => {
    writeFileSync(lock, JSON.stringify({ pid, at, label }));
    const child = spawnSync(process.execPath, [entry, 'status'], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    return child.stdout;
  };
  assert.match(status(process.pid), /held by pid \d+: long-running screen capture/);
  const exited = spawnSync(process.execPath, ['--eval', 'process.exit(0)']);
  assert.equal(exited.status, 0);
  assert.match(status(exited.pid), /stale \(long-running screen capture\)/);
});

function lockFixture(t) {
  const root = tempRoot(t);
  const scripts = join(root, 'scripts', 'fleet');
  mkdirSync(scripts, { recursive: true });
  const entry = join(scripts, 'game-lock.mjs');
  copyFileSync(new URL('../scripts/fleet/game-lock.mjs', import.meta.url), entry);
  const env = { ...process.env };
  delete env.SPACEFACE_GAME_LOCK_OWNER;
  const run = (...args) => spawn(process.execPath, [entry, 'run', '--', ...args], {
    cwd: root, env, stdio: 'ignore', windowsHide: true,
  });
  return { root, scripts, entry, env, run, lock: join(root, '.devshots', 'fleet', 'game.lock'),
    queue: join(root, '.devshots', 'fleet', 'game-queue') };
}

async function waitForFixture(predicate, description) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${description}`);
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
}

test('a nested lock fails promptly and an independent contender remains queued until the outer command exits', async (t) => {
  const f = lockFixture(t);
  const nestedReport = join(f.root, 'nested.json');
  const outerRelease = join(f.root, 'release-outer');
  const contenderStarted = join(f.root, 'contender-started');
  const childScript = join(f.root, 'outer.cjs');
  writeFileSync(childScript, `
    const { spawnSync } = require('node:child_process');
    const { existsSync, readFileSync, writeFileSync } = require('node:fs');
    const [entry, report, lock, release] = process.argv.slice(2);
    const nested = spawnSync(process.execPath, [entry, 'run', '--', process.execPath, '-e', 'process.exit(0)'],
      { encoding: 'utf8', timeout: 2500, windowsHide: true });
    writeFileSync(report, JSON.stringify({ code: nested.status, stderr: nested.stderr,
      timedOut: nested.error?.code === 'ETIMEDOUT', owner: JSON.parse(readFileSync(lock, 'utf8')).pid }));
    const timer = setInterval(() => { if (existsSync(release)) { clearInterval(timer); process.exit(0); } }, 20);
  `);
  const outer = f.run(process.execPath, childScript, f.entry, nestedReport, f.lock, outerRelease);
  const outerDone = waitForChild(outer);
  let contender;
  let contenderDone;
  try {
    await waitForFixture(() => existsSync(nestedReport), 'nested lock result');
    const nested = JSON.parse(readFileSync(nestedReport, 'utf8'));
    assert.notEqual(nested.code, 0);
    assert.equal(nested.timedOut, false, 'the nested request is rejected without waiting for its parent');
    assert.match(nested.stderr, /nested.*game.lock|game.lock.*nested/i);
    assert.equal(nested.owner, outer.pid, 'the inner request did not remove or replace its owner');
    assert.equal(JSON.parse(readFileSync(f.lock, 'utf8')).pid, outer.pid);

    contender = f.run(process.execPath, '-e', `require('node:fs').writeFileSync(process.argv[1], 'started')`, contenderStarted);
    contenderDone = waitForChild(contender);
    await waitForFixture(() => existsSync(f.queue) && readdirSync(f.queue).some(name => name.endsWith(`-${contender.pid}.json`)),
      'independent contender ticket');
    assert.equal(existsSync(contenderStarted), false, 'independent work cannot overlap the outer command');
    assert.equal(JSON.parse(readFileSync(f.lock, 'utf8')).pid, outer.pid);
    writeFileSync(outerRelease, 'go');
    assert.equal((await outerDone).code, 0);
    assert.equal((await contenderDone).code, 0);
    assert.equal(existsSync(contenderStarted), true);
    assert.equal(existsSync(f.lock), false);
  } finally {
    if (!existsSync(outerRelease)) writeFileSync(outerRelease, 'go');
    if (outer.exitCode === null && !outer.killed) outer.kill();
    if (contender && contender.exitCode === null && !contender.killed) contender.kill();
    await Promise.allSettled([outerDone, contenderDone].filter(Boolean));
  }
});

test('the exact npm gate command runs under its existing lock and forwards arguments', async (t) => {
  const f = lockFixture(t);
  const gateStarted = join(f.root, 'gate-started.json');
  const gateRelease = join(f.root, 'release-gate');
  writeFileSync(join(f.root, 'package.json'), JSON.stringify({ scripts: {
    gate: 'node scripts/fleet/game-lock.mjs run -- node scripts/fleet/gate.mjs',
  } }));
  writeFileSync(join(f.scripts, 'gate.mjs'), `
    import { existsSync, readFileSync, writeFileSync } from 'node:fs';
    const [marker, lock, release] = ${JSON.stringify([gateStarted, f.lock, gateRelease])};
    writeFileSync(marker, JSON.stringify({ args: process.argv.slice(2), owner: JSON.parse(readFileSync(lock, 'utf8')).pid }));
    const timer = setInterval(() => { if (existsSync(release)) { clearInterval(timer); process.exit(0); } }, 20);
  `);
  const outer = f.run('npm', 'run', 'gate', '--', '--quick');
  const done = waitForChild(outer);
  try {
    await waitForFixture(() => existsSync(gateStarted), 'gate under outer lock');
    const started = JSON.parse(readFileSync(gateStarted, 'utf8'));
    assert.deepEqual(started.args, ['--quick']);
    assert.equal(started.owner, outer.pid);
    assert.equal(JSON.parse(readFileSync(f.lock, 'utf8')).pid, outer.pid);
    writeFileSync(gateRelease, 'go');
    assert.equal((await done).code, 0);
    assert.equal(existsSync(f.lock), false);
  } finally {
    if (!existsSync(gateRelease)) writeFileSync(gateRelease, 'go');
    if (outer.exitCode === null && !outer.killed) outer.kill();
    await Promise.allSettled([done]);
  }
});

test('npm gate lifecycle hooks are not bypassed by the nested-lock shortcut', async (t) => {
  const f = lockFixture(t);
  const hook = join(f.root, 'hook-ran');
  const gate = join(f.root, 'gate-ran');
  f.env.npm_config_ignore_scripts = 'false';
  writeFileSync(join(f.root, 'package.json'), JSON.stringify({ scripts: {
    pregate: 'node pregate.cjs',
    gate: 'node scripts/fleet/game-lock.mjs run -- node scripts/fleet/gate.mjs',
  } }));
  writeFileSync(join(f.root, 'pregate.cjs'), `require('node:fs').writeFileSync(${JSON.stringify(hook)}, 'yes');`);
  writeFileSync(join(f.scripts, 'gate.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(gate)}, 'yes');`);
  const outer = f.run('npm', 'run', 'gate');
  try {
    const result = await waitForChild(outer);
    assert.notEqual(result.code, 0, 'a nested gate with hooks is rejected, not silently bypassed');
    assert.equal(existsSync(hook), true, 'npm ran its declared lifecycle hook');
    assert.equal(existsSync(gate), false, 'the nested gate body never ran without its own lock');
    assert.equal(existsSync(f.lock), false);
  } finally {
    if (outer.exitCode === null && !outer.killed) outer.kill();
  }
});

function verdictPath(step) {
  const arg = step.args.find((value) => value.startsWith('--out='));
  assert.ok(arg, 'the child gets its own output directory');
  return join(arg.slice('--out='.length), 'verdict.json');
}

function writeVerdict(step, overall, overrides = {}) {
  const results = criticalIds.map((id) => ({ id, status: 'PASS' }));
  writeFileSync(verdictPath(step), JSON.stringify({ meta: { mode: 'swarm' }, overall, results, ...overrides }));
}

test('the next Swarm gate cannot use a prior successful boot', (t) => {
  const createStep = fixture(t);
  const old = createStep();
  writeVerdict(old, 'PASS');
  assert.equal(old.judge({ code: 0, out: '' }), null);

  const candidateSource = '.devshots/source-baselines/working art.json.gz';
  const fresh = createStep(candidateSource);
  assert.ok(fresh.args.includes(`--candidate-source=${candidateSource}`));
  assert.notEqual(verdictPath(fresh), verdictPath(old));
  assert.match(fresh.judge({ code: 4, out: 'HARNESS ENVIRONMENT: assets stale vs HEAD' }), /assets stale/);
  assert.match(fresh.judge({ code: 0, out: '' }), /no readable verdict/);
  assert.match(old.judge({ code: -1, out: 'spawn error: missing npm' }), /missing npm/);
  assert.match(old.judge({ code: 3, out: '' }), /player-truth exited 3/);
});

test('a completed route can miss a noncritical check but every critical row must pass', (t) => {
  const createStep = fixture(t);
  for (const [code, overall, status] of [[1, 'FAIL', 'FAIL'], [2, 'INCOMPLETE', 'UNKNOWN']]) {
    const step = createStep();
    const results = criticalIds.map((id) => ({ id, status: 'PASS' }));
    results.push({ id: 'readability', status });
    writeVerdict(step, overall, { results });
    assert.equal(step.judge({ code, out: '' }), null);

    results.find((row) => row.id === 'player_control').status = status;
    writeVerdict(step, overall, { results });
    assert.match(step.judge({ code, out: '' }), /boot-critical checks not PASS: player_control/);
  }
});

test('zero child exit code does not make a malformed or incomplete boot verdict pass', (t) => {
  const step = fixture(t)();
  writeFileSync(verdictPath(step), '{broken');
  assert.match(step.judge({ code: 0, out: '' }), /no readable verdict/);

  writeVerdict(step, 'PASS', { meta: { mode: 'adventure' } });
  assert.match(step.judge({ code: 0, out: '' }), /invalid Swarm verdict/);

  writeVerdict(step, 'PASS', { results: [] });
  assert.match(step.judge({ code: 0, out: '' }), /boot-critical checks not PASS/);
});

function standaloneFixture(t) {
  const root = tempRoot(t);
  const scripts = join(root, 'scripts', 'fleet');
  mkdirSync(scripts, { recursive: true });
  const gate = join(scripts, 'gate.mjs');
  copyFileSync(new URL('../scripts/fleet/gate.mjs', import.meta.url), gate);
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    scripts: {
      'check:src-syntax': 'node gate-child.cjs syntax-fixture',
      'check:src-imports': 'node gate-child.cjs import-fixture',
      'check:playable': 'node gate-child.cjs adventure-fixture',
      'player-truth': 'node gate-child.cjs swarm-fixture',
      'check:sim': 'node gate-child.cjs sim-fixture',
    },
  }));
  writeFileSync(join(root, 'gate-child.cjs'), `
    const { writeFileSync } = require('node:fs');
    const { join } = require('node:path');
    const [, , step, ...args] = process.argv;
    if (step === 'swarm-fixture') {
      const output = args.find(arg => arg.startsWith('--out=')).slice('--out='.length);
      const results = ${JSON.stringify(criticalIds)}.map(id => ({ id, status: 'PASS' }));
      writeFileSync(join(output, 'verdict.json'), JSON.stringify({ meta: { mode: 'swarm' }, overall: 'PASS', results }));
    }
    console.log(step);
  `);
  const env = { ...process.env };
  delete env.npm_execpath;
  return {
    root,
    run: (...nodeFlags) => spawnSync(process.execPath, [...nodeFlags, gate], {
      cwd: root, env, encoding: 'utf8', timeout: 30000, windowsHide: true,
    }),
    output: name => readFileSync(join(root, '.devshots', 'fleet', name), 'utf8'),
  };
}

test('the standalone gate runs npm scripts without inheriting npm_execpath', (t) => {
  const gate = standaloneFixture(t);
  const child = gate.run();
  assert.equal(child.status, 0, child.error?.message || child.stderr);
  assert.match(gate.output('gate-src-syntax.log'), /syntax-fixture/);
  assert.match(gate.output('gate-import-lint.log'), /import-fixture/);
  assert.match(gate.output('gate-boot-adventure.log'), /adventure-fixture/);
  assert.match(gate.output('gate-boot-swarm.log'), /swarm-fixture/);
  assert.match(gate.output('gate-sim-47a.log'), /sim-fixture/);
  assert.match(gate.output('gate-last.txt'), /GATE PASS/);
});

test('a synchronous spawn error is recorded as a normal gate failure', (t) => {
  const gate = standaloneFixture(t);
  const preload = join(gate.root, 'spawn-refusal.cjs');
  writeFileSync(preload, [
    "require('node:child_process').spawn = () => { throw new Error('spawn EINVAL (fixture)'); };",
    "require('node:module').syncBuiltinESMExports();",
  ].join('\n'));
  const child = gate.run('--require', preload);
  assert.equal(child.status, 1, child.error?.message || child.stderr);
  assert.match(gate.output('gate-src-syntax.log'), /spawn error: spawn EINVAL \(fixture\)/);
  assert.match(gate.output('gate-last.txt'), /FAIL src-syntax: spawn error: spawn EINVAL \(fixture\)/);
  assert.match(gate.output('gate-last.txt'), /GATE FAIL/);
});
