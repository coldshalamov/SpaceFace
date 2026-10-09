// FB-036 — a chronicler story with evidence is cited. An empty story is dropped. One legend a day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createMarketNews } from '../src/ui/marketNews.js';

test('empty evidence does not publish, and a witnessed chain does once', () => {
  const state = { simTime: 100, meta: { seed: 4242 }, ui: {} };
  const bus = createBus();
  createMarketNews({ state, bus, helpers: { voice: { say: () => false } } });
  bus.emit('news:publish', {
    text: 'A story nobody saw.',
    source: 'chronicler',
    kind: 'chronicler-salvage',
    evidence: [],
    sourceRef: 'story:empty',
    eventId: 'story:empty',
  });
  assert.equal(state.ui.marketNews.log.length, 0);
  bus.emit('news:publish', {
    text: 'The seam kept the tender.',
    source: 'chronicler',
    kind: 'chronicler-salvage',
    evidence: [{ factId: 'fact-4242' }],
    sourceRef: 'story:seen',
    eventId: 'story:seen',
  });
  assert.equal(state.ui.marketNews.log.length, 1);
  bus.emit('news:publish', {
    text: 'A Hand in the Dark — first legend.',
    source: 'chronicler',
    kind: 'chronicler-legend',
    evidence: [{ factId: 'legend' }],
    sourceRef: 'legend:1',
    eventId: 'legend:1',
  });
  bus.emit('news:publish', {
    text: 'A second legend the same day.',
    source: 'chronicler',
    kind: 'chronicler-legend',
    evidence: [{ factId: 'legend-2' }],
    sourceRef: 'legend:2',
    eventId: 'legend:2',
  });
  const legends = state.ui.marketNews.log.filter((row) => row.kind === 'chronicler-legend');
  assert.equal(legends.length, 1);
});
