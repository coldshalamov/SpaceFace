// A welded gate refuses the route. A drive leg on that same road still engages. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { auditEdgeKey } from '../src/data/worldPressure.js';
import { routeFollower } from '../src/systems/routeFollower.js';

function rig(via) {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 4;
  const from = 'sector_helios_prime';
  const to = 'sector_ceres_belt';
  state.worldPressure = {
    gates: {
      [auditEdgeKey(from, to)]: { status: 'closed', gateName: 'Ceres Gate' },
    },
  };
  state.nav.route = {
    legs: [{ from, to, travelVia: via, target: { x: 12, z: 40 }, label: 'Ceres' }],
  };
  state.nav.autoTravel = true;
  const events = [];
  const bus = {
    on() { return () => {}; },
    emit(type, payload) { events.push({ type, payload }); },
  };
  routeFollower.init({ state, bus });
  return { state, events };
}

test('seed 4242: a welded gate refuses the route and names the gate', () => {
  const { state, events } = rig('gate');
  const executor = routeFollower.engage({});
  assert.equal(executor, null);
  assert.equal(state.nav.executor, undefined);
  const toast = events.find((e) => e.type === 'toast');
  assert.equal(toast.payload.text, 'Ceres Gate is welded shut — the route can\'t take it');
  const denied = events.find((e) => e.type === 'nav:routeExecutorDenied');
  assert.equal(denied.payload.reason, 'gate-closed');
});

test('seed 4242: a drive leg still flies a road whose gate is welded', () => {
  const { state, events } = rig('drive');
  const executor = routeFollower.engage({});
  assert.ok(executor);
  assert.equal(executor.engaged, true);
  assert.equal(state.nav.executor, executor);
  assert.equal(events.some((e) => e.type === 'toast' && /welded/.test(e.payload.text)), false);
  assert.equal(events.some((e) => e.type === 'nav:routeExecutor' && e.payload.transition === 'engaged'), true);
});
