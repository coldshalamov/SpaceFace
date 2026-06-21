import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateEvidenceCorpus, formatEvidenceIssue } from '../src/contracts/evidenceSchemas.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const INPUT_PATH = 'test/47a.inputs.json';
const ENVELOPE_PATH = 'test/47a.telemetry.expected.json';
const SCENARIO_PATH = 'src/data/scenarios/47a.scenario.json';

const evidence = validateEvidenceCorpus([
  { path: INPUT_PATH, data: readJson(INPUT_PATH) },
  { path: ENVELOPE_PATH, data: readJson(ENVELOPE_PATH) },
  { path: SCENARIO_PATH, data: readJson(SCENARIO_PATH) },
]);
assert(evidence.ok, evidence.issues.map(formatEvidenceIssue).join('\n'));

const trace = runJson([
  'scripts/sf.mjs',
  'trace',
  '47a',
  '--seed',
  '47',
  '--ticks',
  '720',
  '--inputs',
  INPUT_PATH,
  '--events',
  'scenario.*,combat.*,story.*',
  '--limit',
  '300',
]);

assert.equal(trace.schema, 'spaceface.sfCliResult.v1', 'sf trace should use the canonical CLI envelope');
assert.equal(trace.ok, true, 'sf trace should succeed');
assert.equal(trace.result.schema, 'spaceface.sfSimTraceResult.v1', 'sf trace should wrap the sim trace result');

const result = trace.result;
assert.equal(result.scenarioContract.id, 'scenario.47a.mass-discrepancy', 'trace should load the canonical 47-A scenario contract');
assert.equal(result.scenarioContract.source, SCENARIO_PATH, 'trace should report the canonical scenario contract path');
assert.equal(result.scenarioContract.activeBeatId, 'drop_wreck_field', '720-tick smoke run should honestly enter only the first 47-A beat');
assert.deepEqual(result.scenarioContract.enteredBeatIds, ['drop_wreck_field'], 'smoke run should not claim later beats');
assert.equal(result.scenarioContract.factCount, 5, 'scenario runtime should initialize declared world facts');
assert.equal(result.scenarioContract.actorCount, 8, 'scenario runtime should see every declared actor');
assert(result.scenarioContract.boundActorCount >= 1, 'scenario runtime should bind the player actor');
assert(result.scenarioContract.unresolvedActorIds.includes('evidence_spindle_47a'),
  'runtime should report unresolved slice actors instead of silently inventing them');

const counts = result.traceSummary.types || {};
assert.equal(counts['scenario:loaded'], 1, 'scenario trace should prove contract load');
assert.equal(counts['scenario:factsInitialized'], 1, 'scenario trace should prove fact initialization');
assert.equal(counts['scenario:actorBindings'], 1, 'scenario trace should prove actor binding audit');
assert.equal(counts['scenario:beatEntered'], 1, 'scenario trace should prove beat entry');
assert(result.trace.records.some((record) => record.type === 'scenario:beatEntered'
  && record.payload.beatId === 'drop_wreck_field'), 'trace records should name the first beat');

const compare = runJson([
  'scripts/sf-sim.mjs',
  'compare',
  '47a',
  '--seed',
  '47',
  '--ticks',
  '720',
  '--inputs',
  INPUT_PATH,
  '--expect',
  ENVELOPE_PATH,
  '--reload-at',
  '600',
]);
assert.equal(compare.schema, 'spaceface.sfSimCompareResult.v1', 'compare should emit a versioned result');
assert.equal(compare.ok, true, 'scenario runtime should preserve reload parity');
assert.equal(compare.baseline.scenarioContract.activeBeatId, 'drop_wreck_field', 'baseline should preserve active beat');
assert.equal(compare.candidate.scenarioContract.activeBeatId, 'drop_wreck_field', 'reload candidate should preserve active beat');
assert.deepEqual(compare.comparison.diffs, [], 'scenario runtime should not introduce replay diffs');

console.log('SG-05 scenario runtime bridge checks OK');

function runJson(args) {
  return JSON.parse(execFileSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  }));
}

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}
