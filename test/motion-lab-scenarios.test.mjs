import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isJsonSerializable,
  jsonRoundTrip,
} from '../src/systems/motionTelemetry.js';
import {
  MOTION_LAB_SEED,
  formatM1Table,
  runM1,
  runM4,
  runM6,
  runM8,
  runM11,
} from '../src/systems/motionScenarios.js';

const SEED = MOTION_LAB_SEED;
const LONG = { timeout: 180_000 };

async function runTwice(run) {
  const a = await run();
  const b = await run();
  assert.ok(a && a.metrics, 'scenario must return metrics');
  assert.equal(a.metrics.schema, 'spaceface.motionMetrics.v1');
  assert.ok(isJsonSerializable(a.metrics), 'metrics must be JSON-serializable');
  assert.deepEqual(jsonRoundTrip(a.metrics), a.metrics);
  assert.deepEqual(a.metrics, b.metrics, 'same seed must produce identical metrics');
  if (a.trace) {
    assert.ok(isJsonSerializable(a.trace), 'trace must be JSON-serializable');
    assert.equal(a.trace.schema, 'spaceface.motionTrace.v1');
  }
  return a;
}

test('M1 player impulse response is deterministic across Hitch, Wasp, Drifter, Atlas', LONG, async () => {
  const result = await runTwice(() => runM1({ seed: SEED }));
  assert.equal(result.metrics.scenarioId, 'M1');
  const hulls = result.metrics.hulls;
  assert.ok(hulls.ship_kestrel && hulls.ship_wasp && hulls.ship_drifter && hulls.ship_atlas);
  assert.ok(hulls.ship_kestrel.peakForwardSpeed > 5, 'Hitch must accelerate under a throttle step');
  assert.ok(hulls.ship_wasp.peakForwardSpeed > 5, 'Wasp must accelerate under a throttle step');
  assert.ok(hulls.ship_atlas.peakForwardSpeed > 1, 'Atlas must accelerate under a throttle step');
  assert.equal(hulls.ship_kestrel.energyHeatSeam, 'skipped-canonical-cap-and-weapon-heat');
  const table = formatM1Table(result.metrics);
  console.log('\nM1 Hitch vs Wasp baseline\n' + table + '\n');
});

test('M4 moving slot convergence is deterministic', LONG, async () => {
  const result = await runTwice(() => runM4({ seed: SEED }));
  assert.equal(result.metrics.scenarioId, 'M4');
  assert.equal(typeof result.metrics.rmsPositionError, 'number');
  assert.equal(typeof result.metrics.rmsVelocityError, 'number');
  assert.equal(typeof result.metrics.peakOvershoot, 'number');
  assert.ok('settleTimeS' in result.metrics);
  assert.ok('controlSignChangesPerS' in result.metrics);
  assert.ok('collisions' in result.metrics);
});

test('M6 interceptor scissors is deterministic (bad numbers are the baseline)', LONG, async () => {
  const result = await runTwice(() => runM6({ seed: SEED }));
  assert.equal(result.metrics.scenarioId, 'M6');
  assert.ok('entryTimingSpreadS' in result.metrics);
  assert.ok('minFriendlySeparation' in result.metrics);
  assert.ok('targetExposureBeforeFirstShotS' in result.metrics);
  assert.ok('laneConflicts' in result.metrics);
  assert.ok('cleanExtensions' in result.metrics);
  assert.ok('reformTimeS' in result.metrics);
});

test('M8 formation break/recovery is deterministic', LONG, async () => {
  const result = await runTwice(() => runM8({ seed: SEED }));
  assert.equal(result.metrics.scenarioId, 'M8');
  assert.equal(result.metrics.impulseApplied, true);
  assert.equal(result.metrics.leaderDisabled, true);
  assert.ok('physicsPreserved' in result.metrics);
  assert.ok('timeDisruptedS' in result.metrics);
  assert.ok('collisions' in result.metrics);
});

test('M11 swarm river is deterministic and keeps wall-time out of the metrics', LONG, async () => {
  const result = await runTwice(() => runM11({ seed: SEED }));
  assert.equal(result.metrics.scenarioId, 'M11');
  assert.equal(result.metrics.cohort12.count, 12);
  assert.equal(result.metrics.cohort24.count, 24);
  assert.ok('flowAlignment' in result.metrics.cohort12);
  assert.ok('nnMean' in result.metrics.cohort12);
  assert.ok('disruptionResponseS' in result.metrics.cohort12);
  assert.ok('collisions' in result.metrics.cohort12);
  const blob = JSON.stringify(result.metrics);
  assert.equal(blob.includes('stepWallMs'), false);
  assert.equal(blob.includes('perMemberMs'), false);
  assert.ok(result.cost && result.cost.cohort12 && Number.isFinite(result.cost.cohort12.stepWallMs));
  assert.ok(Number.isFinite(result.cost.cohort12.perMemberMs));
});
