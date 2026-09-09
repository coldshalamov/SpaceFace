// PQ-155.01 — ten-hour economy curve: three archetypes, committed ladder, honest first upgrade.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FIRST_UPGRADE,
  FIRST_UPGRADE_MINUTES,
  TARGET_FIRST_UPGRADE_MINUTES,
  TECH_VERB_LADDER,
  VERB_LADDER_RATES,
  assertCommittedLadder,
} from '../src/data/techVerbLadder.js';
import {
  ECONOMY_CURVE_ARCHETYPE_IDS,
  ECONOMY_CURVE_HOURS,
  ECONOMY_CURVE_SEED,
  evaluateEconomyCurve,
  formatEconomyCurveReport,
  runEconomyCurveCheck,
  simulateTenHourEconomyCurve,
} from '../src/systems/economy.js';

test('PQ-155.01: committed ladder stays hour → verb → cost → gate', () => {
  const gate = assertCommittedLadder(TECH_VERB_LADDER);
  assert.equal(gate.ok, true, gate.errors.join('; '));
  assert.equal(TECH_VERB_LADDER.length, 32);
  assert.equal(FIRST_UPGRADE.nodeId, 'tech_combat_basics');
  assert.equal(FIRST_UPGRADE.bottleneck, 'rp');
  assert.equal(FIRST_UPGRADE.meetsTarget, false);
  assert.ok(FIRST_UPGRADE.hour * 60 >= FIRST_UPGRADE_MINUTES.min);
  assert.ok(FIRST_UPGRADE.hour * 60 <= FIRST_UPGRADE_MINUTES.max);
  assert.ok(FIRST_UPGRADE.hour * 60 > TARGET_FIRST_UPGRADE_MINUTES);
  assert.equal(VERB_LADDER_RATES.creditsPerHour, 3750);
  assert.equal(VERB_LADDER_RATES.rpPerHour, 8);
});

test('PQ-155.01: seed 15510 prints ten hours for hunter, trader, miner', () => {
  const result = simulateTenHourEconomyCurve({ seed: ECONOMY_CURVE_SEED });
  assert.equal(result.seed, 15510);
  assert.deepEqual(result.archetypes.map((row) => row.id), ECONOMY_CURVE_ARCHETYPE_IDS.slice());
  assert.deepEqual(result.archetypes.map((row) => row.name), ['Hunter', 'Trader', 'Miner']);
  for (const arch of result.archetypes) {
    assert.equal(arch.hours.length, ECONOMY_CURVE_HOURS, arch.id);
    for (let hour = 1; hour <= 10; hour += 1) {
      const row = arch.hours[hour - 1];
      assert.equal(row.hour, hour, `${arch.id} hour`);
      assert.equal(typeof row.netWorth, 'number');
      assert.equal(typeof row.verbsUnlocked, 'number');
      assert.equal(typeof row.sinks, 'number');
      assert.ok(row.netWorth >= 0, `${arch.id} h${hour} net worth`);
    }
  }
});

test('PQ-155.01: check:economy:curve is green and deterministic', () => {
  const check = runEconomyCurveCheck({ seed: 15510 });
  assert.equal(check.ok, true, check.errors.join('; '));
  const again = evaluateEconomyCurve(simulateTenHourEconomyCurve({ seed: 15510 }));
  assert.equal(again.ok, true, again.errors.join('; '));
  const report = formatEconomyCurveReport(check.result);
  assert.match(report, /MISSED/);
  assert.match(report, /15 min/);
  assert.match(report, /60–90|60-90|band 60/);
  assert.match(report, /HUNTER/);
  assert.match(report, /TRADER/);
  assert.match(report, /MINER/);
  assert.match(report, /tech_combat_basics/);
});

test('PQ-155.01: first upgrade is still 60–90 min RP, not the 15-minute wish', () => {
  const result = simulateTenHourEconomyCurve({ seed: 15510 });
  assert.equal(result.firstUpgradeWishMissed, true);
  assert.equal(result.firstUpgrade.meetsTarget, false);
  const hunter = result.archetypes.find((row) => row.id === 'hunter');
  assert.ok(hunter.firstUnlock, 'hunter should unlock Combat Basics inside ten hours');
  assert.equal(hunter.firstUnlock.id, 'tech_combat_basics');
  assert.ok(hunter.firstUnlock.atHour >= 1.0);
  assert.ok(hunter.firstUnlock.atHour <= 1.5);
  assert.ok(hunter.firstUnlock.atHour * 60 > TARGET_FIRST_UPGRADE_MINUTES);
});
