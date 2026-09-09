import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SECTORS } from '../src/data/sectors.js';
import { CONTACT_VOICE_REGISTERS } from '../src/data/barks.js';
import {
  CONTACT_COUNTER_DEFS,
  createInitialStationContactCounters,
  normalizeStationContactCounters,
} from '../src/data/stationContacts.js';
import {
  DEPTH_PROGRAM_CONTACTS,
  depthContactsForStation,
  validateDepthProgramContacts,
} from '../src/story/campaign47a/embodiedDialogue.js';
import { authoredBarContactsForStation } from '../src/ui/station/barContacts.js';

const EXPECTED = Object.freeze([
  ['G1', 'contact_yune', 'Clerk Yune', 'Sealed files open for a fee. Then re-seal.', ['station_nyx_march'], 'yune.trust'],
  ['G2', 'contact_coldburn_rey', '“Coldburn” Rey', 'You took that lane. I remember which one.', ['station_reach'], 'coldburn.grudge'],
  ['G3', 'contact_iren_suhl', 'Dr. Iren Suhl', 'The clauses answer back. I keep the transcripts.', ['station_veil'], 'suhl.clauses'],
  ['G4', 'contact_orrin', 'Warrant Orrin', 'The audit is clean. The audit is always clean.', ['station_coalition'], 'orrin.case'],
  ['G5', 'contact_sker_vane', 'Boss Sker Vane', 'My lane. My toll. My cut of your apology.', ['station_sker'], 'vane.favor'],
  ['G6', 'contact_dustwife_senna', '“Dustwife” Senna', 'The dark remembers. I write it down.', ['station_sedna'], 'senna.names'],
  ['G7', 'contact_latch_child', 'Latch-Child', 'Found. Held. Delivered. Found. Held. Delivered.', ['station_smuggler'], 'latch.child'],
  ['G8', 'contact_question', 'The Question', 'What was carried. What was owed. Answer.', ['station_sedna'], 'question.answers'],
  ['G9', 'contact_filecleaver_dorin', '“Filecleaver” Dorin', 'I stole the seal log. It proves a massacre.', ['station_customs'], 'dorin.trust'],
  ['G10', 'contact_lira_vonn', 'Lira Vonn, “The Margin”', 'I print what happened. You happened. Talk.', ['station_drift'], 'vonn.interviews'],
  ['G11', 'contact_tinker_zell', 'Tinker Zell', 'Stolen parts, fair prices, no warranty. Park it.', ['station_sker'], 'zell.work'],
  ['G12', 'contact_mara_children', 'Mara and the Children', 'Three children, one hold, no destination. Take us.', ['station_drift', 'station_beltout'], 'mara.debt'],
  ['G13', 'contact_wraith_kell', '“Wraith” Kell', 'I file manifests by day, copy them by night. Burn?', ['station_customs'], 'kell.cover'],
  ['G14', 'contact_halev_doss', 'Prof. Halev Doss', 'The sector has a paper trail. I walk it daily.', ['station_helios'], 'doss.sources'],
  ['G15', 'contact_maera_vols', 'Captain Maera Vols', 'I left the engines warm. You fly her further than I did.', ['station_helios'], 'vols.business'],
]);

test('the fifteen canon contact cards are exact, placed, gated, and trackable', () => {
  assert.equal(DEPTH_PROGRAM_CONTACTS.length, 15);
  const stationIds = new Set(SECTORS.flatMap((sector) => sector.stations || []).map((station) => station.id));
  for (const [programId, id, name, blurb, stationHints, trackerId] of EXPECTED) {
    const card = DEPTH_PROGRAM_CONTACTS.find((entry) => entry.id === id);
    assert.ok(card, `${programId}/${id} missing`);
    assert.equal(card.programId, programId);
    assert.equal(card.name, name);
    assert.equal(card.blurb, blurb);
    assert.deepEqual(card.stationHints, stationHints);
    assert.equal(card.trackerId, trackerId);
    assert.equal(typeof card.voiceRegister, 'string');
    assert.equal(typeof card.gate, 'object');
    for (const stationId of card.stationHints) assert.equal(stationIds.has(stationId), true, `${id}: ${stationId}`);
  }
  assert.equal(DEPTH_PROGRAM_CONTACTS.find((card) => card.id === 'contact_maera_vols').poiHint, 'poi_helios_yard');
  assert.deepEqual(validateDepthProgramContacts(), { ok: true, errors: [] });
});

test('every named contact has six in-register lines and a first-contact program', () => {
  for (const [, id] of EXPECTED) {
    const voice = CONTACT_VOICE_REGISTERS[id];
    assert.ok(voice, `${id}: voice register missing`);
    assert.equal(typeof voice.register, 'string');
    assert.equal(voice.lines.length >= 6, true, `${id}: needs at least six lines`);
    if (id !== 'contact_question') {
      assert.equal(new Set(voice.lines).size, voice.lines.length, `${id}: duplicate voice line`);
    } else {
      assert.deepEqual([...new Set(voice.lines)], ['What was carried?', 'What was owed?', 'Answer?']);
    }
    assert.equal(voice.firstContact.choices.length >= 3, true, `${id}: first-contact choices missing`);
    for (const choice of voice.firstContact.choices) {
      assert.equal(typeof choice.id, 'string');
      assert.equal(typeof choice.label, 'string');
      assert.equal(Number.isInteger(choice.lineIndex), true);
      assert.equal(typeof voice.lines[choice.lineIndex], 'string');
    }
  }
  for (const id of ['contact_question', 'contact_maera_vols']) {
    const voice = CONTACT_VOICE_REGISTERS[id];
    assert.equal(voice.dialogueComplete, true, `${id}: load-bearing dialogue must be complete`);
    assert.deepEqual(new Set(voice.firstContact.choices.flatMap((choice) => choice.lineIndexes || [choice.lineIndex])), new Set([0, 1, 2, 3, 4, 5]));
  }
});

test('registered counters normalize deterministically and station selectors honor gates', () => {
  const expectedCounters = EXPECTED.map((entry) => entry[5]).sort();
  assert.deepEqual(Object.keys(CONTACT_COUNTER_DEFS).sort(), expectedCounters);
  const initial = createInitialStationContactCounters();
  assert.deepEqual(Object.keys(initial).sort(), expectedCounters);
  assert.equal(Object.values(initial).every((value) => value === 0), true);
  const normalized = normalizeStationContactCounters({ ...initial, 'orrin.case': 4.9, 'mara.debt': -999, bogus: 20 });
  assert.equal(normalized['orrin.case'], 4);
  assert.equal(normalized['mara.debt'], CONTACT_COUNTER_DEFS['mara.debt'].min);
  assert.equal(Object.hasOwn(normalized, 'bogus'), false);

  const lateFriendly = {
    story: { beatIndex: 7 },
    factions: { faction_quiet: { rep: 30 } },
    player: { flags: { uniqueWrecksVisited: ['a', 'b', 'c'] } },
  };
  assert.deepEqual(depthContactsForStation('station_sker', lateFriendly).map((card) => card.id), ['contact_sker_vane', 'contact_tinker_zell']);
  assert.deepEqual(depthContactsForStation('station_sedna', lateFriendly).map((card) => card.id), ['contact_dustwife_senna', 'contact_question']);
  assert.deepEqual(authoredBarContactsForStation('station_sker', lateFriendly).map((card) => card.id), ['contact_sker_vane', 'contact_tinker_zell']);
  assert.equal(authoredBarContactsForStation('station_sker', lateFriendly).every((card) => card.choices.length === 3 && card.voiceLines.length >= 6), true);
  assert.deepEqual(authoredBarContactsForStation('station_customs', lateFriendly).map((card) => card.id), ['contact_filecleaver_dorin', 'contact_wraith_kell']);
  assert.deepEqual(authoredBarContactsForStation('station_drift', lateFriendly).map((card) => card.id), ['contact_lira_vonn', 'contact_mara_children']);
  assert.deepEqual(authoredBarContactsForStation('station_sedna', lateFriendly).map((card) => card.id), ['contact_dustwife_senna', 'contact_question']);

  for (const card of DEPTH_PROGRAM_CONTACTS) {
    assert.equal(depthContactsForStation(card.stationHints[0], lateFriendly).some((entry) => entry.id === card.id), true, `${card.id}: positive gate fixture`);
    if (card.gate.minBeat > 0) {
      const beforeBeat = structuredClone(lateFriendly);
      beforeBeat.story.beatIndex = card.gate.minBeat - 1;
      assert.equal(depthContactsForStation(card.stationHints[0], beforeBeat).some((entry) => entry.id === card.id), false, `${card.id}: beat gate`);
    }
    if (card.gate.minRep) {
      const unfriendly = structuredClone(lateFriendly);
      unfriendly.factions[card.gate.minRep.factionId].rep = card.gate.minRep.value - 1;
      assert.equal(depthContactsForStation(card.stationHints[0], unfriendly).some((entry) => entry.id === card.id), false, `${card.id}: rep gate`);
    }
    if (card.gate.minUniqueWrecks) {
      const unread = structuredClone(lateFriendly);
      unread.player.flags.uniqueWrecksVisited = ['a', 'b'];
      assert.equal(depthContactsForStation(card.stationHints[0], unread).some((entry) => entry.id === card.id), false, `${card.id}: wreck gate`);
    }
  }
  assert.equal(depthContactsForStation('station_nyx_march', { story: { beatIndex: 5 }, factions: { faction_quiet: { rep: 100 } } }).length, 0);
  assert.equal(depthContactsForStation('station_nyx_march', lateFriendly)[0].id, 'contact_yune');
});

test('named-contact data and owner system stay deterministic and respect single writers', () => {
  const sources = [
    '../src/data/barks.js',
    '../src/data/stationContacts.js',
    '../src/story/campaign47a/embodiedDialogue.js',
    '../src/systems/stationContacts.js',
  ];
  const forbidden = [
    [/Math\.random\s*\(/, 'Math.random'],
    [/Date\.now\s*\(/, 'wall clock'],
    [/player\.credits\s*=(?!=)/, 'direct credits write'],
    [/player\.heat\s*=(?!=)/, 'direct heat write'],
    [/\.rep\s*=(?!=)/, 'direct reputation write'],
    [/player\.cargo\s*=(?!=)/, 'direct cargo write'],
  ];
  for (const source of sources) {
    const text = readFileSync(new URL(source, import.meta.url), 'utf8');
    for (const [pattern, label] of forbidden) assert.equal(pattern.test(text), false, `${source}: ${label}`);
  }
});
