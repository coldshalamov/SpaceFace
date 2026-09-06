import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { MASSLINE2_FLAGS, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { bulletTime } from '../src/systems/bulletTime.js';

function boot() {
  const snap = snapshotFeatureMaps();
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.bulletTime = true;
  const state = createGameState(47);
  state.mode = 'flight';
  state.input.actions = { bulletTime: false };
  const bus = createBus();
  const timeEffects = createTimeEffects(state);
  const system = Object.create(bulletTime);
  system.init({ state, bus, timeEffects, helpers: {} });
  return { state, bus, system, timeEffects, snap };
}

test('holding bullet-time engages the time-effects source at 0.35', () => {
  const { state, bus, system, timeEffects, snap } = boot();
  try {
    state.input.actions.bulletTime = true;
    system.update(1 / 60, state);
    assert.equal(state.massline2.bulletTime.active, true);
    assert.equal(timeEffects.getEffectiveScale(), 0.35);

    state.input.actions.bulletTime = false;
    system.update(1 / 60, state);
    assert.equal(state.massline2.bulletTime.active, false);
    assert.equal(timeEffects.getEffectiveScale(), 1);
  } finally {
    system.destroy?.();
    bus.clear();
    restoreFeatureMaps(snap);
  }
});

test('an empty meter cannot re-engage until the verb is released', () => {
  const { state, bus, system, snap } = boot();
  try {
    state.massline2 = { bulletTime: { active: false, energy: 0.05 } };
    state.input.actions.bulletTime = true;
    system.update(1 / 60, state);
    assert.equal(state.massline2.bulletTime.active, false, 'below engage floor must refuse');
  } finally {
    system.destroy?.();
    bus.clear();
    restoreFeatureMaps(snap);
  }
});
