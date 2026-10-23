// A hull hit lets go of a route the ship is flying. A shield graze does not. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { routeFollower } from '../src/systems/routeFollower.js';

function rig() {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 9;
  state.nav.executor = {
    engaged: true,
    status: 'acquiring',
    legs: [{ index: 0, toSectorId: 'sector_kepler' }],
    legIndex: 0,
    interruptReason: null,
    armedLegIndex: 0,
  };
  state.nav.autopilot = { active: true, target: { x: 10, z: 20 }, status: 'armed', label: 'Kepler' };
  state.nav.waypoint = null;
  const events = [];
  const handlers = new Map();
  const bus = {
    on(type, fn) {
      const list = handlers.get(type) || [];
      list.push(fn);
      handlers.set(type, list);
      return () => {};
    },
    emit(type, payload) {
      events.push({ type, payload });
      for (const fn of handlers.get(type) || []) fn(payload);
    },
  };
  routeFollower.init({ state, bus });
  return { state, bus, events };
}

test('seed 4242: a hull hit lets go of the engaged route', () => {
  const { state, bus, events } = rig();
  bus.emit('combat:damage', { targetId: 1, hullDamage: 8, shieldDamage: 0 });
  assert.equal(state.nav.executor.engaged, false);
  assert.equal(state.nav.executor.status, 'interrupted');
  assert.equal(state.nav.executor.interruptReason, 'hull-strike');
  assert.equal(state.nav.autopilot.active, false);
  const toast = events.find((e) => e.type === 'toast');
  assert.equal(toast.payload.text, 'Hull hit — the route let go');
  assert.equal(events.some((e) => e.type === 'nav:routeExecutor' && e.payload.transition === 'interrupted'), true);
});

test('seed 4242: a graze and someone else\'s hull keep the route', () => {
  const graze = rig();
  graze.bus.emit('combat:damage', { targetId: 1, hullDamage: 0, shieldDamage: 14 });
  assert.equal(graze.state.nav.executor.engaged, true);
  assert.equal(graze.state.nav.executor.status, 'acquiring');
  assert.equal(graze.state.nav.autopilot.active, true);
  assert.equal(graze.events.some((e) => e.type === 'toast'), false);

  const other = rig();
  other.bus.emit('combat:damage', { targetId: 6, hullDamage: 20 });
  assert.equal(other.state.nav.executor.engaged, true);
  assert.equal(other.events.some((e) => e.type === 'toast'), false);
});
