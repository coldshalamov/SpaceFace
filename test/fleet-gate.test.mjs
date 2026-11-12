import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  return () => createSwarmBootStep(root);
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

  const fresh = createStep();
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
  assert.match(gate.output('gate-import-lint.log'), /spawn error: spawn EINVAL \(fixture\)/);
  assert.match(gate.output('gate-last.txt'), /FAIL import-lint: spawn error: spawn EINVAL \(fixture\)/);
  assert.match(gate.output('gate-last.txt'), /GATE FAIL/);
});
