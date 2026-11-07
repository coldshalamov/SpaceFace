// W1 Journey framing — the act table, the durable act surfaces, and the story-first board
// recommendation. Run: node --test test/w1-journey-framing.test.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JOURNEY_ACTS, journeyActForBeat, journeyActLabel, journeyActTrackerLabel } from '../src/data/journeyActs.js';
import { STORY_BEATS } from '../src/data/missions.js';
import { storyBeatTitle } from '../src/systems/missions.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { recommendMissionBoardOffer } from '../src/ui/station/stationMissionModel.js';
import { flightDestinationSurface } from '../src/ui/hud.js';
import { codexJourneyActRows } from '../src/ui/screens/codex.js';
import { journalJourneyActStrip, storyActionForBeat } from '../src/ui/screens/missionLog.js';

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
  assert.equal(journeyActTrackletLabelSafe(), true);
  assert.equal(journeyActLabel(null), '');
  assert.equal(storyBeatTitle(STORY_BEATS[2]), 'First Blood');
  assert.doesNotMatch(storyBeatTitle(STORY_BEATS[2]), /Cinder Board/,
    'the act is separate state, never a label prefix');
});

function journeyActTrackletLabelSafe() {
  for (const act of JOURNEY_ACTS) {
    const label = journeyActTrackerLabel(act);
    assert.ok(label.length <= 30, `${label} fits the 290px nowrap tracker`);
    assert.ok(label.startsWith(`ACT ${act.num} - `), 'the tracker keeps the act identity');
  }
  assert.equal(journeyActTrackerLabel(journeyActForBeat(4)), 'ACT III - THREE DOORS',
    'the long canon title keeps a short tracker form');
  return true;
}

test('Codex locks future acts and keeps the verb on reached articles', () => {
  const rows = codexJourneyActRows({ beatIndex: 1, flags: {} });
  const actOne = rows.find((row) => row.id === 'act:I');
  const actThree = rows.find((row) => row.id === 'act:III');
  const actFour = rows.find((row) => row.id === 'act:IV');
  assert.equal(actOne.locked, false);
  assert.match(actOne.body, /Sample and haul/, 'the reached act article names its verb');
  assert.equal(actThree.locked, true, 'a future act is locked');
  assert.equal(actThree.body, '— not yet encountered —', 'a future act does not reveal its goal or line');
  assert.equal(actFour.locked, true, 'Act IV stays sealed on an early save');
});

test('the Journal keeps a persistent act strip beside a tracked job, and drops it after the book', () => {
  const live = { story: { beatIndex: 5, flags: {} } };
  const strip = journalJourneyActStrip(live);
  assert.ok(strip, 'the act is a Journal surface, not only a recommendation');
  assert.equal(strip.label, 'ACT III - THREE DOORS, ONE ADMINISTRATOR');
  assert.match(strip.goal, /Pick a side/);
  assert.equal(journalJourneyActStrip({ story: { beatIndex: 7, flags: { endgame: true } } }), null,
    'the strip is suppressed once the book closes');
  assert.equal(journalJourneyActStrip({ story: { beatIndex: 8, flags: { sandboxContinued: true } } }), null,
    'a sandbox save names no live act');
});

test('the Journal B2 what-next follows the same ordered steps as the tracker', () => {
  const state = (completed) => ({
    story: { beatIndex: 2, flags: {}, campaign47a: { stepProgress: { '2': { completed } } } },
    missions: { active: [], boards: {} },
    player: { credits: 0 },
  });
  assert.equal(storyActionForBeat(STORY_BEATS[2], state([])).title, 'Arm for a bounty');
  assert.equal(storyActionForBeat(STORY_BEATS[2], state(['cinder_board'])).title, 'Feed the Compost Run');
  assert.equal(storyActionForBeat(STORY_BEATS[2], state(['cinder_board', 'compost'])).title, 'Clear the Nest');
  assert.equal(storyActionForBeat(STORY_BEATS[2], state(['cinder_board', 'compost', 'nest'])).title,
    'Read the Registry Writ');
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

test('the real B4 producer stamps the live beat so the three-door choice badges', () => {
  const state = createGameState(47);
  state.story = { beatIndex: 4, branch: null, flags: {}, chainProgress: 0, journeyActs: { seen: [], current: null } };
  state.onboarding = { active: false, finished: true };
  const bus = createBus();
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers: {}, registry: null });
  const stationIds = ['station_tethys', 'station_helios', 'station_reach'];
  for (const stationId of stationIds) missions.ensureBoard(stationId);
  const rows = [];
  for (const stationId of stationIds) {
    const board = state.missions.boards[stationId];
    rows.push(...(board?.slots || []).filter((row) => row && row.storyTag === 'story.branch_intro'));
  }
  assert.equal(rows.length, 3, 'all three doors post from the real producer');
  for (const row of rows) assert.equal(row.campaign47aBeat, 4, 'the producer names its live beat');
  const pick = recommendMissionBoardOffer(rows, state);
  assert.ok(pick, 'the real three-door choice is recommendable');
  assert.equal(pick.label, 'THE BOOK');
  assert.ok(rows.some((row) => String(pick.missionId) === String(row.id)));

  // The refresh path must also re-post a missing door with the same stamp.
  const tethys = state.missions.boards.station_tethys;
  tethys.slots = tethys.slots.filter((row) => row?.storyTag !== 'story.branch_intro');
  assert.equal(missions._refreshStoryBranchIntroBoards(), true);
  // ensureBoard replaces the board object; re-read the canonical reference.
  const refreshed = state.missions.boards.station_tethys;
  assert.ok(refreshed, 'the board survives the refresh');
  const restored = refreshed.slots.find((row) => row?.storyTag === 'story.branch_intro');
  assert.ok(restored, 'the real refresh path re-posts the door');
  assert.equal(restored.campaign47aBeat, 4);
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
  assert.equal(h.state.story.journeyActs.current, 'I', 'the act state is the durable destination');
  assert.deepEqual(h.state.story.journeyActs.seen, ['I']);
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
  assert.equal(h.state.story.journeyActs.current, 'IV');
  assert.deepEqual(h.state.story.journeyActs.seen, ['I', 'II', 'III', 'IV']);
});

test('a dropped popup cannot suppress the act: the state record is written before the flag', () => {
  const bus = createBus();
  const system = {
    state: { story: { flags: {} } },
    bus,
    _announceJourneyAct: missionsProto._announceJourneyAct,
    _publishJourneyAct: missionsProto._publishJourneyAct,
  };
  // No popups are observed here: this simulates a gate/eviction that drops the event.
  system._announceJourneyAct(journeyActForBeat(2));
  assert.deepEqual(system.state.story.journeyActs.seen, ['II']);
  assert.equal(system.state.story.flags.journey_act_II_announced, true);
});

test('Continue replays the current act from the saved state record', () => {
  const h = freshMissionHarness();
  h.state.story.beatIndex = 4;
  h.popups.length = 0;
  h.missions._announceJourneyAct(journeyActForBeat(4));
  assert.equal(h.state.story.journeyActs.current, 'III');
  assert.deepEqual(h.state.story.journeyActs.seen, ['I', 'II', 'III']);
  const savedStory = structuredClone(h.state.story);
  // A save taken after the popup was dropped: the flag is already set. Continue must still
  // publish the durable receipt because the popup is not itself saved.
  const h2 = freshMissionHarness();
  h2.popups.length = 0;
  h2.state.story = savedStory;
  h2.missions._reconcileJourneyAct();
  const replayed = h2.popups.find((p) => p && p.id === 'act:III');
  assert.ok(replayed, 'the current act is replayed on load');
  assert.equal(replayed.storyReceipt, true);
  assert.equal(h2.state.story.journeyActs.current, 'III');
});

test('a pre-W1 mid-act save backfills every act through the current beat', () => {
  const bus = createBus();
  const popups = [];
  bus.on('comms:popup', (p) => popups.push(p));
  const system = {
    state: { story: { beatIndex: 5, flags: {} } },
    bus,
    journeyActForBeat,
    _reconcileJourneyAct: missionsProto._reconcileJourneyAct,
    _publishJourneyAct: missionsProto._publishJourneyAct,
  };
  system._reconcileJourneyAct();
  assert.deepEqual(system.state.story.journeyActs.seen, ['I', 'II', 'III']);
  assert.equal(popups.filter((p) => p && p.id === 'act:III').length, 1);
  assert.equal(popups.some((p) => p && p.id === 'act:IV'), false,
    'a future act is not announced by the backfill');
});

test('the act announcement method is the same shared writer used by the turn', () => {
  const bus = createBus();
  const popups = [];
  bus.on('comms:popup', (p) => popups.push(p));
  const system = {
    state: { story: { flags: {} } },
    bus,
    _announceJourneyAct: missionsProto._announceJourneyAct,
    _publishJourneyAct: missionsProto._publishJourneyAct,
  };
  system._announceJourneyAct(journeyActForBeat(2));
  system._announceJourneyAct(journeyActForBeat(2));
  assert.equal(popups.length, 1);
  assert.equal(popups[0].id, 'act:II');
  assert.equal(popups[0].persist, true);
});
