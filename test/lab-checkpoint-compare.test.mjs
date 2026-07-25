// Checkpoint compare + first-divergence localization (Phase 4).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compareCheckpoints,
  firstDifferingField,
  classifyDivergence,
  localizeFirstDivergingTick,
} from '../src/testing/lab/checkpointCompare.js';

test('compareCheckpoints matches identical series', () => {
  const series = [
    { tick: 0, hash: 'aaa' },
    { tick: 10, hash: 'bbb' },
  ];
  const r = compareCheckpoints(series, series);
  assert.equal(r.match, true);
  assert.equal(r.firstDivergence, null);
  assert.equal(r.lastMatchingTick, 10);
  assert.equal(r.exactWithin.crossRuntime, false);
});

test('compareCheckpoints localizes first differing field with raw FP delta', () => {
  const node = [{
    tick: 5,
    hash: 'h1',
    surface: { tick: 5, entities: [{ id: 1, pos: { x: 1.0, z: 2.0 } }], input: { moveZ: 1 } },
  }];
  const chrome = [{
    tick: 5,
    hash: 'h2',
    surface: { tick: 5, entities: [{ id: 1, pos: { x: 1.0000001, z: 2.0 } }], input: { moveZ: 1 } },
  }];
  const r = compareCheckpoints(node, chrome);
  assert.equal(r.match, false);
  assert.ok(r.firstDivergence);
  assert.equal(r.firstDivergence.tick, 5);
  // Tiny FP difference must NOT be rounded away.
  assert.ok(r.firstDivergence.field.includes('pos') || r.firstDivergence.field.includes('x'));
  assert.notEqual(r.firstDivergence.nodeValue, r.firstDivergence.chromiumValue);
  assert.ok(r.firstDivergence.raw);
  assert.equal(r.classification, 'physics');
});

test('firstDifferingField records raw numeric delta', () => {
  const d = firstDifferingField({ a: 1 }, { a: 1 + 1e-12 }, '');
  assert.ok(d);
  assert.equal(d.path, 'a');
  assert.equal(d.left, 1);
  assert.ok(Math.abs(d.delta) > 0);
});

test('classifyDivergence maps input/profile/order', () => {
  assert.equal(classifyDivergence({ field: 'input.moveZ' }), 'input');
  assert.equal(classifyDivergence({ field: 'runtime.profileHash' }), 'profile');
  assert.equal(classifyDivergence({ field: 'tick' }), 'order');
});

test('localizeFirstDivergingTick binary-searches interval', () => {
  const node = new Map();
  const chrome = new Map();
  for (let t = 0; t <= 20; t++) {
    node.set(t, { x: t });
    chrome.set(t, { x: t < 13 ? t : t + 0.001 });
  }
  const loc = localizeFirstDivergingTick(node, chrome, { lo: 0, hi: 20 });
  assert.equal(loc.tick, 13);
  assert.equal(loc.lastMatchingTick, 12);
  assert.equal(loc.field, 'x');
});

test('FIX5: common prefix matches before series-length mismatch', () => {
  // [19,39,59] vs [19,39] must NOT claim divergence at tick 19.
  const node = [
    { tick: 19, hash: 'a' },
    { tick: 39, hash: 'b' },
    { tick: 59, hash: 'c' },
  ];
  const chrome = [
    { tick: 19, hash: 'a' },
    { tick: 39, hash: 'b' },
  ];
  const r = compareCheckpoints(node, chrome);
  assert.equal(r.match, false);
  assert.equal(r.lastMatchingTick, 39, 'prefix ticks 19 and 39 matched');
  assert.equal(r.firstDivergence.kind, 'series-length');
  assert.equal(r.firstDivergence.tick, 59, 'divergence at the missing checkpoint tick');
  assert.equal(r.firstDivergence.missingSide, 'chromium');
  assert.equal(r.seriesLength.node, 3);
  assert.equal(r.seriesLength.chromium, 2);
});

test('FIX5: shorter node series reports missing on node at correct tick', () => {
  const node = [
    { tick: 19, hash: 'a' },
    { tick: 39, hash: 'b' },
  ];
  const chrome = [
    { tick: 19, hash: 'a' },
    { tick: 39, hash: 'b' },
    { tick: 59, hash: 'c' },
  ];
  const r = compareCheckpoints(node, chrome);
  assert.equal(r.match, false);
  assert.equal(r.lastMatchingTick, 39);
  assert.equal(r.firstDivergence.tick, 59);
  assert.equal(r.firstDivergence.missingSide, 'node');
});

test('FIX10: length mismatch + common-prefix divergence → sameCoverage false', () => {
  // Series lengths differ AND a shared-prefix checkpoint also diverges.
  // Early return on prefix must still report sameCoverage:false (not contradictory true).
  const node = [
    { tick: 19, hash: 'a' },
    { tick: 39, hash: 'DIFF' },
    { tick: 59, hash: 'c' },
  ];
  const chrome = [
    { tick: 19, hash: 'a' },
    { tick: 39, hash: 'other' },
  ];
  const r = compareCheckpoints(node, chrome);
  assert.equal(r.match, false);
  assert.equal(r.seriesLength.node, 3);
  assert.equal(r.seriesLength.chromium, 2);
  assert.equal(r.firstDivergence.kind, 'checkpoint');
  assert.equal(r.firstDivergence.tick, 39);
  assert.equal(
    r.exactWithin.sameCoverage,
    false,
    'length mismatch must set sameCoverage false even when prefix also diverges',
  );
  assert.equal(r.exactWithin.crossRuntime, false);
});

test('FIX10: pure length mismatch also has sameCoverage false', () => {
  const node = [
    { tick: 19, hash: 'a' },
    { tick: 39, hash: 'b' },
    { tick: 59, hash: 'c' },
  ];
  const chrome = [
    { tick: 19, hash: 'a' },
    { tick: 39, hash: 'b' },
  ];
  const r = compareCheckpoints(node, chrome);
  assert.equal(r.match, false);
  assert.equal(r.firstDivergence.kind, 'series-length');
  assert.equal(r.exactWithin.sameCoverage, false);
});
