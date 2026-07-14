import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  blockNondeterminism,
  restoreNondeterminism,
  runHunterPublicRoute,
  measureHunterPublicRouteHorizons,
  HUNTER_HEALTHY_CR_PER_MIN,
  HUNTER_HEALTHY_UPPER_CR_PER_MIN,
  HUNTER_PUBLIC_ROUTE_SCHEMA,
  HUNTER_PUBLIC_ROUTE_SEED,
  travelTimeS,
} from '../src/balance/hunterPublicRoute.js';
import {
  CAREER_ORIGIN_CONTRACTS,
  HUNTER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR,
} from '../src/careers/origins/careerOriginContracts.js';
import { HUNTER_ORIGIN_REWARD } from '../src/careers/origins/hunterOriginData.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { SERVICE_PRICES } from '../src/systems/economy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function deterministicReceipt(receipt) {
  return {
    endingCapital: receipt.endingCapital,
    earnedValue: receipt.earnedValue,
    missionProceeds: receipt.missionProceeds,
    completedContracts: receipt.completedContracts,
    failedContracts: receipt.failedContracts,
    repairCost: receipt.repairCost,
    tollCost: receipt.tollCost,
    time: receipt.time,
    origin: receipt.origin,
    loops: receipt.loops,
    authorityReceipts: receipt.authorityReceipts,
    saveProof: receipt.saveProof,
  };
}

test('authored Hunter clean gross envelope is the three writs plus completion award', () => {
  const writSum = CAREER_ORIGIN_CONTRACTS.hunter.reduce((sum, def) => sum + def.rewardCr, 0);
  assert.equal(writSum + HUNTER_ORIGIN_REWARD.credits, HUNTER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR);
  assert.equal(HUNTER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR, 2100);
});

test('travel adapter is grounded in MISSION_TUNING cruise speed and sector graph', () => {
  const leg = travelTimeS('sector_helios_prime', 'sector_ceres_belt');
  assert.ok(leg > 5, 'inter-sector travel must cost real time');
  assert.ok(leg < 600, 'inter-sector travel must stay inside a career loop budget');
  assert.ok((MISSION_TUNING.cruiseSpeedRef || 0) > 0);
  assert.ok((SERVICE_PRICES.repairCrPerHp || 0) > 0);
});

test('30-minute Hunter public route advances real time through live authorities', () => {
  blockNondeterminism();
  try {
    const r = runHunterPublicRoute({
      horizonMin: 30,
      seed: HUNTER_PUBLIC_ROUTE_SEED,
    });
    assert.equal(r.schema, HUNTER_PUBLIC_ROUTE_SCHEMA);
    assert.equal(r.ok, true, (r.assertionFails || []).join('; '));
    assert.equal(r.origin.status, 'completed');
    assert.deepEqual(r.origin.completedContractIds, CAREER_ORIGIN_CONTRACTS.hunter.map((d) => d.id));
    assert.equal(r.time.simS, 30 * 60, 'registered simulation time must cover the exact horizon');
    assert.ok(r.time.travelS > 0, 'travel time must advance');
    assert.ok(r.time.actionS > 0, 'combat/action time must advance');
    assert.ok(r.repairCost > 0, 'repair must charge through economy service');
    assert.ok(r.failedContracts > 0, 'retry/board failure must remain economically present');
    assert.ok(r.missionProceeds > 0, 'missions→economy payouts required');
    assert.ok(r.creditsPerMin >= HUNTER_HEALTHY_CR_PER_MIN, `healthy floor ${r.creditsPerMin}`);
    assert.ok(r.creditsPerMin <= HUNTER_HEALTHY_UPPER_CR_PER_MIN, `healthy ceiling ${r.creditsPerMin}`);
    assert.ok(r.saveProof && r.saveProof.ok, r.saveProof && r.saveProof.error);
    assert.ok(r.origin.attemptHaircuts.length >= 1, 'origin retry haircut required');
    const haircut = r.origin.attemptHaircuts[0];
    assert.ok(haircut.rewardAfter < haircut.rewardBefore, 'retries must reduce payout');
    assert.ok(r.authorityReceipts.some((a) => a.kind === 'mission_complete'
      && a.reward > 0 && /missions/i.test(a.authority || '')));
    assert.ok(r.authorityReceipts.some((a) => a.kind === 'combat_damage'
      && a.hullDamage > 0 && a.damageEvents > 0), 'damage must route through registered combat');
    assert.ok(r.authorityReceipts.some((a) => a.kind === 'repair_service'
      && a.spent > 0), 'repair must route through docked economy service');
    assert.ok(r.loops.some((l) => l.phase === 'origin' && l.markerId),
      'origin loops must record objective marker navigation');
    // Clean envelope remains a settlement ceiling; timed net after repair/retry is lower.
    const originPaid = r.loops
      .filter((l) => l.phase === 'origin' && l.outcome === 'completed')
      .reduce((sum, l) => sum + (l.reward || 0), 0);
    assert.ok(originPaid < HUNTER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR
      || r.repairCost > 0,
    'timed route must not pretend clean gross is free of operating cost');
  } finally {
    restoreNondeterminism();
  }
});

test('independent 30/60/90 Hunter public-route cells stay inside the healthy band', () => {
  blockNondeterminism();
  try {
    const report = measureHunterPublicRouteHorizons({ seed: HUNTER_PUBLIC_ROUTE_SEED });
    assert.equal(report.ok, true, JSON.stringify(report.table.map((r) => r.assertionFails)));
    assert.equal(report.table.length, 3);
    for (const row of report.table) {
      assert.equal(row.ok, true, `${row.minutes}m ${JSON.stringify(row.assertionFails)}`);
      assert.ok(row.creditsPerMin >= HUNTER_HEALTHY_CR_PER_MIN, `${row.minutes}m rate`);
      assert.ok(row.creditsPerMin <= HUNTER_HEALTHY_UPPER_CR_PER_MIN, `${row.minutes}m rate ceiling`);
      assert.equal(row.originStatus, 'completed');
      assert.equal(row.simS, row.minutes * 60, `${row.minutes}m exact registered time`);
      assert.ok(row.travelS > 0);
      assert.ok(row.completedContracts > 0);
      assert.ok(row.failedContracts > 0);
      assert.ok(row.repairCost > 0);
      assert.ok(row.missionProceeds > 0);
      assert.ok(row.damageReceipts > 0);
      assert.ok(row.repairReceipts > 0);
      assert.ok(row.retryHaircut && row.retryHaircut.rewardAfter < row.retryHaircut.rewardBefore);
    }
    // Horizons are independent runs, not cumulative — longer windows must still progress.
    assert.ok(report.cells[90].completedContracts > report.cells[30].completedContracts);
    assert.ok(report.cells[90].earnedValue > report.cells[30].earnedValue);
    assert.equal(report.cells[60].first15kAtMin, 39.64);
    assert.equal(report.cells[90].first15kAtMin, 39.64);
  } finally {
    restoreNondeterminism();
  }
});

test('Hunter public route is deterministic and contains no wallet, clock, or retry-state bypass', () => {
  blockNondeterminism();
  try {
    const first = runHunterPublicRoute({ horizonMin: 30, seed: HUNTER_PUBLIC_ROUTE_SEED });
    const second = runHunterPublicRoute({ horizonMin: 30, seed: HUNTER_PUBLIC_ROUTE_SEED });
    assert.deepEqual(deterministicReceipt(second), deterministicReceipt(first));
  } finally {
    restoreNondeterminism();
  }

  const source = readFileSync(path.join(ROOT, 'src/balance/hunterPublicRoute.js'), 'utf8');
  assert.match(source, /ctx\.sim\.step\(d\)/, 'elapsed time must use the simulation registry');
  assert.match(source, /ctx\.combat\.onHit\(/, 'combat adapters must use the registered combat authority');
  assert.doesNotMatch(source, /state\.player\.credits\s*=/, 'route must not write the wallet');
  assert.doesNotMatch(source, /ctx\.state\.simTime\s*=/, 'route must not write the simulation clock');
  assert.doesNotMatch(source, /routeAfter\.(?:status|activeMissionId|activeOfferId|attempt)\s*=/,
    'retry proof must not repair career state directly');
});

test('check:m3-hunter-route gate passes and prints JSON receipt', () => {
  const stdout = execFileSync(process.execPath, ['scripts/check-m3-hunter-route.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.match(stdout, /\[check-m3-hunter-route\] PASS/);
  const marker = '{\n  "gate": "check-m3-hunter-route"';
  const start = stdout.indexOf(marker);
  assert.notEqual(start, -1, 'gate must print JSON receipt');
  const json = JSON.parse(stdout.slice(start, stdout.indexOf('\n[check-m3-hunter-route] PASS', start)));
  assert.equal(json.ok, true);
  assert.equal(json.table.length, 3);
  for (const row of json.table) {
    assert.equal(row.ok, true);
    assert.ok(row.creditsPerMin >= HUNTER_HEALTHY_CR_PER_MIN);
    assert.ok(row.creditsPerMin <= HUNTER_HEALTHY_UPPER_CR_PER_MIN);
  }
});
