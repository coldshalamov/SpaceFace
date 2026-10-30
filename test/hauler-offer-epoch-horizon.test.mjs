import test from 'node:test';
import assert from 'node:assert/strict';

import { HAULER_STEPS } from '../src/careers/origins/haulerOriginData.js';
import { buildHaulerStepMissionOffer } from '../src/careers/origins/haulerOriginOffers.js';
import {
  buildHaulerLadderMissionOffer,
  HAULER_STEP_PARAMS,
} from '../src/careers/ladders/haulerLadderDefs.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { makeHaulerState, seedIronSpreadMarkets } from './hauler-origin-fixtures.mjs';

// Mission authority (missions.js / missionBoardOps) rejects an offer once
//   expiresAtEpoch <= floor(simTime / refreshSec).
// The hauler career offers used a literal `expiresAtEpoch: 1`, so the whole chain died once
// ~one refresh window (5 min) of sim time had passed.

const REFRESH = MISSION_TUNING.refreshSec;
const epochAt = (t) => Math.floor(t / REFRESH);

function originOffer(simTime, step = HAULER_STEPS[0]) {
  const state = makeHaulerState({ simTime });
  seedIronSpreadMarkets(state);
  return buildHaulerStepMissionOffer(state, step, 0, 1);
}

test('origin offers: expiry is a real epoch past the deadline, at any sim time', () => {
  for (const simTime of [0, 120, 301, 900, 5000, 123456]) {
    for (const step of HAULER_STEPS) {
      const offer = originOffer(simTime, step);
      if (!offer) continue;
      assert.equal(offer.time_limit_s, step.deadlineSlackS, 'time_limit_s carries the slack in seconds');
      assert.ok(Number.isInteger(offer.expiresAtEpoch));
      assert.ok(offer.expiresAtEpoch > epochAt(simTime), `live at t=${simTime} (${step.id})`);
      assert.ok(offer.expiresAtEpoch > epochAt(offer.deadlineS), 'outlives its own deadline');
      assert.ok(offer.expiresAtEpoch <= epochAt(simTime + step.deadlineSlackS) + 1, 'horizon is tight, not unbounded');
    }
  }
});

test('origin offers: the next chain step stays offerable after more than 5 minutes of sim time', () => {
  const late = HAULER_STEPS[1];
  const offer = originOffer(20 * 60, late);
  assert.ok(offer, 'the later step still builds');
  assert.ok(!(offer.expiresAtEpoch <= epochAt(20 * 60 + 1)), 'not already expired when posted');
});

test('ladder offers: expiry is a real epoch past the deadline, at any sim time', () => {
  for (const simTime of [0, 120, 301, 900, 5000, 123456]) {
    for (const stepId of Object.keys(HAULER_STEP_PARAMS)) {
      // role_hull_capstone is an ownership step with no freight deadline of its own.
      if (!Number.isFinite(HAULER_STEP_PARAMS[stepId].deadlineSlackS)) continue;
      const state = makeHaulerState({ simTime });
      const offer = buildHaulerLadderMissionOffer(state, stepId, 0, 1);
      if (!offer) continue;
      assert.ok(Number.isInteger(offer.expiresAtEpoch));
      assert.ok(offer.expiresAtEpoch > epochAt(simTime), `live at t=${simTime} (${stepId})`);
      assert.ok(offer.expiresAtEpoch > epochAt(offer.deadlineS), 'outlives its own deadline');
    }
  }
});

test('offer expiry honours the live mission refresh cadence', () => {
  const state = makeHaulerState({ simTime: 1000 });
  state.missions = { config: { refreshSec: 100 } };
  seedIronSpreadMarkets(state);
  const step = HAULER_STEPS[0];
  const offer = buildHaulerStepMissionOffer(state, step, 0, 1);
  assert.equal(offer.expiresAtEpoch, Math.floor((1000 + step.deadlineSlackS) / 100) + 1);
});
