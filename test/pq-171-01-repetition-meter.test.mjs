// PQ-171.01 — encounter repetition meter: grammar keys, budget fail, 10-hour default route.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ENCOUNTERS } from '../src/data/encounters.js';
import {
  ENCOUNTER_REPETITION_HOURS,
  ENCOUNTER_REPETITION_SECTOR_ID,
  ENCOUNTER_REPETITION_SEED,
  ENCOUNTER_SCRIPTS,
  ENCOUNTER_SHAPE_BUDGET_PER_HOUR,
  createEncounterShapeMeter,
  encounterGrammarKey,
  encounterGrammarKeyFromLive,
  evaluateEncounterRepetition,
  formatEncounterRepetitionReport,
  recordEncounterShapeSighting,
} from '../src/systems/encounterScripts.js';
import {
  runEncounterRepetitionCheck,
  simulateTenHourEncounterRepetition,
} from '../scripts/check-content-repetition.mjs';

test('PQ-171.01: grammar key is situation × place × twist × actor', () => {
  assert.equal(
    encounterGrammarKey({
      situation: 'toll',
      place: 'trade_lane',
      twist: 'none',
      actor: 'faction_reach',
    }),
    'toll|trade_lane|none|faction_reach',
  );
  assert.equal(
    encounterGrammarKey({
      situation: 'trade',
      place: ['mining_belt', 'trade_lane', 'civilian_core'],
      twist: 'none',
      actor: 'faction_mts',
    }),
    'trade|civilian_core+mining_belt+trade_lane|none|faction_mts',
  );
  assert.equal(
    encounterGrammarKey({
      situation: 'trade',
      place: ['mining_belt', 'trade_lane'],
      twist: 'none',
      actor: 'faction_mts',
    }, 'mining_belt'),
    'trade|mining_belt|none|faction_mts',
  );
});

test('PQ-171.01: live place is the zone the beat landed in', () => {
  const live = {
    shape: ENCOUNTERS.trader_run,
    plan: { zoneType: 'mining_belt' },
    causality: { topology: 'mining_belt' },
  };
  assert.equal(
    encounterGrammarKeyFromLive(live),
    'trade|mining_belt|none|faction_mts',
  );
});

test('PQ-171.01: meter fails when any shape exceeds the per-hour budget', () => {
  const state = { simTime: 0, encounterShapeMeter: createEncounterShapeMeter() };
  const stamp = {
    situation: 'toll',
    place: 'trade_lane',
    twist: 'none',
    actor: 'faction_reach',
  };
  const hours = ENCOUNTER_REPETITION_HOURS;
  const over = ENCOUNTER_SHAPE_BUDGET_PER_HOUR * hours + 1;
  for (let i = 0; i < over; i++) {
    recordEncounterShapeSighting(state, stamp, i * (hours * 3600 / over));
  }
  const fail = evaluateEncounterRepetition(state.encounterShapeMeter, { hours });
  assert.equal(fail.ok, false);
  assert.equal(fail.violations.length, 1);
  assert.ok(fail.violations[0].perHour > ENCOUNTER_SHAPE_BUDGET_PER_HOUR);
  assert.match(formatEncounterRepetitionReport(fail), /EXCEED/);

  const underState = { simTime: 0, encounterShapeMeter: createEncounterShapeMeter() };
  recordEncounterShapeSighting(underState, stamp, 10);
  recordEncounterShapeSighting(underState, {
    situation: 'patrol',
    place: 'civilian_core',
    twist: 'none',
    actor: 'faction_scn',
  }, 80);
  const pass = evaluateEncounterRepetition(underState.encounterShapeMeter, { hours });
  assert.equal(pass.ok, true, pass.errors.join('; '));
});

test('PQ-171.01: script fire records telemetry on state.simTime', () => {
  const state = { simTime: 128, encounterShapeMeter: createEncounterShapeMeter() };
  const live = {
    shape: ENCOUNTERS.pirate_toll,
    plan: { zoneType: 'trade_lane', ships: [] },
    vars: {},
    data: {},
    ids: [],
    phase: 'telegraph',
  };
  const d = {
    now: () => state.simTime,
    player: () => null,
    cargoValue: () => 0,
    abort: () => 'aborted',
  };
  ENCOUNTER_SCRIPTS.toll.fire(d, live, state);
  assert.equal(state.encounterShapeMeter.sightings.length, 1);
  assert.equal(state.encounterShapeMeter.sightings[0].t, 128);
  assert.equal(state.encounterShapeMeter.sightings[0].key, 'toll|trade_lane|none|faction_reach');
});

test('PQ-171.01: 10-hour default-route stand-in is green and deterministic', () => {
  const a = simulateTenHourEncounterRepetition({ seed: ENCOUNTER_REPETITION_SEED });
  const b = simulateTenHourEncounterRepetition({ seed: ENCOUNTER_REPETITION_SEED });
  assert.equal(a.sectorId, ENCOUNTER_REPETITION_SECTOR_ID);
  assert.equal(a.hours, 10);
  assert.equal(a.budget, ENCOUNTER_SHAPE_BUDGET_PER_HOUR);
  assert.ok(a.sightingCount > 0, '10-hour planner must schedule shapes');
  assert.ok(a.distinctShapes >= 2, 'combination depth, not one stamp');
  assert.equal(a.ok, true, a.errors.join('; '));
  assert.deepEqual(
    a.rows.map((row) => [row.key, row.total]),
    b.rows.map((row) => [row.key, row.total]),
  );
  for (const row of a.rows) {
    assert.ok(row.perHour <= ENCOUNTER_SHAPE_BUDGET_PER_HOUR, `${row.key} ${row.perHour}/h`);
  }
  const check = runEncounterRepetitionCheck({ seed: 17101 });
  assert.equal(check.ok, true, check.errors.join('; '));
  assert.match(formatEncounterRepetitionReport(check.result), /PASS/);
});
