import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createFurnaceIntake } from '../src/systems/furnaceIntake.js';
import { missions } from '../src/systems/missions.js';
import { buildMissionBoardContract } from '../src/story/campaign47a/embodiedMissions.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import {
  FURNACE_MITE_KEYS,
  furnaceLotSpec,
  furnaceLots,
  furnaceMouthGlobal,
} from '../src/missions/furnaceWorksite.js';
import { syncFurnaceWorksite } from '../src/missions/furnaceWorksiteRuntime.js';
import { objectiveText } from '../src/ui/sim/missionRecap.js';

const CLEAR_COUNT = 4;
const POD_COUNT = 3;

function authorFurnaceOffer(state) {
  const offer = buildMissionBoardContract(1, {
    seed: 23,
    epoch: 0,
    state: { story: state.story },
  });
  assert.ok(offer, 'the authored B1 book should post its next contract');
  assert.equal(offer.storyTag, 'campaign47a:b1:infested');
  assert.equal(offer.type, 'patrol_clear');
  assert.equal(offer.params.furnaceWorksiteVersion, 1);
  return offer;
}

function authoredMission() {
  const state = createGameState(23);
  state.story = {
    beatIndex: 1,
    branch: null,
    flags: {},
    campaign47a: createCampaign47aState(),
  };
  state.story.campaign47a.stepProgress['1'] = {
    completed: ['alloy_run', 'scale_4'],
    updatedAtS: 0,
  };
  state.missions = { active: [], nextId: 1, boards: {}, completedLog: [], receipts: [] };
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.alienEcology = { sites: { closed_refinery: { deadFauna: {} } } };
  state.run = { kind: 'adventure' };

  const owner = Object.create(missions);
  owner.state = state;
  const mission = owner._instanceFromOffer(authorFurnaceOffer(state));
  return { state, owner, mission };
}

function liveWorksite() {
  const { state, owner, mission } = authoredMission();
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: `spawn-${state.nextEntityId++}`, alive: true };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      state.entities.delete(id);
      const index = state.entityList.findIndex((entity) => entity.id === id);
      if (index >= 0) state.entityList.splice(index, 1);
    },
  };
  owner.init({ state, bus, helpers, registry: { get: () => null } });
  state.missions.active.push(mission);

  for (const lot of furnaceLots(mission)) {
    const entity = { ...furnaceLotSpec(mission, lot), id: `ore-pod-${lot.slot}`, alive: true };
    lot.entityId = entity.id;
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
  }

  // Use the real intake producer and the production missions listener. It emits only after a
  // marked body actually crosses the CR-FEED lip, which is the canonical received counter seam.
  const intake = createFurnaceIntake();
  intake.init({ state, bus, helpers });
  return { state, bus, owner, mission, intake };
}

function feedPod(fixture, slot) {
  const lot = fixture.mission.params.furnaceLots[slot];
  const pod = fixture.state.entities.get(lot.entityId);
  assert.ok(pod, `ore pod ${slot} exists before CR-FEED takes it`);
  pod.pos = furnaceMouthGlobal();
  fixture.intake.update();
}

function destroyPod(fixture, slot) {
  const lot = fixture.mission.params.furnaceLots[slot];
  const pod = fixture.state.entities.get(lot.entityId);
  assert.ok(pod, `ore pod ${slot} exists before it is destroyed`);
  pod.alive = false;
  fixture.bus.emit('entity:killed', { id: pod.id, entity: pod, killerId: 'npc' });
}

function clearAllMiteSites(fixture) {
  const deadFauna = fixture.state.world.alienEcology.sites.closed_refinery.deadFauna;
  for (const key of FURNACE_MITE_KEYS) deadFauna[key] = true;
  syncFurnaceWorksite(fixture.owner, fixture.mission);
}

test('the canonical B1 furnace recap is a pure two-leg read, not the generic patrol counter', () => {
  const { mission } = authoredMission();
  assert.equal(mission.objectiveTarget, CLEAR_COUNT);
  assert.equal(mission.params.furnaceWorksiteVersion, 1);
  assert.equal(mission.params.furnaceLots, undefined, 'the authored contract has not spawned worksite lots yet');

  const before = JSON.stringify(mission);
  const initialObjective = objectiveText(mission);
  assert.equal(
    initialObjective,
    'Clear the marked repair-mite sites (0/4); tow or fling the remaining marked ore pods into CR-FEED (0/3 received; 0 lost)',
  );
  assert.doesNotMatch(initialObjective, /\bthen\b/i, 'the recap does not force a leg order');
  assert.equal(JSON.stringify(mission), before, 'the shared recap must not create or mutate furnace lots');
  assert.equal(mission.params.furnaceLots, undefined);

  const legacy = {
    ...mission,
    params: { ...mission.params, furnaceWorksiteVersion: undefined },
  };
  assert.equal(objectiveText(legacy), 'Clear 0/4 hostiles', 'legacy B1 saves keep the generic safe fallback');
  assert.equal(objectiveText({ ...mission, storyTag: 'other:patrol' }), 'Clear 0/4 hostiles');
  assert.equal(objectiveText({ ...mission, objectiveTarget: 3 }), 'Clear 0/3 hostiles');
});

test('owner-produced partial losses and receipts stay independent and settle only after both legs', () => {
  const fixture = liveWorksite();
  const { mission, state } = fixture;
  assert.equal(mission.status, 'active', 'posting a card does not mean it is settled');

  feedPod(fixture, 0);
  destroyPod(fixture, 1);
  assert.equal(mission.params.furnaceFeeds, 1);
  assert.equal(mission.params.furnaceLosses, 1);
  assert.match(objectiveText(mission), /0\/4\); tow or fling .*\(1\/3 received; 1 lost\)/);
  assert.doesNotMatch(objectiveText(mission), /paid|reward|settled/i);

  // Cargo may be received/lost before clearance; there is no forced leg order in the work order.
  clearAllMiteSites(fixture);
  assert.equal(mission.objectiveProgress, CLEAR_COUNT);
  assert.equal(mission.status, 'active', 'two accounted pods do not satisfy the three-pod leg');
  assert.match(objectiveText(mission), /Repair-mite sites clear \(4\/4\); tow or fling .*\(1\/3 received; 1 lost\)/);
  const waypoint = fixture.owner._missionWaypoint(mission);
  assert.match(waypoint.reason, /1\/3 hauler lots received; 1 lost/, 'the existing focus still owns the current worksite phase');

  feedPod(fixture, 2);
  assert.equal(mission.status, 'completed', 'four clear sites plus three accounted pods settle the detail');
  assert.equal(mission.params.furnaceFeeds, 2);
  assert.equal(mission.params.furnaceLosses, 1);
  assert.equal(mission.params.furnaceOutcome, 'partial_disposal');
  assert.equal(mission.reward_cr, 320, 'the owner prorates reward by the two actually received pods');
  assert.equal(state.missions.active.includes(mission), false);
  assert.equal(state.missions.receipts.at(-1).rewardCr, 320);
});

test('all-lost cargo is recorded separately, counts as accounted, and advances without cargo pay', () => {
  const fixture = liveWorksite();
  const { mission, state } = fixture;
  for (let slot = 0; slot < POD_COUNT; slot++) destroyPod(fixture, slot);

  assert.equal(mission.params.furnaceFeeds, undefined);
  assert.equal(mission.params.furnaceLosses, POD_COUNT);
  assert.equal(
    objectiveText(mission),
    'Clear the marked repair-mite sites (0/4); ore-pod leg accounted (0/3 received; 3 lost)',
  );
  assert.doesNotMatch(objectiveText(mission), /paid|reward|settled/i);

  clearAllMiteSites(fixture);
  assert.equal(mission.status, 'completed');
  assert.equal(mission.params.furnaceOutcome, 'clearance_only_cargo_lost');
  assert.equal(mission.reward_cr, 0);
  assert.equal(state.missions.active.includes(mission), false);
});

test('invalid or unsafe saved worksite counters are not presented as real progress', () => {
  const { mission } = authoredMission();
  mission.objectiveProgress = Number.NaN;
  assert.match(objectiveText(mission), /Repair-mite clearance record unavailable/);

  mission.objectiveProgress = 0;
  mission.params.furnaceFeeds = 1.5;
  assert.match(objectiveText(mission), /ore-pod ledger unavailable/);

  mission.params.furnaceFeeds = 0;
  mission.params.furnaceLedgerInvalid = true;
  assert.match(objectiveText(mission), /cargo ledger is invalid/);
});
