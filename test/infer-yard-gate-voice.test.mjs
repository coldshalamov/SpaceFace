// The yard gate opens and shuts because of the weight on the cradle. Each change speaks once.
import test from 'node:test';
import assert from 'node:assert/strict';

import { heistFacilities } from '../src/systems/heistFacilities.js';

function yard(gate, hold, release) {
  const said = [];
  const cw = {
    sceneId: null,
    gate,
    gateHoldTicks: hold,
    gateReleaseTicks: release,
    doorPose01: gate === 'open' ? 1 : 0,
    doorEntityId: null,
    pressureSpawned: true,
  };
  const state = {
    mode: 'flight',
    tick: 1,
    entities: new Map(),
    heistFacilities: { counterweight: cw },
  };
  const sys = Object.assign(Object.create(heistFacilities), {
    state,
    _cradleHeldBody() { return hold > 0 ? { id: 3 } : null; },
    _emitCounterweightEvent() {},
    _saySceneCue(line) { said.push(line); return line; },
  });
  return { sys, state, cw, said };
}

test('holding the cradle opens the yard gate once', () => {
  const { sys, state, cw, said } = yard('closed', 89, 0);
  sys._stepCounterweightScene(state);
  sys._stepCounterweightScene(state);
  assert.equal(cw.gate, 'open');
  assert.equal(said.length, 1);
  assert.equal(said[0].text, 'Yard gate open — the balance is holding');
});

test('letting the cradle go shuts the gate once', () => {
  const { sys, state, cw, said } = yard('open', 0, 44);
  sys._cradleHeldBody = () => null;
  sys._stepCounterweightScene(state);
  sys._stepCounterweightScene(state);
  assert.equal(cw.gate, 'closed');
  assert.equal(said.length, 1);
  assert.equal(said[0].text, 'Yard gate shut — the balance left the cradle');
});
