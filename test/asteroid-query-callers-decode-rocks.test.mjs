import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { requestDecodeRunwayPromote } from '../src/world/presentationSources.js';

test('decode-runway promote reports field presence without spatial rock query', () => {
  const state = createGameState();
  state.playerId = 1;
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, maxSpeed: 160, radius: 8, data: {},
  };
  state.entities = new Map([[1, player]]);
  state.entityList = [player];
  insertAsteroidFieldRock(state, {
    id: 9001, pos: { x: 40, z: 0 }, radius: 8,
    data: { typeId: 'ast_common_rock' },
  });
  const result = requestDecodeRunwayPromote(state, null);
  assert.ok(result.rocksSeen >= 1, 'presence telegraph without cell walk');
  assert.equal(result.rocksPromoted, 0);
});
