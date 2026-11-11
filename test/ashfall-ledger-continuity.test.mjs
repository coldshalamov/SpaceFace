import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ashfallElroyLedgerNote } from '../src/story/campaign47a/ashfallLedger.js';
import { reckoningCallbacks } from '../src/story/campaign47a/reckoningCallbacks.js';
import { story as owner } from '../src/systems/story.js';
const clone = value => JSON.parse(JSON.stringify(value));
function approach(state) {
  const events = [];
  owner._onKurtzInteract.call({ state, bus: { emit: (...row) => events.push(row) },
    _fireComms() {}, _maybeOfferEndgame() {},
    _addPersistentCargo() { throw new Error('approach must not take cargo'); },
    _markVergeEvidence() { throw new Error('approach must not grant evidence'); },
  }, { action: 'approach' });
  return events;
}
const stateFor = flags => ({ story: { flags }, player: { callsign: 'Reader', cargo: { items: {} } } });
test('only canonical terminal outcome determines new Elroy wording', () => {
  assert.match(ashfallElroyLedgerNote({ flags: { elroy_outcome: 'custody' } }), /^TAKEN INTO CUSTODY/);
  assert.match(ashfallElroyLedgerNote({ flags: { elroy_outcome: 'force' } }), /^DECEASED/);
  for (const outcome of [undefined, null, '', 'unknown', 'patrol', 'dead', false]) {
    assert.match(ashfallElroyLedgerNote({ flags: { elroy_outcome: outcome } }), /^OUTCOME UNRESOLVED/);
  }
  assert.match(ashfallElroyLedgerNote(), /^OUTCOME UNRESOLVED/);
});
test('branch, legacy marker, flicker and completed chapter cannot invent a terminal outcome', () => {
  const s = { branch: 'patrol', beatIndex: 7, flags: { elroy_outcome_legacy: true, elroyTagResolved: true, beat_2_done: true } };
  assert.match(ashfallElroyLedgerNote(s), /^OUTCOME UNRESOLVED/);
  s.flags.elroy_outcome = 'force';
  assert.match(ashfallElroyLedgerNote(s), /^DECEASED/);
  s.branch = 'traders'; s.flags.elroy_outcome = 'custody';
  assert.match(ashfallElroyLedgerNote(s), /^TAKEN INTO CUSTODY/);
});
test('reader is pure', () => {
  const s = stateFor({ elroy_outcome: 'custody', weighing_receipt: { outcome: 'cleared_unverified' } });
  const before = JSON.stringify(s);
  ashfallElroyLedgerNote(s.story); reckoningCallbacks(s);
  assert.equal(JSON.stringify(s), before);
});
test('ordinary approach emits truthful new rows without cargo or evidence', () => {
  const s = stateFor({ elroy_outcome: 'custody', weighing_receipt: { outcome: 'cleared_unverified' } });
  const flags = clone(s.story.flags), cargo = clone(s.player.cargo);
  const events = approach(s);
  assert.match(s.story.kurtzLedgerRows[2].note, /^TAKEN INTO CUSTODY/);
  assert.equal(events[0][0], 'story:kurtzLedger');
  assert.deepEqual(s.player.cargo, cargo);
  for (const [key, value] of Object.entries(flags)) assert.deepEqual(s.story.flags[key], value);
  assert.equal(s.story.flags.hasLedger, undefined);
});
test('historical ledger survives contrary outcome and JSON Continue without rewrite', () => {
  const s = stateFor({ elroy_outcome: 'custody' });
  const rows = [{ column: 'COUNTERPARTY', name: 'ELROY', note: 'DECEASED (B2) — HISTORICAL RECORD' }];
  s.story.kurtzLedgerRows = rows;
  approach(s); assert.equal(s.story.kurtzLedgerRows, rows);
  const continued = clone(s); approach(continued);
  assert.deepEqual(continued.story.kurtzLedgerRows, rows);
});
test('Foreman sling is not described as a core delivery; callback mechanics are preserved', () => {
  const s = stateFor({});
  s.story.campaign47a = { flags: { spine: { v: 1, solved: { '3': { method: 'sling_in', stepId: 'foreman', verb: 'throw' } } } } };
  const row = reckoningCallbacks(s).find(r => r.id === 'b3_sling_in');
  assert.deepEqual(row, { id: 'b3_sling_in', label: 'Your yard work leaves a movable ballast mass', kind: 'core', mass: 96 });
  s.story.campaign47a.flags.spine.solved['3'].method = 'tow_in';
  const tow = reckoningCallbacks(s).find(r => r.id === 'b3_tow_in');
  assert.equal(tow.mass, 48); assert.equal(tow.label, row.label);
});
test('missing Book3 evidence creates no callback', () => {
  assert.deepEqual(reckoningCallbacks(stateFor({})), []);
});
// Optional earned-run reader: the file is an input, never a modified save or test fixture.
if (process.env.ASHFALL_EARNED_SLOTS) test('earned custody/Hauler checkpoint and Continue preserve sealed uncertainty', () => {
  const pairs = JSON.parse(fs.readFileSync(process.env.ASHFALL_EARNED_SLOTS, 'utf8'));
  const data = JSON.parse(new Map(pairs).get('sf.save.quick')).data;
  const state = { story: clone(data.missions.story), player: clone(data.player), missions: clone(data.missions) };
  assert.equal(state.story.flags.elroy_outcome, 'custody');
  assert.equal(state.story.flags.weighing_receipt.outcome, 'cleared_unverified');
  const original = clone(state);
  const callbacks = reckoningCallbacks(state);
  assert.equal(callbacks.find(r => r.id === 'b6_trader').mass, 150);
  assert.equal(callbacks.find(r => r.id === 'b3_sling_in').label, 'Your yard work leaves a movable ballast mass');
  assert.equal(callbacks.some(r => r.id === 'b2_crew'), false);
  approach(state); const continued = clone(state); approach(continued);
  assert.match(continued.story.kurtzLedgerRows[2].note, /^TAKEN INTO CUSTODY/);
  assert.deepEqual(continued.player, original.player);
  for (const [key, value] of Object.entries(original.story.flags)) assert.deepEqual(continued.story.flags[key], value);
  assert.deepEqual(continued.story.campaign47a, original.story.campaign47a);
});
