// NXI-077: Reject an invalid challenge seed before starting a run
import test from 'node:test';
import assert from 'node:assert/strict';
import { planWave, isCombatLabSeed, WAVE_PLAN_ERROR } from '../src/systems/survivalWavePlanner.js';
import { crucibleSetupFor, requestCrucibleRun, normalizeSeed } from '../src/ui/crucibleLaunch.js';

const ARENA = 'helios_core';

test('NXI-077: planWave rejects zero, out-of-range, NaN, and malformed seeds with WAVE_PLAN_ERROR', () => {
  const invalidSeeds = [0, -1, -500, NaN, Infinity, -Infinity, 0.5, 0xffffffff + 1, 'abc', '0', '-5', '1.5'];
  for (const badSeed of invalidSeeds) {
    const res = planWave({ seed: badSeed, arenaId: ARENA, wave: 1 });
    assert.equal(res.ok, false, `expected seed ${badSeed} to be rejected`);
    assert.equal(res.error, WAVE_PLAN_ERROR);
    assert.ok(res.issues.some((i) => i.path === 'seed'), `expected issue on seed for ${badSeed}`);
  }
});

test('NXI-077: planWave accepts valid integer seeds and valid string-coerced seeds identically', () => {
  const numPlan = planWave({ seed: 4242, arenaId: ARENA, wave: 1 });
  const strPlan = planWave({ seed: '4242', arenaId: ARENA, wave: 1 });
  assert.ok(!numPlan.error && numPlan.id);
  assert.ok(!strPlan.error && strPlan.id);
  assert.deepEqual(numPlan, strPlan);
});

test('NXI-077: crucibleSetupFor rejects zero, negative, NaN and malformed seeds without clamping to 1', () => {
  const badSeeds = [0, -10, NaN, 'garbage', 0xffffffff + 10];
  for (const bad of badSeeds) {
    const setup = crucibleSetupFor({ seed: bad });
    assert.equal(setup.ok, false, `crucibleSetupFor should fail for seed ${bad}`);
    assert.ok(setup.issues.some((i) => i.path === 'seed'));
  }

  const valid = crucibleSetupFor({ seed: 4242 });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.seed, 4242);

  const validStr = crucibleSetupFor({ seed: '4242' });
  assert.equal(validStr.ok, true);
  assert.equal(validStr.value.seed, 4242);
});

test('NXI-077: requestCrucibleRun aborts on invalid setup without partial run creation', () => {
  const emitted = [];
  const bus = { emit: (ev, payload) => emitted.push({ ev, payload }) };

  const failedSetup = crucibleSetupFor({ seed: 0 });
  const started = requestCrucibleRun(bus, failedSetup);
  assert.equal(started, false);
  assert.equal(emitted.length, 0, 'no game:new event should be emitted');
});
