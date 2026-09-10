// PQ-175.00 — every wave asks a question. Seed family 17500.
// Validator: each recipe names a physical question and a PQ-174.03 verb.
// Planner: a long generated run never schedules two consecutive waves with the same question.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SURVIVAL_ARC_LENGTH } from '../src/data/survivalActs.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import {
  SURVIVAL_ANSWER_VERBS,
  SURVIVAL_TEMPLATE_QUESTIONS,
  SURVIVAL_WAVES,
  catalogQuestionIssues,
  consecutiveQuestionIssues,
  questionForGeneratedPlan,
  templateQuestionOf,
  validateWaveRecipe,
} from '../src/data/survivalWaves.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const SEED = 17500;
const SWARM_SEEDS = Object.freeze([17500, 17501, 17502]);
const ARENA = 'helios_core';
const TEMPLATE_WAVES = 10;
const LONG_SWARM = 80;
const LONG_ENDLESS = 90;

function planQuestion(wave, ruleset) {
  const plan = planWave({
    seed: SEED,
    arenaId: ARENA,
    wave,
    ruleset,
  });
  assert.notEqual(plan && plan.ok, false, `plan ${ruleset} wave ${wave}`);
  const asked = questionForGeneratedPlan(plan, wave);
  assert.ok(asked && asked.id, `${ruleset} wave ${wave} missing question`);
  return asked;
}

test('PQ-175.00: every authored recipe declares a question and a 174.03 verb', () => {
  assert.equal(Object.keys(SURVIVAL_TEMPLATE_QUESTIONS).length, TEMPLATE_WAVES);
  const templateIds = Object.values(SURVIVAL_TEMPLATE_QUESTIONS).map((row) => row.id);
  assert.equal(new Set(templateIds).size, TEMPLATE_WAVES);
  assert.deepEqual(consecutiveQuestionIssues(templateIds), []);
  assert.deepEqual(catalogQuestionIssues(), []);

  assert.equal(SURVIVAL_WAVES.length, 70);
  for (const recipe of SURVIVAL_WAVES) {
    const result = validateWaveRecipe(recipe);
    assert.equal(result.ok, true, `${recipe.id}: ${JSON.stringify(result.issues)}`);
    const asked = SURVIVAL_TEMPLATE_QUESTIONS[recipe.wave];
    assert.equal(recipe.questionId, asked.id, recipe.id);
    assert.equal(recipe.question, asked.question, recipe.id);
    assert.equal(recipe.answerVerb, asked.answerVerb, recipe.id);
    assert.ok(SURVIVAL_ANSWER_VERBS.includes(recipe.answerVerb), recipe.answerVerb);
    assert.ok(!recipe.question.includes('\n'), recipe.id);
    assert.ok(recipe.question.length >= 24, recipe.id);
  }
});

test('PQ-175.00: validator rejects a recipe with no question', () => {
  const base = SURVIVAL_WAVES[0];
  const stripped = {
    ...base,
    questionId: '',
    question: '',
    answerVerb: 'guns',
  };
  const result = validateWaveRecipe(stripped);
  assert.equal(result.ok, false);
  const paths = result.issues.map((row) => row.path);
  assert.ok(paths.includes('questionId'));
  assert.ok(paths.includes('question'));
  assert.ok(paths.includes('answerVerb'));
});

test('PQ-175.00: thirty-wave arc seed 17500 never repeats a question in a row', () => {
  const ids = [];
  const verbs = [];
  for (let wave = 1; wave <= SURVIVAL_ARC_LENGTH; wave += 1) {
    const asked = planQuestion(wave, 'arc');
    const expected = templateQuestionOf(wave);
    assert.equal(asked.id, expected.id, `wave ${wave}`);
    assert.equal(asked.answerVerb, expected.answerVerb, `wave ${wave}`);
    ids.push(asked.id);
    verbs.push(asked.answerVerb);
  }
  const issues = consecutiveQuestionIssues(ids);
  assert.deepEqual(issues, [], JSON.stringify(issues));
  assert.equal(ids[19], 'plate_theft');
  assert.equal(verbs[19], 'well');
  console.log(`ARC_17500 questions=${ids.join(' > ')}`);
});

test('PQ-175.00: endless seed 17500 waves 31-90 never repeats a question in a row', () => {
  const ids = [];
  for (let wave = 31; wave <= LONG_ENDLESS; wave += 1) {
    const asked = planQuestion(wave, 'endless');
    ids.push(asked.id);
  }
  const issues = consecutiveQuestionIssues(ids);
  assert.deepEqual(issues, [], JSON.stringify(issues.slice(0, 8)));
});

test('PQ-175.00: swarm seeds 17500-17502 waves 1-80 never repeat a question in a row', () => {
  const summaries = [];
  for (const seed of SWARM_SEEDS) {
    const ids = [];
    for (let wave = 1; wave <= LONG_SWARM; wave += 1) {
      const plan = planWave({
        seed,
        arenaId: ARENA,
        wave,
        ruleset: SWARM_RULESET,
      });
      assert.notEqual(plan && plan.ok, false, `swarm ${seed} w${wave}`);
      const asked = questionForGeneratedPlan(plan, wave);
      assert.ok(asked && asked.id, `swarm ${seed} w${wave}`);
      assert.ok(SURVIVAL_ANSWER_VERBS.includes(asked.answerVerb), asked.answerVerb);
      assert.ok(!asked.question.includes('\n'), asked.id);
      ids.push(asked.id);
    }
    const issues = consecutiveQuestionIssues(ids);
    assert.deepEqual(issues, [], `seed ${seed}: ${JSON.stringify(issues.slice(0, 6))}`);
    summaries.push(`${seed}:${ids.slice(0, 8).join('>')}`);
  }
  console.log(`SWARM_QUESTIONS ${summaries.join(' || ')}`);
});
