// W1 Journey framing — the act table and the story-first board recommendation.
// The act table is pure data (src/data/journeyActs.js); the recommendation policy lives in the
// station board model. Run: node --test test/w1-journey-framing.test.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JOURNEY_ACTS, journeyActForBeat } from '../src/data/journeyActs.js';
import { STORY_BEATS } from '../src/data/missionsData.js';
import { recommendMissionBoardOffer } from '../src/ui/station/stationMissionModel.js';

test('the four acts tile the 8-beat spine exactly', () => {
  assert.equal(JOURNEY_ACTS.length, 4);
  const covered = JOURNEY_ACTS.flatMap((act) => act.beats).sort((a, b) => a - b);
  assert.deepEqual(covered, [0, 1, 2, 3, 4, 5, 6, 7], 'acts cover beats 0-7 with no gaps');
  const beatsInSpine = STORY_BEATS.map((b) => b.beat).sort((a, b) => a - b);
  assert.deepEqual(covered, beatsInSpine, 'act tiling matches the live spine beats');
});

test('journeyActForBeat maps each act boundary and rejects past-the-spine', () => {
  assert.equal(journeyActForBeat(0).num, 'I');
  assert.equal(journeyActForBeat(1).num, 'I');
  assert.equal(journeyActForBeat(2).num, 'II');
  assert.equal(journeyActForBeat(3).num, 'II');
  assert.equal(journeyActForBeat(4).num, 'III');
  assert.equal(journeyActForBeat(5).num, 'III');
  assert.equal(journeyActForBeat(6).num, 'IV');
  assert.equal(journeyActForBeat(7).num, 'IV');
  assert.equal(journeyActForBeat(8), null, 'past the spine no act exists');
  assert.equal(journeyActForBeat(Number.NaN), null);
  assert.equal(journeyActForBeat(1.9), journeyActForBeat(1), 'floors fractional beats');
});

function slot(overrides = {}) {
  return {
    id: 'mo_procedural', type: 'cargo_delivery', title: 'Open Manifest — food to Ceres',
    reward_cr: 900, riskTier: 0, collateral_cr: 0,
    params: { cmdtyId: 'cmdty_food', qty: 4 },
    destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt',
    ...overrides,
  };
}

const STATE = { player: { credits: 5000, ownedShips: ['ship_kit'], debt: 0, cargo: { items: {}, capVolume: 100, usedVolume: 0 } }, factions: {}, story: { beatIndex: 1 } };

test('the board recommends the book job over juicier procedural rows', () => {
  const book = slot({
    id: 'mo_47a_b1', storyTag: 'campaign47a:b1:alloy_run', type: 'cargo_delivery',
    title: 'Weigh-In — sealed alloy delivery', reward_cr: 600, riskTier: 1,
  });
  const juicy = slot({ id: 'mo_big', reward_cr: 2400, riskTier: 0 });
  const pick = recommendMissionBoardOffer([juicy, book], STATE);
  assert.ok(pick, 'a recommendation exists');
  assert.equal(String(pick.missionId), 'mo_47a_b1', 'the campaign row wins');
  assert.equal(pick.label, 'THE BOOK');
});

test('branch intro rows count as journey steps; final-disposition filings do not', () => {
  const intro = slot({ id: 'mo_intro', storyTag: 'story.branch_intro', type: 'bulk_trade', reward_cr: 300 });
  const pick = recommendMissionBoardOffer([intro], STATE);
  assert.equal(String(pick.missionId), 'mo_intro');
  assert.equal(pick.label, 'THE BOOK');

  const filing = slot({ id: 'mo_file', storyTag: 'campaign47a:ending:A', storyDisposition: 'A', reward_cr: 0 });
  const plain = slot({ id: 'mo_plain' });
  const pick2 = recommendMissionBoardOffer([filing, plain], STATE);
  assert.equal(String(pick2.missionId), 'mo_plain', 'a disposition filing is never recommended');
});

test('a blocked book job still names the book but demands prep first', () => {
  const book = slot({
    id: 'mo_47a_b1', storyTag: 'campaign47a:b1:alloy_run', type: 'cargo_delivery',
    title: 'Weigh-In — sealed alloy delivery', reward_cr: 600, riskTier: 1,
    params: { cmdtyId: 'cmdty_alloys', qty: 400 },
  });
  const pick = recommendMissionBoardOffer([book], STATE);
  assert.ok(pick, 'recommendation exists even when blocked');
  if (pick.disabled) assert.equal(pick.label, 'PREP FIRST');
});
