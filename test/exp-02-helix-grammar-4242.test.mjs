// EXP-02: Helix contacts use the Concord grammar shape and the Directorate's words.
// Seed 4242. Pressure factions stay the original three.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESSURE_FACTION_IDS,
  contactGrammarFor,
  liveContactProfile,
} from '../src/data/factionContactGrammar.js';

test('seed 4242: contactGrammarFor returns a Helix profile and leaves pressure ids alone', () => {
  const helix = contactGrammarFor('faction_helix');
  const concord = contactGrammarFor('faction_scn');
  assert.ok(helix);
  assert.equal(helix.id, 'faction_helix');
  assert.equal(helix.callsign, 'Helix Directorate');
  assert.equal(helix.sampleLine, 'Lawful interdiction. Under orders. Read the invoice first.');
  assert.equal(helix.firstFire, false);
  assert.equal(helix.lawfulRoe, concord.lawfulRoe);
  assert.deepEqual(Object.keys(helix).sort(), Object.keys(concord).sort());
  assert.deepEqual(Object.keys(helix.aftermath).sort(), Object.keys(concord.aftermath).sort());
  assert.deepEqual([...PRESSURE_FACTION_IDS], ['faction_scn', 'faction_reach', 'faction_quiet']);

  const profile = liveContactProfile('faction_helix', 4242);
  assert.equal(profile.factionId, 'faction_helix');
  assert.equal(profile.doctrine.firstFire, false);
  assert.equal(profile.grammar.demandType, 'read_the_invoice');
  assert.equal(typeof profile.primaryBarkLine, 'string');
});
