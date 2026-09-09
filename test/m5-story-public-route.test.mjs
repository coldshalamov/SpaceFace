import test from 'node:test';
import assert from 'node:assert/strict';

import { STORY_BEATS, MISSION_TUNING } from '../src/data/missions.js';
import { postEndingReplayChain } from '../src/data/postEndingReplayChains.js';
import { endingDef } from '../src/story/endings/endingDefs.js';
import {
  createPostEndingContinuity,
  normalizePostEndingContinuity,
} from '../src/story/endings/resolve.js';
import { postEndingReplay } from '../src/systems/postEndingReplay.js';
import {
  persistentCampaignAction,
  recommendedActions,
  storyActionForBeat,
} from '../src/ui/screens/missionLog.js';

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) {
    const list = this.handlers.get(name) || [];
    list.push(fn);
    this.handlers.set(name, list);
    return () => this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
  count(name) { return this.log.filter((entry) => entry.name === name).length; }
}

function stateAtB7() {
  return {
    meta: { seed: 47 },
    simTime: 7200,
    player: {
      credits: 120000,
      ownedShips: [{ defId: 'ship_kestrel' }],
      cargo: { items: {}, capVolume: 40, usedVolume: 0 },
    },
    story: {
      beatIndex: 7,
      branch: 'patrol',
      flags: { endgame: true },
      endgameOffered: true,
      endgameResolved: false,
      endgameChoice: null,
      endgameDeclined: [],
    },
    careers: { origins: { hunter: { status: 'active', acceptedAtS: 100 } } },
    claims: { bodies: [{ id: 'claim_alpha' }] },
    automation: { outposts: [] },
    factions: {
      faction_scn: { rep: 80 }, faction_mts: { rep: 0 }, faction_free: { rep: 0 }, faction_dmc: { rep: 0 },
    },
    missions: {
      boards: {}, active: [], completedLog: [], receipts: [], nextId: 1,
      config: JSON.parse(JSON.stringify(MISSION_TUNING)),
    },
    world: { currentSectorId: 'sector_ashfall_reach' },
    ui: { trackedMissionId: null, dockedStationId: null },
    nav: {},
  };
}

function continuityRecord(choiceId, { seed = 47, simTime = 7200, progress = 1 } = {}) {
  const rec = createPostEndingContinuity(choiceId, simTime, seed);
  const prefix = rec.signal === 'mission:completed' ? 'mission:mission_log_'
    : rec.signal === 'economy:tradeCompleted' ? 'trade:station_test_:cmdty_test_'
      : rec.signal === 'scan:completed' ? 'scan:sector:sector_test_'
        : 'sector:sector_test_';
  return normalizePostEndingContinuity({
    ...rec,
    seenKeys: Array.from({ length: progress }, (_, index) => prefix + index),
    completedAtS: simTime + 10,
  });
}

function resolvedState(choiceId = 'A') {
  const state = stateAtB7();
  state.story.endgameChoice = choiceId;
  state.story.endgameResolved = true;
  state.story.postEnding = continuityRecord(choiceId);
  return state;
}

test('final disposition remains actionable from the public Mission Log after the one-shot prompt', () => {
  const state = stateAtB7();
  const action = storyActionForBeat(STORY_BEATS[7], state);
  assert.equal(action.label, 'FINAL DISPOSITION');
  assert.match(action.title, /47-A|Ash Cache/);
  assert.match(action.body, /Missions/);
  assert.equal(action.primaryEndingId, 'A');
  assert.equal(action.action, undefined, 'board endings remain physical mission-board rows');
  assert.equal(action.secondaryAction, 'endgameSandbox');
  assert.equal(action.secondaryActionLabel, 'CONTINUE WITHOUT FILING');
  assert.equal(action.mapAction.stationId, 'station_ashcache');
  assert.equal(action.mapAction.sectorId, 'sector_ashfall_reach');

  assert.deepEqual(action.routeOptions.map((route) => route.id), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(action.routeOptions.find((route) => route.id === 'A').status, 'ready');
  assert.match(action.routeOptions.find((route) => route.id === 'A').interfaceLabel, /ASH CACHE MISSIONS/);
  assert.match(action.routeOptions.find((route) => route.id === 'B').reason, /Quiet path/);
  assert.match(action.routeOptions.find((route) => route.id === 'C').reason, /full cargo load/);
  assert.match(action.routeOptions.find((route) => route.id === 'D').reason, /ledger/);
  assert.match(action.routeOptions.find((route) => route.id === 'E').reason, /Decline disposition/);
});

test('final-disposition guidance promotes each ready physical interface without filing from the log', () => {
  const state = stateAtB7();

  state.story.branch = 'free';
  state.careers.origins = {};
  state.factions.faction_scn.rep = 0;
  state.factions.faction_free.rep = 80;
  let action = storyActionForBeat(STORY_BEATS[7], state);
  assert.equal(action.primaryEndingId, 'B');
  assert.match(action.body, /Ash Cache Missions/);

  state.player.cargo.usedVolume = state.player.cargo.capVolume;
  action = storyActionForBeat(STORY_BEATS[7], state);
  assert.equal(action.primaryEndingId, 'C');
  assert.equal(action.action, 'endgameUnfiledJump');

  state.player.cargo = { items: { cmdty_personal_ledger: 1 }, capVolume: 40, usedVolume: 1 };
  state.story.flags.hasLedger = true;
  action = storyActionForBeat(STORY_BEATS[7], state);
  assert.equal(action.primaryEndingId, 'D');
  assert.match(action.body, /departure/i);
  assert.equal(action.action, undefined, 'Choice D remains owned by a normal departure preflight');

  state.story.endgameDeclined = ['A', 'B', 'C', 'D'];
  action = storyActionForBeat(STORY_BEATS[7], state);
  assert.equal(action.primaryEndingId, 'E');
  assert.match(action.body, /Courier/);
  assert.equal(action.mapAction.stationId, 'station_ashcache');
});

test('final disposition persists beside tracked, untracked, and trade-route work', () => {
  const state = stateAtB7();
  const mission = { id: 'mission_ordinary', status: 'active' };
  let campaign = persistentCampaignAction(state, [mission], mission.id);
  assert.equal(campaign.label, 'FINAL DISPOSITION', 'tracked work must not hide campaign');

  campaign = persistentCampaignAction(state, [mission], null);
  assert.equal(campaign.label, 'FINAL DISPOSITION', 'untracked work must not hide campaign');

  state.nav.waypoint = {
    kind: 'trade', stationId: 'station_helios', sectorId: 'sector_helios_prime',
    commodityId: 'cmdty_food',
  };
  campaign = persistentCampaignAction(state, [], null);
  assert.equal(campaign.label, 'FINAL DISPOSITION', 'trade route must not hide campaign');

  state.nav.waypoint = null;
  assert.equal(persistentCampaignAction(state, [], null), null, 'campaign stays in CURRENT ACTION when no work competes');
});

test('resolved endings replace the stale B7 grind instruction with durable sandbox progress', () => {
  const state = resolvedState('A');
  const action = recommendedActions(state, [], null)[0];
  assert.equal(action.title, endingDef('A').continuity.title);
  assert.equal(action.label, 'ENDING A');
  assert.match(action.body, /Complete/);
  assert.equal(action.meta, '1/3 · WORLD CONTINUES');
  assert.doesNotMatch(action.body, /100,000/);
});

test('unlocked replay work names the physical board and both authored branch destinations', () => {
  const state = resolvedState('A');
  const chain = postEndingReplayChain('A');
  state.story.postEnding = continuityRecord('A', { progress: endingDef('A').continuity.target });
  state.missions.postEndingReplay = {
    choiceId: 'A', chainId: chain.id, replayHookId: chain.replayHookId,
    cycle: 0, stageIndex: 0, branchId: null, status: 'ready',
  };
  let action = storyActionForBeat(STORY_BEATS[7], state);
  assert.equal(action.title, chain.opening.title);
  assert.equal(action.mapAction.stationId, chain.opening.boardStationId);
  assert.match(action.body, /open Missions/i);

  state.missions.postEndingReplay.stageIndex = 1;
  action = storyActionForBeat(STORY_BEATS[7], state);
  assert.match(action.title, /Choose the consequence/);
  for (const option of chain.branches) {
    assert.match(action.body, new RegExp(option.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.equal(action.mapAction.focus, 'galaxy');
});

test('save load while already docked re-posts one missing replay offer and never duplicates it', () => {
  const state = resolvedState('A');
  const chain = postEndingReplayChain('A');
  state.story.postEnding = continuityRecord('A', { progress: endingDef('A').continuity.target });
  state.ui.dockedStationId = chain.opening.boardStationId;
  const bus = new Bus();
  const sys = { ...postEndingReplay };

  bus.on('mission:offered', (offer) => {
    const board = state.missions.boards[offer.stationId] || { slots: [] };
    state.missions.boards[offer.stationId] = board;
    if (!board.slots.some((entry) => entry.id === offer.id)) board.slots.push(offer);
    bus.emit('mission:offerBoarded', {
      offerId: offer.id,
      stationId: offer.stationId,
      source: offer.source,
      causeFingerprint: offer.cause.fingerprint,
    });
  });

  sys.init({ state, bus });
  bus.emit('save:loaded', {});
  assert.equal(bus.count('mission:offered'), 1);
  assert.equal(state.missions.postEndingReplay.status, 'offered');
  assert.equal(state.missions.boards[chain.opening.boardStationId].slots.length, 1);
  assert.ok(bus.count('postEndingReplay:route') >= 2, 'load and offer publish persistent route state');

  bus.emit('save:loaded', {});
  assert.equal(bus.count('mission:offered'), 1, 'second load cannot duplicate a boarded offer');
  assert.equal(state.missions.boards[chain.opening.boardStationId].slots.length, 1);
  sys.destroy();
});
