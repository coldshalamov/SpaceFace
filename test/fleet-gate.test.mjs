import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSwarmBootStep } from '../scripts/fleet/gate.mjs';

const criticalIds = ['route', 'player_ship', 'player_control', 'spawn_motion', 'crucible_realm', 'sim_stalled', 'play_interrupted'];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'spaceface-fleet-gate-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return () => createSwarmBootStep(root);
}

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
