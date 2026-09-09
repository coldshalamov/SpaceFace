#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateScenarioDocument, formatScenarioIssue } from '../src/contracts/scenarioSchemas.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCOPE_PATH = 'docs/Spec/47A_SLICE_SCOPE.json';
const SCENARIO_PATH = 'src/data/scenarios/47a.scenario.json';
const PR_TEMPLATE_PATH = '.github/pull_request_template.md';

const scope = readJson(SCOPE_PATH);
const scenario = readJson(SCENARIO_PATH);
const packageJson = readJson('package.json');
const sliceContract = readText(scope.sliceContract);
const sourceSpec = readText(scope.sourceSpec);
const ledger = readText('docs/handoffs/FOUNDATION_INTAKE_LEDGER.md');
const prTemplate = readText(PR_TEMPLATE_PATH);

const scenarioReport = validateScenarioDocument(scenario, { file: SCENARIO_PATH });
assert(scenarioReport.ok, scenarioReport.issues.map(formatScenarioIssue).join('\n'));

assert.equal(scope.schema, 'spaceface.sliceScope.v1', 'slice scope manifest must use the current schema');
assert.equal(scope.scenarioContract, SCENARIO_PATH, 'slice scope manifest must point at the 47-A scenario contract');
assert(Array.isArray(scope.requiredProofMetricIds) && scope.requiredProofMetricIds.length > 0,
  'slice scope manifest must list required proofMetricIds');
assert(Array.isArray(scope.acceptanceEvidence) && scope.acceptanceEvidence.length > 0,
  'slice scope manifest must list acceptance evidence for proof metrics');

const metricById = new Map((scenario.proofMetrics || []).map((metric) => [metric.id, metric]));
const requiredMetricIds = new Set(scope.requiredProofMetricIds);
const requiredScenarioMetrics = (scenario.proofMetrics || []).filter((metric) => metric.required).map((metric) => metric.id);
assert.deepEqual([...requiredMetricIds].sort(), [...new Set(requiredScenarioMetrics)].sort(),
  'slice scope requiredProofMetricIds must exactly match required scenario proof metrics');

const beatMetricRefs = collectBeatMetricRefs(scenario);
for (const id of scope.requiredProofMetricIds) {
  const metric = metricById.get(id);
  assert(metric, `required proof metric ${id} must exist in scenario proofMetrics`);
  assert.equal(metric.required, true, `proof metric ${id} must be marked required`);
  assert(metric.target && metric.evidence, `proof metric ${id} must name target and evidence`);
  assert(beatMetricRefs.has(id), `proof metric ${id} must be referenced by at least one beat`);
  assert(prTemplate.includes(id), `PR template must expose proofMetricId ${id}`);
}

const evidenceByMetric = new Map(scope.acceptanceEvidence.map((entry) => [entry.proofMetricId, entry]));
for (const id of scope.requiredProofMetricIds) {
  const evidence = evidenceByMetric.get(id);
  assert(evidence, `slice scope acceptanceEvidence missing ${id}`);
  assert(Array.isArray(evidence.commands) && evidence.commands.length > 0,
    `slice scope acceptanceEvidence for ${id} must list commands`);
  for (const command of evidence.commands) assertCommandExists(command, packageJson);
}

assert.equal(packageJson.scripts['check:slice-scope'], 'node scripts/check-slice-scope.mjs',
  'package scripts must expose check:slice-scope');
assert(packageJson.scripts.check.includes('npm run check:slice-scope'),
  'full check must include check:slice-scope');
assert(packageJson.scripts.check.indexOf('npm run check:slice-scope')
  < packageJson.scripts.check.indexOf('node scripts/check-phase0-slice-contract.mjs'),
  'check:slice-scope should run before the Phase 0 umbrella guard');

assert(prTemplate.includes('Required `proofMetricId`'), 'PR template must require a proofMetricId');
assert(prTemplate.includes('Evidence run'), 'PR template must require evidence run notes');
assert(sliceContract.includes('Every merge must name the slice metric it'), 'slice contract must keep the merge metric guardrail');
assert(sourceSpec.includes('Every merge names the slice metric'), 'master plan must keep the merge metric guardrail');
assert(ledger.includes('improves a named slice metric'), 'intake ledger must keep the named-metric acceptance rule');

console.log('47-A slice scope guard checks OK');

function readText(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

function readJson(rel) {
  return JSON.parse(readText(rel));
}

function collectBeatMetricRefs(doc) {
  const refs = new Map();
  for (const beat of doc.beats || []) {
    for (const id of beat.proofMetricIds || []) {
      if (!refs.has(id)) refs.set(id, []);
      refs.get(id).push(beat.id);
    }
  }
  return refs;
}

function assertCommandExists(command, pkg) {
  if (command.startsWith('npm run ')) {
    const script = command.slice('npm run '.length).trim();
    assert(pkg.scripts && pkg.scripts[script], `evidence command references missing package script ${script}`);
    return;
  }
  const match = /^node\s+([^ ]+)$/.exec(command);
  assert(match, `evidence command must be npm run <script> or node <script>: ${command}`);
  assert(existsSync(resolve(ROOT, match[1])), `evidence command references missing file ${match[1]}`);
}
