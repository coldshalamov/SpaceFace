// Seed 4242. An investigated loss is named in the Discoveries survey sentence when
// the loss ledger filed a display name for it. A stored coordinate on the raw
// scan record never prints. A ledger row with no name stays "One loss identified".

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { lossesFor } from '../src/systems/lossLedger.js';
import { discoveryKnowledge } from '../src/ui/sim/discoveryKnowledge.js';
import {
  surveyedLossCodexLine,
  surveyStatusBody,
} from '../src/ui/screens/codex.js';

const SEED = 4242;
const LOSS_ID = 'loss_4242';
const TITLE = 'Vigil of Nyx';

function investigatedState(loss) {
  const state = createGameState(SEED);
  state.scanReveal = {
    investigated: {
      [LOSS_ID]: {
        at: 10,
        sectorId: 'helios',
        entityId: 999001,
        exactPos: { x: 12, z: 34 },
      },
    },
  };
  if (loss) {
    state.lossLedger = {
      bySector: { helios: [loss] },
      entries: [loss],
      seed: SEED,
    };
  }
  return state;
}

function assertNoPlantedCoordinate(text) {
  assert.equal(text.includes('12'), false, text);
  assert.equal(text.includes('34'), false, text);
  assert.equal(text.includes('999001'), false, text);
}

test('seed 4242 a titled loss is named in the Discoveries sentence', () => {
  const loss = {
    lossId: LOSS_ID,
    sectorId: 'helios',
    kind: 'ship',
    victimName: TITLE,
    source: 'entity:killed',
  };
  const state = investigatedState(loss);
  assert.equal(state.meta.seed, SEED);
  const filed = lossesFor(state, 'helios').find((row) => row && row.lossId === LOSS_ID);
  assert.ok(filed);
  assert.equal(filed.victimName, TITLE);
  const knowledge = discoveryKnowledge(state).entries.find((row) => row.tier === 'survey');
  assert.ok(knowledge);
  assert.equal(knowledge.pos, null);

  const line = surveyedLossCodexLine(state);
  assert.equal(line, 'One loss identified: ' + TITLE);
  const body = surveyStatusBody(state);
  assert.equal(
    body,
    'Fly close to unresolved signals and triangulate them to chart the frontier. One loss identified: ' + TITLE + '.',
  );
  assertNoPlantedCoordinate(line);
  assertNoPlantedCoordinate(body);
});

test('seed 4242 a ledger loss with no title stays a count', () => {
  const state = investigatedState({
    lossId: LOSS_ID,
    sectorId: 'helios',
    kind: 'trader',
    assetId: 'hauler-nyx',
    victimName: '   ',
    source: 'automation:assetLost',
  });
  const filed = lossesFor(state, 'helios').find((row) => row && row.lossId === LOSS_ID);
  assert.ok(filed);
  assert.equal(surveyedLossCodexLine(state), 'One loss identified');
  const body = surveyStatusBody(state);
  assert.equal(
    body,
    'Fly close to unresolved signals and triangulate them to chart the frontier. One loss identified.',
  );
  assert.equal(body.includes('hauler-nyx'), false);
  assert.equal(body.includes('helios'), false);
  assertNoPlantedCoordinate(body);
});
