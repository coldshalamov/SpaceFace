import test from 'node:test';
import assert from 'node:assert/strict';
import * as mod from '../src/systems/survivalWave.js';

const proto = Object.values(mod).find((v) => v && typeof v === 'object' && typeof v._releaseStragglers === 'function');

function wave(enemyPos) {
  const sys = Object.create(proto);
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 } };
  const enemy = { id: 7, alive: true, type: 'ship', pos: { ...enemyPos }, data: { runCohort: 'survival' } };
  const removed = [];
  sys.state = { playerId: 1, entities: new Map([[1, player], [7, enemy]]) };
  sys.helpers = { removeEntity: (id) => removed.push(id) };
  sys._swarm = { killTarget: true };
  sys._admittedTotal = 15;
  sys._plannedBodies = 15;
  sys._pending = [];
  sys._bossIds = new Set();
  sys._cohort = new Map([[7, { entity: enemy }]]);
  return { sys, enemy, removed };
}

test('a lone straggler far behind the pilot breaks off after the grace window', () => {
  const { sys, removed } = wave({ x: 4000, z: 0 });
  for (let i = 0; i < 8 * 60 - 1; i++) sys._releaseStragglers();
  assert.deepEqual(removed, [], 'not before the grace window');
  sys._releaseStragglers();
  assert.deepEqual(removed, [7]);
});

test('a straggler in range keeps the round open', () => {
  const { sys, removed } = wave({ x: 600, z: 0 });
  for (let i = 0; i < 20 * 60; i++) sys._releaseStragglers();
  assert.deepEqual(removed, []);
});
