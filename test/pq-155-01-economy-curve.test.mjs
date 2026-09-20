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
import { STORY_BEATS } from '../src/data/missions.js';
import { RESEARCH_GRANTS } from '../src/data/researchGrants.js';
import {
  ECONOMY_CURVE_ARCHETYPE_IDS,
  ECONOMY_CURVE_EARLY_EVENTS,
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
  // Entry tier is start-capital covered under the derived price scale (2026-09-19
  // ruling); the honest window describes firstEarnedRow, asserted by the ladder gate.
  assert.equal(FIRST_UPGRADE.hour, 0);
  assert.equal(VERB_LADDER_RATES.creditsPerHour, 6000);
  assert.equal(VERB_LADDER_RATES.rpPerHour, 12);
  // The first-contact pool is derived from live data, never written down.
  assert.equal(VERB_LADDER_RATES.earlyRpPool,
    STORY_BEATS[0].reward.rp
    + RESEARCH_GRANTS['anomaly:triangulated'].rp
    + RESEARCH_GRANTS['signal:investigated'].rp);
});

test('PQ-155.01: early events are derived from the live grant table', () => {
  const totalRp = ECONOMY_CURVE_EARLY_EVENTS.reduce((sum, ev) => sum + ev.rp, 0);
  const totalCredits = ECONOMY_CURVE_EARLY_EVENTS.reduce((sum, ev) => sum + ev.credits, 0);
  assert.equal(totalRp, VERB_LADDER_RATES.earlyRpPool);
  assert.equal(totalCredits, VERB_LADDER_RATES.earlyCreditsPool);
  for (const ev of ECONOMY_CURVE_EARLY_EVENTS) {
    assert.ok(ev.atHour > 0 && ev.atHour < 1, `${ev.source} must land inside the first hour`);
    assert.ok(ev.rp > 0 || ev.credits > 0, `${ev.source} pays something`);
  }
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
  assert.match(report, /20 min/);
  assert.match(report, /HUNTER/);
  assert.match(report, /TRADER/);
  assert.match(report, /MINER/);
  assert.match(report, /tech_combat_basics/);
  assert.match(report, /EARLY EVENTS/);
  assert.match(report, /CREDIT BANDS/);
});

test('PQ-155.01: the entry tier lands inside the first-session window', () => {
  const result = simulateTenHourEconomyCurve({ seed: 15510 });
  const hunter = result.archetypes.find((row) => row.id === 'hunter');
  // The hunter's first career goal IS the tree's entry node — start-capital covered
  // under the derived scale, so the arc, not the wallet, gates it. The sim proves
  // the purchase happens inside the first session.
  assert.equal(hunter.firstUnlock.id, 'tech_combat_basics');
  assert.ok(hunter.firstUnlock.atHour * 60 <= FIRST_UPGRADE_MINUTES.max,
    `hunter first unlock at ${hunter.firstUnlock.atHour} h`);
  // Other careers save for bigger first goals (hull licenses); honest bound is
  // the first session.
  for (const arch of result.archetypes) {
    assert.ok(arch.firstUnlock, `${arch.id} should unlock a first career node`);
    assert.ok(arch.firstUnlock.atHour <= 4, `${arch.id} first unlock at ${arch.firstUnlock.atHour} h`);
    assert.ok(arch.hour10Verbs >= 3, `${arch.id} verb cadence by hour 10`);
  }
});
