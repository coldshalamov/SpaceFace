// I023 — a doctrine tell is keyed by the enemy's entity id and keeps its slot
// after the run's entities are gone. Retry must release that one loop.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { vfx } from '../src/render/vfx.js';
import { crucibleSetupFor, requestCrucibleRun } from '../src/ui/crucibleLaunch.js';

function activeTells(fx) {
  return fx.inspect().doctrineTells.active;
}

test('five crucible retries release the doctrine-tell loop back to its pre-run count', () => {
  const state = createGameState(4242);
  const bus = createBus();
  const fx = Object.create(vfx);
  fx.init({ state, bus, helpers: {} });
  fx._scene = {};
  // The slot is the loop. Drawing the pulse, and the action-vfx batch that also
  // hears this cue, are not — a fake scene has no add().
  fx._spawnDoctrineTellPulse = () => {};
  fx._onActionVfx = () => {};
  state.tick = 20;
  const before = activeTells(fx);
  try {
    const setup = crucibleSetupFor({ starterId: 'energy_baseline', seed: 4242 });
    assert.equal(setup.ok, true);
    for (let i = 0; i < 5; i++) {
      bus.emit('ai:telegraph', {
        entityId: 100 + i,
        kind: 'detonator_fuse',
        durationTicks: 90,
        tick: state.tick,
      });
      assert.ok(activeTells(fx) > before, `tell ${i} starts`);
      assert.equal(requestCrucibleRun(bus, setup.value), true);
      fx._updateDoctrineTells(1 / 60);
      assert.equal(activeTells(fx), before, `retry ${i + 1} still holds the previous tell`);
    }
    bus.emit('ai:telegraph', {
      entityId: 900,
      kind: 'detonator_fuse',
      durationTicks: 90,
      tick: state.tick,
    });
    assert.equal(activeTells(fx), before + 1, 'a tell started after restart stays until its own deadline');
  } finally {
    fx.destroy();
  }
});
