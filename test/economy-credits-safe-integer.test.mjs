import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { economy as economyBase } from '../src/systems/economy.js';

const ABOVE_INT32 = 2 ** 31; // 2147483648 — `(n | 0)` wraps this to -2147483648

function boot(credits) {
  const bus = createBus();
  const state = {
    meta: { seed: 1 },
    simTime: 0,
    player: {
      credits,
      bounty: 0,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 },
      stats: {},
    },
  };
  const sys = { ...economyBase };
  sys.init({ state, bus, helpers: {}, registry: null });
  return { state, bus, sys };
}

test('granting 1 credit above 2^31 grows the balance instead of wrapping to 0', () => {
  const { state, sys } = boot(ABOVE_INT32);
  const after = sys.grantCredits(1, 'test:int32-wrap');
  assert.equal(after, ABOVE_INT32 + 1);
  assert.equal(state.player.credits, ABOVE_INT32 + 1);
});

test('charging 1 credit above 2^31 leaves a fortune instead of wiping it', () => {
  const { state, sys } = boot(ABOVE_INT32);
  const after = sys.chargeCredits(1, 'test:int32-wrap');
  assert.equal(after, ABOVE_INT32 - 1);
  assert.equal(state.player.credits, ABOVE_INT32 - 1);
});

test('a rich player can pay a bounty without the signed-32 check rejecting them', () => {
  const { state, sys } = boot(ABOVE_INT32);
  state.player.bounty = 1;
  const result = sys.payBounty({ source: 'test:int32-wrap' });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'paid');
  assert.equal(state.player.credits, ABOVE_INT32 - 1);
  assert.equal(state.player.bounty, 0);
});
