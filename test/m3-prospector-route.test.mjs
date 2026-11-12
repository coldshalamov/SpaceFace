import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  blockNondeterminism,
  restoreNondeterminism,
  runProspectorPublicRoute,
  measureProspectorPublicRouteHorizons,
  PROSPECTOR_HEALTHY_CR_PER_MIN,
  PROSPECTOR_ORIGIN_CLEAN_GROSS_ENVELOPE_CR,
  PROSPECTOR_PUBLIC_ROUTE_SCHEMA,
  PROSPECTOR_PUBLIC_ROUTE_SEED,
  PROSPECTOR_ROUTE_HORIZONS_S,
  CLAIMED_PELICAN_PURCHASE_MIN,
  PELICAN_CLAIM_TOLERANCE_MIN,
  PELICAN_PRICE_CR,
  travelTimeS,
} from '../src/balance/prospectorPublicRoute.js';
import { CAREER_ORIGIN_CONTRACTS } from '../src/careers/origins/careerOriginContracts.js';
import { PROSPECTOR_REWARD } from '../src/careers/origins/prospectorOriginDefs.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { SERVICE_PRICES } from '../src/systems/economy.js';
import { SHIPS } from '../src/data/ships.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function deterministicReceipt(receipt) {
  return {
    endingCapital: receipt.endingCapital,
    earnedValue: receipt.earnedValue,
    missionProceeds: receipt.missionProceeds,
    saleProceeds: receipt.saleProceeds,
    completedContracts: receipt.completedContracts,
    completedLoops: receipt.completedLoops,
    failedContracts: receipt.failedContracts,
    repairCost: receipt.repairCost,
    tollCost: receipt.tollCost,
    time: receipt.time,
    origin: receipt.origin,
    loops: receipt.loops,
    authorityReceipts: receipt.authorityReceipts,
    saveProof: receipt.saveProof && {
      ok: receipt.saveProof.ok,
      before: receipt.saveProof.before,
      after: receipt.saveProof.after,
      mismatchKeys: receipt.saveProof.mismatchKeys,
      error: receipt.saveProof.error,
    },
    pelicanPurchase: receipt.pelicanPurchase,
    equipment: {
      activePhase: receipt.equipment.activePhase,
      currentShipId: receipt.equipment.currentShipId,
      purchases: receipt.equipment.purchases,
      beamM: receipt.equipment.beamM,
    },
    inventoryCreated: receipt.inventoryCreated,
    inventoryRemoved: receipt.inventoryRemoved,
    fieldDepletionEvents: receipt.fieldDepletionEvents,
    cargoAuthorityEvents: receipt.cargoAuthorityEvents,
  };
}

test('authored Prospector clean gross envelope is three contracts plus completion award', () => {
  const sum = CAREER_ORIGIN_CONTRACTS.prospector.reduce((s, d) => s + d.rewardCr, 0);
  assert.equal(sum + PROSPECTOR_REWARD.credits, PROSPECTOR_ORIGIN_CLEAN_GROSS_ENVELOPE_CR);
  assert.equal(PROSPECTOR_ORIGIN_CLEAN_GROSS_ENVELOPE_CR, 1150);
});

test('Pelican is the 15,000-credit first physical Prospector upgrade', () => {
  const pelican = SHIPS.find((ship) => ship.id === 'ship_pelican');
  assert.ok(pelican);
  assert.equal(pelican.price, PELICAN_PRICE_CR);
  assert.equal(PELICAN_PRICE_CR, 15_000);
});

test('travel adapter is grounded in MISSION_TUNING cruise speed and sector graph', () => {
  const leg = travelTimeS('sector_helios_prime', 'sector_ceres_belt');
  assert.ok(leg > 5, 'inter-sector travel must cost real time');
  assert.ok(leg < 600, 'inter-sector travel must stay inside a career loop budget');
  assert.ok((MISSION_TUNING.cruiseSpeedRef || 0) > 0);
  assert.ok((SERVICE_PRICES.repairCrPerHp || 0) > 0);
});

test('exact horizons are 1800/3600/5400 seconds', () => {
  assert.deepEqual([...PROSPECTOR_ROUTE_HORIZONS_S], [1800, 3600, 5400]);
});

test('30-minute Prospector public route advances real time through live authorities', () => {
  blockNondeterminism();
  try {
    const r = runProspectorPublicRoute({
      horizonMin: 30,
      seed: PROSPECTOR_PUBLIC_ROUTE_SEED,
    });
    assert.equal(r.schema, PROSPECTOR_PUBLIC_ROUTE_SCHEMA);
    assert.equal(r.ok, true, (r.assertionFails || []).join('; '));
    assert.equal(r.origin.status, 'completed');
    assert.deepEqual(
      r.origin.completedContractIds,
      CAREER_ORIGIN_CONTRACTS.prospector.map((d) => d.id),
    );
    assert.equal(r.time.simS, 30 * 60, 'registered simulation time must cover the exact horizon');
    assert.ok(r.time.travelS > 0, 'travel time must advance');
    assert.ok(r.time.actionS > 0, 'mine/scan/dock action time must advance');
    assert.ok(r.repairCost > 0, 'repair must charge through economy service');
    assert.ok(r.failedContracts > 0, 'retry/failure must remain economically present');
    assert.ok(r.missionProceeds > 0, 'missions→economy payouts required');
    assert.ok(r.saleProceeds > 0, 'market ore sales required');
    assert.ok(r.cargoAuthorityEvents > 0, 'cargo must move through cargo authority');
    assert.ok(r.fieldDepletionEvents > 0, 'field depletion must be recorded');
    assert.ok(r.creditsPerMin >= PROSPECTOR_HEALTHY_CR_PER_MIN, `healthy floor ${r.creditsPerMin}`);
    assert.ok(r.saveProof && r.saveProof.ok, r.saveProof && r.saveProof.error);
    assert.ok(r.origin.attemptHaircuts.length >= 1, 'origin retry haircut required');
    const haircut = r.origin.attemptHaircuts[0];
    assert.ok(haircut.rewardAfter < haircut.rewardBefore, 'retries must reduce payout');
    assert.ok(r.authorityReceipts.some((a) => a.kind === 'mission_complete'
      && /missions/i.test(a.authority || '')));
    assert.ok(r.authorityReceipts.some((a) => a.kind === 'mining_yield' && a.qty > 0));
    assert.ok(r.authorityReceipts.some((a) => a.kind === 'market_sell' && a.total > 0));
    assert.ok(r.authorityReceipts.some((a) => a.kind === 'repair_service' && a.spent > 0));
    assert.equal(r.equipment.activePhase, 'starter');
    assert.equal(r.equipment.currentShipId, 'ship_kestrel');
    assert.equal(r.equipment.beamM.acquired, false);
    assert.ok(r.inventoryConserved, 'mined inventory must conserve');
  } finally {
    restoreNondeterminism();
  }
});

test('independent 30/60/90 Prospector public-route cells stay healthy and time-exact', () => {
  blockNondeterminism();
  try {
    const report = measureProspectorPublicRouteHorizons({
      seed: PROSPECTOR_PUBLIC_ROUTE_SEED,
      includeRetryDelta: true,
    });
    assert.equal(report.ok, true, JSON.stringify(report.table.map((r) => ({
      m: r.minutes, fails: r.assertionFails,
    }))));
    assert.equal(report.table.length, 3);
    for (const row of report.table) {
      assert.equal(row.ok, true, `${row.minutes}m ${JSON.stringify(row.assertionFails)}`);
      assert.ok(row.creditsPerMin >= PROSPECTOR_HEALTHY_CR_PER_MIN, `${row.minutes}m rate`);
      assert.equal(row.originStatus, 'completed');
      assert.equal(row.simS, row.minutes * 60, `${row.minutes}m exact registered time`);
      assert.ok(row.travelS > 0);
      assert.ok(row.completedContracts > 0);
      assert.ok(row.failedContracts > 0);
      assert.ok(row.repairCost > 0);
      assert.ok(row.saleProceeds > 0);
      assert.ok(row.cargoEvents > 0);
      assert.ok(row.depletionEvents > 0);
      assert.ok(row.retryHaircut && row.retryHaircut.rewardAfter < row.retryHaircut.rewardBefore);
    }
    // 30m stays on Hitch; 90m buys one Pelican in window and reports claimed parity.
    assert.equal(report.cells[30].equipment.activePhase, 'starter');
    assert.equal(report.cells[90].equipment.activePhase, 'pelican');
    assert.ok(report.cells[90].pelicanPurchase);
    assert.equal(report.cells[90].pelicanPurchase.price, PELICAN_PRICE_CR);
    assert.ok(report.cells[90].pelicanPurchase.atMin > 30);
    assert.ok(report.cells[90].pelicanPurchase.atMin <= 85);
    assert.equal(report.cells[90].equipment.beamM.acquired, false);
    assert.ok(
      report.cells[90].equipment.beamM.blockedBy
      || report.cells[90].bottlenecks.some((b) => b.code === 'beam_m_research'),
      'Beam M must remain research-gated',
    );
    // Honest claimed comparison (not a silent floor pass).
    assert.equal(report.claimedPelicanPurchaseMin, CLAIMED_PELICAN_PURCHASE_MIN);
    assert.ok(Number.isFinite(report.cells[90].pelicanPurchase.deltaVsClaimedMin));
    assert.ok(
      Math.abs(report.cells[90].pelicanPurchase.deltaVsClaimedMin) <= PELICAN_CLAIM_TOLERANCE_MIN,
      'measured Pelican timing must close the claimed benchmark rather than merely print a delta',
    );
    assert.ok(report.retryDelta && report.retryDelta.meaningful,
      'retry economics must reduce earnings or increase failures vs clean pass');
    assert.equal(report.retryDelta.cleanOk, true,
      'the clean comparison cell must be independently valid, not a knowingly red baseline');
  } finally {
    restoreNondeterminism();
  }
});

test('Prospector public route is deterministic and contains no wallet/cargo/clock bypasses', () => {
  blockNondeterminism();
  try {
    const first = runProspectorPublicRoute({ horizonMin: 30, seed: PROSPECTOR_PUBLIC_ROUTE_SEED });
    const second = runProspectorPublicRoute({ horizonMin: 30, seed: PROSPECTOR_PUBLIC_ROUTE_SEED });
    assert.deepEqual(deterministicReceipt(second), deterministicReceipt(first));
  } finally {
    restoreNondeterminism();
  }

  const source = readFileSync(path.join(ROOT, 'src/balance/prospectorPublicRoute.js'), 'utf8');
  assert.match(source, /ctx\.sim\.step\(d\)/, 'elapsed time must use the simulation registry');
  assert.match(source, /ctx\.cargo\.addCargo\(/, 'mining must use the registered cargo authority');
  assert.match(source, /ctx\.bus\.emit\('asteroid:destroyed'/,
    'depletion must enter through the registered asteroid event seam');
  assert.match(source, /ctx\.world\.enterSector\(/, 'travel must use world authority');
  assert.match(source, /ctx\.combat\.onHit\(/, 'route wear must use combat authority');
  assert.match(source, /ctx\.econ\.execute\(/, 'sales must use economy.execute');
  assert.match(source, /ctx\.ships\.buyShip\(/, 'Pelican must use ships.buyShip');
  assert.doesNotMatch(source, /state\.player\.credits\s*=/, 'route must not write the wallet');
  assert.doesNotMatch(source, /ctx\.state\.simTime\s*=/, 'route must not write the simulation clock');
  assert.doesNotMatch(source, /state\.world\.currentSectorId\s*=/,
    'route must not write world position directly');
  assert.doesNotMatch(source, /\be\.hull\s*=/, 'route must not write player hull directly');
  assert.doesNotMatch(source, /state\.player\.cargo\s*=/, 'route must not replace cargo directly');
  assert.doesNotMatch(source, /player\.cargo\.items\[[^\]]+\]\s*=/, 'route must not mutate cargo map directly');
  assert.doesNotMatch(source, /fields\[[^\]]+\]\.depletion\s*=/, 'route must not mutate depletion directly');
  assert.doesNotMatch(source, /recordFieldExtraction\(/,
    'route must not bypass the fieldDepletion event seam');
  assert.doesNotMatch(source, /Force progress|emit one more yield chunk/,
    'route must not synthesize duplicate mission progress after cargo is already awarded');
});

test('check:m3-prospector-route gate passes and prints JSON receipt', () => {
  const stdout = execFileSync(process.execPath, ['scripts/check-m3-prospector-route.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.match(stdout, /\[check-m3-prospector-route\] PASS/);
  const marker = '{\n  "gate": "check-m3-prospector-route"';
  const start = stdout.indexOf(marker);
  assert.notEqual(start, -1, 'gate must print JSON receipt');
  const json = JSON.parse(stdout.slice(start, stdout.indexOf('\n[check-m3-prospector-route] PASS', start)));
  assert.equal(json.ok, true);
  assert.equal(json.table.length, 3);
  for (const row of json.table) {
    assert.equal(row.ok, true);
    assert.ok(row.creditsPerMin >= PROSPECTOR_HEALTHY_CR_PER_MIN);
  }
  assert.ok(json.retryDelta);
  assert.equal(json.claimedPelicanPurchaseMin, CLAIMED_PELICAN_PURCHASE_MIN);
});
