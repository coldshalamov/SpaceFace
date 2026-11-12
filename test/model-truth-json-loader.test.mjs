import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  loadModelTruthCensus,
  modelTruthCensus,
  modelTruthRows,
  modelTruthRow,
} from '../src/data/modelTruth.js';

test('Node import initializes the complete canonical census before synchronous consumers run', async () => {
  const expected = JSON.parse(await readFile(new URL('../src/data/modelTruthCensus.json', import.meta.url), 'utf8'));
  assert.deepEqual(modelTruthCensus(), expected);
  assert.equal(modelTruthRows().length, expected.rows.length);
  assert.equal(modelTruthRow('place_station_trade_hub')?.id, 'place_station_trade_hub');
});

test('model truth census loading is memoized and keeps the synchronous getter object stable', async () => {
  const first = loadModelTruthCensus();
  const second = loadModelTruthCensus(new URL('../src/data/modelTruthCensus.json', import.meta.url));
  assert.equal(first, second);
  const loaded = await first;
  assert.equal(loaded, modelTruthCensus());
});
