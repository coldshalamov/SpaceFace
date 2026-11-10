import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENGINE_TIER_HZ,
  engineEffortVoice,
  stepElementaryVoices,
} from '../src/audio/elementaryVoices.js';

test('loaded acceleration sits below free thrust, and braking speaks at zero throttle', () => {
  const loaded = engineEffortVoice(ENGINE_TIER_HZ.thrust, { throttle: 1, speed01: 0.1, braking: false });
  const free = engineEffortVoice(ENGINE_TIER_HZ.thrust, { throttle: 1, speed01: 1, braking: false });
  const coast = engineEffortVoice(ENGINE_TIER_HZ.thrust, { throttle: 0, speed01: 1, braking: false });
  const brake = engineEffortVoice(ENGINE_TIER_HZ.thrust, { throttle: 0, speed01: 0.8, braking: true });

  assert.equal(loaded.kind, 'loaded');
  assert.equal(free.kind, 'free');
  assert.equal(coast.kind, 'coast');
  assert.equal(brake.kind, 'brake');
  assert.ok(loaded.hz < free.hz, `loaded ${loaded.hz} should sit under free ${free.hz}`);
  assert.equal(free.hz, ENGINE_TIER_HZ.thrust);
  assert.equal(coast.gain, 0);
  assert.ok(brake.gain > 0);
  assert.ok(brake.hz < free.hz);
});

test('a missing speed leaves the authored tier, and a coast still falls silent', () => {
  const plain = stepElementaryVoices({ engineGain: 0, ropeGain: 0 }, {
    throttle: 1,
    tier: 'thrust',
    flight: true,
    paused: false,
    dt: 1,
  });
  assert.equal(plain.engineHz, ENGINE_TIER_HZ.thrust);

  const coast = stepElementaryVoices({ engineGain: 0.2, ropeGain: 0 }, {
    throttle: 0,
    speed01: 1,
    tier: 'idle',
    flight: true,
    paused: false,
    dt: 2,
  });
  assert.ok(coast.engineGain < 0.2);
  assert.equal(coast.engineTarget, 0);

  const braking = stepElementaryVoices({ engineGain: 0, ropeGain: 0 }, {
    throttle: 0,
    speed01: 0.7,
    braking: true,
    tier: 'thrust',
    flight: true,
    paused: false,
    dt: 1,
  });
  assert.ok(braking.engineGain > 0);
  assert.ok(braking.engineHz < ENGINE_TIER_HZ.thrust);
});
