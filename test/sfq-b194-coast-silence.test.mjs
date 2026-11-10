// SFQ-B194 park — coast is silence. Pitch is not tied to world speed alone.
// A fast coast (throttle 0, speed full) stays gain 0. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { engineEffortVoice } from '../src/audio/elementaryVoices.js';

const SEED = 4242;

test('coasting fast does not sound like thrust (seed 4242)', () => {
  assert.equal(SEED, 4242);
  const coast = engineEffortVoice(220, { throttle: 0, speed01: 1, braking: false });
  const thrust = engineEffortVoice(220, { throttle: 1, speed01: 1, braking: false });
  assert.equal(coast.kind, 'coast');
  assert.equal(coast.gain, 0);
  assert.ok(thrust.gain > 0);
  assert.notEqual(thrust.kind, 'coast');
  assert.equal(coast.hz, thrust.hz);
});
