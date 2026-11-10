// Distant pursuit applies to every actionable survivor without resolving its cohort slot.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as mod from '../src/systems/survivalWave.js';

const proto = Object.values(mod).find((v) => v && typeof v === 'object' && typeof v._commitStragglers === 'function');
const TICKS_PER_SECOND = 60;
const GRACE_TICKS = 8 * TICKS_PER_SECOND;

function wave(positions) {
  const sys = Object.create(proto);
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 } };
  const entities = new Map([[1, player]]);
  const cohort = new Map();
  positions.forEach((pos, i) => {
    const id = 20 + i;
    const enemy = { id, alive: true, type: 'ship', pos: { ...pos }, data: { runCohort: 'survival', ai: { combatDoctrineId: 'pack_pursuit' } } };
    entities.set(id, enemy);
    cohort.set(id, { entity: enemy });
  });
  const removed = [];
  sys.state = { playerId: 1, entities };
  sys.helpers = {
    // The production remove path ends in entity:destroyed, which resolves the cohort slot.
    removeEntity: (id) => {
      const entity = entities.get(id);
      removed.push(id);
      entity.alive = false;
      entities.delete(id);
      sys._onEntityDestroyed({ id, entity });
    },
  };
  sys._swarm = { killTarget: true };
  sys._admittedTotal = 15;
  sys._plannedBodies = 15;
  sys._pending = [];
  sys._bossIds = new Set();
  sys._cohort = cohort;
  sys._resolved = 0;
  sys._publishThreat = () => {};
  sys._noteCircuitResolution = () => {};
  return { sys, removed, cohort };
}

test('five distant hulls commit after the grace period without resolving', () => {
  const { sys, removed, cohort } = wave([
    { x: 2500, z: 0 }, { x: 3000, z: 100 }, { x: -2600, z: 40 }, { x: 0, z: 4000 }, { x: 5000, z: -300 },
  ]);
  for (let tick = 1; tick < GRACE_TICKS; tick++) sys._commitStragglers();
  assert.ok([...cohort.values()].every(({ entity }) => entity.data.ai.combatDoctrineId === 'pack_pursuit'));
  sys._commitStragglers();
  assert.equal(cohort.size, 5);
  assert.deepEqual(removed, []);
  assert.ok([...cohort.values()].every(({ entity }) => entity.alive && entity.data.ai.combatDoctrineId === 'brawler_commit'));
});

test('the grace timer still protects a hull that comes back inside the leash', () => {
  const { sys, removed } = wave([
    { x: 2500, z: 0 }, { x: 3000, z: 100 }, { x: -2600, z: 40 },
  ]);
  for (let tick = 0; tick < GRACE_TICKS - 5; tick++) sys._commitStragglers();
  assert.deepEqual(removed, []);
  sys.state.entities.get(20).pos.x = 600; // one hull returns to the fight
  for (let tick = 0; tick < 20; tick++) sys._commitStragglers();
  assert.deepEqual(removed, []);
  assert.equal(sys.state.entities.get(20).data.ai.combatDoctrineId, 'pack_pursuit');
  assert.equal(sys.state.entities.get(21).data.ai.combatDoctrineId, 'brawler_commit');
  assert.equal(sys.state.entities.get(22).data.ai.combatDoctrineId, 'brawler_commit');
});

test('hulls inside the leash are never released however many there are', () => {
  const { sys, removed } = wave(Array.from({ length: 6 }, (_, i) => ({ x: 400 + i * 50, z: 0 })));
  for (let tick = 0; tick < GRACE_TICKS * 2; tick++) sys._commitStragglers();
  assert.deepEqual(removed, []);
});
