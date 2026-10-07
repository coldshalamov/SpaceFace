// Row 290 PB-WIRE-SURVEY. Seed 4242. The codex survey line reads discoveryKnowledge.
// One investigated loss prints "One loss identified" and never the recycled entity
// id or a coordinate stored on the raw record. An empty memory adds nothing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { discoveryKnowledge } from '../src/ui/sim/discoveryKnowledge.js';
import {
  codexProgressSummary,
  surveyedLossCodexLine,
  surveyStatusBody,
} from '../src/ui/screens/codex.js';

const SEED = 4242;

function surveyedState() {
  const state = createGameState(SEED);
  state.scanReveal = {
    investigated: {
      loss_4242: {
        at: 10,
        sectorId: 'helios',
        entityId: 999001,
        exactPos: { x: 12, z: 34 },
      },
    },
  };
  return state;
}

test('seed 4242 codex survey names the loss and hides the record', () => {
  const empty = createGameState(SEED);
  assert.equal(empty.meta.seed, SEED);
  assert.equal(surveyedLossCodexLine(empty), '');
  assert.equal(surveyStatusBody(empty).includes('identified'), false);
  const emptySurvey = codexProgressSummary({}, empty).items.find((item) => item.key === 'Survey');
  assert.ok(emptySurvey);
  assert.equal(emptySurvey.value.includes('identified'), false);

  const state = surveyedState();
  const entry = discoveryKnowledge(state).entries.find((row) => row.tier === 'survey');
  assert.ok(entry);
  assert.equal(entry.pos, null);
  assert.equal(surveyedLossCodexLine(state), 'One loss identified');
  const body = surveyStatusBody(state);
  assert.ok(body.endsWith('One loss identified.'), body);
  assert.equal(body.includes('999001'), false);
  assert.equal(body.includes('12'), false);
  assert.equal(body.includes('34'), false);
  const survey = codexProgressSummary({}, state).items.find((item) => item.key === 'Survey');
  assert.ok(survey.value.includes('One loss identified'), survey.value);
  assert.equal(survey.value.includes('999001'), false);
});
