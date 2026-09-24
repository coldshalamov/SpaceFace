// Phase 5.3 — the first swarm minute hands one light hull before the pack.
// The pack is the same bodies, held for 45 seconds. A run that does not ask for the lesson
// still opens at pressure.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SWARM_RULESET, swarmOpeningCount } from '../src/data/swarmMode.js';
import { OPENING_LESSON_HOLD_TICKS, planWave } from '../src/systems/survivalWavePlanner.js';

const BASE = Object.freeze({
  seed: 4242,
  arenaId: 'helios_core',
  wave: 1,
  ruleset: SWARM_RULESET,
});

test('a swarm wave that was not asked to teach still opens inside the first half-second', () => {
  const plan = planWave(BASE);
  assert.equal(plan.error, undefined);
  assert.equal(plan.openingLesson, undefined);
  assert.ok(plan.schedule.some((entry) => entry.atTick < 24));
});

test('the opening lesson keeps the body count and holds the pack for 45 seconds', () => {
  const plain = planWave(BASE);
  const taught = planWave({ ...BASE, teachOpening: true });
  assert.equal(swarmOpeningCount(taught.packages), swarmOpeningCount(plain.packages),
    'the lesson must not add a body to the budget');
  assert.equal(taught.openingLesson.holdTicks, OPENING_LESSON_HOLD_TICKS);
  assert.equal(OPENING_LESSON_HOLD_TICKS, 45 * 60);
  const early = taught.schedule.filter((entry) => entry.atTick === 0);
  assert.equal(early.length, 1);
  assert.equal(early[0].enemyId, 'wasp_swarmer');
  assert.equal(early[0].count, 1);
  assert.equal(early[0].distance, 90);
  assert.ok(taught.schedule.filter((entry) => entry !== early[0]).every(
    (entry) => entry.atTick >= OPENING_LESSON_HOLD_TICKS,
  ));
  assert.equal(taught.openingLesson.rock.radius, 6);
  assert.equal(taught.openingLesson.well.radius, 96);
  assert.equal(
    taught.swarm.durationTicks,
    plain.swarm.durationTicks + OPENING_LESSON_HOLD_TICKS,
    'the pack still gets a full wave after the lesson',
  );

  const second = planWave({ ...BASE, wave: 2, teachOpening: true });
  assert.equal(second.openingLesson, undefined, 'only the first wave teaches');
});
