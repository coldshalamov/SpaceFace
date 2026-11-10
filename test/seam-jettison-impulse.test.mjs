import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { MASSLINE2_FLAGS, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { jettisonImpulse } from '../src/systems/jettisonImpulse.js';

function boot({ flagOn = true } = {}) {
  const snap = snapshotFeatureMaps();
  MASSLINE2_FLAGS.enabled = flagOn;
  MASSLINE2_FLAGS.jettisonImpulse = flagOn;
  const state = createGameState(47);
  state.mode = 'flight';
  state.playerId = 1;
  state.tick = 10;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, mass: 18, flags: {},
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const impulses = [];
  const system = Object.create(jettisonImpulse);
  system.init({
    state,
    bus,
    helpers: {
      combatPhysics: {
        applyImpulse(req) { impulses.push(req); },
      },
    },
  });
  return { state, bus, system, impulses, snap };
}

test('dumping ore mass kicks the hull through the physics impulse seam', () => {
  const { bus, system, impulses, snap } = boot({ flagOn: true });
  try {
    bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 8 });
    assert.equal(impulses.length, 1, 'jettison of real mass must apply an impulse');
    assert.equal(impulses[0].reason, 'cargo_jettison');
    assert.equal(impulses[0].entityId, 1);
    const mag = Math.hypot(impulses[0].impulse.x, impulses[0].impulse.z);
    assert.ok(mag > 0.5, `impulse magnitude ${mag} must be a kick, not a token`);
  } finally {
    system.destroy?.();
    bus.clear();
    restoreFeatureMaps(snap);
  }
});

test('jettison impulse is inert when the massline-2 flag is off', () => {
  const { bus, system, impulses, snap } = boot({ flagOn: false });
  try {
    bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 8 });
    assert.equal(impulses.length, 0);
  } finally {
    system.destroy?.();
    bus.clear();
    restoreFeatureMaps(snap);
  }
});
