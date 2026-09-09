import assert from 'node:assert/strict';
import test from 'node:test';

import { collectAttackCandidates } from '../src/combat/attackHit.js';

test('chain candidates use live hostility rather than treating every team mismatch as an enemy', () => {
  const player = {
    id: 'player',
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    data: {},
  };
  const neutralPatrol = {
    id: 'neutral',
    type: 'ship',
    team: 2,
    alive: true,
    pos: { x: 10, z: 0 },
    data: { ai: { lawful: true, passive: true } },
  };
  const hostile = {
    id: 'hostile',
    type: 'ship',
    team: 1,
    alive: true,
    pos: { x: 20, z: 0 },
    data: { encounter: true },
  };
  const entityList = [player, neutralPatrol, hostile];
  const state = {
    playerId: player.id,
    entityList,
    entities: new Map(entityList.map((entity) => [entity.id, entity])),
  };

  const candidates = collectAttackCandidates(
    state,
    player.pos,
    100,
    [],
    player.id,
    player.team,
  );

  assert.deepEqual(candidates.map((candidate) => candidate.id), ['hostile']);
});
