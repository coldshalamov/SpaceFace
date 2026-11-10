import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { applyPirateDisguise } from '../src/data/pirateDisguise.js';
import { pirateDisguise } from '../src/systems/pirateDisguise.js';

function thiefAt(id, x) {
  return {
    id, type: 'ship', alive: true, team: 1,
    pos: { x, z: 0 }, vel: { x: 0, z: 0 },
    factionId: 'faction_reach',
    data: {
      ai: { doctrine: 'thief', archetype: 'pirate_raider', passive: false },
    },
  };
}

test('a scan pulse blows a disguised thief and flips them hostile', () => {
  const state = createGameState(47);
  state.playerId = 1;
  state.player.team = 0;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, data: {},
  };
  const raider = thiefAt(2, 80);
  const disguise = applyPirateDisguise(raider, { seed: 47, key: 'raid' });
  assert.ok(disguise);
  assert.equal(disguise.disguised, true);
  assert.equal(raider.team, 2, 'before the scan the hull reads as civilian traffic');

  state.entities.set(1, player);
  state.entities.set(2, raider);
  state.entityList = [player, raider];
  const bus = createBus();
  const revealed = [];
  bus.on('pirateDisguise:revealed', (p) => revealed.push(p));
  const system = Object.create(pirateDisguise);
  system.init({ state, bus, helpers: {} });
  try {
    bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
    assert.equal(revealed.length, 1);
    assert.equal(raider.data.disguiseBlown, true);
    assert.equal(raider.team, 1);
    assert.equal(raider.data.ai.forcePlayerTarget, true);
    assert.equal(raider.data.ai.huntPlayer, true);
    assert.ok(raider.data.ai.hostileTeams.includes(0));
  } finally {
    system.destroy?.();
    bus.clear();
  }
});

test('an already-blown disguise is not revealed twice', () => {
  const state = createGameState(48);
  const raider = thiefAt(2, 40);
  applyPirateDisguise(raider, { seed: 48, key: 'raid' });
  raider.data.disguiseBlown = true;
  state.entityList = [raider];
  const bus = createBus();
  const revealed = [];
  bus.on('pirateDisguise:revealed', (p) => revealed.push(p));
  const system = Object.create(pirateDisguise);
  system.init({ state, bus, helpers: {} });
  try {
    bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
    assert.equal(revealed.length, 0);
  } finally {
    system.destroy?.();
    bus.clear();
  }
});
