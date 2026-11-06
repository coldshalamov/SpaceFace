// inf-brood-aggression-flush — the relay hit's rush reads red, the authored way.
//
// The player story: I put a shot into the Brood Queen (or the Tendril's head) and every
// linked member inside the cascade reach turns on me at once — the sim arms the rush,
// tracks my live position for the whole window, and publishes BROOD_CASCADE_AGGRESSION on
// the view. The data contract's own sentence names the picture: "the Queen (or a relay)
// taking a hit turns every linked member on the player at once; the filaments flush red"
// (src/data/swarmBrood.js W-COUPLING). Wave 8 deliberately left that kind unwired until the
// sim published it; the sim now publishes it (relayHit → view.cascade), so the pack's
// bodies flush hot anger red for the window — the angriest moment of the fight is no longer
// motion-only. No cascade, unknown kind: still null, bit-identical colours.
//
// These tests pin the pure decision layer (resolveBroodCascadeFlush in
// src/render/broodPresentation.js); the body loop lerps exactly what it names.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BROOD_FLUSH_AGGRESSION_RGB,
  BROOD_FLUSH_GRIEF_RGB,
  BROOD_FLUSH_PANIC_RGB,
  resolveBroodCascadeFlush,
} from '../src/render/broodPresentation.js';
import {
  BROOD_CASCADE_NONE,
  BROOD_CASCADE_PANIC,
  BROOD_CASCADE_GRIEF,
  BROOD_CASCADE_AGGRESSION,
} from '../src/data/swarmBrood.js';

test('a live aggression cascade flushes the pack red — the authored read', () => {
  const aggr = resolveBroodCascadeFlush(BROOD_CASCADE_AGGRESSION, 21.7, 0.25, false);
  assert.ok(aggr, 'the now-live aggression kind answers');
  assert.deepEqual([aggr.r, aggr.g, aggr.b], [...BROOD_FLUSH_AGGRESSION_RGB],
    'the flush is the authored red, not an invented family voice');
  assert.ok(aggr.weight > 0 && aggr.weight < 1, 'the flush blends — the family never vanishes');
  // The three cascades never share a read.
  assert.notDeepEqual([aggr.r, aggr.g, aggr.b], [...BROOD_FLUSH_PANIC_RGB]);
  assert.notDeepEqual([aggr.r, aggr.g, aggr.b], [...BROOD_FLUSH_GRIEF_RGB]);
});

test('no cascade and unknown kinds stay bit-identical to the unwired path', () => {
  assert.equal(resolveBroodCascadeFlush(BROOD_CASCADE_NONE, 5, 0.1, false), null);
  assert.equal(resolveBroodCascadeFlush(undefined, 5, 0.1, false), null,
    'an old view without the kind stays on the unwired path');
  assert.equal(resolveBroodCascadeFlush(99, 5, 0.1, false), null, 'an unknown kind is quiet');
});

test('the anger beat is hotter and faster than the panic flare', () => {
  const beats = (kind) => {
    let min = 1, max = 0, peaks = 0, prev = 0, prevPrev = 0;
    for (let k = 0; k <= 480; k++) {
      const w = resolveBroodCascadeFlush(kind, k / 240, 0, false).weight; // 2-second window
      min = Math.min(min, w); max = Math.max(max, w);
      if (k >= 2 && prev > prevPrev && prev >= w) peaks += 1; // a local maximum
      prevPrev = prev; prev = w;
    }
    return { min, max, peaks };
  };
  const aggr = beats(BROOD_CASCADE_AGGRESSION);
  const panic = beats(BROOD_CASCADE_PANIC);
  assert.ok(aggr.max - aggr.min > 0.2, `the anger pulses, not a static tint (${aggr.min.toFixed(2)}–${aggr.max.toFixed(2)})`);
  assert.ok(aggr.min > panic.min, 'the rush rides a hotter floor than the panic flare');
  assert.ok(aggr.peaks > panic.peaks,
    `the anger beat is faster (${aggr.peaks} peaks vs ${panic.peaks} in 2s)`);
});

test('the stagger waves the anger through the pack like the flare', () => {
  const a = resolveBroodCascadeFlush(BROOD_CASCADE_AGGRESSION, 12.3, 0.0, false).weight;
  const b = resolveBroodCascadeFlush(BROOD_CASCADE_AGGRESSION, 12.3, 0.5, false).weight;
  assert.ok(Math.abs(a - b) > 0.02, 'two bodies are not pinned to one brightness');
});

test('reduced motion holds a steady anger floor — readable, never silent, never pulsing', () => {
  const still1 = resolveBroodCascadeFlush(BROOD_CASCADE_AGGRESSION, 10, 0.4, true);
  const still2 = resolveBroodCascadeFlush(BROOD_CASCADE_AGGRESSION, 13.5, 0.4, true);
  assert.equal(still1.weight, still2.weight, 'reduced motion steadies the flush');
  assert.ok(still1.weight > 0.2, 'the anger still reads — steady, never silent');
  assert.deepEqual([still1.r, still1.g, still1.b], [...BROOD_FLUSH_AGGRESSION_RGB],
    'reduced motion changes the pulse, never the colour');
});

test('a broken clock degrades to a deterministic red, not a crash', () => {
  const badTime = resolveBroodCascadeFlush(BROOD_CASCADE_AGGRESSION, Number.NaN, 0.3, false);
  assert.ok(badTime && badTime.weight >= 0 && badTime.weight <= 1);
  assert.deepEqual([badTime.r, badTime.g, badTime.b], [...BROOD_FLUSH_AGGRESSION_RGB]);
  const badPhase = resolveBroodCascadeFlush(BROOD_CASCADE_AGGRESSION, 5, Number.NaN, false);
  assert.ok(badPhase && badPhase.weight >= 0 && badPhase.weight <= 1);
});

test('the flush layer is deterministic — same inputs, same red, every call', () => {
  const a = resolveBroodCascadeFlush(BROOD_CASCADE_AGGRESSION, 44.2, 0.7, false);
  const b = resolveBroodCascadeFlush(BROOD_CASCADE_AGGRESSION, 44.2, 0.7, false);
  assert.equal(a.weight, b.weight);
  assert.deepEqual([a.r, a.g, a.b], [b.r, b.g, b.b]);
});
