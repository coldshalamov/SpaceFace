// Contract test for the gate-reachability audit.
//
// The audit exists because fourteen green gates ran in no aggregate. A gate that cannot fail would
// reproduce exactly that problem one level up, so every failure mode is exercised here against
// synthetic script maps, and the real package.json is asserted to pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  auditReachability,
  collectReachable,
  directNpmDependencies,
} from '../scripts/check-gate-reachability.mjs';
import {
  countGateInvocations,
  resolveAggregateCommand,
  resolveAggregateSource,
} from '../scripts/lib/ciGateGraph.mjs';

const BASE = {
  precheck: 'npm run check:alpha',
  check: 'npm run check:beta && node scripts/thing.mjs',
  'check:alpha': 'node scripts/alpha.mjs',
  'check:beta': 'npm run check:gamma',
  'check:gamma': 'node scripts/gamma.mjs',
  'check:lonely': 'node scripts/lonely.mjs',
};

test('reachability follows nested npm run chains from both roots', () => {
  const reachable = collectReachable(BASE);
  assert.deepEqual([...reachable].sort(), ['check:alpha', 'check:beta', 'check:gamma']);
  assert.ok(!reachable.has('check:lonely'));
});

test('passes when must-gate checks are reachable and a manual exception is reasoned', () => {
  const report = auditReachability(BASE, {
    mustGate: ['check:beta', 'check:gamma'],
    manualGates: { 'check:lonely': 'This synthetic gate requires a headed manual runtime.' },
  });
  assert.equal(report.ok, true, report.failures.join('; '));
  assert.equal(report.orphans, 1);
});

test('FAILS when a pinned gate is dropped from its aggregate', () => {
  const scripts = { ...BASE, check: 'node scripts/thing.mjs' };
  const report = auditReachability(scripts, { mustGate: ['check:gamma'], manualGates: {} });
  assert.equal(report.ok, false);
  assert.match(report.failures.join('\n'), /mustGate "check:gamma" is UNREACHABLE/);
});

test('FAILS when a direct atlas member is reachable but not pinned', () => {
  const scripts = { ...BASE, 'check:atlas': 'npm run check:gamma && npm run check:sneaky', 'check:sneaky': 'node scripts/sneaky.mjs' };
  const report = auditReachability(scripts, { mustGate: ['check:gamma'], manualGates: {} });
  assert.equal(report.ok, false);
  assert.match(report.failures.join('\n'), /check:atlas member "check:sneaky" is reachable but not pinned/);
});

test('FAILS when a manual exception becomes reachable but is not pruned', () => {
  const scripts = { ...BASE, check: 'npm run check:beta && npm run check:lonely' };
  const report = auditReachability(scripts, {
    mustGate: ['check:beta'],
    manualGates: { 'check:lonely': 'This synthetic gate requires a headed manual runtime.' },
  });
  assert.equal(report.ok, false);
  assert.match(report.failures.join('\n'), /now reachable — remove the stale exception/);
});

test('FAILS when a manual exception references a deleted script', () => {
  const report = auditReachability(BASE, {
    mustGate: [],
    manualGates: { 'check:deleted': 'This synthetic gate requires a headed manual runtime.' },
  });
  assert.equal(report.ok, false);
  assert.match(report.failures.join('\n'), /"check:deleted", which is no longer a declared script/);
});

test('FAILS when a manual exception has no concrete reason', () => {
  const report = auditReachability(BASE, { mustGate: [], manualGates: { 'check:lonely': 'manual' } });
  assert.equal(report.ok, false);
  assert.match(report.failures.join('\n'), /needs a concrete reason/);
});

test('FAILS when a mustGate entry is not a declared script at all', () => {
  const report = auditReachability(BASE, { mustGate: ['check:imaginary'], manualGates: {} });
  assert.equal(report.ok, false);
  assert.match(report.failures.join('\n'), /is not a declared npm script/);
});

test('direct dependency parsing only treats npm run segments as aggregate members', () => {
  assert.deepEqual(
    directNpmDependencies('npm run check:alpha && node scripts/nope.mjs && npm run check:beta -- --flag'),
    ['check:alpha', 'check:beta'],
  );
});

test('the live package.json and baseline pass the audit', () => {
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  const baseline = JSON.parse(readFileSync(new URL('./gate-reachability.baseline.json', import.meta.url), 'utf8'));
  const report = auditReachability(scripts, baseline);
  assert.equal(report.ok, true, report.failures.join('\n'));
});

// The `check:ci` delegation is the thing that broke four gates at once: they each counted `npm run`
// strings inside `scripts['check:ci']`, which is a single `npm run check:ci:report` and therefore
// contains none of the links CI actually executes. scripts/lib/ciGateGraph.mjs is now the one place
// that resolves it, so its failure modes are exercised here rather than trusted.
const DELEGATING = {
  check: 'npm run check:alpha && npm run check:beta',
  'check:ci': 'npm run check:ci:report',
  'check:ci:report': 'node scripts/check-ci-report.mjs',
  'check:alpha': 'node scripts/alpha.mjs',
  'check:beta': 'npm run check:gamma',
  'check:gamma': 'node scripts/gamma.mjs',
};

test('check:ci resolves through the ci-report runner to the real check chain', () => {
  assert.equal(resolveAggregateCommand(DELEGATING, 'check:ci'), DELEGATING.check);
  assert.equal(resolveAggregateSource(DELEGATING, 'check:ci').name, 'check');
  assert.equal(resolveAggregateCommand(DELEGATING, 'check'), DELEGATING.check);
});

test('the delegating and direct aggregates agree on transitive gate counts', () => {
  for (const gate of ['check:alpha', 'check:beta', 'check:gamma']) {
    assert.equal(countGateInvocations(DELEGATING, 'check:ci', gate), 1, gate);
    assert.equal(countGateInvocations(DELEGATING, 'check', gate), 1, gate);
  }
  assert.equal(countGateInvocations(DELEGATING, 'check:ci', 'check:absent'), 0);
});

test('a gate wired twice is counted twice, so "exactly once" can still fail', () => {
  const doubled = { ...DELEGATING, check: 'npm run check:alpha && npm run check:beta && npm run check:gamma' };
  assert.equal(countGateInvocations(doubled, 'check:ci', 'check:gamma'), 2);
});

test('dropping a gate from check makes it unreachable from check:ci too', () => {
  const dropped = { ...DELEGATING, check: 'npm run check:alpha' };
  assert.equal(countGateInvocations(dropped, 'check:ci', 'check:gamma'), 0);
  assert.ok(!collectReachable(dropped, ['check:ci']).has('check:gamma'));
});

test('a --smoke runner is NOT the package matrix and does not resolve to check', () => {
  const smoke = { ...DELEGATING, 'check:ci:report': 'node scripts/check-ci-report.mjs --smoke' };
  assert.equal(resolveAggregateSource(smoke, 'check:ci').name, 'check:ci:report');
  assert.equal(countGateInvocations(smoke, 'check:ci', 'check:gamma'), 0);
});

test('resolution throws on a delegation cycle instead of hanging', () => {
  const cyclic = { check: 'npm run check:ci', 'check:ci': 'npm run check' };
  assert.throws(() => resolveAggregateCommand(cyclic, 'check:ci'), /delegation cycle/);
});

test('resolution throws when the root is not a declared script', () => {
  assert.throws(() => resolveAggregateCommand(DELEGATING, 'check:nope'), /does not declare a runnable script/);
});

test('the live check and check:ci aggregates run the same gates', () => {
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  assert.equal(resolveAggregateCommand(scripts, 'check:ci'), resolveAggregateCommand(scripts, 'check'));
  for (const gate of collectReachable(scripts)) {
    assert.equal(
      countGateInvocations(scripts, 'check:ci', gate),
      countGateInvocations(scripts, 'check', gate),
      `${gate} must be executed the same number of times by check and check:ci`,
    );
  }
});

test('Chromium parity gate is a single pinned member of the real CI matrix', () => {
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  const baseline = JSON.parse(readFileSync(new URL('./gate-reachability.baseline.json', import.meta.url), 'utf8'));
  const gate = 'check:lab-chromium-parity';

  assert.equal(
    scripts[gate],
    'node --test test/lab-chromium-parity.test.mjs test/lab-browser-input-grammar.test.mjs',
  );
  assert.equal(directNpmDependencies(scripts.check).filter((name) => name === gate).length, 1);
  assert.equal(countGateInvocations(scripts, 'check', gate), 1);
  assert.equal(countGateInvocations(scripts, 'check:ci', gate), 1);
  assert.ok(baseline.mustGate.includes(gate), `${gate} must remain pinned in the baseline`);
});

test('draw-to-fly gate runs path-tracking and stroke-speed exactly once from check/check:ci', () => {
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  const baseline = JSON.parse(readFileSync(new URL('./gate-reachability.baseline.json', import.meta.url), 'utf8'));
  const gate = 'check:draw-to-fly';
  const body = scripts[gate];

  assert.equal(
    body,
    'node --test test/draw-to-fly-path-tracking.test.mjs test/draw-to-fly-stroke-speed.test.mjs',
  );
  assert.equal((body.match(/draw-to-fly-path-tracking\.test\.mjs/g) || []).length, 1);
  assert.equal((body.match(/draw-to-fly-stroke-speed\.test\.mjs/g) || []).length, 1);
  assert.equal(directNpmDependencies(scripts.check).filter((name) => name === gate).length, 1);
  assert.equal(countGateInvocations(scripts, 'check', gate), 1);
  assert.equal(countGateInvocations(scripts, 'check:ci', gate), 1);
  assert.ok(baseline.mustGate.includes(gate), `${gate} must remain pinned in the baseline`);
});

test('the atlas program suite is pinned and reachable, not merely green', () => {
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  const baseline = JSON.parse(readFileSync(new URL('./gate-reachability.baseline.json', import.meta.url), 'utf8'));
  const reachable = collectReachable(scripts);
  const atlasGates = directNpmDependencies(scripts['check:atlas']);
  for (const gate of atlasGates) {
    assert.ok(reachable.has(gate), `${gate} must be reachable from the CI matrix roots`);
    assert.ok(baseline.mustGate.includes(gate), `${gate} must be pinned in the baseline`);
  }
});
