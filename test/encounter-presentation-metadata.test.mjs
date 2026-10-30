import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { ENCOUNTERS, ENCOUNTER_MODULES } from '../src/data/encounters/index.generated.js';
import { NAMED_CAPTAINS } from '../src/data/encounters.js';
import {
  ENCOUNTER_PRESENTATION_METADATA as PRESENTATION,
} from '../src/data/encounters/presentation.generated.js';
import {
  planAuthoredEncounterItem as planAuthoredEncounterItemPure,
  planEncounterShape as planEncounterShapePure,
  planUniqueWreckEncounter as planUniqueWreckEncounterPure,
} from '../src/data/encounters/planning.js';
import {
  planAuthoredEncounterItem,
  planEncounterShape,
} from '../src/systems/encounterDirector.js';
import { planUniqueWreckEncounter } from '../src/systems/uniqueWrecks.js';

const selfRegisteredEncounterIds = new Set(PRESENTATION.selfRegisteredEncounterIds);
const planningOptions = {
  selfRegisteredEncounterIds,
  namedCaptains: PRESENTATION.namedCaptains,
};

test('generated presentation metadata preserves every planner field and runtime id', () => {
  assert.equal(PRESENTATION.schemaVersion, 1);
  assert.equal(Object.keys(PRESENTATION.encounters).length, Object.keys(ENCOUNTERS).length);
  assert.deepEqual(PRESENTATION.namedCaptains, NAMED_CAPTAINS);
  assert.deepEqual(
    [...PRESENTATION.selfRegisteredEncounterIds].sort(),
    ENCOUNTER_MODULES.filter((module) => module && module.runtime)
      .map((module) => module.trigger.id).sort(),
  );

  for (const [id, authored] of Object.entries(ENCOUNTERS)) {
    const actual = PRESENTATION.encounters[id];
    assert.ok(actual, `presentation metadata includes ${id}`);
    for (const field of PRESENTATION.fields) {
      if (Object.hasOwn(authored, field)) {
        assert.deepEqual(actual[field], authored[field], `${id}.${field} matches the canonical data`);
      } else {
        assert.equal(Object.hasOwn(actual, field), false, `${id}.${field} remains absent`);
      }
    }
  }
});

test('data-only planning preserves canonical encounter roster output', () => {
  const zone = {
    id: 'encounter-metadata-test',
    name: 'Test lane',
    type: 'trade_lane',
    center: { x: 230, z: -140 },
    radius: 420,
    threat: 2,
    factionId: 'faction_reach',
  };
  const ids = [
    'pirate_toll',
    'distress_call',
    'named_hunter',
    'depth_h1_distress_from_inside',
  ];
  for (const id of ids) {
    const seed = `metadata-parity:${id}`;
    const canonical = planEncounterShape(
      ENCOUNTERS[id], zone, 'sector_helios_prime', 3, 2, mulberry32(hash32(seed)),
    );
    const presentation = planEncounterShapePure(
      PRESENTATION.encounters[id], zone, 'sector_helios_prime', 3, 2, mulberry32(hash32(seed)),
      planningOptions,
    );
    assert.deepEqual(presentation, canonical, `${id} planned output remains identical`);
  }
});

test('authored and unique-wreck presentation plans match their canonical sim owners', () => {
  const state = {
    meta: { seed: 481516 },
    simTime: 1220,
  };
  const payload = {
    shapeId: 'ambush_snare',
    encounterId: 'metadata-authored-plan',
    sectorId: 'sector_helios_prime',
    anchor: { x: 205, z: -90 },
    zoneId: 'metadata-authored-zone',
    zoneType: 'ambush_lane',
    zoneRadius: 260,
    force: true,
  };
  const canonicalAuthored = planAuthoredEncounterItem({ state, payload, playerPos: { x: 0, z: 0 } });
  const presentationAuthored = planAuthoredEncounterItemPure({
    state,
    payload,
    playerPos: { x: 0, z: 0 },
    encounters: PRESENTATION.encounters,
    ...planningOptions,
  });
  assert.deepEqual(presentationAuthored, canonicalAuthored);

  const uniqueArgs = {
    programSeed: 901,
    def: { id: 'test_wreck', name: 'Test Wreck', programSlot: 'D6', factionId: 'faction_reach' },
    bearing: { exactPos: { x: 340, z: -240 } },
    complication: { encounterId: 'unique-wreck-test', anchor: { x: 350, z: -250 } },
    sectorId: 'sector_helios_prime',
    simTime: 990,
    shape: ENCOUNTERS.unique_wreck_tideline_held_mass,
  };
  const canonicalUnique = planUniqueWreckEncounter(uniqueArgs);
  const presentationUnique = planUniqueWreckEncounterPure({
    ...uniqueArgs,
    shape: PRESENTATION.encounters[uniqueArgs.shape.id],
    ...planningOptions,
  });
  assert.deepEqual(presentationUnique, canonicalUnique);
});

test('renderer presentation imports do not pull the full encounter systems or catalogue', () => {
  const renderer = fs.readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /data\/encounters\/presentation\.generated\.js/);
  assert.match(renderer, /data\/encounters\/planning\.js/);
  assert.doesNotMatch(renderer, /systems\/encounterDirector\.js/);
  assert.doesNotMatch(renderer, /systems\/uniqueWrecks\.js/);
  assert.doesNotMatch(renderer, /data\/encounters\/index\.generated\.js/);
});
