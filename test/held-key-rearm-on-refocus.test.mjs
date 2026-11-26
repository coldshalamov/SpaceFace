// C1 of the lane audit (2026-11-21): focus loss releases held controls, and the OS
// never re-sends a keydown for a key still physically held — it only keeps
// auto-repeating it. Before the fix, repeats were discarded outright, so a key held
// through a momentary focus loss did nothing until it was lifted and pressed again.
// Ruling (owner, 2026-11-21): a key that is still held works again without re-pressing.
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyFlightKeyEvent } from '../src/systems/input.js';

function freshHost() {
  return { _keys: Object.create(null), state: {} };
}

test('a repeat re-arms a key the game released under focus loss', () => {
  const host = freshHost();
  applyFlightKeyEvent(host, { code: 'KeyW', pressed: true });
  assert.equal(host._keys.KeyW, true, 'the press arms the key');
  // Focus loss: held controls are released while the finger never leaves the key.
  applyFlightKeyEvent(host, { code: 'KeyW', pressed: false });
  assert.equal(host._keys.KeyW, false, 'blur releases the held key');
  // Refocus: the OS only delivers repeats for the still-held key.
  const rearmed = applyFlightKeyEvent(host, { code: 'KeyW', pressed: true, repeat: true });
  assert.equal(rearmed, true, 'the repeat is treated as the press edge it physically is');
  assert.equal(host._keys.KeyW, true, 'the still-held key works again without re-pressing');
  assert.equal(host._kbmActivityPending, true, 'the keyboard stays live for helm arbitration');
});

test('an ordinary repeat for a key already down is still not an edge', () => {
  const host = freshHost();
  applyFlightKeyEvent(host, { code: 'KeyW', pressed: true });
  const edge = applyFlightKeyEvent(host, { code: 'KeyW', pressed: true, repeat: true });
  assert.equal(edge, false, 'repeats of a known-down key must not re-fire press actions');
  assert.equal(host._keys.KeyW, true);
  assert.equal(host._kbmActivityPending, true, 'the hold still marks the keyboard live');
});

test('a repeat for a key swallowed by a modal never re-arms it', () => {
  const host = freshHost();
  applyFlightKeyEvent(host, { code: 'KeyW', pressed: true, blocked: true });
  assert.equal(host._keys.KeyW, false, 'a press under a modal never arms the key');
  const edge = applyFlightKeyEvent(host, { code: 'KeyW', pressed: true, repeat: true });
  assert.equal(edge, false, 'its repeats stay swallowed');
  assert.equal(host._keys.KeyW, false);
});
