// The translated-catalog idle warm must converge where requestIdleCallback does not exist.
//
// The fallback branch re-queued the same step with setTimeout(step, 0): it re-entered itself without ever
// taking a slice (the warm index only moved inside the idle callback), so Safari, older browsers and every
// Node test process spun a permanent zero-delay timer. The accessibility settings-parity test hung for
// that reason. The fallback now takes one slice per spaced tick, and none while the loading shell animates.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FALLBACK_IDLE_WARM_DELAY_MS,
  FALLBACK_IDLE_WARM_LOADING_DELAY_MS,
  fallbackWarmDelayMs,
} from '../src/localization/idleWarmPolicy.js';

test('the fallback spacing is longer while the loading shell is on screen', () => {
  const visibleShell = { getElementById: () => ({ style: { display: 'block' }, classList: { contains: () => false } }) };
  const hiddenShell = { getElementById: () => ({ style: { display: 'none' }, classList: { contains: () => false } }) };
  assert.equal(fallbackWarmDelayMs(visibleShell), FALLBACK_IDLE_WARM_LOADING_DELAY_MS);
  assert.equal(fallbackWarmDelayMs(hiddenShell), FALLBACK_IDLE_WARM_DELAY_MS);
  assert.equal(fallbackWarmDelayMs(undefined), FALLBACK_IDLE_WARM_DELAY_MS, 'no document: spaced, never zero');
  assert.ok(FALLBACK_IDLE_WARM_DELAY_MS >= 16, 'a slice per frame or slower');
});

test('without requestIdleCallback the warm schedules spaced slices, not a zero-delay spin', async () => {
  const delays = [];
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...rest) => { delays.push(ms ?? 0); return realSetTimeout(fn, ms, ...rest); };
  // A window with no requestIdleCallback and no document. It stays defined for the rest of this process:
  // the background warm keeps taking spaced slices after the assertions, and they read it.
  globalThis.window = {};
  try {
    await import('../src/localization/gameLocalization.js');
    await new Promise((resolve) => realSetTimeout(resolve, 900));
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  const zero = delays.filter((ms) => ms === 0).length;
  // The five phased steps (0..4) are the only zero-delay timers; the old fallback produced hundreds in 900 ms.
  assert.ok(zero <= 24, `${zero} zero-delay timers in 900 ms: the warm is spinning`);
  assert.ok(delays.length < 80, `${delays.length} timers scheduled in 900 ms`);
  assert.ok(delays.filter((ms) => ms === FALLBACK_IDLE_WARM_DELAY_MS).length >= 3,
    'translated catalogs are being warmed one spaced slice at a time');
});
