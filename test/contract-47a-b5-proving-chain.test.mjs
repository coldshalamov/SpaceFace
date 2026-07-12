import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { BRANCH_CHAIN, FAIL_RECOVERY_COOLDOWN_S } from '../src/story/campaign47a/index.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const EXPECTED = Object.freeze({
  custody: Object.freeze({ branch: 'patrol', stationId: 'station_coalition', variant: 'custody_patrol' }),
  force: Object.freeze({ branch: 'traders', stationId: 'station_tethys', variant: 'force_manifest' }),
});

function harness(outcome) {
  const expected = EXPECTED[outcome];
  const state = createGameState(outcome === 'custody' ? 477 : 478);
  state.mode = 'flight';
  state.simTime = 60;
  state.playerId = 1;
  state.player.credits = 100_000;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_helios_prime';
  state.factions.faction_scn = { ...(state.factions.faction_scn || {}), rep: 100 };
  state.factions.faction_mts = { ...(state.factions.faction_mts || {}), rep: 100 };

  let nextId = 30;
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  state.entities.set(player.id, player);
  const bus = createBus();
  const credits = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  const helpers = {
    hash32,
    mulberry32,
    player: () => player,
    voice: { say: () => true },
    spawnEntity: (spec) => {
      const entity = { ...spec, id: nextId++, alive: true, pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 } };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  missions.newGame();
  state.missions.active = [];
  state.ui.trackedMissionId = null;
  state.nav.waypoint = null;
  state.story.beatIndex = 5;
  state.story.branch = expected.branch;
  state.story.chainProgress = 0;
  state.story.flags.elroy_outcome = outcome;
  state.story.flags.pick_a_side_stake = outcome === 'custody' ? 'evidence_patrol' : 'manifest_charter';
  missions._syncCampaignSidecarAfterAdvance();
  missions._refreshNavigation({ forceStory: true, silent: true });
  return { state, bus, missions, credits, expected };
}

function chainOffer(h) {
  const board = h.missions.ensureBoard(h.expected.stationId);
  const step = h.state.story.chainProgress + 1;
  const tag = `campaign47a:b5:${h.expected.branch}:${step}`;
  const offer = board.slots.find((row) => row.storyTag === tag);
  assert.ok(offer, `physical chain leg ${step} is posted`);
  return offer;
}

function acceptChainLeg(h) {
  const offer = chainOffer(h);
  assert.equal(h.missions.acceptMission(offer.id), true);
  const mission = h.state.missions.active.find((row) => row.storyTag === offer.storyTag);
  assert.ok(mission);
  return mission;
}

function completePhysicalLeg(h, mission) {
  if (mission.type === 'bulk_trade') {
    h.bus.emit('economy:tradeCompleted', {
      side: 'sell', stationId: mission.destStationId,
      commodityId: mission.params.cmdtyId, qty: mission.objectiveTarget,
    });
    return;
  }
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  for (const targetId of [...mission.targetEntityIds]) {
    h.bus.emit('entity:killed', { id: targetId, killerId: h.state.playerId });
  }
}

function exerciseOutcome(outcome) {
  const h = harness(outcome);
  const count = BRANCH_CHAIN[h.expected.branch].count;
  assert.equal(h.state.nav.waypoint.stationId, h.expected.stationId);
  assert.match(h.state.nav.waypoint.reason, new RegExp(`leg 1/${count}`, 'i'));

  const failed = acceptChainLeg(h);
  h.missions._failMission(failed, h.state.missions.active.indexOf(failed), 'proving_failure');
  assert.equal(h.state.story.beatIndex, 5);
  assert.equal(h.state.story.chainProgress, 0);
  assert.equal(h.state.story.campaign47a.beatStatus, 'failed');

  h.state.simTime += FAIL_RECOVERY_COOLDOWN_S + 1;
  h.bus.emit('dock:docked', { stationId: h.expected.stationId });
  assert.notEqual(h.state.story.campaign47a.beatStatus, 'failed');

  for (let completed = 0; completed < count; completed++) {
    const mission = acceptChainLeg(h);
    completePhysicalLeg(h, mission);
    if (completed < count - 1) {
      assert.equal(h.state.story.beatIndex, 5);
      assert.equal(h.state.story.chainProgress, completed + 1);
    }
  }

  assert.equal(h.state.story.beatIndex, 6);
  assert.equal(h.state.story.chainProgress, 0);
  assert.equal(h.state.story.flags.proving_ground_complete, true);
  assert.equal(h.state.story.flags.proving_ground_variant, h.expected.variant);
  assert.equal(h.credits.filter((row) => row.reason === 'story:proving_ground').length, 1);

  h.bus.emit('economy:tradeCompleted', { side: 'sell', stationId: 'station_ceres', commodityId: 'cmdty_food', qty: 99 });
  assert.equal(h.credits.filter((row) => row.reason === 'story:proving_ground').length, 1, 'B5 reward is exact-once');
}

test('47-A B5 recovers and completes custody or force proving chains', () => {
  exerciseOutcome('custody');
  exerciseOutcome('force');
});
