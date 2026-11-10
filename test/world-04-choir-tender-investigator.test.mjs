import test from 'node:test';
import assert from 'node:assert/strict';

import { ENCOUNTERS } from '../src/data/encounters.js';
import { ENCOUNTER_SCRIPTS } from '../src/systems/encounterScripts.js';
import { uniqueWreckById } from '../src/data/uniqueWrecks.js';
import { complicationEncounterId } from '../src/core/uniqueWreckComplications.js';

// WORLD-04 — the Choir-Tender's `report_or_loot` complication described an SCN
// investigator that no encounter implemented. The catalog must now contain
// `unique_wreck_choir_tender_investigator`, bound to the wreck, offering the
// report/loot choice the complication already names, carried by exactly one hull.

const ID = 'unique_wreck_choir_tender_investigator';

test('WORLD-04: the director catalog contains the investigator bound to the wreck', () => {
  const enc = ENCOUNTERS[ID];
  assert.ok(enc, `${ID} must be in the shipped encounter catalog`);
  assert.equal(enc.gates && enc.gates.uniqueWreckId, 'wreck_choir_tender');
  assert.equal(enc.gates && enc.gates.uniqueWreckOnly, true);
  assert.equal(enc.factionId, 'faction_scn');
});

test('WORLD-04: the encounter offers the complication choice — report or loot', () => {
  const enc = ENCOUNTERS[ID];
  const ids = (enc.choices || []).map((c) => c.id);
  assert.deepEqual(ids.sort(), ['loot', 'report'], 'the audit offers report vs loot');
  assert.equal(enc.timeoutChoice, 'loot', 'ignoring the audit keeps the claim and takes the filing');
});

test('WORLD-04: the investigator is one lawful SCN hull', () => {
  const enc = ENCOUNTERS[ID];
  assert.deepEqual(enc.squad && enc.squad.size, [1, 1]);
  assert.deepEqual(enc.squad && enc.squad.archetypes, ['customs_cutter']);
});

test('WORLD-04: the wreck complication resolves to the encounter id', () => {
  const def = uniqueWreckById('wreck_choir_tender');
  assert.ok(def, 'wreck_choir_tender def must exist');
  const investigator = (def.complications || []).find((c) => c.id === 'choir_tender_investigator');
  assert.ok(investigator, 'the report_or_loot complication must exist');
  assert.equal(investigator.encounterRef, ID);
  assert.equal(complicationEncounterId(def, 'report_or_loot'), ID,
    'the salvaged-claim trigger resolves the investigator encounter');
});

test('WORLD-04: the audit script is registered and answers the choice', () => {
  const enc = ENCOUNTERS[ID];
  const script = ENCOUNTER_SCRIPTS[enc.script];
  assert.ok(script, `script ${enc.script} must be registered`);
  assert.equal(typeof script.start, 'function');
  assert.equal(typeof script.choose, 'function');
  assert.equal(typeof script.tick, 'function');
});
