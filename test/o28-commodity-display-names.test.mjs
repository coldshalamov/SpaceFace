// O28 — story cargo must be named, not spelled out from its id.
//
// The opening contract (47-A) carries `cmdty_47a_assay_sample`, which lives in PERSISTENT_CARGO,
// not in COMMODITIES. About ten screens each carried their own `id.replace(/_/g, ' ')` fallback
// that knew only COMMODITIES, so the first minute of play read "1 47a assay sample short".
// `commodityDisplayName` (src/ui/commodityNames.js) is now the one answer: COMMODITIES, then the
// story cargo table, then the scripted-cargo table, then a humanised fallback that never shows an
// underscore or the raw id.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMODITIES } from '../src/data/commodities.js';
import { PERSISTENT_CARGO } from '../src/data/narrative.js';
import { commodityDisplayName, MISSION_CARGO_NAMES } from '../src/ui/commodityNames.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { missions, CONTRACT_47A_SAMPLE_ID } from '../src/systems/missions.js';
import { recommendedActions } from '../src/ui/screens/missionLog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(?:js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

/** Every cargo-shaped id literal the mission and story code can mint. */
function referencedCargoIds() {
  const files = [
    ...sourceFiles(join(ROOT, 'src', 'story')),
    ...sourceFiles(join(ROOT, 'src', 'data')),
    join(ROOT, 'src', 'systems', 'missions.js'),
    join(ROOT, 'src', 'systems', 'cargo.js'),
    join(ROOT, 'src', 'systems', 'stationContacts.js'),
  ];
  const found = new Set();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/['"`](cmdty_[a-z0-9_]*[a-z0-9])['"`]/g)) found.add(m[1]);
  }
  return [...found].sort();
}

function allIds() {
  const ids = new Set();
  for (const c of COMMODITIES) ids.add(c.id);
  for (const c of PERSISTENT_CARGO) ids.add(c.id);
  for (const id of Object.keys(MISSION_CARGO_NAMES)) ids.add(id);
  ids.add(CONTRACT_47A_SAMPLE_ID);
  for (const id of referencedCargoIds()) ids.add(id);
  return [...ids].sort();
}

function assertProperName(id, name) {
  assert.equal(typeof name, 'string', `${id}: a string`);
  assert.ok(name.trim().length > 0, `${id}: not empty`);
  assert.ok(!name.includes('_'), `${id}: no underscore, got "${name}"`);
  assert.notEqual(name, id, `${id}: never the raw id`);
  assert.doesNotMatch(name, /^cmdty/i, `${id}: no namespace prefix, got "${name}"`);
  assert.doesNotMatch(name, /undefined|null|NaN/, `${id}: no leaked sentinel, got "${name}"`);
}

test('the enumeration sees the real cargo tables, not an empty set', () => {
  const ids = allIds();
  assert.ok(ids.length >= COMMODITIES.length + PERSISTENT_CARGO.length, 'commodities + story cargo are all in');
  assert.ok(ids.includes('cmdty_47a_assay_sample'), 'the opening contract cargo is in');
  assert.ok(ids.includes('cmdty_ore_iron'), 'a market good is in');
  assert.ok(ids.includes(CONTRACT_47A_SAMPLE_ID), 'the mission module id is in');
});

test('every cargo id the game can mint resolves to a proper name', () => {
  for (const id of allIds()) assertProperName(id, commodityDisplayName(id));
});

test('market goods keep their authored name verbatim', () => {
  for (const c of COMMODITIES) {
    assert.equal(commodityDisplayName(c.id), String(c.name).replace(/_/g, ' '), `${c.id} keeps its catalogue name`);
  }
});

test('story cargo is named from the story table, in sentence-safe case', () => {
  for (const c of PERSISTENT_CARGO) {
    const name = commodityDisplayName(c.id);
    assertProperName(c.id, name);
    assert.equal(name.toLowerCase(), String(c.name).toLowerCase(), `${c.id} reads as its authored name`);
    const letters = name.replace(/[^A-Za-z]/g, '');
    assert.notEqual(letters, letters.toUpperCase(), `${c.id} must not shout in a sentence: "${name}"`);
  }
  assert.equal(commodityDisplayName('cmdty_47a_assay_sample'), '47-A Assay Sample');
  assert.equal(commodityDisplayName('depth_vols_letter'), 'Letter to the Tessera');
});

test('scripted encounter cargo has an authored name, not an id spelled out', () => {
  assert.equal(commodityDisplayName('cmdty_machine_parts'), 'Machine Parts');
  assert.equal(commodityDisplayName('cmdty_contraband_med'), 'Contraband Medicine');
});

test('an unknown id degrades to readable words — never an underscore, never a raw id', () => {
  assert.equal(commodityDisplayName('cmdty_new_thing'), 'New Thing');
  assert.equal(commodityDisplayName('depth_some_item'), 'Some Item');
  assert.equal(commodityDisplayName('camelCaseThing'), 'Camel Case Thing');
  assert.equal(commodityDisplayName('  cmdty_padded_id  '), 'Padded Id');
  for (const odd of ['cmdty_', '___', '', '   ', null, undefined, 42, {}, []]) {
    const name = commodityDisplayName(odd);
    assert.equal(name, 'Cargo', `non-id ${JSON.stringify(odd)} falls back to a plain word`);
  }
  for (const id of ['cmdty_a__b', 'cmdty__x_', 'weird_id_with_many_parts_9', 'cmdty_3i_atlas_dust']) {
    assertProperName(id, commodityDisplayName(id));
  }
});

function openingFixture() {
  const state = createGameState(4242);
  state.world.currentSectorId = 'sector_helios_prime';
  const bus = createBus();
  const owner = Object.create(missions);
  owner.init({ state, bus, helpers: {}, registry: { get: () => null } });
  owner._installContract47aColdStart();
  const mission = (state.missions.active || []).find((m) => m && m.storyTag === 'campaign47a:b0:recovery');
  return { state, mission };
}

test('the first story contract names its cargo as a proper name', () => {
  const { mission } = openingFixture();
  assert.ok(mission, 'the 47-A opening contract is installed');
  const cargoId = mission.params.cmdtyId;
  assert.equal(cargoId, CONTRACT_47A_SAMPLE_ID);
  const name = commodityDisplayName(cargoId);
  assertProperName(cargoId, name);
  assert.match(name, /assay/i, `the first contract's cargo reads as an assay sample, got "${name}"`);
  assert.doesNotMatch(name, /47a_/i);
  assert.doesNotMatch(name, /47a assay/, 'the old lower-case id spelling is gone');
});

test('the mission log says "47-A Assay Sample short", not "47a assay sample short"', () => {
  const { state, mission } = openingFixture();
  // A 47-A carry row that the log does not recognise as the paperwork lane (an older save, or a
  // row rebuilt without its contract id) falls to the generic "N <cargo> short" sentence — the
  // very line the first minute of play used to misname.
  delete mission.params.contractId;
  const actions = recommendedActions(state, state.missions.active, state.ui.trackedMissionId);
  const tracked = actions.find((a) => a && a.missionId === mission.id);
  assert.ok(tracked, 'the tracked contract is a recommended action');
  assert.match(tracked.body, /1 47-A Assay Sample short/, `got: ${tracked.body}`);
  assert.doesNotMatch(tracked.body, /47a assay/i);
  assert.doesNotMatch(tracked.body, /_/);
});

test('screens that name cargo use the one helper, not a private id-to-words fallback', () => {
  const migrated = [
    'src/ui/screens/missionLog.js',
    'src/ui/missionPreflight.js',
    'src/ui/hudMeta.js',
    'src/ui/asteroid/inspector.js',
    'src/ui/galaxyMap.js',
    'src/ui/marketNews.js',
    'src/ui/pirateParleyPrompt.js',
    'src/ui/screens/base.js',
    'src/ui/screens/drill.js',
    'src/ui/station/screens/industry.js',
    'src/ui/targetPanel.js',
    'src/ui/screens/starmap.js',
    'src/ui/station/barContacts.js',
  ];
  for (const rel of migrated) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    assert.match(text, /commodityDisplayName/, `${rel} names cargo through commodityDisplayName`);
    assert.doesNotMatch(
      text,
      /replace\((?:\/\^cmdty_\/[a-z]*|'cmdty_'|"cmdty_")/,
      `${relative(ROOT, join(ROOT, rel))} still strips cmdty_ by hand`,
    );
  }
});
