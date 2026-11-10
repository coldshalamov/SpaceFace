import test from 'node:test';
import assert from 'node:assert/strict';
import { startupFailureFromConsole, createPhaseClock, raceStartupFailure }
  from '../scripts/lib/shaderCompileBoot.mjs';

const CI_LINE = '[SpaceFace] new game startup failed GameStartReadinessError: mobile opening first-picture admission timed out\n    at x (y.js:1:1)';

test('startup-failed console line is recognised with its first line as the reason', () => {
  assert.equal(startupFailureFromConsole(CI_LINE),
    '[SpaceFace] new game startup failed GameStartReadinessError: mobile opening first-picture admission timed out');
  assert.equal(startupFailureFromConsole('[render] opening submission pre-submit gate failed closed'), null);
  assert.equal(startupFailureFromConsole(undefined), null);
});

test('a reported startup failure ends the flight wait immediately, not at its timeout', async () => {
  const failure = { reason: null };
  const never = new Promise(() => {});
  const t0 = Date.now();
  setTimeout(() => { failure.reason = startupFailureFromConsole(CI_LINE); }, 30);
  await assert.rejects(raceStartupFailure(never, failure, { pollMs: 5 }),
    (error) => error.code === 'SF_STARTUP_FAILED' && /first-picture admission timed out/.test(error.message));
  assert.ok(Date.now() - t0 < 1_000);
});

test('a healthy boot resolves through the race untouched', async () => {
  assert.equal(await raceStartupFailure(Promise.resolve('flight'), { reason: null }, { pollMs: 5 }), 'flight');
});

test('phase clock reports per-phase durations', () => {
  let t = 0;
  const clock = createPhaseClock(() => t);
  t = 1500; clock.mark('boot');
  t = 4000; clock.mark('launch');
  assert.equal(clock.summary(), 'boot=1.5s launch=2.5s');
});
