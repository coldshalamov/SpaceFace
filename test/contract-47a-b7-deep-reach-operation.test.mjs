import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const EXPECTED = Object.freeze({
  custody: Object.freeze({
    branch: 'patrol', stationId: 'station_coalition', type: 'patrol_clear',
    program: 'patrol_guard', variant: 'custody_watch_reach',
  }),
  force: Object.freeze({
    branch: 'traders', stationId: 'station_tethys', type: 'bulk_trade',
    program: 'mine_to_depot', variant: 'force_manifest_reach',
  }),
});

function harness(outcome) {
  const expected = EXPECTED[outcome];
  const state = createGameState(outcome === 'custody' ? 481 : 482);
  state.mode = 'flight';
  state.simTime = 80;
  state.playerId = 1;
  state.player.credits = 100_000;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_helios_prime';
  state.factions.faction_scn = { ...(state.factions.faction_scn || {}), rep: 100 };
  state.factions.faction_mts = { ...(state.factions.faction_mts || {}), rep: 100 };

  let nextId = 40;
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
  state.story.beatIndex = 7;
  state.story.branch = expected.branch;
  state.story.flags.elroy_outcome = outcome;
  state.story.flags.proving_ground_complete = true;
  state.story.flags.empire_seed_complete = true;
  state.story.flags.empire_seed_asset_id = 'seed-2';
  state.story.flags.empire_seed_variant = outcome === 'custody' ? 'custody_watch' : 'force_logistics';
  missions._syncCampaignSidecarAfterAdvance();
  missions._refreshNavigation({ forceStory: true, silent: true });
  return { state, bus, missions, credits, expected };
}

function operationOffer(h) {
  const board = h.missions.ensureBoard(h.expected.stationId);
  const offer = board.slots.find((row) => String(row.storyTag || '').startsWith('campaign47a:b7:'));
  assert.ok(offer, 'Deep Reach operation is physically posted');
  assert.equal(offer.type, h.expected.type);
  assert.equal(offer.params.assetId, h.state.story.flags.empire_seed_asset_id);
  return offer;
}

function acceptOperation(h) {
  const offer = operationOffer(h);
  assert.equal(h.missions.acceptMission(offer.id), true);
  return h.state.missions.active.find((row) => row.storyTag === offer.storyTag);
}

function completePhysicalOperation(h, mission) {
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
  assert.equal(h.state.nav.waypoint.stationId, h.expected.stationId);
  assert.match(h.state.nav.waypoint.reason, /Deep Reach/i);

  const failed = acceptOperation(h);
  assert.ok(failed);
  h.bus.emit('automation:assetLost', { kind: 'drone', id: 'seed-2', sectorId: 'sector_helios_prime' });
  assert.equal(h.state.story.flags.deep_reach_asset_lost, true);
  assert.equal(h.state.missions.active.some((row) => row.id === failed.id), false);
  assert.equal(h.state.story.flags.endgame, undefined);
  assert.notEqual(h.state.story.campaign47a.beatStatus, 'failed', 'observe-only ending metadata remains recoverable');

  h.bus.emit('asset:deployed', { kind: 'drone', id: 'seed-3', defId: 'drone_mk1', sectorId: 'sector_tethys_junction' });
  h.bus.emit('automation:programAssigned', { kind: 'drone', id: 'seed-3', templateId: h.expected.program });
  assert.equal(h.state.story.flags.empire_seed_asset_id, 'seed-3');
  assert.equal(h.state.story.flags.deep_reach_asset_lost, undefined);

  const mission = acceptOperation(h);
  completePhysicalOperation(h, mission);
  assert.equal(h.state.story.beatIndex, 7);
  assert.equal(h.state.story.flags.deep_reach_operation_complete, true);
  assert.equal(h.state.story.flags.deep_reach_variant, h.expected.variant);
  assert.equal(h.state.story.flags.endgame, true, 'physical operation unlocks the existing ending gate');
  assert.equal(h.credits.filter((row) => row.reason === 'story:deep_reach').length, 1);

  assert.equal(h.missions.postEndgameDispositionOffers(), true);
  const endingBoard = h.state.missions.boards.station_ashcache;
  const endingIds = endingBoard.slots.filter((row) => row.storyDisposition).map((row) => row.id);
  assert.ok(endingIds.length >= 2);
  h.missions.ensureBoard('station_ashcache');
  assert.deepEqual(
    endingBoard.slots.filter((row) => row.storyDisposition).map((row) => row.id),
    endingIds,
    'campaign refresh preserves final-disposition rows',
  );

  completePhysicalOperation(h, mission);
  assert.equal(h.credits.filter((row) => row.reason === 'story:deep_reach').length, 1, 'B7 reward is exact-once');
}

test('47-A B7 recovers its seeded asset and unlocks Deep Reach physically', () => {
  exerciseOutcome('custody');
  exerciseOutcome('force');
});
