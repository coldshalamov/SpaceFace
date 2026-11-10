// INF-019 — the close-quarters closing marker reads steady.
//
// The raw marker recomputes per sample and straddles its show threshold while contacts
// slide past. A freshly accepted value holds for a further beat: chatter inside the window
// keeps the old text, and a genuinely sustained change lands when the hold expires.
import test from 'node:test';
import assert from 'node:assert/strict';

import { CLOSING_MARKER_HOLD_MS, steadyClosingMarker } from '../src/ui/hud.js';

test('INF-019: the first read lands immediately and starts the hold', () => {
  const out = steadyClosingMarker(undefined, '▸12', 1000);
  assert.equal(out.text, '▸12');
  assert.equal(out.changed, true);
  assert.equal(out.holdUntil, 1000 + CLOSING_MARKER_HOLD_MS);
});

test('INF-019: chatter inside the window keeps the old text', () => {
  let mark = steadyClosingMarker(undefined, '▸12', 1000);
  for (const t of [1050, 1100, 1200, 1300]) {
    mark = steadyClosingMarker(mark, t % 2 ? '▸13' : '', t);
    assert.equal(mark.text, '▸12', `sample at ${t}ms must hold`);
    assert.equal(mark.changed, false);
  }
});

test('INF-019: a sustained change lands the moment the hold expires', () => {
  let mark = steadyClosingMarker(undefined, '▸12', 1000);
  mark = steadyClosingMarker(mark, '', 1000 + CLOSING_MARKER_HOLD_MS - 1);
  assert.equal(mark.text, '▸12', 'the last millisecond still holds');
  mark = steadyClosingMarker(mark, '', 1000 + CLOSING_MARKER_HOLD_MS);
  assert.equal(mark.text, '', 'expiry accepts the sustained change');
  assert.equal(mark.changed, true);
});

test('INF-019: repeating the shown text is a no-op that extends nothing', () => {
  const mark = steadyClosingMarker({ text: '▸12', holdUntil: 2000 }, '▸12', 1500);
  assert.equal(mark.text, '▸12');
  assert.equal(mark.changed, false);
  assert.equal(mark.holdUntil, 2000, 'a steady read must not push the hold out');
});
