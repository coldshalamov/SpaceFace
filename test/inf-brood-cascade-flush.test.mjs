// inf-brood-cascade-flush — the pack's coupling finally reads on the glass.
//
// The player story: the Bloom spine authors the coupling web ("faint green filaments join
// members within this radius; a node's death flares the web") and the cascade kinds' own
// data contract says "published on the view; the renderer flushes the filaments on them" —
// yet the picture kept every body its calm family colour. Lane 2 armed the panic cascade
// (scatter, then the knot) and the grief loop; both ran as motion only, and in a 200-body
// furball a pack scattering in panic and a pack feeding read identically until you have
// watched the motion for seconds. Now the flock's per-instance colours flush on the view
// kind the engine publishes: panic sweeps the pack hot pale acid green (the web flaring as
// one animal breaks), grief sinks it toward a mourning slate. No cascade, no flush — the
// colours stay bit-identical to the unwired path.
//
// These tests pin the pure decision layer (resolveBroodCascadeFlush in
// src/render/broodPresentation.js); the body loop lerps exactly what it names.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
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

test('a live panic cascade flares the web; none leaves the colours untouched', () => {
  const panic = resolveBroodCascadeFlush(BROOD_CASCADE_PANIC, 12.4, 0.3, false);
  assert.ok(panic, 'a live panic answers');
  assert.deepEqual([panic.r, panic.g, panic.b], [...BROOD_FLUSH_PANIC_RGB],
    'the flare is the coupling\'s pale-hot acid green, not a new family voice');
  assert.ok(panic.weight > 0 && panic.weight < 1, 'the flush blends — it never erases the family');
  const none = resolveBroodCascadeFlush(BROOD_CASCADE_NONE, 12.4, 0.3, false);
  assert.equal(none, null, 'no cascade — no flush, bit-identical colours');
  assert.equal(resolveBroodCascadeFlush(undefined, 12.4, 0.3, false), null,
    'an old view without the kind stays on the unwired path');
});

test('grief cools the pack toward its dead, a different read than panic', () => {
  const grief = resolveBroodCascadeFlush(BROOD_CASCADE_GRIEF, 40, 0.8, false);
  assert.ok(grief, 'a live grief window answers');
  assert.deepEqual([grief.r, grief.g, grief.b], [...BROOD_FLUSH_GRIEF_RGB]);
  assert.notDeepEqual([grief.r, grief.g, grief.b], [...BROOD_FLUSH_PANIC_RGB],
    'mourning and panic never share a colour');
  assert.ok(grief.weight > 0 && grief.weight < 1);
});

test('the aggression kind now carries its own red flush (inf-brood-aggression-flush)', () => {
  const aggr = resolveBroodCascadeFlush(BROOD_CASCADE_AGGRESSION, 5, 0.1, false);
  assert.ok(aggr, 'the sim publishes the rush; the pack answers red');
  assert.equal(resolveBroodCascadeFlush(99, 5, 0.1, false), null, 'an unknown kind is quiet');
});

test('the panic pulse is urgent and waves through the pack on the per-body stagger', () => {
  const calm = resolveBroodCascadeFlush(BROOD_CASCADE_PANIC, 10, 0.0, false).weight;
  // The pulse modulates the floor weight over the urgent band.
  let min = 1, max = 0;
  for (let k = 0; k < 64; k++) {
    const w = resolveBroodCascadeFlush(BROOD_CASCADE_PANIC, k / 64, 0, false).weight;
    min = Math.min(min, w); max = Math.max(max, w);
  }
  assert.ok(max - min > 0.2, `the flare pulses hard, not a static tint (band ${min.toFixed(2)}–${max.toFixed(2)})`);
  assert.ok(calm > 0.2 && calm < 0.8);
  // Stagger: two bodies of the pack are not pinned to one brightness — the flare waves.
  const a = resolveBroodCascadeFlush(BROOD_CASCADE_PANIC, 12.3, 0.0, false).weight;
  const b = resolveBroodCascadeFlush(BROOD_CASCADE_PANIC, 12.3, 0.5, false).weight;
  assert.ok(Math.abs(a - b) > 0.02, 'the stagger sweeps the flare through the pack');
});

test('grief breathes slow; reduced motion steadies both flushes without silencing them', () => {
  let griefMin = 1, griefMax = 0;
  for (let k = 0; k < 64; k++) {
    const w = resolveBroodCascadeFlush(BROOD_CASCADE_GRIEF, k, 0.2, false).weight;
    griefMin = Math.min(griefMin, w); griefMax = Math.max(griefMax, w);
  }
  assert.ok(griefMax - griefMin < 0.25, 'mourning breathes, it does not strobe');
  assert.ok(griefMax - griefMin > 0.05, 'the breath is a breath, not a flat tint');

  const panicStill = resolveBroodCascadeFlush(BROOD_CASCADE_PANIC, 10, 0.0, true);
  const panicStill2 = resolveBroodCascadeFlush(BROOD_CASCADE_PANIC, 13, 0.0, true);
  assert.equal(panicStill.weight, panicStill2.weight, 'reduced motion steadies the flare');
  assert.ok(panicStill.weight > 0.2, 'the coupling still reads — steady, never silent');
  const griefStill = resolveBroodCascadeFlush(BROOD_CASCADE_GRIEF, 10, 0.4, true);
  const griefStill2 = resolveBroodCascadeFlush(BROOD_CASCADE_GRIEF, 16, 0.4, true);
  assert.equal(griefStill.weight, griefStill2.weight, 'reduced motion steadies the mourning');
  assert.ok(griefStill.weight > 0.2, 'the mourning still reads — steady, never silent');
  assert.deepEqual([panicStill.r, panicStill.g, panicStill.b], [...BROOD_FLUSH_PANIC_RGB],
    'reduced motion changes the pulse, never the colour');
});

test('a broken clock degrades to a deterministic read, not a crash', () => {
  const badTime = resolveBroodCascadeFlush(BROOD_CASCADE_PANIC, Number.NaN, 0.3, false);
  assert.ok(badTime && badTime.weight >= 0 && badTime.weight <= 1);
  const badPhase = resolveBroodCascadeFlush(BROOD_CASCADE_GRIEF, 5, Number.NaN, false);
  assert.ok(badPhase && badPhase.weight >= 0 && badPhase.weight <= 1);
});
