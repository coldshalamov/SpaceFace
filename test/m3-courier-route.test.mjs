import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  blockNondeterminism,
  restoreNondeterminism,
  runCourierPublicRoute,
  measureCourierPublicRouteHorizons,
  COURIER_HEALTHY_CR_PER_MIN,
  COURIER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR,
  COURIER_PUBLIC_ROUTE_SCHEMA,
  COURIER_PUBLIC_ROUTE_SEED,
  COURIER_FIRST_SHIP_TARGET_CR,
  travelTimeS,
} from '../src/balance/courierPublicRoute.js';
import {
  HAULER_COMPLETION_REWARD,
  HAULER_STEPS,
} from '../src/careers/origins/haulerOriginData.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { SERVICE_PRICES } from '../src/systems/economy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('authored Courier clean gross envelope is the three freight steps plus completion award', () => {
  const stepSum = HAULER_STEPS.reduce((sum, def) => sum + def.baseRewardCr, 0);
  assert.equal(stepSum + HAULER_COMPLETION_REWARD.credits, COURIER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR);
  assert.equal(COURIER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR, 1180);
});

test('travel adapter is grounded in MISSION_TUNING cruise speed and sector graph', () => {
  const leg = travelTimeS('sector_helios_prime', 'sector_ceres_belt');
  assert.ok(leg > 5, 'inter-sector travel must cost real time');
  assert.ok(leg < 600, 'inter-sector travel must stay inside a career loop budget');
  assert.ok((MISSION_TUNING.cruiseSpeedRef || 0) > 0);
  assert.ok((SERVICE_PRICES.repairCrPerHp || 0) > 0);
});

test('30-minute Courier public route advances real time through live authorities', () => {
  blockNondeterminism();
  try {
    const r = runCourierPublicRoute({
      horizonMin: 30,
      seed: COURIER_PUBLIC_ROUTE_SEED,
    });
    assert.equal(r.schema, COURIER_PUBLIC_ROUTE_SCHEMA);
    assert.equal(r.ok, true, (r.assertionFails || []).join('; '));
    assert.equal(r.origin.status, 'completed');
    assert.ok(r.origin.completedStepIds.length >= 3
      || r.loops.filter((l) => l.phase === 'origin' && l.outcome === 'completed').length >= 3,
    'all three origin freight steps must complete');
    assert.equal(r.time.simS, 30 * 60, 'registered sim authority must advance the exact horizon');
    assert.ok(r.time.travelS > 0, 'travel time must advance');
    assert.ok(r.time.actionS > 0, 'dock/market action time must advance');
    assert.ok(r.repairCost > 0, 'repair must charge through economy service');
    assert.ok(r.failedContracts > 0, 'retry/board failure must remain economically present');
    assert.ok(r.missionProceeds > 0, 'missions→economy payouts required');
    assert.ok(r.cargoAuthorityEvents > 0, 'cargo must move through cargo authority');
    assert.ok(r.saleProceeds > 0, 'market/freight sales required');
    assert.ok(r.creditsPerMin >= COURIER_HEALTHY_CR_PER_MIN, `healthy floor ${r.creditsPerMin}`);
    assert.ok(r.saveProof && r.saveProof.ok, r.saveProof && r.saveProof.error);
    assert.ok(r.origin.attemptHaircuts.length >= 1, 'origin retry haircut required');
    const haircut = r.origin.attemptHaircuts[0];
    assert.ok(haircut.rewardAfter < haircut.rewardBefore, 'retries must reduce payout');
    assert.ok(r.authorityReceipts.some((a) => a.kind === 'mission_complete'
      && /missions/i.test(a.authority || '')));
    assert.ok(r.authorityReceipts.some((a) => a.kind === 'market_arbitrage'
      || (a.kind === 'mission_complete' && a.type === 'bulk_trade')),
    'freight market causality required');
    assert.equal(r.creditAccounting.residual, 0, 'all wallet deltas must reconcile to authority receipts');
    assert.ok(r.transitDamageReceipts.some((x) => x.ok && x.hullDamage > 0),
      'transit wear must route through combat damage authority');
    assert.equal(r.purchasePacing.targetCredits, COURIER_FIRST_SHIP_TARGET_CR);
    assert.ok(r.purchasePacing.reached, '30m route should expose first-ship purchase pacing');
    // Clean envelope remains a settlement ceiling; timed net after repair/retry is lower or costed.
    const originPaid = r.loops
      .filter((l) => l.phase === 'origin' && l.outcome === 'completed')
      .reduce((sum, l) => sum + (l.reward || 0), 0);
    assert.ok(originPaid < COURIER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR
      || r.repairCost > 0
      || r.failedContracts > 0,
    'timed route must not pretend clean gross is free of operating cost');
  } finally {
    restoreNondeterminism();
  }
});

test('independent 30/60/90 Courier public-route cells stay above the healthy floor', () => {
  blockNondeterminism();
  try {
    const report = measureCourierPublicRouteHorizons({
      seed: COURIER_PUBLIC_ROUTE_SEED,
      includeRetryDelta: true,
    });
    assert.equal(report.ok, true, JSON.stringify(report.table.map((r) => r.assertionFails)));
    assert.equal(report.table.length, 3);
    for (const row of report.table) {
      assert.equal(row.ok, true, `${row.minutes}m ${JSON.stringify(row.assertionFails)}`);
      assert.ok(row.creditsPerMin >= COURIER_HEALTHY_CR_PER_MIN, `${row.minutes}m rate`);
      assert.equal(row.originStatus, 'completed');
      assert.ok(row.travelS > 0);
      assert.ok(row.completedContracts > 0);
      assert.ok(row.failedContracts > 0);
      assert.ok(row.repairCost > 0);
      assert.equal(row.simS, row.minutes * 60);
    }
    // Horizons are independent runs, not cumulative — longer windows must still progress.
    assert.ok(report.cells[90].completedContracts >= report.cells[30].completedContracts);
    assert.ok(report.cells[90].earnedValue >= report.cells[30].earnedValue
      || report.cells[90].creditsPerMin >= COURIER_HEALTHY_CR_PER_MIN);
    assert.ok(report.retryDelta && report.retryDelta.meaningful,
      'retry economics must reduce earnings or increase failures vs clean pass');
    assert.ok(report.retryDelta.earnedDelta > 0 || report.retryDelta.withRetryFailed > report.retryDelta.cleanFailed);
    assert.equal(report.determinism.ok, true, report.determinism.mismatch);
  } finally {
    restoreNondeterminism();
  }
});

test('Courier harness does not repair registered authorities with direct state shortcuts', () => {
  const source = readFileSync(path.join(ROOT, 'src/balance/courierPublicRoute.js'), 'utf8');
  assert.doesNotMatch(source, /resolveStuckMarketSpreadOrigin|courier_route_leg_repair/);
  assert.doesNotMatch(source, /state\.player\.credits\s*=|state\.player\.cargo\s*=/);
  assert.doesNotMatch(source, /state\.world\.currentSectorId\s*=|state\.simTime\s*=/);
  assert.doesNotMatch(source, /\.hull\s*=\s*Math\.max/);
});
