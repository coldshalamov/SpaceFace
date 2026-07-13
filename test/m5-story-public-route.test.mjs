import test from 'node:test';
import assert from 'node:assert/strict';

import { STORY_BEATS, MISSION_TUNING } from '../src/data/missions.js';
import { postEndingReplayChain } from '../src/data/postEndingReplayChains.js';
import { endingDef } from '../src/story/endings/endingDefs.js';
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

function resolvedState(choiceId = 'A') {
  const state = stateAtB7();
  const def = endingDef(choiceId);
  state.story.endgameChoice = choiceId;
  state.story.endgameResolved = true;
  state.story.postEnding = {
    status: 'active',
    choiceId,
    endingId: choiceId,
    sandboxMode: def.sandboxMode,
    title: def.continuity.title,
    objective: def.continuity.objective,
    signal: def.continuity.signal,
    target: def.continuity.target,
    progress: 1,
    replayHookId: def.continuity.replayHookId,
  };
  return state;
}

test('final disposition remains actionable from the public Mission Log after the one-shot prompt', () => {
  const state = stateAtB7();
  const action = storyActionForBeat(STORY_BEATS[7], state);
  assert.equal(action.label, 'FINAL DISPOSITION');
  assert.match(action.title, /47-A|Ash Cache/);
  assert.match(action.body, /Missions/);
  assert.equal(action.action, 'endgameSandbox');
  assert.equal(action.actionLabel, 'CONTINUE OPEN');
  assert.equal(action.mapAction.stationId, 'station_ashcache');
  assert.equal(action.mapAction.sectorId, 'sector_ashfall_reach');
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
  state.story.postEnding.status = 'complete';
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
  state.story.postEnding.status = 'complete';
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
