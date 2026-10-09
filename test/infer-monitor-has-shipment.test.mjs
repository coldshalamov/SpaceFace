// The first time a monitor sees heist cargo, the player hears that post. It does not repeat
// while the cargo stays in the beam.
import test from 'node:test';
import assert from 'node:assert/strict';

import { heistFacilities } from '../src/systems/heistFacilities.js';

function step(extraEntities = []) {
  const said = [];
  const payload = {
    id: 7,
    alive: true,
    type: 'payload',
    pos: { x: 500, z: -1100 },
    data: { heistPayloadStableId: 'lot-1' },
  };
  const state = {
    mode: 'flight',
    tick: 3,
    entityList: [payload, ...extraEntities],
    heistFacilities: { monitorPosts: { monitor_ridge: { entityId: 1 } } },
  };
  const sys = Object.assign(Object.create(heistFacilities), {
    state,
    bus: { emit() {} },
    _global(local) { return { x: local.x, z: local.z }; },
    _saySceneCue(line) { said.push(line); return line; },
  });
  sys._stepMonitors(state);
  return { said, state };
}

test('the ridge monitor speaks once while the shipment stays in its beam', () => {
  const first = step();
  assert.equal(first.said.length, 1);
  assert.equal(first.said[0].text, 'Concord Monitor — Ridge has the shipment');
  first.state.tick = 4;
  const sys = Object.assign(Object.create(heistFacilities), {
    state: first.state,
    bus: { emit() {} },
    _global(local) { return { x: local.x, z: local.z }; },
    _saySceneCue(line) { first.said.push(line); return line; },
  });
  sys._stepMonitors(first.state);
  assert.equal(first.said.length, 1);
});

test('cargo that leaves the beam lets the monitor speak on the next pass', () => {
  const first = step();
  first.state.entityList[0].pos = { x: 5000, z: 5000 };
  const said = [];
  const sys = Object.assign(Object.create(heistFacilities), {
    state: first.state,
    bus: { emit() {} },
    _global(local) { return { x: local.x, z: local.z }; },
    _saySceneCue(line) { said.push(line); return line; },
  });
  sys._stepMonitors(first.state);
  assert.equal(said.length, 0);
  first.state.entityList[0].pos = { x: 500, z: -1100 };
  sys._stepMonitors(first.state);
  assert.equal(said.length, 1);
  assert.equal(said[0].text, 'Concord Monitor — Ridge has the shipment');
});
