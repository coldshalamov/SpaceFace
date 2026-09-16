// First bomb drop teaches itself once: the player's first released drift bomb fires
// a one-shot first-use hint through the same mechanism as the other first-time
// lessons. NPC drops must never spend the player's lesson.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { onboarding } from '../src/systems/onboarding.js';
import { firstUseLine } from '../src/ui/hudAttention.js';

function boot() {
  const state = createGameState(7);
  state.onboarding = { active: false, finished: true };
  if (!state.player.hints) state.player.hints = {};
  const bus = createBus();
  const seen = [];
  bus.on('hud:firstUse', (p) => seen.push(p));
  const system = Object.create(onboarding);
  system.init({ state, bus, helpers: {} });
  return { state, bus, seen };
}

test('first player bomb drop shows the one-shot hint', () => {
  assert.equal(firstUseLine('firstBombDrop'), 'Bomb away. Clear the blast.');
  const { state, bus, seen } = boot();
  bus.emit('bombs:dropped', {
    schemaVersion: 1, bombId: 'b1', payloadId: 'bomb_frag',
    ownerId: state.playerId, pos: { x: 0, z: 0 }, radius: 60, trigger: 'fuze',
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].verbId, 'firstBombDrop');
  assert.equal(seen[0].text, 'Bomb away. Clear the blast.');
  assert.equal(state.player.hints.firstBombDrop, true);
  bus.emit('bombs:dropped', {
    schemaVersion: 1, bombId: 'b2', payloadId: 'bomb_frag',
    ownerId: state.playerId, pos: { x: 10, z: 0 }, radius: 60, trigger: 'fuze',
  });
  assert.equal(seen.length, 1, 'the lesson fires once');
});

test("another ship's drop does not spend the player's lesson", () => {
  const { state, bus, seen } = boot();
  bus.emit('bombs:dropped', {
    schemaVersion: 1, bombId: 'b9', payloadId: 'bomb_frag',
    ownerId: 'npc-raider-1', pos: { x: 0, z: 0 }, radius: 60, trigger: 'fuze',
  });
  assert.equal(seen.length, 0);
  assert.equal(state.player.hints.firstBombDrop || false, false);
});
