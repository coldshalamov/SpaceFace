import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ENCOUNTERS,
  ENCOUNTER_MODULES,
} from '../src/data/encounters/index.generated.js';

import {
  defineEncounter,
  buildEncounterCatalog,
  validateEncounterShape,
  SITUATION_VOCABULARY,
  PLACE_VOCABULARY,
  TWIST_VOCABULARY,
  ACTOR_VOCABULARY,
} from '../src/data/encounters/catalog.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIR = join(ROOT, 'src/data/encounters');
const MODULE_RE = /^\d{3}-[a-z0-9-]+\.js$/;

test('vocabularies are exported and frozen', () => {
  assert.equal(Object.isFrozen(SITUATION_VOCABULARY), true);
  assert.equal(Object.isFrozen(PLACE_VOCABULARY), true);
  assert.equal(Object.isFrozen(TWIST_VOCABULARY), true);
  assert.equal(Object.isFrozen(ACTOR_VOCABULARY), true);

  for (const item of ['toll', 'ambush', 'patrol', 'hunt', 'distress', 'salvage', 'trade', 'convoy', 'claim', 'anomaly', 'wreck']) {
    assert.equal(SITUATION_VOCABULARY.includes(item), true, `SITUATION_VOCABULARY must include ${item}`);
  }
  for (const item of ['civilian_core', 'trade_lane', 'patrol_corridor', 'ambush_lane', 'outlaw_zone', 'derelict_field']) {
    assert.equal(PLACE_VOCABULARY.includes(item), true, `PLACE_VOCABULARY must include ${item}`);
  }
  for (const item of ['none', 'named', 'unique_wreck', 'k1', 'depth', 'follow_on', 'player_echo', 'logic', 'literalized', 'admirers']) {
    assert.equal(TWIST_VOCABULARY.includes(item), true, `TWIST_VOCABULARY must include ${item}`);
  }
  for (const item of ['faction_reach', 'faction_scn', 'faction_quiet', 'faction_mts', 'faction_vael', 'none']) {
    assert.equal(ACTOR_VOCABULARY.includes(item), true, `ACTOR_VOCABULARY must include ${item}`);
  }
});

test('authored file count matches index.generated.js and catalog', () => {
  const authoredFiles = readdirSync(DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MODULE_RE.test(entry.name))
    .map((entry) => entry.name);

  assert.equal(authoredFiles.length, ENCOUNTER_MODULES.length);
  assert.equal(Object.keys(ENCOUNTERS).length, authoredFiles.length);
  assert.equal(authoredFiles.length, 49);
});

test('every catalog entry has a complete legal shape and passes validation', () => {
  for (const [id, encounter] of Object.entries(ENCOUNTERS)) {
    assert.ok(encounter.shape, `Encounter "${id}" must have a shape object.`);
    assert.equal(typeof encounter.shape, 'object');
    assert.equal(Object.isFrozen(encounter.shape), true, `Encounter "${id}" shape must be frozen.`);

    const { situation, place, twist, actor } = encounter.shape;

    assert.equal(typeof situation, 'string', `Encounter "${id}" situation must be a string.`);
    assert.equal(SITUATION_VOCABULARY.includes(situation), true, `Encounter "${id}" has unknown situation "${situation}".`);

    if (typeof place === 'string') {
      assert.equal(PLACE_VOCABULARY.includes(place), true, `Encounter "${id}" has unknown place "${place}".`);
    } else {
      assert.equal(Array.isArray(place), true, `Encounter "${id}" place must be string or array.`);
      for (const p of place) {
        assert.equal(PLACE_VOCABULARY.includes(p), true, `Encounter "${id}" has unknown place "${p}".`);
      }
    }

    assert.equal(typeof twist, 'string', `Encounter "${id}" twist must be a string.`);
    assert.equal(TWIST_VOCABULARY.includes(twist), true, `Encounter "${id}" has unknown twist "${twist}".`);

    assert.equal(typeof actor, 'string', `Encounter "${id}" actor must be a string.`);
    assert.equal(ACTOR_VOCABULARY.includes(actor), true, `Encounter "${id}" has unknown actor "${actor}".`);

    // validateEncounterShape returns true
    assert.equal(validateEncounterShape(encounter.shape, id), true);
  }
});

test('grammar is not a repeated stamp (diversity across situations, twists, and actors)', () => {
  const situations = new Set();
  const twists = new Set();
  const actors = new Set();

  for (const encounter of Object.values(ENCOUNTERS)) {
    situations.add(encounter.shape.situation);
    twists.add(encounter.shape.twist);
    actors.add(encounter.shape.actor);
  }

  assert.ok(situations.size >= 2, `Expected at least 2 distinct situations, found ${situations.size}`);
  assert.ok(twists.size >= 2, `Expected at least 2 distinct twists, found ${twists.size}`);
  assert.ok(actors.size >= 2, `Expected at least 2 distinct actors, found ${actors.size}`);

  // Stronger assertions based on authored content
  assert.ok(situations.size >= 10, `Expected rich situation diversity, found ${situations.size}`);
  assert.ok(twists.size >= 5, `Expected rich twist diversity, found ${twists.size}`);
  assert.ok(actors.size >= 5, `Expected rich actor diversity, found ${actors.size}`);
});

test('defineEncounter rejects missing or invalid shape', () => {
  const dummyTrigger = { id: 'dummy_test', zoneTypes: ['trade_lane'] };

  // Missing shape
  assert.throws(() => {
    defineEncounter(dummyTrigger, { title: 'No Shape' });
  }, /must declare a valid shape object/);

  // Invalid situation
  assert.throws(() => {
    defineEncounter(dummyTrigger, {
      shape: {
        situation: 'nonexistent_situation_xyz',
        place: 'trade_lane',
        twist: 'none',
        actor: 'faction_reach',
      },
    });
  }, /invalid shape\.situation/);

  // Invalid place
  assert.throws(() => {
    defineEncounter(dummyTrigger, {
      shape: {
        situation: 'patrol',
        place: 'invalid_place_xyz',
        twist: 'none',
        actor: 'faction_reach',
      },
    });
  }, /invalid shape\.place/);

  // Invalid place in array
  assert.throws(() => {
    defineEncounter(dummyTrigger, {
      shape: {
        situation: 'patrol',
        place: ['trade_lane', 'invalid_place_xyz'],
        twist: 'none',
        actor: 'faction_reach',
      },
    });
  }, /invalid place in shape\.place array/);

  // Invalid twist
  assert.throws(() => {
    defineEncounter(dummyTrigger, {
      shape: {
        situation: 'patrol',
        place: 'trade_lane',
        twist: 'bogus_twist_xyz',
        actor: 'faction_reach',
      },
    });
  }, /invalid shape\.twist/);

  // Invalid actor
  assert.throws(() => {
    defineEncounter(dummyTrigger, {
      shape: {
        situation: 'patrol',
        place: 'trade_lane',
        twist: 'none',
        actor: 'invented_character_xyz',
      },
    });
  }, /invalid shape\.actor/);
});

test('buildEncounterCatalog rejects invalid shape', () => {
  assert.throws(() => {
    buildEncounterCatalog([
      {
        encounterOrder: 1,
        trigger: { id: 'bad_test', zoneTypes: [] },
        default: { id: 'bad_test' }, // missing shape
      },
    ]);
  }, /must declare a valid shape object/);
});
