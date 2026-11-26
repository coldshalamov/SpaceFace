/**
 * Re-init listener drain — singleton systems re-initialized on a live bus (hot reload /
 * test restore) must drop their previous bus bindings before attaching new ones. A stale
 * set would fire every intent once per past registration (e.g. economy:chargeCredits
 * charging twice). Drives the real systems on createBus + createGameState.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { economy } from '../src/systems/economy.js';
import { claims } from '../src/systems/claims.js';
import { createGamepad } from '../src/systems/gamepad.js';

function boot() {
  const bus = createBus();
  const state = createGameState(4242);
  const ctx = { state, bus, helpers: {}, registry: null };
  return { bus, state, ctx };
}

function listenerCount(bus, event) {
  const set = bus._listeners && bus._listeners.get(event);
  return set ? set.size : 0;
}

test('economy re-init on a live bus fires a credit intent once, not per past registration', () => {
  const { bus, state, ctx } = boot();
  try {
    economy.init(ctx);
    economy.init(ctx); // registry re-initialization is a legal path
    economy.init(ctx);
    assert.equal(listenerCount(bus, 'economy:grantCredits'), 1, 'one grant binding after two re-inits');
    assert.equal(listenerCount(bus, 'economy:chargeCredits'), 1, 'one charge binding after two re-inits');
    assert.equal(listenerCount(bus, 'day:tick'), 1);

    const before = state.player.credits;
    bus.emit('economy:grantCredits', { amount: 100, reason: 'test' });
    assert.equal(state.player.credits, before + 100, 'grant applied exactly once');

    bus.emit('economy:chargeCredits', { amount: 30, reason: 'test' });
    assert.equal(state.player.credits, before + 100 - 30, 'charge applied exactly once');
  } finally {
    economy.destroy();
  }
});

test('economy destroy() drains its bus bindings', () => {
  const { bus, state, ctx } = boot();
  economy.init(ctx);
  economy.destroy();
  try {
    assert.equal(listenerCount(bus, 'economy:grantCredits'), 0);
    const before = state.player.credits;
    bus.emit('economy:grantCredits', { amount: 100, reason: 'test' });
    assert.equal(state.player.credits, before, 'no listener survives destroy');
  } finally {
    economy._unsubs = []; // belt: the singleton must not retain spent offs between tests
  }
});

test('claims re-init keeps each handler bound once (two sector:enter rows, never four)', () => {
  const { bus, ctx } = boot();
  try {
    claims.init(ctx);
    claims.init(ctx);
    assert.equal(listenerCount(bus, 'sector:enter'), 2, 'claims registers two sector:enter handlers per init');
    assert.equal(listenerCount(bus, 'economy:tradeCompleted'), 1);
    assert.equal(listenerCount(bus, 'claim:convoyDocked'), 1);
  } finally {
    claims.destroy();
    assert.equal(listenerCount(bus, 'claim:convoyDocked'), 0);
  }
});

test('gamepad.destroy() drains the bus listeners createGamepad registered', () => {
  const { bus, state } = boot();
  const gp = createGamepad({ state, bus });
  assert.ok(listenerCount(bus, 'tether:latched') >= 1, 'haptic verb listeners attached');
  assert.ok(listenerCount(bus, 'combat:collisionConsequence') >= 1);
  gp.destroy();
  assert.equal(listenerCount(bus, 'tether:latched'), 0);
  assert.equal(listenerCount(bus, 'combat:collisionConsequence'), 0);
});
