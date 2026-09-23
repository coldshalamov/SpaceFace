import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { cycleTarget, clearCombatTarget, targetNearestHostileToPlayer } from '../src/ui/uiRoot.js';
import { createAutoTargetRuntime, tickAutoTarget } from '../src/combat/autoTargetMode.js';

function scene() {
  const state = createGameState(0x7ab);
  const player = { id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0 };
  const near = { id: 2, type: 'ship', alive: true, team: 1,
    pos: { x: 120, z: 0 }, vel: { x: 0, z: 24 }, data: { ai: { huntPlayer: true } } };
  const far = { id: 3, type: 'ship', alive: true, team: 1,
    pos: { x: 180, z: 30 }, vel: { x: 0, z: 0 }, data: { ai: { huntPlayer: true } } };
  state.mode = 'flight';
  state.playerId = player.id;
  state.entities = new Map([[player.id, player], [near.id, near], [far.id, far]]);
  state.entityList = [player, near, far];
  state.input.aimWorld = { x: 35, z: -20 };
  const messages = [];
  const bus = { emit(name, payload) { messages.push({ name, payload }); } };
  return { state, player, near, far, bus, messages };
}

test('combat target leads guns by default without engaging draw-to-fly', () => {
  const { state, near, bus } = scene();
  targetNearestHostileToPlayer(state, bus, { quiet: true });
  assert.equal(state.player.targetId, near.id);
  tickAutoTarget(state, 1 / 60, bus, createAutoTargetRuntime());
  assert.equal(state.input.autoAim?.targetId, near.id);
  assert.equal(state.input.autoFire, false);
  assert.equal(state.input.drawFlight, undefined);
  assert.deepEqual(state.input.aimWorld, { x: 35, z: -20 }, 'manual Massline cursor stays physical');
  assert(state.input.aimAngle > 0, 'guns lead the moving target');
});

test('Tab cycles enemies, then releases to free aim until Tab reacquires', () => {
  const { state, near, far, bus } = scene();
  targetNearestHostileToPlayer(state, bus, { quiet: true });
  assert.equal(state.player.targetId, near.id);
  cycleTarget(state, 1, bus);
  assert.equal(state.player.targetId, far.id);
  cycleTarget(state, 1, bus);
  assert.equal(state.player.targetId, null);
  assert.equal(state.input.targetAssistDisabled, true);
  targetNearestHostileToPlayer(state, bus, { quiet: true });
  tickAutoTarget(state, 1 / 60, bus, createAutoTargetRuntime());
  assert.equal(state.input.autoAim, undefined);
  cycleTarget(state, 1, bus);
  assert.equal(state.player.targetId, near.id);
  assert.equal(state.input.targetAssistDisabled, false);
  clearCombatTarget(state, bus);
  assert.equal(state.player.targetId, null);
  assert.equal(state.input.targetAssistDisabled, true);
});

test('reverse Tab from the first enemy releases immediately', () => {
  const { state, near, bus } = scene();
  state.player.targetId = near.id;
  cycleTarget(state, -1, bus);
  assert.equal(state.player.targetId, null);
  assert.equal(state.input.targetAssistDisabled, true);
});
