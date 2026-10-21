// RC-42: the loading clock reads mm:ss — no hours placeholder, no tenths digit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLoadingClock } from '../src/ui/loadingClockFormat.js';

test('loading clock renders mm:ss with no tenths digit', () => {
  assert.equal(formatLoadingClock(0), '00:00');
  assert.equal(formatLoadingClock(5.3), '00:05');
  assert.equal(formatLoadingClock(65.9), '01:05');
  assert.equal(formatLoadingClock(604.12), '10:04');
  assert.match(formatLoadingClock(3723.9), /^\d{2,}:\d{2}$/);
  assert.equal(formatLoadingClock(3723.9).includes('.'), false, 'no tenths digit');
});
