// words-yard-count-lines — the yard and the market can count to one, in words.
//
// Player problem: fitting a single bomb round at the shipworks read "Partial fill —
// 1 units load before credits run out", a one-unit freight route's screen-reader label
// read "Review 1 units of Platinoid Ore", and the market chart's cursor gave its sample
// age as a stopwatch — "25 s ago". The yard's count lines are whole singular/plural
// sentences with the verb agreeing, the review label counts in the singular, and the
// sample age reads in words.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  rackLoadLine,
  rackPartialFillLine,
  rackShortLine,
} from '../src/ui/station/screens/shipworks.js';
import {
  reviewLoadLabel,
  sampleAgeLabel,
} from '../src/ui/station/screens/market.js';

test('the partial-fill hint names one round in the singular, verb and all', () => {
  assert.equal(rackPartialFillLine(1), 'Partial fill — 1 unit loads before credits run out');
  assert.equal(rackPartialFillLine(4), 'Partial fill — 4 units load before credits run out');
});

test('the full-load hint names one round in the singular', () => {
  assert.equal(rackLoadLine(1), 'Load 1 unit — hangar stock first, then purchased ammunition');
  assert.equal(rackLoadLine(12), 'Load 12 units — hangar stock first, then purchased ammunition');
});

test('the short-rack refusal names one missing round in the singular', () => {
  assert.equal(rackShortLine(1), 'The rack is short 1 unit — restock fee plus ammunition exceed the balance');
  assert.equal(rackShortLine(7), 'The rack is short 7 units — restock fee plus ammunition exceed the balance');
});

test('the yard count lines never print a fraction or a negative', () => {
  assert.equal(rackPartialFillLine(2.9), 'Partial fill — 2 units load before credits run out');
  assert.equal(rackShortLine(NaN), 'The rack is short 0 units — restock fee plus ammunition exceed the balance');
  assert.equal(rackLoadLine(-3), 'Load 0 units — hangar stock first, then purchased ammunition');
});

test('the route review label counts one unit in the singular', () => {
  assert.equal(reviewLoadLabel(1, 'Platinoid Ore'), 'Review 1 unit of Platinoid Ore');
  assert.equal(reviewLoadLabel(36, 'Refined Metals'), 'Review 36 units of Refined Metals');
});

test('the route review label falls back to an honest noun when the name is missing', () => {
  assert.equal(reviewLoadLabel(2, ''), 'Review 2 units of cargo');
  assert.equal(reviewLoadLabel(NaN, null), 'Review 0 units of cargo');
});

test('the chart cursor reads a sample age in words, not a stopwatch', () => {
  assert.equal(sampleAgeLabel(-25, 'h'), '25 seconds ago');
  assert.equal(sampleAgeLabel(-89, 'h'), '89 seconds ago');
  assert.equal(sampleAgeLabel(-90, 'h'), '2 minutes ago');
  assert.equal(sampleAgeLabel(-7200, 'h'), '120 minutes ago');
  assert.ok(!sampleAgeLabel(-25, 'h').includes(' s ago'), 'no stopwatch unit anywhere');
});

test('fresh samples, forecasts and corrupt stamps keep their honest words', () => {
  assert.equal(sampleAgeLabel(-5, 'h'), 'now');
  assert.equal(sampleAgeLabel(-19, 'h'), 'now');
  assert.equal(sampleAgeLabel(0, 'f'), 'now');
  assert.equal(sampleAgeLabel(60, 'f'), 'in 1 minute');
  assert.equal(sampleAgeLabel(300, 'f'), 'in 5 minutes');
  assert.equal(sampleAgeLabel(NaN, 'f'), 'forecast');
  assert.equal(sampleAgeLabel(NaN, 'h'), '');
});
