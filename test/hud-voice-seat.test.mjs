// One voice per moment (design/overhaul/08 §1.2, §4): besides the objective line and the aim tag,
// at most one surface speaks; the rest step aside and come back when the seat frees.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVoiceSeat, VOICE_SEAT_ORDER } from '../src/ui/hudAttention.js';

const yields = (present, opts) => [...resolveVoiceSeat(present, opts).yields].sort();

test('the bench fight frame: a tell, a danger line and the dock prompt leave the tell alone', () => {
  const r = resolveVoiceSeat({ tell: true, danger: true, dock: true });
  assert.equal(r.seat, 'tell');
  assert.deepEqual([...r.yields].sort(), ['danger', 'dock']);
});

test('ranks run decision, tell, danger, speaker, banner line, receipts', () => {
  assert.deepEqual(VOICE_SEAT_ORDER, ['deck', 'tell', 'danger', 'speaker', 'floor', 'feed']);
  assert.equal(resolveVoiceSeat({ deck: true, tell: true, feed: true }).seat, 'deck');
  assert.equal(resolveVoiceSeat({ speaker: true, floor: true, feed: true }).seat, 'speaker');
  assert.deepEqual(yields({ speaker: true, floor: true, feed: true }), ['feed', 'floor']);
  assert.equal(resolveVoiceSeat({ feed: true }).seat, 'feed');
  assert.deepEqual(yields({ feed: true }), []);
});

test('the dock prompt and standing pills are verb tags and lamps: they yield only to a decision, a tell or danger', () => {
  assert.deepEqual(yields({ dock: true, pill: true, speaker: true }), []);
  assert.deepEqual(yields({ dock: true, pill: true, feed: true }), []);
  assert.deepEqual(yields({ dock: true, pill: true, floor: true }), []);
  assert.deepEqual(yields({ dock: true, pill: true, danger: true }), ['dock', 'pill']);
  assert.deepEqual(yields({ dock: true, deck: true }), ['dock']);
  assert.equal(resolveVoiceSeat({ dock: true }).seat, null);
});

test('an open centre dialog sends the world tells aside, and the seat passes on', () => {
  const r = resolveVoiceSeat({ tell: true, danger: true }, { dialogOpen: true });
  assert.equal(r.seat, 'danger');
  assert.deepEqual([...r.yields], ['tell']);
});

test('nothing present seats nothing', () => {
  const r = resolveVoiceSeat({});
  assert.equal(r.seat, null);
  assert.equal(r.yields.size, 0);
});
