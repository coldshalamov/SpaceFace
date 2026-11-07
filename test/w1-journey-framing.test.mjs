// W1 Journey framing — the act table, the durable act surfaces, and the story-first board
// recommendation. Run: node --test test/w1-journey-framing.test.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JOURNEY_ACTS, journeyActForBeat, journeyActLabel } from '../src/data/journeyActs.js';
import { STORY_BEATS } from '../src/data/missions.js';
import { storyBeatTitle } from '../src/systems/missions.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { recommendMissionBoardOffer } from '../src/ui/station/stationMissionModel.js';
import { flightDestinationSurface } from '../src/ui/hud.js';

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
  assert.equal(journeyActForBeat(null), null, 'null is not beat 0');
  assert.equal(journeyActForBeat(undefined), null, 'undefined is not beat 0');
  assert.equal(journeyActForBeat(''), null, 'empty string is not beat 0');
  assert.equal(journeyActForBeat(1.9), journeyActForBeat(1), 'floors fractional beats');
});

test('the act line is one stable heading and the beat label stays actionable', () => {
  assert.equal(journeyActLabel(journeyActForBeat(2)), 'ACT II - THE CINDER BOARD');
  assert.equal(journeyActLabel(null), '');
  assert.equal(storyBeatTitle(STORY_BEATS[2]), 'First Blood');
  assert.doesNotMatch(storyBeatTitle(STORY_BEATS[2]), /Cinder Board/,
    'the act is separate state, never a label prefix');
});

test('the HUD tracker paints the act as its own line above the objective', () => {
  const state = { story: { beatIndex: 2, flags: {} } };
  const story = flightDestinationSurface(state, { owner: 'story' });
  assert.equal(story.actLine, 'ACT II - THE CINDER BOARD');
  assert.equal(story.show, true);
  const navigation = flightDestinationSurface(state, {
    owner: 'navigation',
    waypoint: { reason: 'Recover the marked sample', label: '47-A Recovery Site' },
  });
  assert.equal(navigation.actLine, 'ACT II - THE CINDER BOARD');
  assert.match(navigation.line, /^Recover the marked sample/,
    'the beat-specific reason owns the objective line');
  const ended = flightDestinationSurface(
    { story: { beatIndex: 7, flags: { endgame: true } } },
    { owner: 'story' },
  );
  assert.equal(ended.actLine, '', 'a closed book has no live act to name');
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

function state(beatIndex = 1, overrides = {}) {
  return {
    player: {
      credits: 5000, ownedShips: ['ship_kit'], debt: 0,
      cargo: { items: {}, capVolume: 100, usedVolume: 0, capMass: 100, usedMass: 0 },
    },
    factions: { faction_mts: { rep: 0 }, faction_scn: { rep: 0 } },
    story: { beatIndex, flags: {} },
    ...overrides,
  };
}

test('the board recommends the book job over juicier procedural rows', () => {
  const book = slot({
    id: 'mo_47a_b1', storyTag: 'campaign47a:b1:alloy_run', campaign47aBeat: 1,
    type: 'cargo_delivery', title: 'Weigh-In — sealed alloy delivery', reward_cr: 600, riskTier: 1,
  });
  const juicy = slot({ id: 'mo_big', reward_cr: 2400, riskTier: 0 });
  const pick = recommendMissionBoardOffer([juicy, book], state(1));
  assert.ok(pick, 'a recommendation exists');
  assert.equal(String(pick.missionId), 'mo_47a_b1', 'the campaign row wins');
  assert.equal(pick.label, 'THE BOOK');
});

test('branch intro rows count as journey steps; final-disposition filings do not', () => {
  const intro = slot({
    id: 'mo_intro', storyTag: 'story.branch_intro', campaign47aBeat: 4,
    type: 'bulk_trade', reward_cr: 300,
  });
  const pick = recommendMissionBoardOffer([intro], state(4));
  assert.equal(String(pick.missionId), 'mo_intro');
  assert.equal(pick.label, 'THE BOOK');

  const filing = slot({
    id: 'mo_file', storyTag: 'campaign47a:ending:A', storyDisposition: 'A',
    campaign47aBeat: 4, reward_cr: 0,
  });
  const plain = slot({ id: 'mo_plain' });
  const pick2 = recommendMissionBoardOffer([filing, plain], state(4));
  assert.equal(pick2, null,
    'with no valid journey row the live spine offers no badge at all');
});

test('a blocked book job names the book, the blocker, and demands prep first', () => {
  const book = slot({
    id: 'mo_47a_b1', storyTag: 'campaign47a:b1:alloy_run', campaign47aBeat: 1,
    type: 'cargo_delivery', title: 'Weigh-In — sealed alloy delivery', reward_cr: 600, riskTier: 1,
    factionId: 'faction_mts', minRep: 150,
    params: { cmdtyId: 'cmdty_alloys', qty: 400 },
  });
  const pick = recommendMissionBoardOffer([book], state(1));
  assert.ok(pick, 'recommendation exists even when blocked');
  assert.equal(pick.disabled, true, 'a blocked book job is not actionable');
  assert.equal(pick.state, 'blocked');
  assert.equal(pick.label, 'PREP FIRST');
  assert.equal(pick.actionLabel, 'Resolve Prep');
  assert.ok(pick.blocker, 'the board can name the blocker instead of a bare badge');
  assert.match(pick.blocker, /standing with Meridian/);
  assert.match(pick.reason, /standing with Meridian/);
});

test('the doubled interdiction contract is never THE BOOK', () => {
  const doubled = slot({
    id: 'mo_47a_b4_doubled_1b_0', storyTag: 'campaign47a:b4:doubled', campaign47aBeat: 4,
    type: 'bounty_hunt', riskTier: 2, reward_cr: 1600,
  });
  const procedural = slot({ id: 'mo_plain', reward_cr: 2400 });
  const pick = recommendMissionBoardOffer([doubled, procedural], state(4));
  assert.equal(pick, null, 'the doubled row never badges as the journey');
});

test('a journey row from another beat or without an id never badges', () => {
  const wrongBeat = slot({
    id: 'mo_47a_b1', storyTag: 'campaign47a:b1:alloy_run', campaign47aBeat: 1,
    type: 'cargo_delivery', reward_cr: 600, riskTier: 1,
  });
  assert.equal(recommendMissionBoardOffer([wrongBeat], state(2)), null,
    'a stale cross-beat row does not badge');

  const noId = slot({
    id: '', storyTag: 'campaign47a:b1:alloy_run', campaign47aBeat: 1,
    type: 'cargo_delivery', reward_cr: 600, riskTier: 1,
  });
  assert.equal(recommendMissionBoardOffer([noId], state(1)), null,
    'a journey row without a real id cannot render a CTA');
});

test('a ready journey row beats an earlier blocked one', () => {
  const blocked = slot({
    id: 'mo_47a_b1_blocked', storyTag: 'campaign47a:b1:alloy_run', campaign47aBeat: 1,
    type: 'cargo_delivery', reward_cr: 600, riskTier: 1,
    factionId: 'faction_mts', minRep: 150,
  });
  const ready = slot({
    id: 'mo_47a_b1_ready', storyTag: 'campaign47a:b1:infested', campaign47aBeat: 1,
    type: 'patrol_clear', reward_cr: 600, riskTier: 1,
  });
  const pick = recommendMissionBoardOffer([blocked, ready], state(1));
  assert.equal(String(pick.missionId), 'mo_47a_b1_ready');
  assert.equal(pick.disabled, false);
});

test('when the spine posts no board row the board goes quiet (B6)', () => {
  const pick = recommendMissionBoardOffer([slot({ id: 'mo_side', reward_cr: 2400 })], state(6));
  assert.equal(pick, null, 'procedural side work must not compete with the live tracker');
});

test('the journey row is explicitly exempt from the first-loop safe-work gate', () => {
  const book = slot({
    id: 'mo_47a_b1', storyTag: 'campaign47a:b1:alloy_run', campaign47aBeat: 1,
    type: 'cargo_delivery', title: 'Weigh-In', reward_cr: 600, riskTier: 2,
  });
  const riskySide = slot({ id: 'mo_side', reward_cr: 9000, riskTier: 2 });
  const onboarding = { active: true, finished: false, beatDoneAt: {} };
  const pick = recommendMissionBoardOffer([book, riskySide], state(1, { onboarding }));
  assert.equal(String(pick.missionId), 'mo_47a_b1',
    'the authored route is not side work and stays recommendable');
  assert.equal(pick.disabled, false);
});

function freshMissionHarness() {
  const state = createGameState(47);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.heat = 0;
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 200,
  };
  state.factions = state.factions || {};
  for (const id of ['faction_scn', 'faction_mts', 'faction_free', 'faction_dmc']) {
    state.factions[id] = state.factions[id] || { rep: 0, aggro: false };
    state.factions[id].rep = 0;
  }
  state.entities = state.entities || new Map();
  state.entities.set(1, {
    id: 1, team: 'player', pos: { x: 0, y: 0, z: 0 },
    flags: {}, hull: 100, maxHull: 100,
  });
  state.onboarding = { active: false, finished: true };
  const bus = createBus();
  const popups = [];
  bus.on('comms:popup', (p) => popups.push(p));
  const helpers = {
    voice: { say: () => true },
    spawnEntity: (spec) => {
      const id = state.entities.size ? Math.max(...state.entities.keys()) + 1 : 1;
      const entity = { id, alive: true, ...spec, data: structuredClone(spec.data || {}) };
      state.entities.set(id, entity);
      state.entityList = state.entityList || [];
      state.entityList.push(entity);
      return entity;
    },
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: null });
  missions.newGame();
  return { state, bus, missions, popups };
}

test('Act I announces once on a fresh save and every act keeps a persistent receipt', () => {
  const h = freshMissionHarness();
  const actOne = h.popups.find((p) => p && p.id === 'act:I');
  assert.ok(actOne, 'the first act has a durable receipt on a fresh save');
  assert.match(actOne.text, /ACT I - THE PIT/);
  assert.equal(actOne.persist, true, 'the act line survives a missed toast');
  const before = h.popups.filter((p) => p && p.id === 'act:I').length;
  h.missions._announceJourneyAct(journeyActForBeat(0));
  assert.equal(h.popups.filter((p) => p && p.id === 'act:I').length, before,
    'the same act is not re-announced');

  // The turn itself: B5 -> B6 crosses into Act IV and must leave the same durable receipt
  // (the dock modal can hide the toast; the persistent line cannot).
  h.state.story.beatIndex = 5;
  h.missions._advanceStory(STORY_BEATS[5]);
  assert.equal(h.state.story.beatIndex, 6);
  const actFour = h.popups.find((p) => p && p.id === 'act:IV');
  assert.ok(actFour, 'the act turn emits a persistent act:<n> line');
  assert.match(actFour.text, /ACT IV - THE DEEP REACH/);
});

test('the act announcement method is the same shared writer used by the turn', () => {
  const bus = createBus();
  const popups = [];
  bus.on('comms:popup', (p) => popups.push(p));
  const system = {
    state: { story: { flags: {} } },
    bus,
    _announceJourneyAct: missionsProto._announceJourneyAct,
  };
  system._announceJourneyAct(journeyActForBeat(2));
  system._announceJourneyAct(journeyActForBeat(2));
  assert.equal(popups.length, 1);
  assert.equal(popups[0].id, 'act:II');
  assert.equal(popups[0].persist, true);
});
