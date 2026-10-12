import test from 'node:test';
import assert from 'node:assert/strict';
import { survivalWave } from '../src/systems/survivalWave.js';

test('after the lesson the held batches land a breath apart, in order, batch-mates together', () => {
  const sys = Object.create(survivalWave);
  sys._cursor = 100;
  const at = (t) => ({ entry: { atTick: t } });
  sys._pending = [at(280), at(280), at(300), at(330), at(90), at(700)];
  sys._spaceOpeningArrivals();
  assert.deepEqual(sys._pending.map((p) => p.entry.atTick), [280, 280, 360, 440, 90, 700]);
});

test('a single held batch is left where the release put it', () => {
  const sys = Object.create(survivalWave);
  sys._cursor = 0;
  sys._pending = [{ entry: { atTick: 180 } }, { entry: { atTick: 180 } }];
  sys._spaceOpeningArrivals();
  assert.deepEqual(sys._pending.map((p) => p.entry.atTick), [180, 180]);
});
