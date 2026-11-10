// Safety and append-only behaviour for scripts/reference.mjs.
//
// The tool exists so a deliberate golden re-record is one auditable command, not a hand edit.
// These tests inject the sf-sim boundary: they prove the refusals happen BEFORE any file is
// written, that a second record appends v2 without touching v1, and that diff reads the stored
// snapshots and reports the motion/content split a reviewer needs.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  diffReference, listReferences, recordReference, validateRecordOptions,
} from '../scripts/reference.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function envelope(hash = HASH_A, extra = {}) {
  return {
    schema: 'spaceface.telemetryEnvelope.v1',
    id: 'fixture-envelope',
    scenario: '47-A: The Mass Discrepancy',
    seed: 47,
    sourceInputTape: 'test/47a.inputs.json',
    sourceScenarioContract: 'src/data/scenarios/47a.scenario.json',
    phase0ObservedTraceCounts: { 'combat:fire': 17, 'projectile:hit': 2 },
    acceptanceCriteria: { authoritativeHash: hash, cleanRunCountRequired: 5 },
    notes: [],
    ...extra,
  };
}

function runResult(hash, overrides = {}) {
  return {
    schema: 'spaceface.sfSimResult.v1',
    scenario: '47a',
    seed: 47,
    ticks: 720,
    reloadAt: 600,
    repeat: 5,
    sha256: hash,
    inputTape: 'test/47a.inputs.json',
    scenarioContract: { source: 'src/data/scenarios/47a.scenario.json' },
    traceSummary: { types: { 'combat:fire': 17, 'projectile:hit': 2 } },
    ...overrides,
  };
}

function snapshot({ x = 1, economy = 10, version = 23 } = {}) {
  return {
    meta: { version },
    entities: [{ id: 1, pos: { x, z: 0 }, vel: { x: 0, z: 0 } }],
    economy: { seed: economy },
  };
}

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'sf-reference-'));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function baseOptions(root, overrides = {}) {
  return {
    root,
    envelope: envelope(),
    envelopeLabel: 'test/47a.telemetry.save-v23.expected.json',
    id: 'fixture-ref',
    reason: 'A deliberate fixture re-record with a reviewed gameplay reason.',
    ticket: 'Q5',
    runSim: () => runResult(HASH_B),
    runInspect: () => ({ sha256: HASH_B, snapshot: snapshot() }),
    now: () => new Date('2026-11-06T12:00:00.000Z'),
    ...overrides,
  };
}

test('record refuses a short reason, a missing ticket and a low clean-run count before writing', () => {
  const { root, cleanup } = fixtureRoot();
  try {
    assert.throws(() => validateRecordOptions({
      envelope: envelope(), reason: 'too short', ticket: 'Q5', cleanRuns: 5,
    }), /at least 20 characters/);
    assert.throws(() => validateRecordOptions({
      envelope: envelope(), reason: 'A deliberate fixture re-record.', ticket: '', cleanRuns: 5,
    }), /--ticket is required/);
    assert.throws(() => recordReference(baseOptions(root, { cleanRuns: 4 })), /below the envelope/);
    assert.equal(existsSync(join(root, 'test/references/fixture-ref')), false, 'a refused record writes nothing');
  } finally { cleanup(); }
});

test('record refuses moved event counts unless --events-changed, and writes nothing', () => {
  const { root, cleanup } = fixtureRoot();
  try {
    const runSim = () => runResult(HASH_B, { traceSummary: { types: { 'combat:fire': 18, 'projectile:hit': 2 } } });
    assert.throws(() => recordReference(baseOptions(root, { runSim })), /event counts moved/);
    assert.equal(existsSync(join(root, 'test/references/fixture-ref')), false, 'event drift is not written');
  } finally { cleanup(); }
});

test('record refuses a failed sf-sim run, a mismatched inspect hash and a stale envelope pin', () => {
  const { root, cleanup } = fixtureRoot();
  try {
    assert.throws(() => recordReference(baseOptions(root, {
      runSim: () => { throw new Error('repeat 3 hash diverged'); },
    })), /repeat 3 hash diverged/);
    assert.equal(existsSync(join(root, 'test/references/fixture-ref')), false);

    assert.throws(() => recordReference(baseOptions(root, {
      runInspect: () => ({ sha256: HASH_C, snapshot: snapshot() }),
    })), /inspect hash/);
    assert.equal(existsSync(join(root, 'test/references/fixture-ref')), false);

    assert.throws(() => recordReference(baseOptions(root, {
      runSim: () => runResult(HASH_B, { seed: 99 }),
    })), /seed 99 does not match envelope seed 47/);
    assert.equal(existsSync(join(root, 'test/references/fixture-ref')), false);
  } finally { cleanup(); }
});

test('a second record appends v2 and never mutates v1', () => {
  const { root, cleanup } = fixtureRoot();
  try {
    const first = recordReference(baseOptions(root));
    assert.equal(first.version, 1);
    const v1Path = join(root, 'test/references/fixture-ref/v1.expected.json');
    const v1Bytes = readFileSync(v1Path, 'utf8');

    const second = recordReference(baseOptions(root, {
      envelope: envelope(HASH_B),
      runSim: () => runResult(HASH_C),
      runInspect: () => ({ sha256: HASH_C, snapshot: snapshot({ x: 2, economy: 11 }) }),
      now: () => new Date('2026-11-06T12:05:00.000Z'),
    }));
    assert.equal(second.version, 2);
    assert.equal(readFileSync(v1Path, 'utf8'), v1Bytes, 'v1 is append-only');

    const files = readdirSync(join(root, 'test/references/fixture-ref')).sort();
    assert.deepEqual(files, [
      'history.jsonl', 'index.json', 'v1.expected.json', 'v1.snapshot.json.gz',
      'v2.expected.json', 'v2.snapshot.json.gz',
    ]);

    const history = readFileSync(join(root, 'test/references/fixture-ref/history.jsonl'), 'utf8')
      .trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(history.length, 2);
    for (const row of history) {
      assert.deepEqual(Object.keys(row).sort(), ['at', 'cleanRuns', 'delta', 'hash', 'prevHash', 'reason', 'ticket']);
    }
    assert.equal(history[1].prevHash, HASH_B);
    assert.equal(history[1].delta.motionCount, 1, 'the moved entity x is a motion leaf');
    assert.equal(history[1].delta.fieldClasses.economy, 1);

    const index = JSON.parse(readFileSync(join(root, 'test/references/fixture-ref/index.json'), 'utf8'));
    assert.equal(index.schema, 'spaceface.referenceIndex.v1');
    assert.equal(index.latest, 2);
    assert.deepEqual(index.versions.map((row) => row.version), [1, 2]);
    assert.equal(index.versions[1].hash, HASH_C);
    assert.equal(index.versions[1].cleanRuns, 5);
  } finally { cleanup(); }
});

test('diff reports the field-class delta from stored snapshots, and matches working when unchanged', () => {
  const { root, cleanup } = fixtureRoot();
  try {
    recordReference(baseOptions(root));
    recordReference(baseOptions(root, {
      envelope: envelope(HASH_B),
      runSim: () => runResult(HASH_C),
      runInspect: () => ({ sha256: HASH_C, snapshot: snapshot({ x: 2, economy: 11 }) }),
    }));

    let inspectCalls = 0;
    const report = diffReference({
      root, id: 'fixture-ref', from: 1, to: 2,
      runInspect: () => { inspectCalls++; return { sha256: HASH_C, snapshot: snapshot({ x: 2, economy: 11 }) }; },
    });
    assert.equal(inspectCalls, 0, 'version-to-version diff uses stored snapshots');
    assert.equal(report.identical, false);
    assert.equal(report.snapshotDelta.motionCount, 1);
    assert.equal(report.snapshotDelta.fieldClasses.economy, 1);
    assert.equal(report.snapshotDelta.totalDiffs, 2);

    const same = diffReference({
      root, id: 'fixture-ref', from: 2, to: 'working',
      runInspect: () => ({ sha256: HASH_C, snapshot: snapshot({ x: 2, economy: 11 }) }),
    });
    assert.equal(same.identical, true);
    assert.equal(same.snapshotDelta.totalDiffs, 0);

    assert.equal(listReferences({ root }).length, 1);
  } finally { cleanup(); }
});
