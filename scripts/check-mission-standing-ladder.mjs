#!/usr/bin/env node
// Guards the faction contract ladder: mission risk must map to visible standing gates, and locked
// offers must be blocked before collateral, board mutation, or active mission creation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MISSION_STANDING_LADDER,
  MISSION_TUNING,
  missionMinRepForRisk,
  missionStandingGateForMinRep,
  missionStandingGateForRisk,
  STORY_BRANCH_INTROS,
  STORY_BRANCH_INTRO_TAG,
} from '../src/data/missions.js';
import { missions } from '../src/systems/missions.js';
import {
  missionPreflight,
  missionStandingRequirement,
} from '../src/ui/missionPreflight.js';
import {
  factionContractLadderRows,
  factionContractLadderText,
} from '../src/ui/screens/factions.js';
import { recommendMissionBoardOffer } from '../src/ui/screens/stationHub.js';

const dataSrc = readFileSync(new URL('../src/data/missions.js', import.meta.url), 'utf8');
const missionsSrc = readFileSync(new URL('../src/systems/missions.js', import.meta.url), 'utf8');
const preflightSrc = readFileSync(new URL('../src/ui/missionPreflight.js', import.meta.url), 'utf8');
const stationHubSrc = readFileSync(new URL('../src/ui/screens/stationHub.js', import.meta.url), 'utf8');
const factionsSrc = readFileSync(new URL('../src/ui/screens/factions.js', import.meta.url), 'utf8');

assert.match(dataSrc, /export const MISSION_STANDING_LADDER/,
  'mission standing ladder must live in canonical mission data');
assert.doesNotMatch(missionsSrc, /riskTier,\s*minRep/,
  'generated mission offers should not persist derived standing requirements');
assert.match(missionsSrc, /function missionOfferMinRep\(offer, state = null\)/,
  'acceptance must derive standing requirements for old saves as well as new offers');
assert.match(preflightSrc, /export function missionStandingRequirement/,
  'mission preflight must expose the shared standing requirement helper');
assert.match(missionsSrc, /_rollStoryBranchIntroOffer/,
  'Beat 4 story-intro offers must be explicitly generated and tagged');
assert.match(stationHubSrc, /st-mission-standing/,
  'mission cards must render a dedicated standing gate line');
assert.match(factionsSrc, /export function factionContractLadderRows/,
  'Faction dossier must expose direct-testable contract ladder rows');
assert.match(factionsSrc, /st-fac-contracts/,
  'Faction dossier must render contract ladder rows');

assert.ok(MISSION_STANDING_LADDER.length >= 5, 'ladder should include playable and aspirational tiers');
assert.equal(missionMinRepForRisk(0), -149, 'R0 work should stay available above aggro');
assert.equal(missionMinRepForRisk(1), -149, 'R1 work should stay available above aggro');
assert.equal(missionMinRepForRisk(2), -29, 'R2 work should require neutral standing');
assert.equal(missionMinRepForRisk(3), 30, 'R3 work should require Accepted standing');
assert.equal(missionMinRepForRisk(4), 150, 'R4 work should require Trusted standing');
assert.equal(missionStandingGateForRisk(4).name, 'Trusted Work',
  'R4 should map to the Trusted Work gate, not the aspirational Allied tier');
assert.equal(missionStandingGateForMinRep(-29).name, 'Neutral Board',
  'effective intro-safe standing thresholds should display the Neutral gate');
assert.equal(STORY_BRANCH_INTROS.length, 3, 'Beat 4 must author one explicit intro for each branch path');
assert.deepEqual(STORY_BRANCH_INTROS.map((intro) => intro.branch).sort(), ['free', 'patrol', 'traders'],
  'Beat 4 intro identities must cover Free, Patrol, and Traders branches');

function offer(overrides = {}) {
  return {
    id: overrides.id || 'offer_ladder',
    type: 'cargo_delivery',
    title: overrides.title || 'Standing Gate Delivery',
    factionId: 'faction_scn',
    reward_cr: 1000,
    collateral_cr: 0,
    riskTier: 1,
    time_limit_s: 900,
    destStationId: 'station_beltout',
    destSectorId: 'sector_ceres_belt',
    distance: 800,
    params: { cmdtyId: 'cmdty_gas_hydrogen', qty: 1, taskTime: 20 },
    ...overrides,
  };
}

function state({ rep = 0, capVolume = 20, credits = 5000 } = {}) {
  return {
    simTime: 0,
    meta: { seed: 47 },
    mode: 'flight',
    playerId: 1,
    player: {
      credits,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume, capMass: 100 },
      stats: {},
    },
    factions: {
      faction_scn: { rep, tier: 'Neutral', aggro: rep <= -150, lastDelta: { value: 0, reason: 'init', t: 0 } },
    },
    missions: {
      boards: { station_helios: { refreshEpoch: 0, slots: [] } },
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: { ...MISSION_TUNING, maxActive: 8 },
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    ui: {},
    nav: {},
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map(),
  };
}

function bus() {
  const events = [];
  return {
    events,
    on() {},
    emit(type, payload) { events.push({ type, payload }); },
  };
}

let lockedReq = missionStandingRequirement(offer({ riskTier: 4 }), state({ rep: 0 }));
assert.equal(lockedReq.ok, false, 'R4 offer should lock for neutral players');
assert.equal(lockedReq.minRep, 150, 'R4 offer should require +150 standing');
assert.equal(lockedReq.blocker, 'Need +150 standing with Concord',
  'standing blocker should name the exact faction and threshold');
assert.equal(lockedReq.chip.kind, 'bad', 'locked standing chips should read as bad');

const lockedPreflight = missionPreflight(offer({ riskTier: 4 }), state({ rep: 0 }));
assert.equal(lockedPreflight.blocker, 'Need +150 standing with Concord',
  'preflight should make standing locks the visible blocker');
assert.ok(lockedPreflight.chips.some((chip) => chip.kind === 'bad' && /\+150 Concord standing required/.test(chip.text)),
  'preflight should render a standing-required chip');

const trustedReq = missionStandingRequirement(offer({ riskTier: 4 }), state({ rep: 150 }));
assert.equal(trustedReq.ok, true, 'Trusted players should unlock R4 work');
assert.equal(trustedReq.chip.text, 'Trusted+ standing met',
  'unlocked standing chips should name the gate met');

const branchState = state({ rep: 0 });
branchState.story.beatIndex = 4;
const untaggedBranchReq = missionStandingRequirement(offer({ riskTier: 4, factionId: 'faction_mts' }), branchState);
assert.equal(untaggedBranchReq.ok, false,
  'untagged B4 faction offers should remain normal standing-gated contracts');
assert.equal(untaggedBranchReq.minRep, 150,
  'untagged B4 faction offers should keep the risk-derived Trusted gate');

const branchReq = missionStandingRequirement(offer({
  riskTier: 4,
  factionId: 'faction_mts',
  storyTag: STORY_BRANCH_INTRO_TAG,
  storyBranch: 'traders',
}), branchState);
assert.equal(branchReq.ok, true,
  'B4 faction-choice offers should stay available at neutral standing even if generated risk is high');
assert.equal(branchReq.minRep, -29,
  'B4 faction-choice offers should derive the intro-safe Neutral gate');
assert.equal(branchReq.gateName, 'Neutral Board',
  'B4 faction-choice offers should display the intro-safe Neutral gate, not the generated risk gate');
assert.equal(branchReq.gateShort, 'Neutral+',
  'B4 faction-choice chips should name the effective Neutral gate');
assert.equal(branchReq.chip.text, 'Neutral+ standing met',
  'B4 faction-choice chips should not claim Trusted standing was met');
assert.doesNotMatch(branchReq.gateName + ' ' + branchReq.chip.text, /Trusted/,
  'B4 faction-choice display copy must not leak the generated R4 Trusted gate');

const malformedBranchReq = missionStandingRequirement(offer({
  riskTier: 4,
  factionId: 'faction_mts',
  storyTag: STORY_BRANCH_INTRO_TAG,
  storyBranch: 'patrol',
}), branchState);
assert.equal(malformedBranchReq.ok, false,
  'malformed tagged B4 intros should not receive the neutral waiver');
assert.equal(malformedBranchReq.minRep, 150,
  'malformed tagged B4 intros should fall back to the risk-derived standing gate');

let recommendation = recommendMissionBoardOffer([
  offer({ id: 'locked_r4', title: 'Severe Contract', riskTier: 4, reward_cr: 12000 }),
  offer({ id: 'open_r1', title: 'Open Contract', riskTier: 1, reward_cr: 900 }),
], state({ rep: 0 }));
assert.equal(recommendation.missionId, 'open_r1',
  'recommendation should prefer open work over high-pay standing-locked bait');
assert.equal(recommendation.disabled, false, 'open recommendation should remain actionable');

recommendation = recommendMissionBoardOffer([
  offer({ id: 'locked_only', title: 'Only Locked Work', riskTier: 4, reward_cr: 9000 }),
], state({ rep: 0 }));
assert.equal(recommendation.missionId, 'locked_only',
  'when all work is locked, recommendation should still name the best standing target');
assert.equal(recommendation.disabled, true, 'locked recommendation CTA must be disabled');
assert.equal(recommendation.label, 'PREP FIRST', 'locked recommendation should be framed as prep');
assert.match(recommendation.reason, /Need \+150 standing with Concord/,
  'locked recommendation should explain the standing threshold');

const ladderNeutral = factionContractLadderRows(0);
assert.ok(ladderNeutral.some((row) => row.name === 'Recovery Work' && row.unlocked),
  'neutral players should see recovery work unlocked');
assert.ok(ladderNeutral.some((row) => row.name === 'Accepted Contracts' && !row.unlocked),
  'neutral players should see Accepted Contracts as a future unlock');
assert.match(factionContractLadderText(0), /30 rep to unlock Accepted Contracts/,
  'Faction dossier should tell the player the next contract standing target');
assert.match(factionContractLadderText(170), /Trusted work unlocked/,
  'Trusted players should see the long-term allied target instead of a fake R5 lock');

const lockedState = state({ rep: 0 });
const lockedOffer = offer({ id: 'offer_locked_r4', riskTier: 4, minRep: 150, collateral_cr: 800 });
lockedState.missions.boards.station_helios.slots = [lockedOffer];
const lockedBus = bus();
missions.init({ state: lockedState, bus: lockedBus, helpers: { hash32: () => 1 } });
assert.equal(missions.acceptMission('offer_locked_r4'), false,
  'system accept path must reject standing-locked offers');
assert.equal(lockedState.missions.active.length, 0, 'standing lock must not create an active mission');
assert.equal(lockedState.missions.boards.station_helios.slots.length, 1,
  'standing lock must leave the board offer posted');
assert.equal(lockedBus.events.some((event) => event.type === 'economy:chargeCredits'), false,
  'standing lock must reject before charging collateral');
assert.ok(lockedBus.events.some((event) =>
  event.type === 'toast' && /standing \+150 required/.test(event.payload && event.payload.text || '')),
  'standing lock should tell the player the exact standing threshold');

const branchAcceptState = state({ rep: 0 });
branchAcceptState.story.beatIndex = 4;
const branchOffer = offer({
  id: 'offer_branch_intro',
  factionId: 'faction_mts',
  riskTier: 4,
  storyTag: STORY_BRANCH_INTRO_TAG,
  storyBranch: 'traders',
});
branchAcceptState.missions.boards.station_helios.slots = [branchOffer];
const branchBus = bus();
missions.init({ state: branchAcceptState, bus: branchBus, helpers: { hash32: () => 1 } });
assert.equal(missions.acceptMission('offer_branch_intro'), true,
  'B4 branch intro offer should pass the system accept path at neutral standing');
assert.equal(branchAcceptState.missions.active.length, 1,
  'B4 branch intro offer should become active instead of being standing-locked');
assert.equal(branchAcceptState.story.branch, 'traders',
  'tagged B4 branch intro offer should choose the authored branch identity');

const untaggedAcceptState = state({ rep: 0 });
untaggedAcceptState.story.beatIndex = 4;
untaggedAcceptState.missions.boards.station_helios.slots = [offer({
  id: 'offer_untagged_branch_faction',
  factionId: 'faction_mts',
  riskTier: 4,
})];
const untaggedBus = bus();
missions.init({ state: untaggedAcceptState, bus: untaggedBus, helpers: { hash32: () => 1 } });
assert.equal(missions.acceptMission('offer_untagged_branch_faction'), false,
  'untagged B4 branch-faction offers should not bypass the contract ladder');
assert.equal(untaggedAcceptState.story.branch, null,
  'untagged B4 branch-faction offers should not select a story branch');

const malformedAcceptState = state({ rep: 0 });
malformedAcceptState.story.beatIndex = 4;
malformedAcceptState.missions.boards.station_helios.slots = [offer({
  id: 'offer_malformed_branch_intro',
  factionId: 'faction_mts',
  riskTier: 4,
  storyTag: STORY_BRANCH_INTRO_TAG,
  storyBranch: 'patrol',
})];
const malformedBus = bus();
missions.init({ state: malformedAcceptState, bus: malformedBus, helpers: { hash32: () => 1 } });
assert.equal(missions.acceptMission('offer_malformed_branch_intro'), false,
  'malformed tagged B4 intros should not bypass the contract ladder in the system accept path');
assert.equal(malformedAcceptState.story.branch, null,
  'malformed tagged B4 intros should not select a story branch');

const generatedIntroState = state({ rep: 0 });
generatedIntroState.story.beatIndex = 4;
generatedIntroState.missions.boards = {};
const generatedIntroBus = bus();
missions.init({ state: generatedIntroState, bus: generatedIntroBus, helpers: { hash32: () => 77 } });
const generatedBoard = missions.ensureBoard('station_tethys');
assert.ok(generatedBoard && generatedBoard.slots && generatedBoard.slots.length,
  'B4 branch station boards should generate normal mission slots');
const generatedIntro = generatedBoard.slots[0];
assert.equal(generatedIntro.storyTag, STORY_BRANCH_INTRO_TAG,
  'B4 branch station boards should put an explicitly tagged intro contract first');
assert.equal(generatedIntro.storyBranch, 'traders',
  'B4 MTS intro contract should carry the authored traders branch identity');
assert.equal(generatedIntro.factionId, 'faction_mts',
  'B4 MTS intro contract should keep the offering faction');
assert.equal(generatedIntro.type, STORY_BRANCH_INTROS.find((intro) => intro.branch === 'traders').type,
  'B4 intro contract type should come from canonical story intro data');

const staleIntroState = state({ rep: 0 });
staleIntroState.story.beatIndex = 3;
staleIntroState.missions.boards = {};
const staleIntroBus = bus();
missions.init({ state: staleIntroState, bus: staleIntroBus, helpers: { hash32: () => 91 } });
const stalePreBeatBoard = missions.ensureBoard('station_tethys');
assert.ok(stalePreBeatBoard && stalePreBeatBoard.slots && stalePreBeatBoard.slots.length,
  'pre-B4 branch station boards should generate normal cached mission slots');
assert.notEqual(stalePreBeatBoard.slots[0].storyTag, STORY_BRANCH_INTRO_TAG,
  'pre-B4 cached boards should not already contain the B4 story intro');
staleIntroState.story.beatIndex = 4;
const staleRefreshedBoard = missions.ensureBoard('station_tethys');
assert.notEqual(staleRefreshedBoard, stalePreBeatBoard,
  'same-epoch cached branch boards should regenerate when Beat 4 requires an intro contract');
assert.equal(staleRefreshedBoard.slots[0].storyTag, STORY_BRANCH_INTRO_TAG,
  'same-epoch cached branch boards should put the tagged B4 intro first after story advancement');
assert.equal(staleRefreshedBoard.slots[0].storyBranch, 'traders',
  'same-epoch cached MTS boards should refresh into the authored traders intro');

const transitionIntroState = state({ rep: 0 });
transitionIntroState.story.beatIndex = 3;
transitionIntroState.missions.boards = {};
const transitionIntroBus = bus();
missions.init({ state: transitionIntroState, bus: transitionIntroBus, helpers: { hash32: () => 99 } });
const transitionPreBeatBoard = missions.ensureBoard('station_tethys');
missions._advanceStory({ id: 'test_enter_branch_choice', beat: 3, next: 4 });
const transitionRefreshedBoard = transitionIntroState.missions.boards.station_tethys;
assert.notEqual(transitionRefreshedBoard, transitionPreBeatBoard,
  'Beat 4 story advancement should refresh already-cached branch station boards');
assert.equal(transitionRefreshedBoard.slots[0].storyTag, STORY_BRANCH_INTRO_TAG,
  'Beat 4 story advancement should leave cached branch boards with a tagged intro first');
assert.ok(transitionIntroBus.events.some((event) => event.type === 'mission:updated'),
  'Beat 4 story advancement should notify station UI after refreshing cached intro boards');

const trustedState = state({ rep: 150 });
const trustedOffer = offer({ id: 'offer_unlocked_r4', riskTier: 4, minRep: 150 });
trustedState.missions.boards.station_helios.slots = [trustedOffer];
const trustedBus = bus();
missions.init({ state: trustedState, bus: trustedBus, helpers: { hash32: () => 1 } });
assert.equal(missions.acceptMission('offer_unlocked_r4'), true,
  'Trusted standing should allow the same R4 offer through the accept path');
assert.equal(trustedState.missions.active.length, 1, 'unlocked offer should become active');
assert.equal(trustedState.missions.boards.station_helios.slots.length, 0,
  'unlocked offer should leave the board after accept');

console.log('Mission standing ladder OK - contract risk gates, story-intro identity, board copy, faction dossier, and accept enforcement agree.');
