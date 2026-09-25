import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const EXPECTED = Object.freeze({
  custody: Object.freeze({
    branch: 'patrol', stationId: 'station_ashcache', type: 'authored_set_piece',
    program: 'patrol_guard', variant: 'ashfall_blockade',
    verb: 'jam', methods: ['park_the_hulk', 'swing_the_wedge'],
  }),
  force: Object.freeze({
    branch: 'traders', stationId: 'station_ashcache', type: 'demolition',
    program: 'mine_to_depot', variant: 'ashfall_siege',
    verb: 'knock_down', methods: ['wrecking_ball', 'cut_down'],
  }),
  free: Object.freeze({
    branch: 'free', stationId: 'station_ashcache', type: 'tow_recovery',
    program: 'mine_to_depot', variant: 'ashfall_evidence_tow',
    verb: 'tow', methods: ['tow_in', 'sling_in'], elroy: 'force',
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
  state.factions.faction_free = { ...(state.factions.faction_free || {}), rep: 100 };

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
  state.story.flags.elroy_outcome = expected.elroy || outcome;
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
  assert.equal(offer.params.physicalVerb, h.expected.verb);
  assert.deepEqual(offer.params.completionMethods, h.expected.methods);
  assert.equal(offer.params.assetId, h.state.story.flags.empire_seed_asset_id);
  return offer;
}

function acceptOperation(h) {
  const offer = operationOffer(h);
  assert.equal(h.missions.acceptMission(offer.id), true);
  return h.state.missions.active.find((row) => row.storyTag === offer.storyTag);
}

function completePhysicalOperation(h, mission) {
  if (!mission || mission.status !== 'active') return;
  assert.equal(mission.destSectorId, 'sector_ashfall_reach');
  h.state.world.currentSectorId = mission.destSectorId;
  h.missions._ensureMissionTargets(mission);
  if (mission.type === 'demolition') {
    const tower = mission.targetEntityIds
      .map((id) => h.state.entities.get(id))
      .find((entity) => entity && entity.data && entity.data.physicalRole === 'demolition_tower');
    assert.ok(tower, 'siege needs a tower');
    const towerDoor = sectorLocalToGlobalForSector({ x: -820 + 260, z: 480 }, 'sector_ashfall_reach');
    assert.ok(Math.hypot(tower.pos.x - towerDoor.x, tower.pos.z - towerDoor.z) < 8, 'siege tower stands off the Ashfall cache');
    h.bus.emit('tether:whipImpact', {
      victimId: tower.id, targetId: h.state.playerId, rating: 'solid', relSpeed: 80,
    });
    return;
  }
  if (mission.type === 'tow_recovery') {
    const core = mission.targetEntityIds
      .map((id) => h.state.entities.get(id))
      .find((entity) => entity && entity.data && entity.data.physicalRole === 'slag_core');
    assert.ok(core, 'evidence tow needs a core');
    const coreDoor = sectorLocalToGlobalForSector({ x: -820 - 200, z: 480 }, 'sector_ashfall_reach');
    assert.ok(Math.hypot(core.pos.x - coreDoor.x, core.pos.z - coreDoor.z) < 8, 'evidence core waits off the Ashfall cache');
    h.state.player.tether = { active: true, targetId: core.id, phase: 'loaded' };
    h.bus.emit('tether:latched', { targetId: core.id });
    h.bus.emit('dock:docked', { stationId: mission.destStationId });
    return;
  }
  const role = mission.params && mission.params.primaryRole;
  const target = mission.targetEntityIds
    .map((id) => h.state.entities.get(id))
    .find((entity) => entity && entity.data && entity.data.physicalRole === role);
  assert.ok(target, `blockade needs a ${role}`);
  const door = sectorLocalToGlobalForSector({ x: -820 + 140, z: 480 }, 'sector_ashfall_reach');
  const doorDist = Math.hypot(target.pos.x - door.x, target.pos.z - door.z);
  assert.ok(doorDist < 8, `jam hulk sits on the Ashfall approach, got ${doorDist.toFixed(1)} WU off`);
  h.state.player.tether = { active: true, targetId: target.id, phase: 'loaded' };
  h.bus.emit('tether:latched', { targetId: target.id });
  h.bus.emit('dock:docked', { stationId: mission.destStationId });
  assert.equal(mission.params.completionMethod, 'park_the_hulk');
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
  exerciseOutcome('free');
});

test('legacy Deep Reach does not point at a climax that is not on the board', () => {
  const h = harness('force');
  h.state.story.flags.elroy_outcome_legacy = true;
  delete h.state.story.flags.elroy_outcome;
  h.missions._refreshNavigation({ forceStory: true, silent: true });
  const reason = (h.state.nav.waypoint && h.state.nav.waypoint.reason) || '';
  assert.doesNotMatch(reason, /Siege the Deep Reach|Run the Deep Reach|Tow the Deep Reach/);
});
