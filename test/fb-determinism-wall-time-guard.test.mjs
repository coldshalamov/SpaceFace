import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  ALLOWED_WALL_TIME_FILES,
  WALL_TIME_SCAN_DIRS,
  scanWallTimeSites,
  unclassifiedWallTimeSites,
} from '../scripts/lib/wallTimeGuard.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// FB-095 — wall-clock determinism guard. The checker script
// (scripts/check-phase0-slice-contract.mjs) imports this same engine and asserts
// unclassifiedWallTimeSites(ROOT) is empty; a planted Date.now() must therefore fail it.

test('the real tree has zero unclassified wall-clock sites in simulation owners', () => {
  assert.deepEqual(unclassifiedWallTimeSites(ROOT), []);
});

test('a planted Date.now() in a sim-owner file is flagged (the guard fails)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sf-walltime-'));
  try {
    mkdirSync(join(tmp, 'src/systems'), { recursive: true });
    writeFileSync(
      join(tmp, 'src/systems', 'planted.js'),
      'export function tick() { return Date.now(); }\n',
    );
    const sites = unclassifiedWallTimeSites(tmp);
    assert.ok(
      sites.some((s) => s.rel === 'src/systems/planted.js' && s.line === 1),
      `planted Date.now() should be reported, got: ${JSON.stringify(sites)}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('a planted performance.now() is flagged too', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sf-walltime-'));
  try {
    mkdirSync(join(tmp, 'src/core'), { recursive: true });
    writeFileSync(
      join(tmp, 'src/core', 'planted.js'),
      'export const t0 = typeof performance !== "undefined" ? performance.now() : 0;\n',
    );
    const sites = scanWallTimeSites(tmp, 'src/core');
    assert.ok(sites.some((s) => s.rel === 'src/core/planted.js'), 'performance.now() must be flagged');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('comments and prose mentioning the clock are not flagged', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sf-walltime-'));
  try {
    mkdirSync(join(tmp, 'src/combat'), { recursive: true });
    writeFileSync(
      join(tmp, 'src/combat', 'clean.js'),
      [
        '// never call performance.now() or Date.now() here — sim uses state.simTime',
        '/* Date.now() inside a block header is prose, not a read */',
        'export function stamp(state) { // Date.now() trailing comment is prose',
        '  return state.simTime;',
        '}',
      ].join('\n'),
    );
    assert.deepEqual(scanWallTimeSites(tmp, 'src/combat'), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('every classification carries a written rationale in the authority audit', () => {
  const audit = readFileSync(join(ROOT, 'docs/Spec/PHASE0_AUTHORITY_AUDIT.md'), 'utf8');
  for (const [rel, rationale] of ALLOWED_WALL_TIME_FILES) {
    assert.ok(rationale && rationale.length > 0, `${rel} needs a written classification`);
    assert.ok(audit.includes(rel), `authority audit must classify ${rel}`);
  }
});

test('the named sim owners no longer read wall clocks directly', () => {
  for (const rel of ['src/core/physics.js', 'src/systems/flightV3.js', 'src/systems/flight.js']) {
    const code = readFileSync(join(ROOT, rel), 'utf8')
      .split(/\r?\n/)
      .filter((l) => {
        const t = l.trim();
        return !(t.startsWith('//') || t.startsWith('/*') || t.startsWith('*'));
      })
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n');
    assert.ok(!/(?:performance\.now|Date\.now)\s*\(/.test(code), `${rel} must not invoke wall clocks`);
    assert.ok(code.includes('perfNow('), `${rel} diagnostics should route through perfNow()`);
  }
});

test('the sanctioned offline-progress exception stays opt-in gated', () => {
  const automation = readFileSync(join(ROOT, 'src/systems/automation.js'), 'utf8');
  assert.ok(
    automation.includes('wallClockOfflineProgressEnabled'),
    'automation.js must keep the wallClockOfflineProgress opt-in gate',
  );
  // The only live Date.now() call site sits inside resolveAutomationOfflineNow behind the gate.
  const idx = automation.indexOf('Date.now) ? Date.now()');
  assert.ok(idx > 0, 'expected the gated Date.now() read to still exist');
  const gateIdx = automation.lastIndexOf('wallClockOfflineProgressEnabled(state, opts)', idx);
  assert.ok(gateIdx > 0 && idx - gateIdx < 400, 'the Date.now() read must sit inside the opt-in gate');
});

test('checker script wires the shared guard', () => {
  const checker = readFileSync(join(ROOT, 'scripts/check-phase0-slice-contract.mjs'), 'utf8');
  assert.ok(checker.includes("from './lib/wallTimeGuard.mjs'"), 'checker must import the shared guard');
  assert.ok(checker.includes('unclassifiedWallTimeSites(ROOT)'), 'checker must scan the real tree');
});

test('scan covers all five simulation-owner directories', () => {
  assert.deepEqual([...WALL_TIME_SCAN_DIRS].sort(), [
    'src/ai', 'src/combat', 'src/core', 'src/systems', 'src/world',
  ]);
});
