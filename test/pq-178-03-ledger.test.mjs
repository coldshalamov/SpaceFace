// PQ-178.03 — the story ledger at the berth.
// Plants the receipts the campaign writer actually stores (recordBeatStep)
// and the session hitch/cut evidence. A blind reader sees only the prose.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { prepareFurnaceSettlement, retireFurnaceWorksite } from '../src/missions/furnaceWorksiteRuntime.js';
import { buildStepProgressReceipt, furnaceSettlementFromMission, normalizeFurnaceSettlement } from '../src/story/campaign47a/campaignReceipts.js';
import { spineGreeting, readSpine, spineRoadFrom } from '../src/story/campaign47a/storySpine.js';
import { CAMPAIGN_BEATS, STORY_BRANCH_INTRO_TAG } from '../src/story/campaign47a/campaignData.js';
import { failEncounter, isBeatStepsComplete, recordBeatStep, recoverEncounter } from '../src/story/campaign47a/campaignTransitions.js';
import { leftoverLedgerCard, leftoverLedgerLine, retellLedger } from '../src/story/storyLedger.js';
import { buildDockArrival, writeBerthArrival } from '../src/ui/dockArrival.js';
import { stationFrameHtml } from '../src/ui/views/stationFrames.js';
import { plantFirstPlayerGrowth, plantNestOutcome } from './story-campaign47a-fixtures.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STATION = 'station_helios';
const STATION_NAME = 'Helios Station';
const contractTagAt = (beat, stepId) => CAMPAIGN_BEATS[beat]?.steps?.find((step) => step.id === stepId)?.contractId || null;
const CONTRACT_47A_B1_TAG = contractTagAt(1, 'infested');
const CONTRACT_47A_B2_TAG = contractTagAt(2, 'elroy');
const CONTRACT_47A_B3_TAG = contractTagAt(3, 'berth');

const CAMPAIGN_RETELL = [
  'sampling the variance',
  'watching the lane take the sample',
  'docking the sample',
  'flying the sealed alloys to Tethys',
  'weighing the crate on Scale 4',
  'clearing four marked mites and feeding three ore pods to CR-FEED',
  'clearing the cinder marks',
  'running the compost to the understory',
  'holding the Nest',
  'answering the register on Elroy',
  'delivering VARIANCE ADJUSTMENT',
  'feeding the furnace maw',
  "settling the Foreman's yard feud",
  "taking the traders' intro",
  'running Spine Break',
  "finished the traders' proving runs",
];

function freshStory() {
  return {
    story: { beatIndex: 0, branch: null, flags: {} },
    ui: { marketNews: { log: [], lastCard: null } },
  };
}

/** Fixed sim times. The sidecar writer is the same one missions calls — the book
 *  route's ordered lists (W-BOOKS-0-2 / W-BOOKS-3-4), planted per step. */
function playedCampaign() {
  const state = freshStory();
  assert.equal(recordBeatStep(state, 'mining:yield', {}, 12).ok, true);
  assert.equal(recordBeatStep(state, 'story:skimResolved', {}, 26).ok, true);
  assert.equal(recordBeatStep(state, 'dock:docked', { stationId: 'station_helios' }, 40).ok, true);
  state.story.beatIndex = 1;
  assert.equal(recordBeatStep(state, 'mission:completed', {
    storyTag: 'campaign47a:b1:alloy_run',
  }, 60).ok, true);
  assert.equal(recordBeatStep(state, 'kesslerPod:weighed', { variance: true }, 70).ok, true);
  assert.equal(recordBeatStep(state, 'mission:completed', {
    storyTag: 'campaign47a:b1:infested',
  }, 80).ok, true);
  state.story.beatIndex = 2;
  assert.equal(recordBeatStep(state, 'mission:completed', {
    storyTag: 'campaign47a:b2:cinder',
  }, 100).ok, true);
  // The recorder only takes the owner's persisted evidence: the garden's retained
  // first-growth row and the encounter director's terminal Nest receipt.
  assert.equal(recordBeatStep(state, 'understory:playerGrowth',
    plantFirstPlayerGrowth(state), 105).ok, true);
  assert.equal(recordBeatStep(state, 'encounter:resolved',
    plantNestOutcome(state), 110).ok, true);
  assert.equal(recordBeatStep(state, 'mission:completed', {
    storyTag: 'campaign47a:b2:elroy',
  }, 120).ok, true);
  state.story.beatIndex = 3;
  assert.equal(recordBeatStep(state, 'mission:completed', {
    storyTag: 'campaign47a:b3:berth',
  }, 140).ok, true);
  assert.equal(recordBeatStep(state, 'mission:completed', {
    storyTag: 'campaign47a:b3:maw',
  }, 150).ok, true);
  assert.equal(recordBeatStep(state, 'mission:completed', {
    storyTag: 'campaign47a:b3:foreman',
  }, 160).ok, true);
  state.story.beatIndex = 4;
  state.story.branch = 'traders';
  assert.equal(recordBeatStep(state, 'mission:accepted', {
    storyTag: STORY_BRANCH_INTRO_TAG,
    type: 'bulk_trade',
    factionId: 'faction_mts',
    branch: 'traders',
  }, 200).ok, true);
  assert.equal(recordBeatStep(state, 'mission:completed', {
    storyTag: 'campaign47a:b4:operation',
  }, 210).ok, true);
  state.story.beatIndex = 5;
  state.story.chainProgress = 3;
  assert.equal(recordBeatStep(state, 'mission:completed', {
    missionType: 'bulk_trade',
    branch: 'traders',
    chainProgress: 3,
  }, 240).ok, true);
  state.story.flags = {
    beat_0_done: true,
    beat_1_done: true,
    beat_2_done: true,
    beat_3_done: true,
    beat_4_done: true,
    beat_5_done: true,
  };
  return state;
}

function methodReceipt(method, type, storyTag, at_s) {
  return {
    id: `mo_47a:${method}:completed`,
    missionId: `mo_47a_${method}`,
    title: type,
    type,
    outcome: 'completed',
    reason: null,
    at_s,
    completionMethod: method,
    storyTag,
    factionId: 'faction_mts',
    stationId: STATION,
    destStationId: STATION,
  };
}

function actualEmbodiedCompletionOwner() {
  const source = readFileSync(join(ROOT, 'src/systems/missionStoryOps.js'), 'utf8');
  const cleanupStart = source.indexOf('  _cleanupTargets(m) {');
  const cleanupEnd = source.indexOf('\n  _handoffFleeingTarget(', cleanupStart);
  const advanceStart = source.indexOf('  _advanceEmbodiedStoryMission(m) {');
  const advanceEnd = source.indexOf('\n  _recordCampaignBookSignal(', advanceStart);
  assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart
    && advanceStart >= 0 && advanceEnd > advanceStart,
  'extract the actual cleanup and mission-story completion owners');
  const cleanupSource = source.slice(cleanupStart, cleanupEnd);
  const advanceSource = source.slice(advanceStart, advanceEnd);
  const create = new Function(
    'retainCinderRetry', 'retireFurnaceWorksite',
    'STORY_BEATS', 'CAMPAIGN_BEATS',
    'CONTRACT_47A_B1_TAG', 'CONTRACT_47A_B2_TAG', 'CONTRACT_47A_B3_TAG',
    'furnaceSettlementFromMission', 'recordBeatStep', 'isBeatStepsComplete',
    `return ({${cleanupSource}\n${advanceSource}});`,
  );
  return create(
    () => false, retireFurnaceWorksite,
    [null, { beat: 1, headlineVerb: 'burn' }], CAMPAIGN_BEATS,
    CONTRACT_47A_B1_TAG, CONTRACT_47A_B2_TAG, CONTRACT_47A_B3_TAG,
    furnaceSettlementFromMission, recordBeatStep, isBeatStepsComplete,
  );
}

const embodiedCompletionOwners = actualEmbodiedCompletionOwner();

function settleFurnaceMission(feeds) {
  const mission = {
    id: `ceres-furnace-${feeds}`,
    status: 'active',
    storyTag: 'campaign47a:b1:infested',
    destSectorId: 'sector_ceres_belt',
    reward_cr: 480,
    objectiveProgress: 4,
    params: {
      furnaceWorksiteVersion: 1,
      furnaceFeedsNeeded: 3,
      furnaceRewardBase: 480,
      furnaceLots: Array.from({ length: 3 }, (_, slot) => ({
        slot,
        received: slot < feeds,
        lost: slot >= feeds,
      })),
    },
  };
  const owner = { state: { entities: new Map(), missions: { active: [mission] } }, bus: { emit() {} } };
  prepareFurnaceSettlement(owner, mission);
  mission.status = 'completed';
  embodiedCompletionOwners._cleanupTargets.call(owner, mission);
  assert.deepEqual(mission.targetEntityIds, []);
  assert.equal(mission.params.furnaceLots.length, 3, 'settlement cleanup retains its canonical lot ledger');
  return mission;
}

function completeFurnaceBeat(state, mission, at = 80) {
  const settlement = furnaceSettlementFromMission(mission);
  assert.ok(settlement, 'only a canonical, settled furnace result may reach the campaign reader');
  state.simTime = at;
  let advances = 0;
  const owner = {
    state,
    bus: { emit() {} },
    _ensureCampaignSidecar() {},
    _advanceStory() { advances += 1; },
    _refreshEmbodiedStoryBoards() {},
    _refreshNavigation() {},
  };
  const result = embodiedCompletionOwners._advanceEmbodiedStoryMission.call(owner, mission);
  const receipt = state.story.campaign47a.receipts.find((row) => row.stepId === 'infested');
  return { result, settlement, receipt, advances };
}

function berthCardHost() {
  const texts = {
    '.sxb-event__badge': '',
    '.sxb-event__title': '',
    '.sxb-event__body': '',
  };
  const attrs = {};
  return {
    hidden: true,
    parentElement: null,
    querySelector(sel) {
      if (!(sel in texts)) return null;
      return {
        get textContent() { return texts[sel]; },
        set textContent(value) { texts[sel] = String(value == null ? '' : value); },
      };
    },
    setAttribute(name, value) { attrs[name] = String(value); },
    removeAttribute(name) { delete attrs[name]; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
  };
}

test('sidecar receipts retell the campaign in order, seed 17803', () => {
  const state = playedCampaign();
  const line = leftoverLedgerLine(state);
  const told = retellLedger(line);
  assert.deepEqual(told, CAMPAIGN_RETELL);
  assert.equal(told.length, 16);
  assert.match(line, /^I was .+ so I .+\.$/);
  assert.equal(retellLedger(line).join(' > '), CAMPAIGN_RETELL.join(' > '));
  const card = leftoverLedgerCard(state);
  assert.equal(card.title, 'Mechanic');
  assert.equal(card.badge, 'LEDGER');
  assert.equal(card.kind, 'story-ledger');
  assert.equal(card.body, line);
  console.log(`PQ-178.03 campaign clauses: ${told.length}`);
  console.log(`PQ-178.03 blind retell: ${told.join(' > ')}`);
});

test('real furnace settlement reaches ordered receipt, Maera, and Mechanic without changing payment', () => {
  const expectedMaera = [
    'Four mites cleared. All three ore pods lost.',
    'Four mites cleared. One ore pod fed to CR-FEED; two lost.',
    'Four mites cleared. Two ore pods fed to CR-FEED; one lost.',
    'Four mites cleared. All three ore pods fed to CR-FEED.',
  ];
  const expectedMaeraFiled = [
    'Three ore pods lost. You filed.',
    'One ore pod fed to CR-FEED; two lost. You filed.',
    'Two ore pods fed to CR-FEED; one lost. You filed.',
    'Three ore pods fed to CR-FEED. You filed.',
  ];
  const expectedLedger = [
    'cleared four marked mites; all three ore pods were lost',
    'fed one ore pod to CR-FEED; two were lost',
    'fed two ore pods to CR-FEED; one was lost',
    'fed all three ore pods to CR-FEED',
  ];
  const expectedHalev = [
    'Filed: four marked mites clear; all three ore pods lost.',
    'Filed: one ore pod fed to CR-FEED; two lost.',
    'Filed: two ore pods fed to CR-FEED; one lost.',
    'Filed: all three ore pods fed to CR-FEED.',
  ];
  const expectedHalevMissed = [
    'Filed after a miss: all three pods lost.',
    'Filed after a miss: one pod fed to CR-FEED; two lost.',
    'Filed after a miss: two pods fed to CR-FEED; one lost.',
    'Filed after a miss: all three pods fed to CR-FEED.',
  ];
  const expectedRoad = [
    'four marked mites cleared; all three ore pods lost',
    'four marked mites cleared; one ore pod fed to CR-FEED; two lost',
    'four marked mites cleared; two ore pods fed to CR-FEED; one lost',
    'four marked mites cleared; all three ore pods fed to CR-FEED',
  ];
  for (let feeds = 0; feeds <= 3; feeds += 1) {
    const mission = settleFurnaceMission(feeds);
    assert.equal(mission.params.furnaceFeeds, feeds);
    assert.equal(mission.params.furnaceLosses, 3 - feeds);
    assert.equal(mission.reward_cr, 160 * feeds);
    assert.equal(mission.params.furnaceOutcome, feeds === 3 ? 'full_disposal'
      : feeds === 0 ? 'clearance_only_cargo_lost' : 'partial_disposal');
    const settlement = furnaceSettlementFromMission(mission);
    assert.deepEqual(normalizeFurnaceSettlement({ ...settlement, beatIndex: 1, stepId: 'infested', signal: 'mission:completed' }), settlement);
    const state = freshStory();
    state.story.beatIndex = 1;
    assert.equal(recordBeatStep(state, 'mission:completed', {
      storyTag: 'campaign47a:b1:alloy_run', missionId: 'alloy-accepted',
    }, 60).ok, true);
    assert.equal(recordBeatStep(state, 'kesslerPod:weighed', { variance: true }, 70).ok, true);
    const first = completeFurnaceBeat(state, mission, 80);
    assert.equal(first.result, true, 'actual completion owner records the settled B1 leg');
    assert.equal(first.receipt.stepId, 'infested');
    assert.equal(first.receipt.stepsComplete, true);
    assert.equal(first.advances, 1);
    assert.equal(state.story.beatIndex, 1, 'the sidecar remains observe-only');
    assert.equal(first.receipt.furnaceFeeds, feeds);
    assert.equal(first.receipt.furnaceLosses, 3 - feeds);
    assert.equal(first.receipt.furnaceOutcome, mission.params.furnaceOutcome);
    assert.equal(first.receipt.furnaceMissionId, mission.id);
    assert.equal(spineGreeting('contact_maera_vols', state), expectedMaera[feeds]);
    assert.equal(spineGreeting('contact_halev_doss', state), expectedHalev[feeds]);
    assert.ok(spineRoadFrom(state).cite.includes(expectedRoad[feeds]));
    assert.equal(state.story.campaign47a.receipts.filter((row) => row.stepId === 'infested').length, 1);
    const line = leftoverLedgerLine(state);
    assert.ok(line.includes(expectedLedger[feeds]), line);
    assert.ok(spineGreeting('contact_maera_vols', state).trim().split(/\s+/).length <= 12);
    assert.ok(spineGreeting('contact_halev_doss', state).trim().split(/\s+/).length <= 12);
    const filedState = JSON.parse(JSON.stringify(state));
    filedState.story.endgameChoice = 'A';
    assert.equal(spineGreeting('contact_maera_vols', filedState), expectedMaeraFiled[feeds]);
    assert.equal(spineGreeting('contact_halev_doss', filedState), expectedHalev[feeds]);
    assert.ok(spineGreeting('contact_maera_vols', filedState).trim().split(/\s+/).length <= 12);
    assert.ok(spineGreeting('contact_halev_doss', filedState).trim().split(/\s+/).length <= 12);

    const missedMission = settleFurnaceMission(feeds);
    const missedState = freshStory();
    missedState.story.beatIndex = 1;
    assert.equal(failEncounter(missedState, 'furnace_missed', 10, { failedMethod: 'burn' }).ok, true);
    assert.equal(recoverEncounter(missedState, 20, { force: true }).ok, true);
    recordBeatStep(missedState, 'mission:completed', {
      missionId: 'alloy-accepted', storyTag: 'campaign47a:b1:alloy_run',
    }, 60);
    recordBeatStep(missedState, 'kesslerPod:weighed', { variance: true }, 70);
    assert.equal(completeFurnaceBeat(missedState, missedMission, 80).result, true);
    missedState.story.beatIndex = 2;
    assert.equal(spineGreeting('contact_halev_doss', missedState), expectedHalevMissed[feeds]);
    assert.ok(spineGreeting('contact_halev_doss', missedState).trim().split(/\s+/).length <= 12);
    const missedFiledState = JSON.parse(JSON.stringify(missedState));
    missedFiledState.story.endgameChoice = 'A';
    assert.equal(spineGreeting('contact_maera_vols', missedFiledState), expectedMaeraFiled[feeds]);
    assert.equal(spineGreeting('contact_halev_doss', missedFiledState), expectedHalevMissed[feeds]);
    assert.ok(spineGreeting('contact_maera_vols', missedFiledState).trim().split(/\s+/).length <= 12);
    assert.ok(spineGreeting('contact_halev_doss', missedFiledState).trim().split(/\s+/).length <= 12);

    const restored = JSON.parse(JSON.stringify(state));
    assert.deepEqual(readSpine(restored).solved['1'].furnaceFeeds, feeds);
    assert.equal(spineGreeting('contact_maera_vols', restored), expectedMaera[feeds]);
    assert.equal(leftoverLedgerLine(restored), line);
    const receiptCount = restored.story.campaign47a.receipts.length;
    const duplicate = recordBeatStep(restored, 'mission:completed', {
      missionId: mission.id, storyTag: mission.storyTag, physicalVerb: 'burn', ...first.settlement,
    }, 80);
    assert.equal(duplicate.reason, 'already_complete');
    assert.equal(restored.story.campaign47a.receipts.length, receiptCount);
    assert.equal(restored.story.campaign47a.receipts.filter((row) => row.stepId === 'infested').length, 1);
    assert.equal(mission.reward_cr, 160 * feeds, 'reading/restoring never changes the settled reward');
  }
});

test('missing, malformed, and legacy furnace metadata stays neutral and cannot invent feeds', () => {
  const state = freshStory();
  state.story.beatIndex = 1;
  recordBeatStep(state, 'mission:completed', { storyTag: 'campaign47a:b1:alloy_run' }, 1);
  recordBeatStep(state, 'kesslerPod:weighed', { variance: true }, 2);
  const invalid = recordBeatStep(state, 'mission:completed', {
    missionId: 'legacy-no-result',
    storyTag: 'campaign47a:b1:infested',
    physicalVerb: 'burn',
    furnaceFeeds: 4,
    furnaceLosses: -1,
    furnaceOutcome: 'full_disposal',
  }, 3);
  assert.equal(invalid.ok, true);
  assert.equal(invalid.receipt.furnaceFeeds, undefined);
  assert.equal(invalid.receipt.furnaceLosses, undefined);
  assert.equal(spineGreeting('contact_maera_vols', state), 'The refinery detail closed.');
  assert.ok(leftoverLedgerLine(state).includes('completed the refinery detail'));
  assert.equal(furnaceSettlementFromMission({
    ...settleFurnaceMission(2), params: {
      ...settleFurnaceMission(2).params,
      furnaceFeeds: 3,
    },
  }), null);
  assert.equal(furnaceSettlementFromMission({
    ...settleFurnaceMission(2), status: 'active',
  }), null);
  const duplicateSlot = settleFurnaceMission(2);
  duplicateSlot.params.furnaceLots[2].slot = 0;
  assert.equal(furnaceSettlementFromMission(duplicateSlot), null);
  const invalidLedger = settleFurnaceMission(2);
  invalidLedger.params.furnaceLedgerInvalid = 'corrupt';
  assert.equal(furnaceSettlementFromMission(invalidLedger), null);
  assert.equal(furnaceSettlementFromMission({
    id: 'broken', status: 'completed', storyTag: 'campaign47a:b1:infested',
    destSectorId: 'sector_ceres_belt', params: null,
  }), null);
  assert.equal(furnaceSettlementFromMission({
    id: 'broken', status: 'completed', storyTag: 'campaign47a:b1:infested',
    destSectorId: 'sector_ceres_belt',
  }), null);
  assert.equal(normalizeFurnaceSettlement({
    missionId: 'forged', storyTag: 'campaign47a:b1:infested', beatIndex: 1,
    stepId: 'infested', signal: 'mission:completed', furnaceFeeds: 2,
    furnaceLosses: 1, furnaceOutcome: 'clearance_only_cargo_lost',
  }), null);
  const misdirected = buildStepProgressReceipt({
    beatIndex: 2, stepId: 'cinder_board', signal: 'mission:completed',
    missionId: 'other-mission', storyTag: 'campaign47a:b2:cinder',
    furnaceSettlement: {
      furnaceMissionId: 'ceres-furnace-2', furnaceStoryTag: 'campaign47a:b1:infested',
      furnaceFeeds: 2, furnaceLosses: 1, furnaceOutcome: 'partial_disposal',
    },
  });
  assert.equal(misdirected.beatIndex, 2);
  assert.equal(misdirected.stepId, 'cinder_board');
  assert.equal(misdirected.furnaceFeeds, undefined);
  const wrongMission = buildStepProgressReceipt({
    beatIndex: 1, stepId: 'infested', signal: 'mission:completed',
    missionId: 'different-mission', storyTag: 'campaign47a:b1:infested',
    furnaceSettlement: {
      furnaceMissionId: 'ceres-furnace-2', furnaceStoryTag: 'campaign47a:b1:infested',
      furnaceFeeds: 2, furnaceLosses: 1, furnaceOutcome: 'partial_disposal',
    },
  });
  assert.equal(wrongMission.furnaceFeeds, undefined);
  const wrongOuterTag = buildStepProgressReceipt({
    beatIndex: 1, stepId: 'infested', signal: 'mission:completed',
    missionId: 'ceres-furnace-2', storyTag: 'campaign47a:b1:other',
    furnaceSettlement: {
      furnaceMissionId: 'ceres-furnace-2', furnaceStoryTag: 'campaign47a:b1:infested',
      furnaceFeeds: 2, furnaceLosses: 1, furnaceOutcome: 'partial_disposal',
    },
  });
  assert.equal(wrongOuterTag.furnaceFeeds, undefined);

  const misplaced = {
    story: {
      beatIndex: 3,
      campaign47a: {
        flags: {
          spine: { solved: { '2': {
            verb: 'burn', stepId: 'infested', signal: 'mission:completed',
            furnaceMissionId: 'ceres-wrong-beat', furnaceStoryTag: 'campaign47a:b1:infested',
            furnaceFeeds: 3, furnaceLosses: 0, furnaceOutcome: 'full_disposal',
          } } },
        },
      },
    },
  };
  assert.equal(readSpine(misplaced).solved['2'].furnaceFeeds, undefined);
  assert.ok(spineRoadFrom(misplaced).cite.includes('the refinery detail closed'));
  assert.doesNotMatch(spineRoadFrom(misplaced).cite, /all three ore pods fed/);
});

test('a completion method replaces the generic beat, and a hitch stays a second sentence', () => {
  const state = playedCampaign();
  state.missions = {
    receipts: [
      methodReceipt('wrecking_ball', 'demolition', 'campaign47a:b1:honest_work', 81),
      methodReceipt('stage_tow', 'rescue_under_fire', 'campaign47a:b2:elroy', 121),
      methodReceipt('sling_in', 'tow_recovery', 'campaign47a:b3:bigger_boat', 161),
    ],
  };
  state.scenario = {
    evidence: {
      schemaVersion: 1,
      events: [
        {
          type: 'tether:attached', tick: 12, simTime: 0.2,
          targetActorId: 'evidence_spindle_47a',
        },
        {
          type: 'tether:broken', tick: 80, simTime: 1.4,
          targetActorId: 'civilian_pod', reason: 'cut',
        },
      ],
    },
  };
  const told = retellLedger(leftoverLedgerLine(state));
  assert.deepEqual(told, [
    'sampling the variance',
    'watching the lane take the sample',
    'docking the sample',
    'flying the sealed alloys to Tethys',
    'weighing the crate on Scale 4',
    'knocking the variance tower with thrown mass',
    'clearing the cinder marks',
    'running the compost to the understory',
    'holding the Nest',
    'pulling the pods into the yard dock',
    'delivering VARIANCE ADJUSTMENT',
    'feeding the furnace maw',
    "settling the Foreman's yard feud",
    'slinging the slag core',
    "taking the traders' intro",
    'running Spine Break',
    "finished the traders' proving runs",
    'hitching the false-mass spindle',
    'the line took',
    'cut for the pod',
  ]);
});

test('beat flags retell a save whose receipt ring is empty', () => {
  const told = retellLedger(leftoverLedgerLine({
    story: {
      beatIndex: 3,
      branch: null,
      flags: { beat_0_done: true, beat_1_done: true, beat_2_done: true },
    },
  }));
  assert.deepEqual(told, [
    'sampling the variance',
    'watching the lane take the sample',
    'docking the sample',
    'flying the sealed alloys to Tethys',
    'weighing the crate on Scale 4',
    'clearing four marked mites and feeding three ore pods to CR-FEED',
    'clearing the cinder marks',
    'running the compost to the understory',
    'holding the Nest',
    'answered the register',
  ]);
});

test('one sample still speaks, and an empty berth invents nothing', () => {
  const state = freshStory();
  assert.equal(recordBeatStep(state, 'mining:yield', {}, 12).ok, true);
  const told = retellLedger(leftoverLedgerLine(state));
  assert.deepEqual(told, ['sampling the variance', 'the sample came in', 'sampled the variance']);
  assert.equal(leftoverLedgerLine({ story: { beatIndex: 0, flags: {} } }), null);
  assert.deepEqual(retellLedger(''), []);
});

test('an ending receipt names the choice the player filed', () => {
  const told = retellLedger(leftoverLedgerLine({
    story: {
      beatIndex: 7,
      endgameChoice: 'A',
      campaign47a: {
        receipts: [{ kind: 'ending_resolution', endingId: 'A', atSimTime: 900 }],
      },
    },
  }));
  assert.deepEqual(told, [
    'weighing The Clean Uniform',
    'the choice was filed',
    'chose The Clean Uniform',
  ]);
});

test('a miss stays in the retelling ahead of the later completion', () => {
  const state = freshStory();
  state.story.beatIndex = 1;
  failEncounter(state, 'encounter_failed', 50);
  assert.equal(recoverEncounter(state, 70).ok, true);
  assert.equal(recordBeatStep(state, 'mission:completed', {
    storyTag: 'campaign47a:b1:alloy_run',
  }, 80).ok, true);
  assert.deepEqual(retellLedger(leftoverLedgerLine(state)), [
    'missing the honest work',
    'the attempt failed',
    'flew the sealed alloys to Tethys',
  ]);
});

test('the berth mechanic reads the campaign back', () => {
  const state = playedCampaign();
  state.player = { ownedShips: [{ defId: 'ship_kestrel' }], activeShipIndex: 0, heat: 0 };
  const view = buildDockArrival(state, { id: STATION, name: STATION_NAME, services: [] });
  assert.equal(view.ledger, null, 'the hull mechanic keeps the single name plate');
  assert.equal(view.mechanic.title, 'Mechanic');
  assert.match(view.mechanic.body, /Clean plate/);
  assert.match(view.mechanic.body, /sampling the variance/);
  assert.deepEqual(retellLedger(view.mechanic.body.slice(view.mechanic.body.indexOf('I was'))), CAMPAIGN_RETELL);

  const quiet = playedCampaign();
  const arrival = buildDockArrival(quiet, { id: STATION, name: STATION_NAME, services: [] });
  assert.equal(arrival.ledgerLine, leftoverLedgerLine(quiet));
  assert.ok(arrival.lines.includes(arrival.ledgerLine));

  const frame = stationFrameHtml();
  assert.match(frame, /sxb-berth__ledger/);
  const appSrc = readFileSync(join(ROOT, 'src/ui/station/stationApp.js'), 'utf8');
  assert.match(appSrc, /writeBerthArrival\(\s*\{ newsEl, cardEl: eventEl(?:, state: s)? \}\s*,\s*arrival\s*,/);
  assert.match(appSrc, /sxb-berth__ledger/);

  const ledgerEl = berthCardHost();
  const painted = writeBerthArrival(
    { newsEl: { textContent: '' }, cardEl: berthCardHost(), ledgerEl },
    arrival,
  );
  assert.equal(painted.ledger.body, arrival.ledgerLine);
  assert.equal(ledgerEl.hidden, false);
  assert.equal(ledgerEl.querySelector('.sxb-event__title').textContent, 'Mechanic');
  assert.match(ledgerEl.getAttribute('aria-label'), /sampling the variance/);

  const silent = writeBerthArrival(
    { newsEl: { textContent: '' }, cardEl: berthCardHost(), ledgerEl: berthCardHost() },
    buildDockArrival({ ui: { marketNews: { log: [], lastCard: null } } }, {
      id: STATION, name: STATION_NAME, services: [],
    }),
  );
  assert.equal(silent.ledger, null);
});
