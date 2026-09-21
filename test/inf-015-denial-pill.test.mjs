import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { masslineHud, denialNextAction } from '../src/ui/masslineHud.js';

function initHud(simTime = 10) {
  const bus = createBus();
  const state = { simTime, masslineDenial: null, player: { tether: { active: false } } };
  const hud = Object.assign({}, masslineHud);
  hud.init({ state, bus, helpers: {} });
  return { bus, state, hud };
}

test('INF-015 each denial names its condition plus one next action', () => {
  const blocked = denialNextAction('invalid', 'blocked');
  const range = denialNextAction('invalid', 'out-of-range');
  const prot = denialNextAction('invalid', 'protected');
  const noKit = denialNextAction('invalid', 'attachment_authority_unavailable');
  for (const a of [blocked, range, prot, noKit]) assert.ok(a && a.length > 3, 'every denial needs words');
  assert.notEqual(blocked, range);
  assert.notEqual(range, prot);
  assert.notEqual(prot, noKit);
});

test('INF-015 held-input repeats do not re-announce the same denial', () => {
  const { bus, state } = initHud(10);
  bus.emit('tether:latchDenied', { reason: 'blocked', targetId: 7 });
  const first = state.masslineDenial.untilSimTime;
  assert.equal(state.masslineDenial.reason, 'blocked');
  bus.emit('tether:latchDenied', { reason: 'blocked', targetId: 7 });
  assert.equal(state.masslineDenial.untilSimTime, first, 'same held denial must not refresh the timer');
  bus.emit('tether:latchDenied', { reason: 'out-of-range', targetId: 7 });
  assert.equal(state.masslineDenial.reason, 'out-of-range', 'a new reason replaces the pill at once');
});

test('INF-015 a successful latch clears stale denial text', () => {
  const { bus, state } = initHud(20);
  bus.emit('tether:latchDenied', { reason: 'blocked', targetId: 3 });
  assert.ok(state.masslineDenial, 'denial lands first');
  bus.emit('tether:latched', { targetId: 3 });
  assert.equal(state.masslineDenial, null, 'latch success clears the pill immediately');
});
