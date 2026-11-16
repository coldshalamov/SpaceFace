import test from 'node:test';
import assert from 'node:assert/strict';
import { trackPloughReleases, isPloughing, ploughKill, PLOUGH_FLIGHT_TICKS, PLOUGH_MIN_SPEED } from '../src/combat/ploughFlight.js';

test('a released body ploughs for 1.5 s while fast; each kill costs a share of its speed', () => {
  const body = { id: 7, alive: true, mass: 16, vel: { x: 200, z: 0 } };
  const state = { tick: 10, entities: new Map([[7, body]]), player: { tether: { active: true, targetId: 7 } } };
  trackPloughReleases(state);
  assert.equal(isPloughing(state, body), false, 'held is not flight');
  state.player.tether = { active: false, targetId: null };
  state.tick = 11; trackPloughReleases(state);
  assert.equal(isPloughing(state, body), true);
  ploughKill(state, body);
  assert.ok(Math.abs(state.massline2.plough.speed[7] - 140) < 1e-9, 'one kill costs 30% of the carried speed');
  body.vel.x = PLOUGH_MIN_SPEED - 1;
  assert.equal(isPloughing(state, body), false, 'too slow: the throw is spent');
  body.vel.x = 200; state.tick = 11 + PLOUGH_FLIGHT_TICKS + 1;
  assert.equal(isPloughing(state, body), false, 'past the flight window');
});
