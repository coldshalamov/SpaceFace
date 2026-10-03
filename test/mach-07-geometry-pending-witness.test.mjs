// INFERENCE MACH-07: "The number of geometry roots still pending is one witness number,
// not a per-mesh flag."
//
// Contract: the live geometry admission queue's stats() already counts pending roots;
// publishGeometryPending writes that count to state.render.geometryPending every frame, the
// witness samples it, and the report prints it — an arrival drain reads as one number falling
// to 0 (seed 4242-style: enqueued at arrival, admitted across presents).
import test from 'node:test';
import assert from 'node:assert/strict';

import { publishGeometryPending } from '../src/render/pipelineAutoFlushPolicy.js';
import {
  collectRuntimeWitnessSample,
  createRuntimeWitness,
  formatRuntimeWitnessReport,
} from '../src/core/runtimeWitness.js';

test('the queue stat lands on state.render.geometryPending as a count', () => {
  const render = {};
  assert.equal(publishGeometryPending(render, { queued: 7 }), 7);
  assert.equal(render.geometryPending, 7, 'one number, not a per-mesh flag');
  assert.equal(publishGeometryPending(render, { queued: 0 }), 0);
  assert.equal(render.geometryPending, 0, 'a drained queue publishes zero');
  assert.equal(publishGeometryPending(render, null), 0, 'no queue stats still publishes a number');
  assert.equal(render.geometryPending, 0);
  assert.equal(publishGeometryPending(render, { queued: -3 }), 0, 'the count is floored at zero');
});

test('the witness samples geometryPending from state.render', () => {
  const state = { render: { geometryPending: 11 }, entities: new Map() };
  const sample = collectRuntimeWitnessSample(state);
  assert.equal(sample.geometryPending, 11);
  const empty = collectRuntimeWitnessSample({});
  assert.equal(empty.geometryPending, 0, 'a state without the render field samples zero');
});

test('the report prints the pending count and its window delta — an arrival falls to 0', () => {
  const witness = createRuntimeWitness();
  const state = { render: { geometryPending: 12 }, entities: new Map(), mode: 'flight' };
  witness.observe(state, { wallMs: 0 });          // arrival: 12 roots queued behind the latch
  state.render.geometryPending = 0;               // drain across presents
  witness.observe(state, { wallMs: 1200 });       // past the 1 Hz period
  const report = witness.explain();
  const line = report.split('\n').find((row) => row.includes('geometry roots pending'));
  assert.ok(line, 'the report carries the geometry-pending line');
  assert.match(line, /geometry roots pending 0 \(-12 in window\)/,
    'an arrival drain reads as one number falling to 0');

  // A second window with nothing queued stays a quiet zero.
  const flat = createRuntimeWitness();
  const idle = { render: { geometryPending: 0 }, entities: new Map(), mode: 'flight' };
  flat.observe(idle, { wallMs: 0 });
  flat.observe(idle, { wallMs: 1200 });
  const flatLine = flat.explain().split('\n').find((row) => row.includes('geometry roots pending'));
  assert.match(flatLine, /pending 0 \(\+0 in window\)/, 'a quiet scene prints a quiet zero');
});
