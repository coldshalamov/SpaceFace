import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COOK_PACE_BUDGET_MS,
  COOK_PACE_MAX_UNITS,
  createCookQueuePaceDebt,
} from '../src/render/gpuQueuePace.js';
import { createSlicedYield } from '../src/render/pipelineReadiness.js';

test('cook pace debt falls due after a few cache-hit units, not every unit', () => {
  const debt = createCookQueuePaceDebt();
  for (let i = 1; i < COOK_PACE_MAX_UNITS; i += 1) {
    debt.note(0.2);
    assert.equal(debt.due(), false, `unit ${i} of ${COOK_PACE_MAX_UNITS} is not due yet`);
  }
  debt.note(0.2);
  assert.equal(debt.due(), true);
  debt.clear();
  assert.equal(debt.due(), false);
});

test('cook pace debt falls due once a frame of issue time has queued', () => {
  const debt = createCookQueuePaceDebt();
  debt.note(COOK_PACE_BUDGET_MS - 1);
  assert.equal(debt.due(), false);
  debt.note(1);
  assert.equal(debt.due(), true);
  debt.clear();
  debt.note(Number.NaN);
  debt.note(-5);
  assert.equal(debt.due(), false, 'non-finite or negative spend only counts the unit');
});

test('a restarted slice does not spend a second yield right after another path yielded', async () => {
  let clock = 0;
  let yields = 0;
  const sliced = createSlicedYield(async () => { yields += 1; }, { sliceMs: 8, now: () => clock });
  clock = 40; // a serial-route pace just waited a presented frame
  sliced.restart();
  assert.equal(await sliced(), false);
  assert.equal(yields, 0);
  clock = 49;
  assert.equal(await sliced(), true);
  assert.equal(yields, 1);
});
