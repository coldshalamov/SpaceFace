import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAuthoritativeInitOrder } from '../src/runtime/authoritativeSystemManifest.js';
import { runLabScenario, runLabScenarioInternal } from '../src/testing/lab/runScenario.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const canaryDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/production-fixture-canary.scenario.json'),
  'utf8',
));

test('production-fixture canary executes the materialized Node-safe production manifest', async () => {
  const result = await runLabScenarioInternal(canaryDoc, { verbosity: 1 });
  assert.equal(result.ok, true, result.error || JSON.stringify(result.oracle));
  assert.equal(result.nonPromoting, true);
  assert.equal(result.evidenceClass, 'internal-test');
  assert.equal(result.executionEvidenceClass, 'production-fixture');
  assert.equal(result.authoredEvidenceClass, 'production-fixture');
  assert.equal(result.evidenceDemoted, false);
  assert.deepEqual(
    result.live.systems,
    getAuthoritativeInitOrder('production', { nodeSafeOnly: true }).filter((id) => id !== 'core'),
  );
  assert.ok(result.live.systems.includes('economy'));
  assert.ok(result.live.systems.includes('world'));
  assert.ok(!result.live.systems.includes('render'));
  assert.equal(result.rendering.detached, true);
});

test('public production-fixture canary result is certifying-shaped with execution-derived class', async () => {
  const result = await runLabScenario(canaryDoc);
  assert.equal(result.ok, true, result.error || JSON.stringify(result.oracle));
  assert.equal(result.certifying, true);
  assert.equal(result.nonPromoting, false);
  assert.equal(result.evidenceClass, 'production-fixture');
  assert.equal(result.authoredEvidenceClass, 'production-fixture');
  assert.equal(result.rendering.detached, true);
});
