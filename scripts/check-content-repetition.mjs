#!/usr/bin/env node
// PQ-171.01 — encounter-shape repetition meter.
//
// Walks the live director planner across 10 hours of sim time (60 sector-days) on the default
// Ceres route and counts grammar shapes (situation × place × twist × actor). Fails when any
// shape's average rate exceeds the per-hour budget. No headed capture. No new encounter files.

import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { planEncounters } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  ENCOUNTER_REPETITION_DAY_SECONDS,
  ENCOUNTER_REPETITION_HOURS,
  ENCOUNTER_REPETITION_SECTOR_ID,
  ENCOUNTER_REPETITION_SEED,
  ENCOUNTER_SHAPE_BUDGET_PER_HOUR,
  ENCOUNTER_SHAPE_HOUR_SECONDS,
  createEncounterShapeMeter,
  evaluateEncounterRepetition,
  formatEncounterRepetitionReport,
  recordEncounterShapeSighting,
} from '../src/systems/encounterScripts.js';

export function simulateTenHourEncounterRepetition(options = {}) {
  const seed = Number.isFinite(options.seed) ? options.seed : ENCOUNTER_REPETITION_SEED;
  const hours = Number.isFinite(options.hours) && options.hours > 0
    ? options.hours
    : ENCOUNTER_REPETITION_HOURS;
  const sectorId = options.sectorId || ENCOUNTER_REPETITION_SECTOR_ID;
  const budget = Number.isFinite(options.budget) && options.budget > 0
    ? options.budget
    : ENCOUNTER_SHAPE_BUDGET_PER_HOUR;
  const catalog = options.catalog || ENCOUNTERS;
  const zones = options.zones || zonesForSector(sectorId);
  const state = { simTime: 0, encounterShapeMeter: createEncounterShapeMeter() };
  const days = Math.round((hours * ENCOUNTER_SHAPE_HOUR_SECONDS) / ENCOUNTER_REPETITION_DAY_SECONDS);

  for (let day = 0; day < days; day++) {
    const schedule = planEncounters(seed, sectorId, day, zones);
    for (const item of schedule) {
      const encounter = catalog[item.shapeId];
      if (!encounter) continue;
      const t = day * ENCOUNTER_REPETITION_DAY_SECONDS + (Number(item.delay) || 0);
      state.simTime = t;
      recordEncounterShapeSighting(state, { shape: encounter, plan: item }, t, item.zoneType);
    }
  }

  return evaluateEncounterRepetition(state.encounterShapeMeter, { hours, budget, seed, sectorId });
}

export function runEncounterRepetitionCheck(options = {}) {
  const result = simulateTenHourEncounterRepetition(options);
  return { ok: result.ok, result, errors: result.errors.slice() };
}

function invokedAsCli() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href
    || fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}

if (invokedAsCli()) {
  const check = runEncounterRepetitionCheck();
  console.log(formatEncounterRepetitionReport(check.result));
  if (!check.ok) {
    console.error('');
    console.error('check:content:repetition FAILED');
    for (const error of check.errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log('check:content:repetition OK');
  process.exit(0);
}
