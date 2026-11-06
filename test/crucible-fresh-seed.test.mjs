import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearCrucibleSetup,
  crucibleSetupFor,
  freshSeed,
  lastCrucibleSetup,
  normalizeSeed,
  requestCrucibleRun,
} from '../src/ui/crucibleLaunch.js';

test('fresh Crucible seeds retain the authored clock roll and always enter the legal seed range', t => {
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(Math, 'random', () => { throw new Error('Seed selection must not consume ambient RNG'); });
  const vectors = [
    [0, 0x9e3779b9],
    [1, 0x9e3779b8],
    [0xffffffff, 0x61cf79b9],
    [1793988000000, 0x2c36909a],
    // The former local generator produced the invalid seed zero at this clock value.
    [0x9e338825, 1],
    [0x19e338825, 1],
  ];
  for (const [clock, expected] of vectors) {
    now = clock;
    const seed = freshSeed();
    assert.equal(seed, expected);
    assert.equal(crucibleSetupFor({ seed }).ok, true, `generated seed at ${clock} is launchable`);
  }
  // Generating a legal seed does not repair or silently accept an invalid player-entered seed.
  assert.equal(normalizeSeed(0), 0);
  assert.equal(crucibleSetupFor({ seed: 0 }).ok, false);
});

test('a generated seed reaches the real New Game intent unchanged and Retry preserves it', t => {
  let now = 0x9e338825;
  t.mock.method(Date, 'now', () => now);
  t.after(clearCrucibleSetup);
  clearCrucibleSetup();
  const seed = freshSeed();
  const setup = crucibleSetupFor({ seed });
  const requests = [];
  const bus = { emit: (event, payload) => { if (event === 'game:new') requests.push(payload); } };
  assert.equal(requestCrucibleRun(bus, setup), true);
  assert.equal(requests[0].seed, seed);
  assert.equal(requests[0].crucibleSetup.survivalSetup.seed, seed);
  now = 1793988000000;
  assert.equal(requestCrucibleRun(bus, lastCrucibleSetup()), true);
  assert.deepEqual(requests.map(request => request.seed), [seed, seed]);
  assert.equal(lastCrucibleSetup().seed, seed);
});
