// PQ-186.01 — Rulings as guards: each guard has a fixture that fails it, and master passes.
//
// Rulings served (design/program/FUN_CONVERGENCE_LOOP.md §7, FEEL_CONTRACT.md §D):
//   "Never add drag. Never clamp given momentum."  "Sim uses state.rng and state.simTime."
//   "Hits do not scale with levels; mass and momentum decide."  "No dialogue trees."
//   "Single writers: the physics owner owns velocity."
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { GUARDS, scanGuard, judge, buildBaseline, readBaseline, scanTree, blankCommentsAndStrings } from '../scripts/check-rulings-guards.mjs';

const FIX = (name) => resolve('test/fixtures/rulings', name);
const guard = (id) => GUARDS.find((g) => g.id === id);

test('every guard quotes the ruling it serves and names its kind', () => {
  for (const g of GUARDS) {
    assert.ok(g.ruling && g.ruling.length > 30, `${g.id} must carry the owner's ruling in its message`);
    assert.ok(['ban', 'ratchet'].includes(g.kind), `${g.id} kind`);
    assert.ok(g.pattern instanceof RegExp);
  }
});

test('each guard has a fixture that fails it', () => {
  const cases = [
    ['no-ambient-randomness', 'bad-randomness.js', 1],
    ['no-wall-clock-in-sim', 'bad-wall-clock.js', 2],
    ['no-linear-damping', 'bad-damping.js', 3],
    ['no-velocity-writes-outside-owner', 'bad-velocity-write.js', 2],
    ['no-hp-scaled-knockback', 'bad-hp-knockback.js', 1],
    ['no-dialogue-trees', 'bad-dialogue-tree.js', 1],
  ];
  for (const [id, file, expected] of cases) {
    const findings = scanGuard(guard(id), [FIX(file)]);
    assert.equal(findings.length, expected, `${id} must catch ${file} ${expected}x — ${guard(id).ruling}`);
  }
});

test('the same words in comments and strings, and an intent instead of a write, trip nothing', () => {
  for (const g of GUARDS) {
    assert.deepEqual(scanGuard(g, [FIX('clean.js')]), [], `${g.id} must not fire on clean.js`);
  }
  assert.doesNotMatch(blankCommentsAndStrings('x = "Math.random()"; // Date.now()'), /Math\.random|Date\.now/);
});

test('a ban never tolerates a finding; a ratchet tolerates the baseline and nothing more', () => {
  const scan = { 'no-hp-scaled-knockback': [{ file: 'src/combat/x.js', line: 1, text: 'impulse *= hpFraction' }] };
  assert.equal(judge(scan, { guards: {} }).violations.length, 1, 'hp-scaled knockback is banned outright');

  const ratchetScan = { 'no-linear-damping': [
    { file: 'src/systems/a.js', line: 1, text: 'e.vel.x *= 0.9' },
    { file: 'src/systems/a.js', line: 2, text: 'e.vel.z *= 0.9' },
  ] };
  const base = buildBaseline(ratchetScan);
  assert.deepEqual(base.guards['no-linear-damping'], { 'src/systems/a.js': 2 });
  assert.equal(judge(ratchetScan, base).violations.length, 0, 'the baseline itself is tolerated');
  const grown = { 'no-linear-damping': [...ratchetScan['no-linear-damping'], { file: 'src/systems/a.js', line: 3, text: 'e.vel.x *= 0.5' }] };
  assert.equal(judge(grown, base).violations.length, 3, 'one more occurrence in a baselined file fails the whole file');
  const newFile = { 'no-linear-damping': [{ file: 'src/systems/b.js', line: 1, text: 'e.vel.x *= 0.5' }] };
  assert.equal(judge(newFile, base).violations[0].why, 'ratchet: new file');
  const shrunk = { 'no-linear-damping': [ratchetScan['no-linear-damping'][0]] };
  const j = judge(shrunk, base);
  assert.equal(j.violations.length, 0);
  assert.deepEqual(j.improvements, [{ guard: 'no-linear-damping', file: 'src/systems/a.js', was: 2, now: 1 }]);
});

test('master is green against the committed baseline, and the baseline names only what exists', () => {
  const scan = scanTree();
  const baseline = readBaseline();
  const { violations } = judge(scan, baseline);
  assert.deepEqual(violations, [], 'a new occurrence of a ruled-out pattern reached master');
  assert.deepEqual(scan['no-hp-scaled-knockback'], [], 'hits do not scale with levels; mass and momentum decide');
  for (const [id, files] of Object.entries(baseline.guards)) {
    const counts = {};
    for (const f of scan[id] || []) counts[f.file] = (counts[f.file] || 0) + 1;
    for (const [file, n] of Object.entries(files)) {
      assert.ok(counts[file] != null && counts[file] <= n, `${id}: ${file} is baselined at ${n} but the tree has ${counts[file] ?? 0}; re-record the baseline downward with a receipt`);
    }
  }
});

test('the CLI honours exit codes: fixtures fail it, the tree passes it', () => {
  const bad = spawnSync(process.execPath, ['scripts/check-rulings-guards.mjs', '--files', FIX('bad-velocity-write.js')], { encoding: 'utf8', cwd: resolve('.') });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /no-velocity-writes-outside-owner/);
  assert.match(bad.stderr, /physics owner owns velocity/);
  const good = spawnSync(process.execPath, ['scripts/check-rulings-guards.mjs'], { encoding: 'utf8', cwd: resolve('.') });
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /rulings-guards: PASS/);
});
