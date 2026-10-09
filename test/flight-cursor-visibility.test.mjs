import assert from 'node:assert/strict';
import test from 'node:test';
import { flightReticlePosition } from '../src/ui/uiRoot.js';

test('mouse flight has no invented center sight before a pointer arrives or after focus loss', () => {
  const state = { input: { autoFire: false, pointerScreen: { x: 600, y: 300, active: false } } };
  assert.equal(flightReticlePosition(state, 1440, 900), null);
  state.input.pointerScreen.active = true;
  assert.deepEqual(flightReticlePosition(state, 1440, 900), { x: 600, y: 300 });
  state.input.pointerScreen.active = false;
  assert.equal(flightReticlePosition(state, 1440, 900), null);
});

test('only explicit combat-stick mode gets a centered sight, even after pointer lock releases', () => {
  const state = { input: { autoFire: true, pointerScreen: { x: 500, y: 200, active: false } } };
  assert.deepEqual(flightReticlePosition(state, 1440, 900), { x: 720, y: 450 });
  state.input.autoFire = false;
  assert.equal(flightReticlePosition(state, 1440, 900), null);
  state.input.pointerScreen.active = true;
  assert.deepEqual(flightReticlePosition(state, 1440, 900), { x: 500, y: 200 });
});

test('invalid or outside-window mouse coordinates do not leave a stranded sight', () => {
  for (const [x, y] of [[NaN, 300], [600, Infinity], [-1, 300], [1441, 300], [600, -1], [600, 901]]) {
    assert.equal(flightReticlePosition({ input: { pointerScreen: { active: true, x, y } } }, 1440, 900), null);
  }
});
