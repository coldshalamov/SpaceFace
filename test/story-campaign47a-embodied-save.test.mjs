import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { STORY_BRANCH_INTRO_TAG } from '../src/data/missions.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { story as storyProto } from '../src/systems/story.js';
import {
  BRANCH_CHAIN,
  CAMPAIGN_SCHEMA_VERSION,
  FAIL_RECOVERY_COOLDOWN_S,
  recoverEncounter,
} from '../src/story/campaign47a/index.js';

const cloneSystem = (proto) => Object.assign({}, proto);

function harness(seed = 47) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 100;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 200 };
  state.onboarding = { active: false, finished: true };
  if (state.settings?.gameplay) state.settings.gameplay.tutorialHints = false;
  state.entities.set(1, { id: 1, alive: true, type: 'ship', team: 0, pos: { x: 0, z: 0 }, data: {} });
  for (const id of ['faction_scn', 'faction_mts', 'faction_free', 'faction_dmc']) {
    state.factions[id] = state.factions[id] || { rep: 0, aggro: false };
  }
  const bus = createBus();
  const grants = [];
  const reps = [];
  const heatClears = [];
  bus.on('economy:grantCredits', (payload) => {
    grants.push(payload);
    state.player.credits += payload?.amount || 0;
  });
  bus.on('faction:repDelta', (payload) => {
    reps.push(payload);
    if (payload?.factionId) state.factions[payload.factionId].rep += payload.delta || 0;
  });
  bus.on('heat:clear', (payload) => { heatClears.push(payload); state.player.heat = 0; });
  const helpers = {
    mulberry32(seedValue) {
      let a = seedValue >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    voice: { say: () => true },
  };
  const missions = cloneSystem(missionsProto);
  const story = cloneSystem(storyProto);
  const registry = { get: (name) => name === 'missions' ? missions : name === 'story' ? story : null };
  missions.init({ state, bus, helpers, registry });
  story.init({ state, bus, helpers, registry });
  missions.newGame();
  story._ensureState(true);
  return { state, bus, missions, story, grants, reps, heatClears };
}

function acceptStoryOffer(h, stationId, tag) {
  const board = h.missions.ensureBoard(stationId);
  const offer = board?.slots?.find((candidate) => candidate?.storyTag === tag);
  assert.ok(offer, `missing ${tag}`);
  assert.equal(h.missions.acceptMission(offer.id), true);
  const mission = h.state.missions.active.find((candidate) => candidate.storyTag === tag);
  assert.ok(mission, `active ${tag}`);
  return mission;
}

function completeMission(h, mission) {
  h.missions._completeMission(mission, h.state.missions.active.indexOf(mission));
}

function toB1(h) {
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1 });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);
}

function toB3(h) {
  toB1(h);
  completeMission(h, acceptStoryOffer(h, 'station_helios', 'campaign47a:b1:honest_work'));
  assert.equal(h.state.story.beatIndex, 2);
  const elroy = acceptStoryOffer(h, 'station_tethys', 'campaign47a:b2:elroy');
  assert.equal(elroy.storyTarget.id, 'npc_elroy');
  completeMission(h, elroy);
  assert.equal(h.state.story.beatIndex, 3);
}

function postIntro(h, branch = 'traders') {
  const type = branch === 'patrol' ? 'patrol_clear' : branch === 'free' ? 'smuggling_run' : 'bulk_trade';
  const factionId = branch === 'patrol' ? 'faction_scn' : branch === 'free' ? 'faction_free' : 'faction_mts';
  const offer = {
    id: `save_intro_${branch}`, type, factionId, stationId: 'station_helios',
    destStationId: 'station_helios', destSectorId: 'sector_helios_prime', distance: 600,
    storyTag: STORY_BRANCH_INTRO_TAG, storyBranch: branch, title: `Intro ${branch}`,
    reward_cr: 100, collateral_cr: 0, riskTier: 0,
    params: type === 'patrol_clear' ? { clearCount: 1, fValue: 1, taskTime: 5 }
      : { cmdtyId: null, qty: 1, fValue: 1, taskTime: 5 },
  };
  assert.equal(h.missions.postAndAcceptAuthoredOffer(offer).ok, true);
}

function toB7(h) {
  toB3(h);
  h.bus.emit('ship:purchased', { defId: 'ship_kestrel_mk2', tier: 2 });
  assert.equal(h.state.story.beatIndex, 4);
  postIntro(h, 'traders');
  assert.equal(h.state.story.beatIndex, 5);
  for (let i = 0; i < BRANCH_CHAIN.traders.count; i++) {
    const mission = {
      id: `save_chain_${i}`, type: 'bulk_trade', status: 'active', factionId: 'faction_mts',
      title: `Chain ${i}`, reward_cr: 20, collateral_cr: 0, riskTier: 0, params: {},
      objectiveProgress: 0, objectiveTarget: 1, targetEntityIds: [], stationId: 'station_tethys',
      destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt',
    };
    h.state.missions.active.push(mission);
    completeMission(h, mission);
  }
  assert.equal(h.state.story.beatIndex, 6);
  h.bus.emit('asset:deployed', { kind: 'outpost', id: 'save_outpost', defId: 'outpost_refinery' });
  assert.equal(h.state.story.beatIndex, 7);
}

function roundTrip(h) {
  const missionsBlob = structuredClone(h.missions.serialize());
  const storyBlob = structuredClone(h.story.serialize());
  const next = harness((h.state.meta.seed || 47) + 1000);
  next.state.simTime = h.state.simTime;
  next.missions.deserialize(missionsBlob);
  next.story.deserialize(storyBlob);
  return next;
}

function contractSnapshot(state) {
  const mission = state.missions.active.find((candidate) => candidate.storyTag?.startsWith('campaign47a:'));
  return mission ? {
    type: mission.type,
    storyTag: mission.storyTag,
    storyContractId: mission.storyContractId,
    campaign47aBeat: mission.campaign47aBeat,
    storyTarget: structuredClone(mission.storyTarget),
    targetEntityIds: mission.targetEntityIds.slice(),
  } : null;
}

test('save v11 remains the live carrier', () => assert.equal(CURRENT_VERSION, 11));

test('B1 authored contract survives Continue with authority metadata', () => {
  const h = harness();
  toB1(h);
  acceptStoryOffer(h, 'station_helios', 'campaign47a:b1:honest_work');
  const before = contractSnapshot(h.state);
  const next = roundTrip(h);
  assert.deepEqual(contractSnapshot(next.state), { ...before, targetEntityIds: [] });
  assert.equal(next.state.story.campaign47a.schemaVersion, CAMPAIGN_SCHEMA_VERSION);
});

test('B2 Elroy identity and story contract survive Continue', () => {
  const h = harness();
  toB1(h);
  completeMission(h, acceptStoryOffer(h, 'station_helios', 'campaign47a:b1:honest_work'));
  acceptStoryOffer(h, 'station_tethys', 'campaign47a:b2:elroy');
  const before = contractSnapshot(h.state);
  assert.equal(before.storyTarget.id, 'npc_elroy');
  const next = roundTrip(h);
  assert.deepEqual(contractSnapshot(next.state), { ...before, targetEntityIds: [] });
  assert.equal(next.state.story.beatIndex, 2);
});

test('failure receipt and deterministic recovery survive Continue without cursor skip', () => {
  const h = harness();
  toB1(h);
  completeMission(h, acceptStoryOffer(h, 'station_helios', 'campaign47a:b1:honest_work'));
  const elroy = acceptStoryOffer(h, 'station_tethys', 'campaign47a:b2:elroy');
  h.missions._failMission(elroy, h.state.missions.active.indexOf(elroy), 'proof_failure');
  assert.equal(h.state.story.campaign47a.beatStatus, 'failed');
  const next = roundTrip(h);
  assert.equal(next.state.story.beatIndex, 2);
  assert.equal(next.state.story.campaign47a.beatStatus, 'failed');
  const tooSoon = recoverEncounter(next.state, next.state.simTime + FAIL_RECOVERY_COOLDOWN_S - 0.1);
  assert.equal(tooSoon.ok, false);
  const recovered = recoverEncounter(next.state, next.state.simTime + FAIL_RECOVERY_COOLDOWN_S + 0.1);
  assert.equal(recovered.ok, true);
  assert.equal(next.state.story.beatIndex, 2);
});

test('B7 pending ending survives Continue without applying a choice', () => {
  const h = harness();
  toB7(h);
  h.state.player.credits = 120_000;
  h.state.factions.faction_mts.rep = 60;
  h.missions._checkStoryGates();
  h.story._maybeOfferEndgame();
  assert.equal(h.state.story.endgameOffered, true);
  assert.equal(h.state.story.endgameChoice, null);
  const next = roundTrip(h);
  assert.equal(next.state.story.beatIndex, 7);
  assert.equal(next.state.story.endgameOffered, true);
  assert.equal(next.state.story.endgameChoice, null);
});

test('Ending A confirmation and owner intents apply once after Continue', () => {
  const h = harness();
  toB7(h);
  h.state.story.flags.endgame = true;
  h.state.story.endgameOffered = true;
  h.state.player.heat = 0.4;
  const next = roundTrip(h);
  // This subsystem round-trip intentionally serializes only story + missions;
  // restore the live owner facts that the full save system carries separately.
  next.state.player.credits = 100_000;
  next.state.player.ownedShips = [{ defId: 'ship_bastion' }];
  next.state.player.heat = 0.4;
  next.state.factions.faction_mts.rep = 60;
  next.state.factions.faction_scn.rep = 60;
  next.bus.emit('ui:endgameChoose', { choice: 'A' });
  assert.equal(next.state.story.endgameChoice, null);
  assert.equal(next.state.story.endgamePending.choice, 'A');
  next.bus.emit('ui:endgameConfirm', { choice: 'A' });
  next.bus.emit('ui:endgameConfirm', { choice: 'A' });
  assert.equal(next.state.story.endgameChoice, 'A');
  assert.equal(next.heatClears.length, 1);
  assert.equal(next.reps.filter((row) => row.reason === 'endgame_clean_uniform').length, 2);
});
