// W2-C / O21: the straggler release was disarmed whenever more than two hulls were still
// actionable, so three or more stranded hulls held a won round open forever. Hulls past the
// leash are off screen whatever their number; the grace timer alone decides.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as mod from '../src/systems/survivalWave.js';

const proto = Object.values(mod).find((v) => v && typeof v === 'object' && typeof v._releaseStragglers === 'function');
const TICKS_PER_SECOND = 60;
const GRACE_TICKS = 8 * TICKS_PER_SECOND;

function wave(positions) {
  const sys = Object.create(proto);
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 } };
  const entities = new Map([[1, player]]);
  const cohort = new Map();
  positions.forEach((pos, i) => {
    const id = 20 + i;
    const enemy = { id, alive: true, type: 'ship', pos: { ...pos }, data: { runCohort: 'survival' } };
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

test('five stranded hulls beyond the leash all break off within the grace window plus ten seconds', () => {
  const { sys, removed, cohort } = wave([
    { x: 2500, z: 0 }, { x: 3000, z: 100 }, { x: -2600, z: 40 }, { x: 0, z: 4000 }, { x: 5000, z: -300 },
  ]);
  const budget = GRACE_TICKS + 10 * TICKS_PER_SECOND;
  let clearedAt = null;
  for (let tick = 1; tick <= budget; tick++) {
    sys._releaseStragglers();
    if (cohort.size === 0) { clearedAt = tick; break; }
  }
  assert.ok(clearedAt != null, 'the stranded tail resolved inside grace + 10 s');
  assert.ok(clearedAt >= GRACE_TICKS, 'not before the grace window');
  assert.equal(removed.length, 5);
});

test('the grace timer still protects a hull that comes back inside the leash', () => {
  const { sys, removed } = wave([
    { x: 2500, z: 0 }, { x: 3000, z: 100 }, { x: -2600, z: 40 },
  ]);
  for (let tick = 0; tick < GRACE_TICKS - 5; tick++) sys._releaseStragglers();
  assert.deepEqual(removed, []);
  sys.state.entities.get(20).pos.x = 600; // one hull returns to the fight
  for (let tick = 0; tick < 20; tick++) sys._releaseStragglers();
  assert.deepEqual(removed.sort(), [21, 22], 'the two still stranded break off; the returnee keeps its slot');
  assert.ok(sys._cohort.has(20));
});

test('hulls inside the leash are never released however many there are', () => {
  const { sys, removed } = wave(Array.from({ length: 6 }, (_, i) => ({ x: 400 + i * 50, z: 0 })));
  for (let tick = 0; tick < GRACE_TICKS * 2; tick++) sys._releaseStragglers();
  assert.deepEqual(removed, []);
});
