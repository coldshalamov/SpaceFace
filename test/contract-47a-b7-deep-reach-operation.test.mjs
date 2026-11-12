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

// ── PQ-032.02: the live route ──────────────────────────────────────────────────
// The real live B2 is `rescue_under_fire` — it deliberately leaves
// `state.story.flags.elroy_outcome` unset. These harnesses model the save that actually
// exists after the pod pull: no outcome token, only positive embodied-route evidence
// (the `embodied_route` mark written when an authored B1–B3 contract settles).
const LIVE_ROUTE = Object.freeze({
  patrol: Object.freeze({ ...EXPECTED.custody }),
  traders: Object.freeze({ ...EXPECTED.force }),
  free: Object.freeze({ ...EXPECTED.free }),
});

function liveHarness(branch) {
  const expected = LIVE_ROUTE[branch];
  assert.ok(expected, `live route covers branch ${branch}`);
  const state = createGameState(branch === 'patrol' ? 491 : branch === 'traders' ? 492 : 493);
  state.mode = 'flight';
  state.simTime = 80;
  state.playerId = 1;
  // Deliberately BELOW the legacy B7 gate: a live save must reach the climax on the
  // authored operation, never on net worth or standing.
  state.player.credits = 2000;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_helios_prime';
  for (const factionId of ['faction_scn', 'faction_mts', 'faction_free']) {
    state.factions[factionId] = { ...(state.factions[factionId] || {}), rep: 0 };
  }

  let nextId = 40;
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  state.entities.set(player.id, player);
  const bus = createBus();
  const credits = [];
  const elroyResolved = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  bus.on('story:elroyResolved', (payload) => elroyResolved.push(payload));
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
  state.story.branch = branch;
  // Positive live evidence, zero Elroy tokens — exactly what the pod-rescue save carries.
  state.story.flags.embodied_route = 'rescue';
  state.story.flags.proving_ground_complete = true;
  state.story.flags.empire_seed_complete = true;
  state.story.flags.empire_seed_asset_id = 'seed-7';
  state.story.flags.empire_seed_variant = branch === 'patrol' ? 'custody_watch' : 'force_logistics';
  missions._syncCampaignSidecarAfterAdvance();
  missions._refreshNavigation({ forceStory: true, silent: true });
  return { state, bus, missions, credits, elroyResolved, expected };
}

function boardOperationOffers(h) {
  const board = h.missions.ensureBoard(h.expected.stationId);
  return board.slots.filter((row) => String(row.storyTag || '').startsWith('campaign47a:b7:'));
}

test('live route: no Elroy outcome still posts the authored B7 operation per branch', () => {
  for (const branch of ['patrol', 'traders', 'free']) {
    const h = liveHarness(branch);
    assert.equal(h.state.story.flags.elroy_outcome, undefined, `${branch}: live save has no outcome token`);
    assert.equal(h.state.story.flags.elroy_outcome_legacy, undefined, `${branch}: live save has no legacy mark`);

    // The legacy net-worth gate must NOT silently end a live save before the operation exists.
    h.state.player.credits = 250_000;
    h.missions.update(0.016, h.state);
    assert.equal(h.state.story.flags.endgame, undefined, `${branch}: net worth alone cannot bypass the authored climax`);

    const offers = boardOperationOffers(h);
    assert.equal(offers.length, 1, `${branch}: exactly one Deep Reach offer posts`);
    assert.equal(offers[0].storyOperation, h.expected.variant, `${branch}: branch selects the authored op`);
    assert.equal(offers[0].type, h.expected.type);

    // The waypoint must point at the physical operation, not the old credit gate.
    h.missions._refreshNavigation({ forceStory: true, silent: true });
    assert.equal(h.state.nav.waypoint.stationId, h.expected.stationId, `${branch}: nav leads to Ashfall`);
    assert.match(h.state.nav.waypoint.reason, /Deep Reach/i);
  }
});

test('live route: B7 offer accepts at low standing and survives board refresh', () => {
  const h = liveHarness('traders');
  assert.equal(h.state.factions.faction_mts.rep, 0, 'no faction standing');

  for (let i = 0; i < 3; i++) {
    h.missions.ensureBoard(h.expected.stationId);
    assert.equal(boardOperationOffers(h).length, 1, `refresh ${i}: offer stays unique`);
  }

  const offer = boardOperationOffers(h)[0];
  assert.equal(h.missions.acceptMission(offer.id), true, 'authored climax accepts without the old rep gate');

  // Once active, board refresh must not re-post a duplicate.
  h.missions._refreshEmbodiedStoryBoards();
  h.missions.ensureBoard(h.expected.stationId);
  assert.equal(boardOperationOffers(h).length, 0, 'active operation is not re-offered');
  assert.equal(h.state.missions.active.filter((row) => String(row.storyTag || '').startsWith('campaign47a:b7:')).length, 1);
});

test('live route: completing the authored op mints no sandbox set-piece follow-on', () => {
  const h = liveHarness('patrol');
  const mission = acceptOperation(h);
  assert.ok(mission && mission.storyOperation === 'ashfall_blockade');
  completePhysicalOperation(h, mission);

  assert.equal(h.state.story.flags.deep_reach_operation_complete, true);
  assert.equal(h.state.story.flags.deep_reach_variant, 'ashfall_blockade');
  assert.equal(h.state.story.flags.endgame, true);
  assert.equal(h.state.story.flags.elroy_outcome, undefined, 'live route never stamps an outcome');
  assert.equal(h.elroyResolved.length, 0, 'live route never resolves Elroy');

  // The blockade's authoredSetPieceId has a generic follow-on def — the campaign op is a
  // story contract, so no ordinary sandbox follow-on may board.
  const followOns = Object.values(h.state.missions.boards || {})
    .flatMap((board) => board && board.slots || [])
    .filter((row) => row && row.source === 'setPieceFollowOn');
  assert.equal(followOns.length, 0, 'no sandbox set-piece follow-on after the authored climax');
});

test('truly legacy saves keep the net-worth gate and never see the authored op', () => {
  // No outcome, no legacy flag, and no embodied evidence — a pre-embodiment Continue save.
  const h = harness('force');
  delete h.state.story.flags.elroy_outcome;
  delete h.state.story.flags.empire_seed_complete;
  delete h.state.story.flags.empire_seed_asset_id;
  delete h.state.story.flags.empire_seed_variant;
  delete h.state.story.flags.proving_ground_complete;
  delete h.state.story.campaign47a.stepProgress;

  const board = h.missions.ensureBoard(h.expected.stationId);
  assert.equal(
    board.slots.filter((row) => String(row.storyTag || '').startsWith('campaign47a:b7:')).length,
    0,
    'legacy save posts no Deep Reach operation',
  );

  // The old north star still ends the run for saves that never took the embodied route.
  h.state.player.credits = 100_000;
  h.missions.update(0.016, h.state);
  assert.equal(h.state.story.flags.endgame, true, 'legacy B7 advances on net worth + standing');
});
