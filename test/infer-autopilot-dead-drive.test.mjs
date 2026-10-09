// A position fix must not keep flying the ship after the drive dies.
import test from 'node:test';
import assert from 'node:assert/strict';

import { releaseAutopilotIfDriveOut } from '../src/systems/flightV3.js';

function world(disabled, extras = {}) {
  const events = [];
  const state = {
    playerId: 1,
    input: { actions: {} },
    nav: {
      autopilot: { active: true, target: { x: 400, z: 0 }, status: 'acquiring' },
      ...extras,
    },
    combat: {
      entities: {
        1: { subsystems: { subsystem_drive: { effectiveDisabled: disabled } } },
      },
    },
  };
  const host = { bus: { emit(name, payload) { events.push({ name, payload }); } } };
  const entity = { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0 };
  return { state, host, entity, events };
}

test('a dead drive drops a local autopilot and says why', () => {
  const { state, host, entity, events } = world(true);
  assert.equal(releaseAutopilotIfDriveOut(host, state, entity), true);
  assert.equal(state.nav.autopilot.active, false);
  assert.equal(events.find((event) => event.name === 'toast').payload.text, 'Drive out — autopilot can\'t hold');
  assert.equal(releaseAutopilotIfDriveOut(host, state, entity), false);
  assert.equal(events.filter((event) => event.name === 'toast').length, 1);
});

test('an engaged route keeps its own drop, and a live drive stays on', () => {
  const route = world(true, { executor: { engaged: true } });
  assert.equal(releaseAutopilotIfDriveOut(route.host, route.state, route.entity), true);
  assert.equal(route.state.nav.autopilot.active, true);
  assert.equal(route.events.length, 0);

  const live = world(false);
  assert.equal(releaseAutopilotIfDriveOut(live.host, live.state, live.entity), false);
  assert.equal(live.state.nav.autopilot.active, true);
});
