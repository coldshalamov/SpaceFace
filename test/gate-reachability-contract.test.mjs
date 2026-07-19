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
