// words-miner-ops-chips — the miner ops chips count in words, not "u".
//
// The automation panel's miner-ops chips were the last "u"-symbol holders on a spoken surface:
// "Gross cut 12 u", "Stored 4/20 u" — the same panel whose screen-reader summary already says
// "units" (words-field-counts), so sighted and blind pilots read different grammars for the same
// numbers. The chips now carry the whole word with a singular branch ("1 unit", "4/20 units");
// the Limit chip is a labeled status, not a count, and stays as it is.
//
// This asserts the rendered chip text by mounting the real _renderDrones through the fake DOM —
// the words on the card, not a literal of the template that produced them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { automationScreen } from '../src/ui/screens/automationPanel.js';
import { createBus } from '../src/core/eventBus.js';
import { fakeDom } from './helpers/fake-dom.mjs';

function minerDrone(id, operation) {
  return {
    id, defId: 'drone_mk1', status: 'mining', fuel: 100, fuelMax: 240, buffer: 0,
    program: { kind: 'template', templateId: 'mine_to_depot' },
    operation: { operatingState: 'running', label: 'Running', reason: 'Cutting.',
      lastSale: null, operatingCostPerMin: 6, netThroughputPerMin: 42, ...operation },
  };
}

test('the gross-cut and stored chips render whole unit words with a singular branch', () => {
  const oldDocument = globalThis.document;
  const doc = fakeDom();
  globalThis.document = doc;
  const screen = Object.create(automationScreen);
  try {
    screen._ctx = {
      state: {
        automation: {
          drones: [
            minerDrone('d_single', { grossUnits: 1, storedUnits: 0, storedCap: 1 }),
            minerDrone('d_plural', { grossUnits: 12, storedUnits: 4, storedCap: 20 }),
          ],
          traders: [], outposts: [], fleet: [], meta: {}, accumulators: {},
        },
        player: { ownedShips: [], credits: 0, researchedNodes: [] },
      },
      bus: createBus(),
    };
    const frag = doc._make('fragment');
    screen._renderDrones(frag);
    const html = frag.children.map((node) => node.innerHTML || node.textContent || '').join('\n');
    assert.match(html, /Gross cut<\/span><strong>1 unit<\/strong>/,
      'a gross cut of one counts to "1 unit"');
    assert.match(html, /Gross cut<\/span><strong>12 units<\/strong>/,
      'a gross cut of twelve counts to "12 units"');
    assert.match(html, /Stored<\/span><strong>0\/1 unit<\/strong>/,
      'a single-slot store counts to "0/1 unit"');
    assert.match(html, /Stored<\/span><strong>4\/20 units<\/strong>/,
      'a twenty-slot store counts to "4/20 units"');
    assert.doesNotMatch(html, /<strong>[\d.,]+ u<\/strong>/,
      'no bare "u" count remains on a chip');
    assert.doesNotMatch(html, /<strong>[\d.,]+\/[\d.,]+ u<\/strong>/,
      'no bare "u" count remains on the stored chip');
  } finally {
    globalThis.document = oldDocument;
  }
});
