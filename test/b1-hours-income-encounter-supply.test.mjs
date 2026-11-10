// B1 (§22.4, design/program/NOW.md:58) — hours 1 through 10 still pay: income is a curve and
// encounters still spawn after hour 4. Close law (row done-when): a DERIVED-MODEL fixture, not a
// ten-hour battery — both numbers derive from the models that already exist, on the canonical
// seeds 4242 and 8008, and the fixture prints them.
//
//   * income: simulateTenHourEconomyCurve({ seed }) per-hour faucet rows
//     (src/systems/economy.js), called directly — NOT runEconomyCurveCheck/evaluateEconomyCurve,
//     which hard-pin ECONOMY_CURVE_SEED 15510 (src/systems/economy.js) and would red spuriously
//     on 4242/8008. Same direct-simulator pattern as test/pq-155-01-economy-curve.test.mjs.
//   * supply: the pure planner planEncounters (src/systems/encounterDirector.js) bucketed at
//     ENCOUNTER_SHAPE_HOUR_SECONDS / ENCOUNTER_REPETITION_DAY_SECONDS = 6 sector-days per hour
//     (hour h covers sector-days (h-1)*6 .. h*6-1), the same bucket law as the repetition meter
//     (src/systems/encounterScripts.js) and the same no-ecologyState derived-model convention as
//     scripts/check-content-repetition.mjs.
//
// Provenance split: this fixture re-asserts PLANNER-LEVEL supply — the WHAT that could happen on
// a sector-day. The fire-time WHEN half of the landed hour-5 supply fix stays pinned by
// test/encounter-proximity-relocate.test.mjs; a green row here is not a fire-time proof.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ECONOMY_CURVE_ARCHETYPE_IDS,
  ECONOMY_CURVE_HOURS,
  simulateTenHourEconomyCurve,
} from '../src/systems/economy.js';
import { planEncounters } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  ENCOUNTER_REPETITION_DAY_SECONDS,
  ENCOUNTER_SHAPE_HOUR_SECONDS,
} from '../src/systems/encounterScripts.js';

const B1_SEEDS = [4242, 8008];
const SUPPLY_SECTORS = ['sector_helios_prime', 'sector_nyx_march'];
const SUPPLY_FIRST_HOUR = 5;
const SUPPLY_LAST_HOUR = 9;

test('B1: income in a post-hour-1 window is > 0 on seeds 4242 and 8008', () => {
  for (const seed of B1_SEEDS) {
    const curve = simulateTenHourEconomyCurve({ seed });
    assert.equal(curve.seed, seed, 'curve seed passthrough');
    assert.deepEqual(
      curve.archetypes.map((row) => row.id),
      ECONOMY_CURVE_ARCHETYPE_IDS.slice(),
      'archetype roster',
    );
    for (const arch of curve.archetypes) {
      assert.equal(arch.hours.length, ECONOMY_CURVE_HOURS, `${arch.id} hour rows`);
      let windowIncome = 0;
      let minFaucet = Infinity;
      // Post-hour-1 window: every hour from 2 through 10 still pays.
      for (let hour = 2; hour <= ECONOMY_CURVE_HOURS; hour += 1) {
        const row = arch.hours[hour - 1];
        assert.equal(row.hour, hour, `${arch.id} hour index`);
        assert.ok(row.faucet > 0, `${arch.id} seed ${seed} hour ${hour} faucet ${row.faucet} must be > 0`);
        windowIncome += row.faucet;
        minFaucet = Math.min(minFaucet, row.faucet);
      }
      assert.ok(windowIncome > 0, `${arch.id} seed ${seed} hours 2-10 window income ${windowIncome}`);
      // "Hours 1 through 10 still pay" = the curve beats its own sinks.
      const netDelta = arch.hours[ECONOMY_CURVE_HOURS - 1].netWorth - arch.hours[0].netWorth;
      assert.ok(netDelta > 0, `${arch.id} seed ${seed} net worth h1->h10 ${netDelta} must be > 0`);
      console.log(`B1 income seed ${seed} ${arch.id}: hours 2-10 window ${windowIncome} cr, min hourly faucet ${minFaucet} cr, net h1->h10 ${netDelta >= 0 ? '+' : ''}${netDelta} cr`);
    }
  }
});

test('B1: encounter supply in hours 5-9 is > 0 on seeds 4242 and 8008, both sectors', () => {
  const daysPerHour = ENCOUNTER_SHAPE_HOUR_SECONDS / ENCOUNTER_REPETITION_DAY_SECONDS;
  assert.ok(Number.isInteger(daysPerHour) && daysPerHour > 0, 'sector-days per hour must derive to a positive integer');
  for (const seed of B1_SEEDS) {
    for (const sectorId of SUPPLY_SECTORS) {
      const zones = zonesForSector(sectorId);
      assert.ok(zones.length > 0, `${sectorId} must have authored zones`);
      const countsByHour = new Map();
      for (let hour = SUPPLY_FIRST_HOUR; hour <= SUPPLY_LAST_HOUR; hour += 1) countsByHour.set(hour, 0);
      for (let day = (SUPPLY_FIRST_HOUR - 1) * daysPerHour; day <= SUPPLY_LAST_HOUR * daysPerHour - 1; day += 1) {
        // 1-indexed hour bucket, mirroring the meter bucket law.
        const hour = Math.floor(day / daysPerHour) + 1;
        // Derived-model convention: no ecologyState (scripts/check-content-repetition.mjs).
        const planned = planEncounters(seed, sectorId, day, zones);
        countsByHour.set(hour, countsByHour.get(hour) + planned.length);
      }
      for (let hour = SUPPLY_FIRST_HOUR; hour <= SUPPLY_LAST_HOUR; hour += 1) {
        assert.ok(countsByHour.get(hour) > 0, `${sectorId} seed ${seed} hour ${hour} supply ${countsByHour.get(hour)} must be > 0`);
      }
      const pretty = [...countsByHour.entries()].map(([hour, count]) => `h${hour}=${count}`).join(' ');
      console.log(`B1 supply seed ${seed} ${sectorId}: ${pretty}`);
    }
  }
});
