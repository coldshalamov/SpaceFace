import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { STORY_BRANCH_INTRO_TAG } from '../src/data/missions.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import * as campaign from '../src/story/campaign47a/index.js';

const EXPECTED = Object.freeze({
  custody: Object.freeze({ branch: 'patrol', stationId: 'station_coalition', type: 'patrol_clear' }),
  force: Object.freeze({ branch: 'traders', stationId: 'station_tethys', type: 'bulk_trade' }),
});

function harness(outcome) {
  const state = createGameState(outcome === 'custody' ? 475 : 476);
  state.mode = 'flight';
  state.simTime = 50;
  state.playerId = 1;
  state.player.credits = 100_000;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_helios_prime';
  for (const factionId of ['faction_scn', 'faction_mts', 'faction_free']) {
    state.factions[factionId] = { ...(state.factions[factionId] || {}), rep: 100 };
  }

  let nextId = 20;
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  state.entities.set(player.id, player);
  const bus = createBus();
  const credits = [];
  const rep = [];
  const toasts = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  bus.on('faction:repDelta', (payload) => rep.push(payload));
  bus.on('toast', (payload) => toasts.push(payload));
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
  state.story.beatIndex = 4;
  state.story.flags.elroy_outcome = outcome;
  missions._syncCampaignSidecarAfterAdvance();
  missions._refreshNavigation({ forceStory: true, silent: true });
  return { state, bus, missions, helpers, credits, rep, toasts };
}

function completePhysicalIntro(h, mission) {
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

/** W-BOOKS-3-4: the door's operation is its own posted contract — Spine Break is
 *  an escort (the convoy lead must dock alive), the Weighing a patrol clear. */
function completeDoorOperation(h, mission) {
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  h.missions.spawnTargetsForSector(mission.destSectorId);
  h.missions._ensureMissionTargets(mission);
  if (mission.type === 'escort') {
    const berth = [...h.state.entities.values()].find((entity) => (
      entity && entity.type === 'station' && entity.data && entity.data.stationId === mission.destStationId
    )) || h.helpers.spawnEntity({
      type: 'station', pos: { x: 0, z: 0 },
      data: { stationId: mission.destStationId, dockRadius: 140 },
    });
    const lead = h.state.entities.get(mission._escorteeId);
    assert.ok(lead, `${mission.storyTag} must spawn a convoy lead`);
    lead.pos = { x: berth.pos.x + 20, z: berth.pos.z };
    h.missions.update(0.016, h.state);
    assert.equal(mission._escorteeArrived, true, 'the convoy lead reaches the dock ring');
    h.bus.emit('dock:docked', { stationId: mission.destStationId });
    return;
  }
  for (const targetId of [...mission.targetEntityIds]) {
    h.bus.emit('entity:killed', { id: targetId, killerId: h.state.playerId });
  }
}

function exerciseOutcome(outcome) {
  const h = harness(outcome);
  const expected = EXPECTED[outcome];
  assert.equal(h.state.nav.waypoint.stationId, expected.stationId);
  assert.match(h.state.nav.waypoint.reason, /complete/i);

  const board = h.missions.ensureBoard(expected.stationId);
  const offer = board.slots.find((row) => row.storyTag === STORY_BRANCH_INTRO_TAG);
  assert.ok(offer, 'the consequence intro is physically posted');
  assert.equal(offer.storyBranch, expected.branch);
  assert.equal(offer.type, expected.type);
  assert.equal(offer.collateral_cr, 0, 'mandatory consequence work cannot inherit procedural collateral');
  assert.equal(offer.clauses, undefined, 'mandatory consequence work cannot inherit random contract terms');
  assert.equal(
    h.missions.acceptMission(offer.id),
    true,
    `accept rejected: ${h.toasts.map((row) => row && row.text).filter(Boolean).join(' | ')}`,
  );
  const mission = h.state.missions.active.find((row) => row.storyTag === STORY_BRANCH_INTRO_TAG);
  assert.ok(mission);
  assert.equal(h.state.story.beatIndex, 4, 'acceptance alone cannot settle Pick a Side');
  assert.equal(h.state.story.branch, null);
  assert.equal(h.credits.filter((row) => row.reason === 'story:pick_a_side').length, 0);

  completePhysicalIntro(h, mission);
  // W-BOOKS-3-4: the intro settles the door; the book closes on the door's operation.
  assert.equal(h.state.story.branch, expected.branch);
  assert.equal(h.state.story.beatIndex, 4, 'the door operation still owes');
  assert.equal(h.state.story.flags.pick_a_side_stake, outcome === 'custody' ? 'evidence_patrol' : 'manifest_charter');
  assert.equal(h.rep.filter((row) => row.reason === 'story_branch').length, 1);
  assert.equal(h.rep.filter((row) => row.reason === 'story_branch_opposing').length, 1);

  const opOffer = h.missions.ensureBoard(expected.stationId).slots
    .find((row) => row.storyTag === 'campaign47a:b4:operation');
  assert.ok(opOffer, 'the door operation posts after the intro settles');
  assert.equal(h.missions.acceptMission(opOffer.id), true, 'op accept fails');
  const op = h.state.missions.active.find((row) => row.sourceOfferId === opOffer.id)
    || h.state.missions.active.find((row) => row.storyTag === 'campaign47a:b4:operation');
  assert.ok(op);
  completeDoorOperation(h, op);
  assert.equal(h.state.story.beatIndex, 5);
  // The posted contract pays its own reward — the beat grant stays skipped,
  // the same no-double-pay pattern B1–B3's book contracts already follow.
  assert.equal(h.credits.filter((row) => row.reason === 'story:pick_a_side').length, 0);
}

test('47-A B4 makes custody and force distinct completed faction stakes', () => {
  exerciseOutcome('custody');
  exerciseOutcome('force');
});

test('47-A B4 door operation cannot settle, or even post, before the door intro is accepted', () => {
  const h = harness('custody');
  const { buildMissionBoardContract, recordBeatStep } = campaign;
  // The board still answers with the door, not with an operation the player never unlocked.
  assert.equal(buildMissionBoardContract(4, { state: h.state, outcome: 'custody' }).kind, 'existing_branch_intro');
  const before = h.state.story.campaign47a;
  const stepKeysBefore = JSON.stringify(before.steps || {});
  // A premature settlement of the door's operation is refused by the ordered recorder and
  // writes nothing: no bucket gains the step, so no mission/board path can cash it.
  const premature = recordBeatStep(h.state, 'mission:completed', { storyTag: 'campaign47a:b4:operation' }, h.state.simTime);
  assert.equal(premature.ok, false, 'a premature door operation does not settle');
  assert.equal(premature.reason, 'signal_mismatch:mission:completed',
    'beat 4 is owned by the door intro until it is accepted: a completion cannot address the operation (its requiresPrior:branch_intro_accept check is the unreachable backstop)');
  assert.equal(JSON.stringify(h.state.story.campaign47a.steps || {}), stepKeysBefore, 'a refused premature step writes no bucket');
  assert.equal(h.state.story.beatIndex, 4);
});