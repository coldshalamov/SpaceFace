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

function lastStand(count, elapsed) {
  const sys = Object.create(proto);
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 } };
  const entities = new Map([[1, player]]);
  const cohort = new Map();
  for (let i = 0; i < count; i++) {
    const id = 10 + i;
    const enemy = { id, alive: true, type: 'ship', pos: { x: 500, z: i * 40 }, data: { runCohort: 'survival', ai: { combatDoctrineId: 'pack_pursuit' } } };
    entities.set(id, enemy);
    cohort.set(id, { entity: enemy });
  }
  sys.state = { playerId: 1, entities };
  sys._swarm = { killTarget: true };
  sys._admittedTotal = 15;
  sys._plannedBodies = 15;
  sys._pending = [];
  sys._bossIds = new Set();
  sys._cohort = cohort;
  sys._elapsedSeconds = () => elapsed;
  sys._durationSeconds = () => 60;
  sys._commitLastStand();
  return [...cohort.values()].map((m) => m.entity.data.ai.combatDoctrineId);
}

test('once the round clock is spent the last few survivors commit to the pilot', () => {
  assert.deepEqual(lastStand(3, 61), ['brawler_commit', 'brawler_commit', 'brawler_commit']);
});

test('the pack keeps its own doctrine while the clock runs or while many remain', () => {
  assert.deepEqual(lastStand(3, 30), ['pack_pursuit', 'pack_pursuit', 'pack_pursuit']);
  assert.ok(lastStand(5, 90).every((d) => d === 'pack_pursuit'));
});
