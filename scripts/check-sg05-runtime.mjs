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
const envelope = readJson(ENVELOPE_PATH);

const evidence = validateEvidenceCorpus([
  { path: INPUT_PATH, data: readJson(INPUT_PATH) },
  { path: ENVELOPE_PATH, data: envelope },
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
  'scenario.*,tether.*,combat.*,story.*,presentation.*',
  '--limit',
  '300',
  '--physics-backend',
  'rapier-dynamic',
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
assert.equal(result.scenarioContract.boundActorCount, 8, 'scenario runtime should bind the complete Phase 0 actor cast');
assert.deepEqual(result.scenarioContract.unresolvedActorIds, [], 'scenario runtime should have no unresolved required actors');

const counts = result.traceSummary.types || {};
assert.equal(counts['scenario:loaded'], 1, 'scenario trace should prove contract load');
assert.equal(counts['scenario:factsInitialized'], 1, 'scenario trace should prove fact initialization');
assert.equal(counts['scenario:actorBindings'], 1, 'scenario trace should prove actor binding audit');
assert.equal(counts['scenario:beatEntered'], 1, 'scenario trace should prove beat entry');
assert.equal(counts['scenario:dialogueLine'], 1, 'scenario trace should prove authored dialogue execution for the first beat');
assert.equal(counts['tether:attached'], 1, 'scenario trace should prove the first Massline attach');
assert.equal(counts['presentation:cue'], 2, 'scenario trace should prove SG-08 cue routing for first beat and Massline attach');
assert(result.trace.records.some((record) => record.type === 'scenario:beatEntered'
  && record.payload.beatId === 'drop_wreck_field'), 'trace records should name the first beat');
assert(result.trace.records.some((record) => record.type === 'tether:attached'
  && record.payload.targetId != null), 'trace records should include the tether target payload');
assert(result.trace.records.some((record) => record.type === 'presentation:cue'
  && record.payload.id === 'scenario.signal.pulse'), 'trace records should include the first scenario presentation cue');
assert(result.trace.records.some((record) => record.type === 'presentation:cue'
  && record.payload.id === 'tether.attach'), 'trace records should include the Massline attach presentation cue');
assert(result.trace.records.some((record) => record.type === 'scenario:dialogueLine'
  && record.payload.lineId === 'dialogue.47a.kessler.drop'
  && record.payload.text.includes('sealed mass')), 'trace records should include the first authored Kessler line');

const progressedTrace = runJson([
  'scripts/sf.mjs',
  'trace',
  '47a',
  '--seed',
  '47',
  '--ticks',
  '5100',
  '--inputs',
  INPUT_PATH,
  '--events',
  'scenario.*,tether.*,combat.*,story.*,presentation.*',
  '--limit',
  '600',
  '--physics-backend',
  'rapier-dynamic',
]);
assert.equal(progressedTrace.schema, 'spaceface.sfCliResult.v1', 'progressed trace should use the canonical CLI envelope');
assert.equal(progressedTrace.ok, true, 'progressed trace should succeed');
const progressed = progressedTrace.result;
assert.equal(progressed.scenarioContract.activeBeatId, 'scavenger_arrival',
  '5100-tick run should enter the third 47-A beat');
assert.deepEqual(progressed.scenarioContract.enteredBeatIds,
  ['drop_wreck_field', 'stabilize_spindle', 'scavenger_arrival'],
  'progressed run should honestly report every entered beat through scavenger arrival');
assert.equal(progressed.scenarioContract.boundActorCount, 8, 'progressed run should keep every actor bound');
assert.deepEqual(progressed.scenarioContract.unresolvedActorIds, [], 'progressed run should not lose actor bindings');
assert((progressed.traceSummary.types['scenario:beatEntered'] || 0) >= 3,
  'progressed trace should prove the first three beat entries');
assert.equal(progressed.traceSummary.types['scenario:dialogueLine'], 3,
  'progressed trace should execute one authored dialogue line for each entered beat through scavenger arrival');
assert.equal(progressed.metrics.presentationCue, 4, 'progressed run should route scenario and tether presentation cues through SG-08');
assert(progressed.trace.records.some((record) => record.type === 'scenario:beatEntered'
  && record.payload.beatId === 'scavenger_arrival'), 'trace records should name scavenger_arrival');
assert(progressed.trace.records.some((record) => record.type === 'presentation:cue'
  && record.payload.id === 'scenario.comms.kessler'), 'progressed trace should include Kessler comms as a semantic cue');
assert(progressed.trace.records.some((record) => record.type === 'scenario:dialogueLine'
  && record.payload.lineId === 'dialogue.47a.kessler.scavengers'), 'progressed trace should include the scavenger-arrival authored line');
assert(progressed.metrics.firstHostileShotTick != null
  && progressed.metrics.firstHostileShotTick <= envelope.acceptancePlaceholders.firstHostileShotTickMax,
  'progressed run should prove first hostile fire inside the authored 90s window');
assert(progressed.metrics.hostileCombatFire > 0, 'progressed run should count hostile scenario fire');

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
  '--physics-backend',
  'rapier-dynamic',
]);
assert.equal(compare.schema, 'spaceface.sfSimCompareResult.v1', 'compare should emit a versioned result');
assert.equal(compare.ok, true, 'scenario runtime should preserve reload parity');
assert.equal(compare.baseline.scenarioContract.activeBeatId, 'drop_wreck_field', 'baseline should preserve active beat');
assert.equal(compare.candidate.scenarioContract.activeBeatId, 'drop_wreck_field', 'reload candidate should preserve active beat');
assert.equal(compare.baseline.scenarioContract.boundActorCount, 8, 'baseline should preserve complete actor binding');
assert.equal(compare.candidate.scenarioContract.boundActorCount, 8, 'reload candidate should preserve complete actor binding');
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
