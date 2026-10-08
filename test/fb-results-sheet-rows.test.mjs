// FB-028 — the results sheet prints the sim's stunt rows, the kit board, and
// the overconfidence reading. The run is named. Seed 4242 is the plate's seed;
// the rows are stuntRoundRows()'s, not a second formula.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stuntRoundRows } from '../src/systems/survivalResults.js';
import { kitBalanceBoard, overconfidenceStreak } from '../src/systems/survivalRecords.js';
import {
  namedRunLabel,
  renderResultsSheet,
  resultsSheetModel,
} from '../src/ui/screens/resultsSheet.js';
import { crucibleResultsScreen } from '../src/ui/screens/crucible.js';
import { fakeDom, textLines } from './helpers/fake-dom.mjs';

const SEED = 4242;

const combo = {
  bestChain: 3,
  bestChainPoints: 90,
  banked: 210,
  banks: [{
    acts: [
      { name: 'Sling', episodeId: 'a', points: 40 },
      { name: 'Wrecking Ball', episodeId: 'b', points: 80 },
      { name: 'Ricochet', episodeId: 'c', points: 90 },
    ],
  }],
};

test('FB-028 seed 4242: three stunt rows and two readings, the run named', () => {
  const rows = stuntRoundRows(combo);
  const trickNames = rows.map((row) => row[0]).filter((name) => ['Sling', 'Wrecking Ball', 'Ricochet'].includes(name));
  assert.deepEqual(trickNames, ['Ricochet', 'Wrecking Ball', 'Sling']);
  assert.equal(rows.length >= 3, true);
  const history = [
    { kitId: 'energy_baseline', seed: SEED, score: 1000, outcome: 'defeat', confidence: 0.8 },
    { kitId: 'physics_toolkit', seed: SEED, score: 2400, outcome: 'defeat', confidence: 0.9 },
  ];
  const model = resultsSheetModel({
    result: {
      seed: SEED,
      arenaId: 'helios_core',
      stuntRoundRows: rows,
    },
    kitBoard: kitBalanceBoard(history.map((row) => ({ kit: row.kitId, seed: row.seed, score: row.score }))),
    overconfidenceStreak: overconfidenceStreak(history),
  });
  assert.equal(model.runName, 'Helios Core');
  assert.equal(model.runName.includes('helios_core'), false);
  assert.equal(namedRunLabel('not_a_real_arena'), 'This run');
  assert.deepEqual(model.stuntRows, rows);
  assert.deepEqual(
    model.stuntRows.map((row) => row[0]).filter((name) => ['Sling', 'Wrecking Ball', 'Ricochet'].includes(name)),
    ['Ricochet', 'Wrecking Ball', 'Sling'],
  );
  assert.equal(model.kitLines.length >= 2, true);
  assert.match(model.overconfidence, /2 runs in a row/);
  assert.equal(JSON.stringify(model).includes('helios_core'), false);
  assert.equal(JSON.stringify(model).includes('energy_baseline'), false);

  const previous = globalThis.document;
  globalThis.document = fakeDom();
  try {
    const node = renderResultsSheet(model);
    const text = textLines(node).join('\n');
    assert.match(text, /Helios Core/);
    assert.match(text, /Ricochet/);
    assert.match(text, /Wrecking Ball/);
    assert.match(text, /Sling/);
    assert.match(text, /Kit balance|Energy Baseline|Physics Toolkit/);
    assert.match(text, /Overconfidence: 2 runs/);
    assert.equal(text.includes('helios_core'), false);
  } finally {
    globalThis.document = previous;
  }
});

test('FB-028 the results plate prints the sheet beside the ledger', () => {
  const rows = stuntRoundRows(combo);
  const previous = globalThis.document;
  const doc = fakeDom();
  globalThis.document = doc;
  const root = doc._make('div');
  try {
    crucibleResultsScreen.mount(root, {
      bus: { emit() {}, on() { return () => {}; }, off() {}, once() {} },
      registry: {
        get(name) {
          if (name !== 'survivalResults') return null;
          return {
            lastResult: () => ({
              seed: SEED,
              arenaId: 'helios_core',
              outcome: 'victory',
              wave: 3,
              headline: 'Helios held.',
              stuntRoundRows: rows,
              overconfidenceStreak: 2,
            }),
          };
        },
      },
      state: {},
    });
    const text = textLines(root).join('\n');
    assert.match(text, /Helios Core/);
    assert.match(text, /Ricochet/);
    assert.match(text, /Overconfidence: 2 runs/);
    assert.equal(text.includes('helios_core'), false);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
