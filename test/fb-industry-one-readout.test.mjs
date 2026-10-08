// FB-055 — drones, traders, outposts, and a site share one readout.
// Seed 4242 is recorded on the fixture; the day figure is rate × 1440, not a second ledger.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  industryReadout,
  industryReadoutFromState,
  renderIndustryStrip,
  traderCycleLine,
} from '../src/ui/screens/industryReadout.js';
import { fakeDom, textLines } from './helpers/fake-dom.mjs';

const SEED = 4242;

test('FB-055 one readout names output per day and the limit, seed 4242', () => {
  const state = {
    seed: SEED,
    automation: {
      drones: [{ defId: 'drone_hauler', ratePerMin: 1, status: 'running' }],
      traders: [{ name: 'Moth', ratePerMin: 2, status: 'lowfuel' }],
      outposts: [{ defId: 'outpost_relay', ratePerMin: 0, status: 'idle' }],
    },
  };
  const sites = [{
    siteName: 'Helios Claim',
    exportRatePerMin: 0.5,
    machines: [{ status: { state: 'stalled', limit: 'full_storage', ratePerMin: {} } }],
    lanes: [],
  }];
  const fromState = industryReadoutFromState(state, sites);
  const direct = industryReadout({ ...state.automation, sites });
  assert.equal(fromState.sentence, direct.sentence);
  assert.equal(fromState.lines.length, 4);
  assert.equal(fromState.lines[0].outputPerDay, 1440);
  assert.equal(fromState.lines[0].unit, 'cr');
  assert.equal(fromState.lines[3].outputPerDay, 720);
  assert.equal(fromState.lines[3].unit, 'u');
  assert.match(fromState.lines[3].text, /Helios Claim — 720 u\/day, limited by Hold is full/);
  assert.match(fromState.lines[1].text, /Moth — 2880 cr\/day, limited by No fuel/);
  assert.equal(fromState.sentence.includes('drone_hauler'), false);
  assert.equal(fromState.crest.includes('Hold is full') || fromState.crest.includes('No fuel'), true);

  const previous = globalThis.document;
  globalThis.document = fakeDom();
  try {
    const node = renderIndustryStrip(fromState, { cycle: traderCycleLine({
      receipt: { result: 'paid', credited: 40 },
    }) });
    const text = textLines(node).join('\n');
    assert.match(text, /Hauler — 1440 cr\/day/);
    assert.equal(text.split('1440').length - 1, 1, 'each asset is one line, not a sentence and a list');
    assert.match(text, /Trader run paid 40 cr/);
    const buttons = [];
    const walk = (n) => {
      if (n.tagName === 'button') buttons.push(n);
      for (const child of n.children || []) walk(child);
    };
    walk(node);
    assert.equal(buttons.length, 0, 'the readout has no management verb');
  } finally {
    globalThis.document = previous;
  }
});

test('FB-055 an empty works says so, and a quiet trader cycle is still a sentence', () => {
  const empty = industryReadoutFromState({ seed: SEED, automation: {} });
  assert.equal(empty.sentence, 'No industrial output on record.');
  assert.equal(empty.crest, 'No output on record');
  assert.equal(traderCycleLine({ receipt: { result: 'no_spread', credited: 0 } }), 'A trader finished a run with no payout.');
  assert.equal(traderCycleLine(null), 'A trader finished a run.');
});
