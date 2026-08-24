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
  forceSquadFrameMutation,
} from '../src/ai/squadFrame.js';
import {
  composeDesiredVelocity,
  forceFodderCohortMutation,
  meanNeighborSeparation,
  normalizeSteeringWeights,
} from '../src/ai/fodderCohort.js';
import {
  MOTION_LAB_SEED,
  formatM1Table,
  formatM2Table,
  formatM3Table,
  formatM4HullTable,
  formatM6Table,
  formatM11Table,
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

  // Recorded M6 baseline was 428 lane conflicts, 0 clean extensions, min separation 2.3, no reform.
  // Ceiling is one order of magnitude under that conflict count; remaining ticks are morph transients
  // while two strikers occupy opposite radials and screen/reserve stay off the collision center.
  assert.ok(result.metrics.cleanExtensions >= 2, 'a pass cycle must produce at least two clean extensions');
  assert.ok(result.metrics.laneConflicts <= 50, 'lane conflicts must drop by an order of magnitude from 428');
  assert.ok(
    Number.isFinite(result.metrics.minFriendlySeparation)
    && result.metrics.minFriendlySeparation > result.metrics.hullClearanceBar,
    'friendly hulls must stay above a real hull-clearance bar',
  );
  assert.ok(result.metrics.reformTimeS != null && result.metrics.reformTimeS <= 6.5, 'reform after a pass is bounded');
  assert.ok(result.metrics.maxSimultaneousAttackers <= 2, 'only two close-attack tokens may be committed at once');
  console.log('\nM6 scissors\n' + formatM6Table(result.metrics) + '\n');
});

test('M8 formation break/recovery is deterministic', LONG, async () => {
  const result = await runTwice(() => runM8({ seed: SEED }));
  assert.equal(result.metrics.scenarioId, 'M8');
  assert.equal(result.metrics.impulseApplied, true);
  assert.equal(result.metrics.leaderDisabled, true);
  assert.ok('physicsPreserved' in result.metrics);
  assert.ok('timeDisruptedS' in result.metrics);
  assert.ok('collisions' in result.metrics);
  assert.equal(result.metrics.morphAborted, true, 'a mid-sequence impulse must abort the morph');
  assert.ok(result.metrics.integrityMin < 0.95, 'integrity drops instead of resetting the wing');
  assert.ok(result.metrics.intactReformTimeS != null && result.metrics.intactReformTimeS <= 5.5);
  assert.ok(
    result.metrics.disruptedRejoinTimeS > result.metrics.intactReformTimeS,
    'the disrupted member rejoins late; intact members do not teleport-reset',
  );
  assert.equal(result.metrics.asymmetricRecovery, true);
});

test('mutation: deleting lane hysteresis explodes M6 lane conflicts', LONG, async () => {
  const live = await runM6({ seed: SEED });
  forceSquadFrameMutation({ laneHysteresis: false });
  try {
    const mutated = await runM6({ seed: SEED });
    assert.ok(live.metrics.laneConflicts <= 50, 'live scissors must already be under the conflict ceiling');
    assert.ok(
      mutated.metrics.laneConflicts > 50,
      'without lane hysteresis attackers side-flip and the conflict ceiling goes red',
    );
  } finally {
    forceSquadFrameMutation(null);
  }
});

test('mutation: four close-attack tokens break the simultaneous-attacker gate', LONG, async () => {
  const live = await runM6({ seed: SEED });
  forceSquadFrameMutation({ closeAttackTokens: 4 });
  try {
    const mutated = await runM6({ seed: SEED });
    assert.ok(live.metrics.maxSimultaneousAttackers <= 2, 'live wing holds two close-attack tokens');
    assert.ok(
      mutated.metrics.maxSimultaneousAttackers > 2,
      'granting four close-attack tokens must turn the simultaneous-attacker gate red',
    );
  } finally {
    forceSquadFrameMutation(null);
  }
});

test('fodder steering weights stay normalized and do not grow with neighbor count', () => {
  const weights = normalizeSteeringWeights({
    flow: 0.46, slot: 0.16, separation: 0.22, alignment: 0.10, hazard: 0.12, pressure: 0.06,
  });
  const sum = Object.values(weights).reduce((n, w) => n + w, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, 'phase weights must sum to 1 after normalization');

  const self = { x: 0, z: 0 };
  const one = meanNeighborSeparation(self, [{ x: 10, z: 0 }], 40);
  const eight = meanNeighborSeparation(self, Array.from({ length: 8 }, () => ({ x: 10, z: 0 })), 40);
  assert.ok(Math.abs(Math.hypot(one.x, one.z) - Math.hypot(eight.x, eight.z)) < 1e-9,
    'mean separation must not grow when the same neighbor is repeated');

  const composed = composeDesiredVelocity({
    flow: { x: 50, z: 0 },
    slot: { x: 10, z: 0 },
    separation: { x: 0, z: 20 },
    alignment: { x: 50, z: 0 },
    hazard: { x: 0, z: 0 },
    pressure: { x: 8, z: 0 },
  }, weights, 58);
  assert.ok(composed.mag <= 58 + 1e-6, 'composed desired velocity is capped by the speed band');
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

  const c12 = result.metrics.cohort12;
  const c24 = result.metrics.cohort24;
  const crescent = result.metrics.crescent12;

  // Flow coherence: baseline seekers were 0.63–0.69. A river's members share one axis;
  // 0.82 means the mean unit-velocity still holds 82% of its length (~35° spread).
  assert.ok(c12.flowCoherence >= 0.82, 'twelve-body river flow coherence must rise well above the 0.63–0.69 seeker baseline');
  assert.ok(c24.flowCoherence >= 0.82, 'twenty-four-body river must keep the same flow floor');
  assert.ok(c12.flowAxisShare >= 0.75, 'river members share a dominant flow axis');
  assert.equal(c12.shape, 'river');

  // Nearest-neighbor: tighten the pack without pileups. Baseline 24-body min was ~8 (hull overlap).
  assert.equal(c12.collisions, 0);
  assert.equal(c24.collisions, 0);
  assert.ok(c12.nnMin >= 20, 'twelve-body river must keep a min-separation floor');
  assert.ok(c24.nnMin >= 20, 'twenty-four-body river must not pile up');
  assert.ok(c12.nnMean <= 55, 'twelve-body mean spacing is a corridor, not a spray');
  assert.ok(c24.nnMean <= 50, 'twenty-four-body mean spacing stays inside the corridor');

  // Throwability: impulse displacement is retained; reacquire is later than the 0.35 s snap-back.
  assert.ok(c12.throwDisplacementWu >= 8, 'shoved bodies leave the river as physical objects');
  assert.ok(c12.impulseRetention >= 0.50, 'the cohort must not steering-cancel the player impulse');
  assert.equal(c12.reacquired, true);
  assert.ok(c12.disruptionResponseS > 0.35, 'reacquire must be later than the seeker baseline');
  assert.ok(c12.disruptionResponseS >= 0.70, 'the thrown interval is visible, not a one-tick blip');
  assert.ok(c12.disruptionResponseS <= 3.5, 'survivors do rejoin after the coast');
  assert.ok(c24.disruptionResponseS > 0.35);
  assert.ok(c24.impulseRetention >= 0.50);

  // Cost: one radius query per member, visits bounded by neighbors-in-radius, not all-pairs.
  // The physics owner parks the spatial hash below 96 colliders, so the motion-lab scene uses the
  // same radius filter on the cohort list; crowded play uses the live hash when it is active.
  assert.ok(c12.queryMode === 'spatial_hash' || c12.queryMode === 'cohort_radius');
  assert.ok(c24.queryMode === 'spatial_hash' || c24.queryMode === 'cohort_radius');
  assert.ok(c12.maxNeighbors < c12.count, 'twelve-body queries stay inside the radius, not an all-pairs scan');
  assert.ok(c24.maxNeighbors < c24.count, 'twenty-four-body queries must not visit the whole cohort');
  assert.ok(c24.maxNeighbors <= c12.maxNeighbors + 6, 'local neighbor count does not grow with roster size');

  // Crescent is the smoke shape: concave front toward the target.
  assert.ok(crescent, 'M11 includes a crescent smoke run');
  assert.equal(crescent.shape, 'crescent');
  assert.ok(crescent.crescentConcavity > 0, 'crescent tips sit ahead of the belly (concave toward the target)');
  assert.equal(crescent.collisions, 0);

  console.log('\nM11 fodder cohort\n' + formatM11Table(result.metrics) + '\n');
});

test('mutation: impulse-cancelling steering turns the throwability gate red', LONG, async () => {
  const live = await runM11({ seed: SEED, crescent: false });
  forceFodderCohortMutation({ cancelImpulses: true });
  try {
    const mutated = await runM11({ seed: SEED, crescent: false });
    assert.ok(live.metrics.cohort12.disruptionResponseS > 0.35, 'live river already has a visible coast');
    assert.ok(
      mutated.metrics.cohort12.disruptionResponseS <= 0.35
      || mutated.metrics.cohort12.impulseRetention < 0.50,
      'cranking steering to cancel impulses must fail throwability',
    );
  } finally {
    forceFodderCohortMutation(null);
  }
});

test('mutation: removing separation turns the pileup gate red', LONG, async () => {
  const live = await runM11({ seed: SEED, crescent: false });
  forceFodderCohortMutation({ disableSeparation: true });
  try {
    const mutated = await runM11({ seed: SEED, crescent: false });
    assert.ok(live.metrics.cohort24.nnMin >= 20, 'live twenty-four-body river already holds min-separation');
    assert.ok(
      mutated.metrics.cohort24.nnMin < 20 || mutated.metrics.cohort24.collisions > 0,
      'without local separation the pileup floor goes red',
    );
  } finally {
    forceFodderCohortMutation(null);
  }
});
