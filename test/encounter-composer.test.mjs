// R19 / 03_COMBAT §9A: one composer builds every fight from a cast, an entrance, a formation and
// a budget, and names the cast in plain words. The first ten Swarm rounds are ten different casts
// with ten different best answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeEncounter, describeCast, castAnswer } from '../src/systems/encounterComposer.js';
import { ENEMY_JOBS, enemyJobFor } from '../src/data/enemyJobs.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { swarmCastFor } from '../src/data/swarmCourseCast.js';

test('every enemy kind in the game has exactly one job row', () => {
  for (const row of ENEMY_TYPES) {
    assert.ok(ENEMY_JOBS[row.id], `${row.id} has a job row`);
  }
});

test('a recipe composes into packages that land each group as one event, with its jobs', () => {
  const plan = composeEncounter({ id: 't', name: 'Test', groups: [
    { cast: [{ enemyId: 'bruiser_brawler', count: 1 }, { enemyId: 'wasp_swarmer', count: 4 }],
      entrance: { gateIndex: 2, atTick: 30 }, formation: 'escort' },
  ] });
  assert.equal(plan.packages.length, 2);
  assert.equal(plan.packages[0].gateIndex, 2);
  assert.equal(plan.packages[1].gate, 'same', 'the pack follows its heavy on the same bearing');
  assert.equal(plan.packages[1].atTick, 42);
  assert.deepEqual([...plan.jobs], ['wall', 'rush']);
  assert.equal(plan.cost, enemyJobFor('bruiser_brawler').cost + 4 * enemyJobFor('wasp_swarmer').cost);
  assert.match(describeCast([{ enemyId: 'mine_layer_jackal' }, { enemyId: 'detonator_dart' }]), /fills space with danger/);
});

test('the first ten Swarm rounds are ten different casts with ten different best answers', () => {
  const casts = new Set();
  const answers = new Set();
  for (let round = 1; round <= 10; round++) {
    const cast = swarmCastFor(round);
    assert.ok(cast && cast.plan, `round ${round} is a composed recipe`);
    assert.ok(cast.plan.line.length > 0, `round ${round} names its cast in plain words`);
    assert.ok(cast.answer && cast.answer.length > 0, `round ${round} names its best answer`);
    casts.add(JSON.stringify(cast.packages.map((p) => [p.enemyId, p.count])));
    answers.add(cast.answer);
  }
  assert.equal(casts.size, 10, 'ten different casts');
  assert.equal(answers.size, 10, 'ten different best answers');
  assert.ok(castAnswer(swarmCastFor(8).plan).length > 0);
});
