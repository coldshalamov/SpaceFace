import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import {
  REQUIRED_47A_BEAT_IDS,
  REQUIRED_47A_BRANCH_IDS,
  formatScenarioIssue,
  validateScenarioDocument,
} from '../src/contracts/scenarioSchemas.js';
import { CRITICAL_SLICE_EVENT_IDS } from '../src/presentation/cueSchema.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCENARIO_PATH = 'src/data/scenarios/47a.scenario.json';
const BRANCH_LIFECYCLE_KEYS = ['abandon', 'active', 'aftermath', 'complete', 'fail', 'offer', 'reminder'];

const scenario = readJson(SCENARIO_PATH);
const report = validateScenarioDocument(scenario, { file: SCENARIO_PATH });
assert(report.ok, report.issues.map(formatScenarioIssue).join('\n'));

assert.equal(scenario.scenario, '47-A: The Mass Discrepancy', 'scenario contract must name the 47-A slice');
assert.equal(scenario.durationSeconds, 720, '47-A scenario should cover the 10-12 minute slice window');
assert.deepEqual(scenario.beats.map((beat) => beat.id), REQUIRED_47A_BEAT_IDS, '47-A beat order should stay pinned');
for (const branchId of REQUIRED_47A_BRANCH_IDS) {
  assert(scenario.branches.some((branch) => branch.id === branchId), `scenario missing required branch ${branchId}`);
}

const cueIds = new Set(scenario.presentationEventIds);
for (const cueId of CRITICAL_SLICE_EVENT_IDS) {
  assert(cueIds.has(cueId), `scenario must reserve critical SG-08 cue ${cueId}`);
}

for (const beat of scenario.beats) {
  assert(beat.requiredMechanics.length > 0, `${beat.id} must name the mechanics it needs`);
  assert(beat.requiredPresentation.length >= 5, `${beat.id} must reserve audio/VFX/camera/UI/accessibility presentation lanes`);
  assert(beat.proofMetricIds.length > 0, `${beat.id} must map to proof metrics`);
  assert(beat.worldFactRefs.length > 0, `${beat.id} must touch declared world facts`);
}

for (const branch of scenario.branches) {
  assert(branch.policyId.startsWith('policy.47a.'), `${branch.id} should have a 47-A policy id`);
  assert.deepEqual(Object.keys(branch.lifecycle || {}).sort(), BRANCH_LIFECYCLE_KEYS, `${branch.id} should supply complete branch lifecycle text`);
  for (const key of BRANCH_LIFECYCLE_KEYS) {
    assert(branch.lifecycle[key].length <= 220, `${branch.id}.${key} should stay inside the lifecycle text budget`);
  }
  assert(branch.worldFactEffects.length >= 1, `${branch.id} must change an immediate world fact`);
}

const metricIds = new Set(scenario.proofMetrics.map((metric) => metric.id));
for (const requiredMetric of [
  'first_meaningful_steering',
  'first_tether_attach',
  'first_hostile_shot',
  'policy_completion_count',
  'enemy_counter_tether_count',
  'branch_world_fact_delta',
  'critical_beat_presentation',
]) {
  assert(metricIds.has(requiredMetric), `scenario missing proof metric ${requiredMetric}`);
}

assertRejectsMalformedScenario();
assertCliValidation();

console.log('SG-05 scenario contract checks OK');

function assertRejectsMalformedScenario() {
  const missingBranchEffects = clone(scenario);
  missingBranchEffects.branches[0].worldFactEffects = [];
  assertIssue(missingBranchEffects, 'minItems', 'branch without world fact effects should fail');

  const missingBranchLifecycle = clone(scenario);
  delete missingBranchLifecycle.branches[0].lifecycle.aftermath;
  assertIssue(missingBranchLifecycle, 'type', 'branch without aftermath lifecycle text should fail');

  const missingActorRef = clone(scenario);
  missingActorRef.beats[0].requiredActors.push('actor_missing');
  assertIssue(missingActorRef, 'actorRef', 'beat actor references should resolve');

  const missingRequiredBeat = clone(scenario);
  missingRequiredBeat.beats = missingRequiredBeat.beats.filter((beat) => beat.id !== 'civilian_pod_choice');
  assertIssue(missingRequiredBeat, 'requiredBeat', 'required 47-A beats should be mandatory');

  const badCue = clone(scenario);
  badCue.presentationEventIds.push('bad');
  assertIssue(badCue, 'cueId', 'presentation event ids should use dotted semantic syntax');
}

function assertCliValidation() {
  const out = JSON.parse(execFileSync(process.execPath, [
    'scripts/sf.mjs',
    'validate',
    'scenario',
    SCENARIO_PATH,
  ], { cwd: ROOT, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }));
  assert.equal(out.schema, 'spaceface.sfCliResult.v1', 'sf validate scenario should emit the canonical CLI result');
  assert.equal(out.ok, true, 'sf validate scenario should pass for the canonical 47-A scenario');
  assert.equal(out.validateKind, 'scenario', 'sf validate scenario should identify scenario validation');
  assert.equal(out.result.schema, 'spaceface.scenarioValidationResult.v1', 'scenario validation result should be versioned');
}

function assertIssue(doc, rule, message) {
  const result = validateScenarioDocument(doc, { file: 'bad.scenario.json' });
  assert.equal(result.ok, false, message);
  assert(result.issues.some((issue) => issue.rule === rule), `${message}: expected rule ${rule}`);
}

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
