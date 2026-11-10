// Engaging travel with nothing plotted used to emit an event nobody heard.
import test from 'node:test';
import assert from 'node:assert/strict';

import { routeFollower } from '../src/systems/routeFollower.js';

function engage(nav) {
  const events = [];
  const follower = Object.assign(Object.create(routeFollower), {
    state: { nav },
    bus: { emit(name, payload) { events.push({ name, payload }); } },
  });
  const result = follower.engage();
  return { result, events };
}

test('engaging with no plotted route says so and does not start travel', () => {
  const { result, events } = engage({});
  assert.equal(result, null);
  const denied = events.find((event) => event.name === 'nav:routeExecutorDenied');
  assert.equal(denied.payload.reason, 'no-route');
  const toast = events.find((event) => event.name === 'toast');
  assert.equal(toast.payload.text, 'Plot a route first');
});

test('a route that decomposes to no legs says it has no flyable leg', () => {
  const { result, events } = engage({ route: { legs: [{}] } });
  assert.equal(result, null);
  assert.equal(
    events.find((event) => event.name === 'nav:routeExecutorDenied').payload.reason,
    'undecomposable-route',
  );
  const toasts = events.filter((event) => event.name === 'toast');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].payload.text, 'That route has no flyable leg');
});

test('a missing nav record stays silent', () => {
  const { result, events } = engage(null);
  assert.equal(result, null);
  assert.equal(events.length, 0);
});
