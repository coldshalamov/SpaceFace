// Seed 4242. A confirmed frontier rumor shows up on the Codex survey as a count.
// The stored coordinate does not. A rumor that is still only a ring does not count.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { discoveryKnowledge } from '../src/ui/sim/discoveryKnowledge.js';
import {
  codexProgressSummary,
  confirmedRumorCodexLine,
  surveyStatusBody,
} from '../src/ui/screens/codex.js';

const SEED = 4242;

function withRumor(phase) {
  const state = createGameState(SEED);
  state.world.frontierRumors.byId = {
    rumor_4242: {
      id: 'rumor_4242',
      sectorId: 'helios',
      phase,
      kind: 'cache',
      kindLabel: 'Cache',
      bearingCenter: { x: 12, z: 34 },
      radius: 400,
      exactPos: { x: 12, z: 34 },
    },
  };
  return state;
}

test('seed 4242 codex names a confirmed rumor and hides its place', () => {
  const empty = createGameState(SEED);
  assert.equal(empty.meta.seed, SEED);
  assert.equal(confirmedRumorCodexLine(empty), '');
  assert.equal(surveyStatusBody(empty).includes('rumor'), false);

  const open = withRumor('rumored');
  const openEntry = discoveryKnowledge(open).entries.find((row) => row.source === 'frontierRumor');
  assert.equal(openEntry.tier, 'bearing');
  assert.equal(openEntry.pos, null);
  assert.equal(confirmedRumorCodexLine(open), '');

  const state = withRumor('resolved');
  const entry = discoveryKnowledge(state).entries.find((row) => row.source === 'frontierRumor');
  assert.equal(entry.tier, 'resolved');
  assert.equal(entry.pos, null);
  assert.equal(confirmedRumorCodexLine(state), 'One rumor confirmed');
  const body = surveyStatusBody(state);
  assert.ok(body.endsWith('One rumor confirmed.'), body);
  assert.equal(body.includes('12'), false);
  assert.equal(body.includes('34'), false);
  const survey = codexProgressSummary({}, state).items.find((item) => item.key === 'Survey');
  assert.ok(survey.value.includes('One rumor confirmed'), survey.value);
  assert.equal(survey.value.includes('12'), false);
  assert.equal(survey.value.includes('34'), false);
});
