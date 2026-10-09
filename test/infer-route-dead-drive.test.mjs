// A dead drive must not take the autopilot. The guns and the stick stay with the pilot.
import test from 'node:test';
import assert from 'node:assert/strict';

import { routeFollower } from '../src/systems/routeFollower.js';

function follower(nav, disabled) {
  const events = [];
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 } };
  const state = {
    playerId: 1,
    entities: new Map([[1, player]]),
    nav,
    combat: {
      entities: {
        1: { subsystems: { subsystem_drive: { effectiveDisabled: disabled } } },
      },
    },
  };
  const sys = Object.assign(Object.create(routeFollower), {
    state,
    bus: { emit(name, payload) { events.push({ name, payload }); } },
  });
  return { sys, state, events };
}

test('engaging a plotted route on a dead drive does not start travel', () => {
  const { sys, events, state } = follower({
    route: { legs: [{ from: 'alpha', to: 'beta' }] },
  }, true);
  assert.equal(sys.engage(), null);
  assert.equal(state.nav.executor, undefined);
  assert.equal(events.find((event) => event.name === 'nav:routeExecutorDenied').payload.reason, 'drive-out');
  assert.equal(events.find((event) => event.name === 'toast').payload.text, 'Drive out — the route can\'t hold');
});

test('an engaged route drops once when the drive dies', () => {
  const { sys, events, state } = follower({
    autoTravel: true,
    route: { legs: [{ from: 'alpha', to: 'beta' }] },
    executor: {
      engaged: true,
      status: 'acquiring',
      legs: [{ toSectorId: 'beta', target: { x: 10, z: 0 }, resolved: true }],
      legIndex: 0,
    },
  }, true);
  sys.update(1 / 60, state);
  sys.update(1 / 60, state);
  assert.equal(state.nav.executor.engaged, false);
  assert.equal(state.nav.executor.interruptReason, 'drive-out');
  assert.equal(events.filter((event) => event.name === 'toast').length, 1);
});

test('a live drive still resumes the plotted trip', () => {
  const { sys, events, state } = follower({
    route: { legs: [{ from: 'alpha', to: 'beta' }] },
    executor: {
      engaged: false,
      status: 'interrupted',
      legs: [{ toSectorId: 'beta' }],
      legIndex: 0,
    },
  }, false);
  const executor = sys.engage();
  assert.equal(executor, state.nav.executor);
  assert.equal(executor.engaged, true);
  assert.equal(executor.status, 'acquiring');
  assert.equal(events.some((event) => event.name === 'toast'), false);
});
