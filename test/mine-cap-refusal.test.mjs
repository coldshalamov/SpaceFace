import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { audio, MINE_CAP_REFUSAL_RECIPE } from '../src/audio/audioSystem.js';
import { mines, MINE_OWNER_CAP } from '../src/systems/mines.js';

const SEED = 4242;

test('FIGHT-07: MINE_CAP_REFUSAL_RECIPE uses the physical refusal voice, not the UI error blip', () => {
  assert.equal(MINE_CAP_REFUSAL_RECIPE, 'sfx_massline_deny');
  assert.notEqual(MINE_CAP_REFUSAL_RECIPE, 'sfx_ui_error', 'must not collapse to UI error blip');
});

test('FIGHT-07: on seed 4242 mines:capReached routes to refusal voice with cap in caption', () => {
  const state = createGameState(SEED);
  const bus = createBus();
  const player = { id: 1, pos: { x: 0, z: 0 }, team: 0 };
  state.playerId = player.id;
  state.entities = new Map([[player.id, player]]);
  state.entityList = [player];

  const ear = Object.create(audio);
  const plays = [];
  const captions = [];

  ear.init({ state, bus });
  ear.play = (id, opts) => {
    plays.push({ id, opts });
    return { recipeId: id };
  };

  bus.on('presentation:caption', (c) => captions.push(c));

  // 1. Direct mines:capReached event test
  bus.emit('mines:capReached', { ownerId: player.id, cap: MINE_OWNER_CAP });
  bus.flush();

  assert.equal(plays.length, 1);
  assert.equal(plays[0].id, 'sfx_massline_deny', 'refusal voice must be played');
  assert.equal(captions.length, 1, 'caption must be emitted');
  assert.ok(captions[0].text.includes(String(MINE_OWNER_CAP)), 'caption must include the cap number');
  assert.equal(captions[0].channel, 'refusal');

  // 2. Integration test through mines system placement at cap
  plays.length = 0;
  captions.length = 0;

  let spawnedIdCounter = 10;
  const spawnedEntities = [];
  const minesSys = Object.create(mines);
  minesSys.init({
    state,
    bus,
    helpers: {
      spawnEntity: (def) => {
        const ent = { id: ++spawnedIdCounter, alive: true, ...def };
        spawnedEntities.push(ent);
        state.entities.set(ent.id, ent);
        state.entityList.push(ent);
        return ent;
      },
    },
  });

  // Place mines up to cap (6 mines)
  for (let i = 0; i < MINE_OWNER_CAP; i++) {
    const placed = minesSys.placeMine({ ownerId: player.id, pos: { x: i * 20, z: 0 }, team: 0 });
    assert.ok(placed, `mine ${i + 1} should be placed`);
  }
  bus.flush();
  assert.equal(plays.length, 0, 'successful placements do not trigger refusal');

  // Attempting the 7th mine past the cap
  const refused = minesSys.placeMine({ ownerId: player.id, pos: { x: 999, z: 0 }, team: 0 });
  bus.flush();

  assert.equal(refused, null, 'placement past cap must return null');
  assert.equal(plays.length, 1, 'refusal voice must be played on cap hit');
  assert.equal(plays[0].id, 'sfx_massline_deny');
  assert.equal(captions.length, 1, 'refusal caption must be emitted on cap hit');
  assert.ok(captions[0].text.includes(String(MINE_OWNER_CAP)), 'caption must contain cap number');
  assert.equal(captions[0].assertive, true);

  ear.destroy();
});
