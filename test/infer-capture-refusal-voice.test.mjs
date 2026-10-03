// A catcher miss the player can see has to name the gate, once per approach.
import test from 'node:test';
import assert from 'node:assert/strict';

import { heistFacilities } from '../src/systems/heistFacilities.js';

function narrator() {
  const said = [];
  const sys = Object.assign(Object.create(heistFacilities), {
    state: { mode: 'flight', heistFacilities: {} },
    _saySceneCue(payload) { said.push(payload); return payload; },
  });
  return { sys, said };
}

test('a too-fast miss speaks once until the reason changes', () => {
  const { sys, said } = narrator();
  assert.equal(sys._narrateCaptureRefusal('run-1', 'too_fast', 10), true);
  assert.equal(sys._narrateCaptureRefusal('run-1', 'too_fast', 40), false);
  assert.equal(said.length, 1);
  assert.equal(said[0].text, 'Too fast for the catcher — bleed speed before the mouth');
  assert.equal(sys._narrateCaptureRefusal('run-1', 'too_sideways', 50), true);
  assert.equal(said[1].text, 'Too much sideways — line up with the rails');
});

test('the same miss can be said again after the approach window', () => {
  const { sys, said } = narrator();
  sys._narrateCaptureRefusal('run-1', 'outside_mouth', 0);
  assert.equal(sys._narrateCaptureRefusal('run-1', 'outside_mouth', 90), true);
  assert.equal(said.length, 2);
  assert.equal(said[1].text, 'Missed the catcher mouth');
});
