import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isJsonSerializable,
  jsonRoundTrip,
} from '../src/systems/motionTelemetry.js';
import {
  deriveEnemyMotionScale,
  ENEMY_MOTION_IDENTITY_SCALE,
} from '../src/data/flightFeelEnvelopes.js';
import {
  MOTION_LAB_SEED,
  formatM1Table,
  formatM2Table,
  formatM3Table,
  formatM4HullTable,
  runM1,
  runM2,
  runM3,
  runM4,
  runM4Hulls,
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
  const hitch = hulls.ship_kestrel;
  const wasp = hulls.ship_wasp;
  const drifter = hulls.ship_drifter;
  const atlas = hulls.ship_atlas;

  // Low-speed 10–90 of a 36 WU/s useful-speed band. The old 2.0 s figure was 80% of a
  // 2.5 s constant-accel window that never reached cruise — not a throttle ramp.
  // Onset is already one tick; this bar is time to useful motion.
  assert.ok(hitch.onsetS <= 0.04 && wasp.onsetS <= 0.04 && drifter.onsetS <= 0.04 && atlas.onsetS <= 0.04);
  assert.ok(hitch.responseTime10to90S <= 0.50, 'Hitch low-speed 10-90 must be well under 2 s');
  assert.ok(wasp.responseTime10to90S <= 0.35, 'Wasp must be the crispest low-speed answer');
  assert.ok(drifter.responseTime10to90S <= 0.75, 'Drifter stays capable');
  assert.ok(atlas.responseTime10to90S <= 1.10, 'Atlas answers, then the mass shows');

  assert.notDeepEqual(hitch, drifter, 'Drifter must not match Hitch on an empty fit');
  assert.ok(wasp.responseTime10to90S < hitch.responseTime10to90S);
  assert.ok(hitch.responseTime10to90S < drifter.responseTime10to90S);
  assert.ok(drifter.responseTime10to90S < atlas.responseTime10to90S);
  assert.ok(wasp.peakYawRate > hitch.peakYawRate);
  assert.ok(hitch.peakYawRate > drifter.peakYawRate);
  assert.ok(drifter.peakYawRate > atlas.peakYawRate);
  assert.ok(wasp.peakForwardSpeed > hitch.peakForwardSpeed);
  assert.ok(hitch.peakForwardSpeed > drifter.peakForwardSpeed);
  assert.ok(drifter.peakForwardSpeed > atlas.peakForwardSpeed);
  assert.ok(hitch.stopTimeS < drifter.stopTimeS);
  assert.ok(drifter.stopTimeS < atlas.stopTimeS);

  const spreadKeys = ['responseTime10to90S', 'peakYawRate', 'peakForwardSpeed', 'stopTimeS'];
  const spreadCount = spreadKeys.filter((key) => relativeSpread(hitch[key], wasp[key], drifter[key], atlas[key]) >= 0.18).length;
  assert.ok(spreadCount >= 3, 'at least three M1 metrics must show a clear four-hull spread');

  const table = formatM1Table(result.metrics);
  console.log('\nM1 four-hull feel\n' + table + '\n');
});

test('M2 player slalom is deterministic and hulls take different lines', LONG, async () => {
  const result = await runTwice(() => runM2({ seed: SEED }));
  assert.equal(result.metrics.scenarioId, 'M2');
  const hulls = result.metrics.hulls;
  const hitch = hulls.ship_kestrel;
  const wasp = hulls.ship_wasp;
  const drifter = hulls.ship_drifter;
  const atlas = hulls.ship_atlas;
  assert.ok(hitch && wasp && drifter && atlas);
  assert.equal(hitch.collisions, 0);
  assert.equal(wasp.collisions, 0);
  assert.equal(atlas.collisions, 0);
  assert.ok(hitch.gatesPassed >= 5, 'Hitch must thread the slalom');
  assert.ok(wasp.gateMisses >= 1, 'Wasp must fly a wider line than the Hitch gates');
  assert.ok(atlas.gateMisses >= 1, 'Atlas must not match a fighter gate line');
  assert.ok(wasp.completionTimeS < hitch.completionTimeS, 'Wasp covers the course sooner');
  assert.ok(atlas.completionTimeS > drifter.completionTimeS, 'Atlas is last through the course');
  assert.ok(wasp.peakOvershoot > hitch.peakOvershoot);
  assert.ok(hitch.peakOvershoot > atlas.peakOvershoot);
  assert.ok(wasp.pathLength > hitch.pathLength);
  assert.ok(hitch.pathLength > drifter.pathLength);
  console.log('\nM2 slalom\n' + formatM2Table(result.metrics) + '\n');
});

test('M3 reversal box distinguishes nose from velocity and keeps Atlas heavy', LONG, async () => {
  const result = await runTwice(() => runM3({ seed: SEED }));
  assert.equal(result.metrics.scenarioId, 'M3');
  const hulls = result.metrics.hulls;
  const hitch = hulls.ship_kestrel;
  const wasp = hulls.ship_wasp;
  const drifter = hulls.ship_drifter;
  const atlas = hulls.ship_atlas;
  assert.ok(hitch && wasp && drifter && atlas);

  for (const hull of [hitch, wasp, drifter, atlas]) {
    assert.equal(typeof hull.nose180TimeS, 'number');
    assert.equal(typeof hull.velocity180TimeS, 'number');
    assert.ok(hull.nose180TimeS >= 0.45, 'nose 180 is a turn, not a snap');
    assert.ok(hull.velocity180TimeS > hull.nose180TimeS + 1.5, 'velocity must lag the nose');
    assert.ok(hull.headingVelocityLagS >= 1.5, 'momentum carries through the 180');
    assert.equal(hull.collisions, 0);
  }

  assert.ok(wasp.nose180TimeS < hitch.nose180TimeS);
  assert.ok(hitch.nose180TimeS < drifter.nose180TimeS);
  assert.ok(drifter.nose180TimeS < atlas.nose180TimeS);
  assert.ok(wasp.velocity180TimeS < hitch.velocity180TimeS);
  assert.ok(hitch.velocity180TimeS < drifter.velocity180TimeS);
  assert.ok(atlas.velocity180TimeS >= 5.0, 'Atlas reversal cost cannot be bought away');
  assert.ok(atlas.velocity180TimeS > hitch.velocity180TimeS);
  assert.ok(atlas.lateralReversalTimeS > hitch.lateralReversalTimeS);
  assert.ok(hitch.lateralReversalTimeS > wasp.lateralReversalTimeS);
  assert.notEqual(hitch.nose180TimeS, drifter.nose180TimeS);

  const spreadKeys = ['nose180TimeS', 'velocity180TimeS', 'lateralReversalTimeS', 'peakForwardSpeed'];
  const spreadCount = spreadKeys.filter((key) => relativeSpread(hitch[key], wasp[key], drifter[key], atlas[key]) >= 0.12).length;
  assert.ok(spreadCount >= 3, 'at least three M3 metrics must show a clear four-hull spread');
  console.log('\nM3 reversal\n' + formatM3Table(result.metrics) + '\n');
});

function relativeSpread(...values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length < 2) return 0;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const mid = (Math.abs(min) + Math.abs(max)) / 2;
  return mid > 1e-9 ? (max - min) / mid : 0;
}

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

test('same AI formation intent on Wasp vs Atlas produces hull-relative envelopes', LONG, async () => {
  const waspScale = deriveEnemyMotionScale('ship_wasp');
  const atlasScale = deriveEnemyMotionScale('ship_atlas');
  const muleScale = deriveEnemyMotionScale('ship_mule');
  assert.equal(waspScale.speed, 1, 'Wasp is the identity reference for enemy caps');
  assert.ok(atlasScale.speed < 0.8, 'Atlas commits at a lower fraction of the same intercept cap');
  assert.ok(atlasScale.slew < waspScale.slew);
  assert.ok(atlasScale.turnBeforeBurn < waspScale.turnBeforeBurn);
  assert.equal(muleScale.speed, ENEMY_MOTION_IDENTITY_SCALE.speed, 'unmapped hulls keep the historical cap');

  const result = await runTwice(() => runM4Hulls({ seed: SEED }));
  assert.equal(result.metrics.scenarioId, 'M4-hulls');
  assert.equal(result.metrics.sharedEnvelope, false);
  const wasp = result.metrics.hulls.ship_wasp;
  const atlas = result.metrics.hulls.ship_atlas;
  assert.ok(wasp && atlas);
  assert.ok(wasp.peakSpeed > 5 && atlas.peakSpeed > 1);
  assert.ok(wasp.peakClosingSpeed > atlas.peakClosingSpeed, 'Wasp closes faster than Atlas on the same slot');
  assert.ok(wasp.peakSpeed > atlas.peakSpeed, 'Wasp peak speed exceeds Atlas on the same intent');
  assert.ok(atlas.meanAbsYawRate < wasp.meanAbsYawRate || atlas.offAxisBurnFraction < wasp.offAxisBurnFraction,
    'Atlas turn commitment is heavier: slower yaw or less off-axis burn');

  const spreadKeys = ['peakSpeed', 'peakClosingSpeed', 'peakOvershoot', 'meanHeadingError', 'offAxisBurnFraction'];
  const spreadCount = spreadKeys.filter((key) => relativeSpread(wasp[key], atlas[key]) >= 0.18).length;
  assert.ok(spreadCount >= 2, 'same intent must separate Wasp and Atlas on at least two envelope metrics');
  console.log('\nM4 hull envelopes\n' + formatM4HullTable(result.metrics) + '\n');
});

test('mutation: shared enemy envelope collapses Wasp vs Atlas differentiation', LONG, async () => {
  const live = await runM4Hulls({ seed: SEED, sharedEnvelope: false });
  const forced = await runM4Hulls({ seed: SEED, sharedEnvelope: true });
  const liveWasp = live.metrics.hulls.ship_wasp;
  const liveAtlas = live.metrics.hulls.ship_atlas;
  const forcedWasp = forced.metrics.hulls.ship_wasp;
  const forcedAtlas = forced.metrics.hulls.ship_atlas;
  const spreadKeys = ['peakSpeed', 'peakClosingSpeed', 'peakOvershoot', 'meanHeadingError', 'offAxisBurnFraction'];
  const liveSpread = spreadKeys.filter((key) => relativeSpread(liveWasp[key], liveAtlas[key]) >= 0.18).length;
  const forcedSpread = spreadKeys.filter((key) => relativeSpread(forcedWasp[key], forcedAtlas[key]) >= 0.18).length;
  assert.ok(liveSpread >= 2, 'live hull envelopes must differentiate before the mutation is meaningful');
  assert.ok(forcedSpread < 2, 'forcing one shared envelope must turn the differentiation assertion red');
  assert.equal(forced.metrics.sharedEnvelope, true);
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
