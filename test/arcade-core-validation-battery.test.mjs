import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARCADE_CORE_BANDS,
  ARCADE_CORE_ROUTE_IDS,
  arcadeCoreCandidateJson,
  computeMarketScores,
  computePhysicsKit,
  computeStyleClassifier,
  evaluateArcadeCoreBattery,
  evaluateArcadeCoreProjection,
} from '../src/testing/metrics/arcadeCoreMetrics.js';
import { runArcadeCoreAtmosphereRoute } from '../src/testing/metrics/arcadeCoreAtmosphereRoute.js';
import { measureArcadeCorePacingRoute } from '../src/testing/metrics/arcadeCorePacingRoute.js';

test('the Layer-1 battery exposes six measured route families and remains open only on owner calibration', async () => {
  const pacing = await measureArcadeCorePacingRoute({ seeds: [0xac0901] });
  const atmosphere = await runArcadeCoreAtmosphereRoute({ seed: 0xac0913 });
  const battery = evaluateArcadeCoreBattery({}, { pacing, atmosphere });
  const routes = [...new Set(battery.results.map((row) => row.route))];
  assert.deepEqual(routes, ARCADE_CORE_ROUTE_IDS);
  assert.equal(battery.ok, false, 'the unplayed owner calibration must fail closed');
  assert.deepEqual(battery.failures, []);
  assert.deepEqual(battery.calibrationOpen.map((row) => row.metric), [
    'pacing.killsPerMinute',
    'pacing.creditsPerMinute',
    'market.maxFactorDelta',
    'market.maxFactorSecondDelta',
    'market.forecastMedianRelativeError',
  ]);
  for (const route of ARCADE_CORE_ROUTE_IDS) {
    const rows = battery.results.filter((row) => row.route === route);
    assert.ok(rows.length > 0, `${route} has numeric rows`);
    for (const row of rows) {
      assert.equal(row.band, ARCADE_CORE_BANDS[row.metric], `${row.metric} uses the canonical band`);
      assert.ok(Number.isFinite(row.value), `${row.metric} is finite`);
    }
  }
});

test('physics and style routes consume their production owners', () => {
  const physics = computePhysicsKit();
  assert.deepEqual(physics.tumbleCrossings.map((row) => [row.mass, row.tumbles]), [
    [16, true], [60, false], [150, false],
  ]);
  assert.ok(physics.weaponRows.every((row) => row.provenance === 'concussion_slug'));

  const style = computeStyleClassifier();
  assert.equal(style.bucketAccuracy, 1);
  assert.equal(style.coversEveryBucket, true);
  assert.deepEqual(style.ladder, [1.5, 2.25, 3.375, 4]);
});

test('market details remain inspectable numeric receipts', () => {
  const market = computeMarketScores({ transitionCount: 1000 });
  assert.equal(market.transitionCount, 1000);
  assert.equal(market.blendBoundsOk, true);
  assert.ok(market.commodityRows.length > 0);
});

test('bounded candidates can fail a relevant band without mutating production data', () => {
  const weakImpulse = evaluateArcadeCoreProjection({
    weapons: { wpn_concussion_cannon_m: { impulsePerHit: 1 } },
  });
  assert.ok(weakImpulse.failures.some((row) => row.metric === 'physics.tumble.light'));

  const candidate = arcadeCoreCandidateJson({ vacuum: { magnetRange: 1 } });
  assert.equal(candidate.schema, 'spaceface.arcadeCoreCandidate.v1');
  assert.equal(candidate.version, 1);
  assert.equal(candidate.overrides.vacuum.magnetRange, 1);
});
