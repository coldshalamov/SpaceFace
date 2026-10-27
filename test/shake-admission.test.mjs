// Controlled Chaos packet 08 - discrete camera shakes are admitted, not summed.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SHAKE_ADMISSION_LAW, createShakeAdmission } from '../src/render/shakeAdmission.js';

test('a lone hero beat is admitted in full', () => {
  const a = createShakeAdmission();
  assert.equal(a.admit(0.5, 10), 0.5);
  assert.ok(Math.abs(a.admit(0.4, 20) - 0.4) < 1e-6, 'and a later one after the window has drained');
});

test('continuous textures (below the event floor) pass untouched, even mid-massacre', () => {
  const a = createShakeAdmission();
  for (let i = 0; i < 6; i++) a.admit(0.5, 10);
  assert.equal(a.admit(0.03, 10), 0.03);
  assert.equal(a.admit(0.07, 10), 0.07);
});

test('a swarm of kills / a shotgun burst diminishes and is bounded by the window ceiling', () => {
  const a = createShakeAdmission();
  const admitted = [];
  for (let i = 0; i < 12; i++) {
    admitted.push(a.admit(0.5, 10 + i * 0.02));
    assert.ok(a.energy() <= SHAKE_ADMISSION_LAW.windowCeiling + 1e-9, `the live window never exceeds the ceiling (${a.energy()})`);
  }
  assert.equal(admitted[0], 0.5);
  for (let i = 1; i < admitted.length; i++) assert.ok(admitted[i] <= admitted[i - 1] + 1e-9, `non-increasing at ${i}`);
  assert.ok(admitted[8] < 0.5 * admitted[0], 'later blows add far less than the first');
  // simultaneous blows (a single frame's worth) add up to at most the ceiling
  const c = createShakeAdmission();
  const same = Array.from({ length: 12 }, () => c.admit(0.5, 7));
  assert.ok(same.reduce((s, x) => s + x, 0) <= SHAKE_ADMISSION_LAW.windowCeiling + 1e-9);
  // 8 pellets into the player's shield, 0.2 each
  const b = createShakeAdmission();
  const pellets = Array.from({ length: 8 }, () => b.admit(0.2, 5));
  assert.equal(pellets[0], 0.2);
  assert.ok(pellets.reduce((s, x) => s + x, 0) < 8 * 0.2 * 0.6, 'no shake per pellet');
});

test('the window drains with time, so the next beat is whole again', () => {
  const a = createShakeAdmission();
  for (let i = 0; i < 10; i++) a.admit(0.5, 3);
  assert.ok(a.admit(0.5, 3) < 0.1, 'saturated now');
  assert.ok(a.admit(0.5, 3 + 3) > 0.45, 'three seconds later it is a hero beat again');
});

test('clock reset and nonsense inputs are safe', () => {
  const a = createShakeAdmission();
  a.admit(0.5, 100);
  assert.equal(a.admit(0.5, 1), 0.5, 'the clock went backwards: forget the old window');
  assert.equal(a.admit(NaN, 1), 0);
  assert.equal(a.admit(-1, 1), 0);
  assert.equal(a.admit(0.3, NaN) >= 0, true);
});
