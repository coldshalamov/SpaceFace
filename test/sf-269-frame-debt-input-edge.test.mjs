// SF-269 — frame debt must not change input-edge meaning on the presentation side.
// A catch-up frame still publishes exactly once, and the render-side edge tally is a
// read-only latch over state.input.actions: a held control edges once, a still-down
// control never re-edges no matter how much sim debt the frame carried, and the tally
// never mutates (consumes) the actions bag itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumePresentInputEdge,
  presentPublicationsForFrameDebt,
  PRESENT_INPUT_EDGE_CAP,
} from '../src/render/pipelineAutoFlushPolicy.js';

test('one publication per present regardless of frame debt', () => {
  for (const debt of [undefined, null, 0, 1, 3, 12, 120]) {
    assert.equal(presentPublicationsForFrameDebt(debt), 1,
      `debt=${debt} must still publish exactly once`);
  }
});

test('a held control edges once and never re-edges under catch-up presents', () => {
  const latch = Object.create(null);
  const actions = { fire: true, boost: true };
  const before = JSON.stringify(actions);

  // Press lands in present 1.
  assert.equal(consumePresentInputEdge(latch, 'fire', actions.fire, 1), true);
  // The same hold observed over presents 2..8 (a debt-stretched frame counts each present) —
  // never a second edge for the same uninterrupted hold.
  for (let present = 2; present <= 8; present++) {
    assert.equal(consumePresentInputEdge(latch, 'fire', actions.fire, present), false,
      `held across present ${present} must not re-edge`);
  }
  // The tally never writes the actions bag — input semantics belong to sim ownership.
  assert.equal(JSON.stringify(actions), before, 'the edge tally is read-only');
});

test('release then press edges again exactly once; a press inside one present cannot multiply', () => {
  const latch = Object.create(null);
  assert.equal(consumePresentInputEdge(latch, 'fire', true, 1), true);
  assert.equal(consumePresentInputEdge(latch, 'fire', false, 2), false);
  assert.equal(consumePresentInputEdge(latch, 'fire', true, 3), true, 'a fresh press edges');
  // Press-release-press observed within the SAME present still counts one edge —
  // the renderer tallies presents, it never invents sim events.
  assert.equal(consumePresentInputEdge(latch, 'fire', false, 3), false);
  assert.equal(consumePresentInputEdge(latch, 'fire', true, 3), false,
    'a second rising edge inside one present is suppressed, not doubled');
});

test('the edge walk stays bounded — the cap is fixed, not frame-debt-scaled', () => {
  assert.equal(PRESENT_INPUT_EDGE_CAP, 32);
  assert.equal(typeof PRESENT_INPUT_EDGE_CAP, 'number');
});
