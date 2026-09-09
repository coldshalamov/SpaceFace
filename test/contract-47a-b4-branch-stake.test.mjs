import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { STORY_BRANCH_INTRO_TAG } from '../src/data/missions.js';
import { missions as missionsProto } from '../src/systems/missions.js';

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
  return { state, bus, missions, credits, rep, toasts };
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
  assert.equal(h.state.story.beatIndex, 5);
  assert.equal(h.state.story.branch, expected.branch);
  assert.equal(h.state.story.flags.pick_a_side_stake, outcome === 'custody' ? 'evidence_patrol' : 'manifest_charter');
  assert.equal(h.credits.filter((row) => row.reason === 'story:pick_a_side').length, 1);
  assert.equal(h.rep.filter((row) => row.reason === 'story_branch').length, 1);
  assert.equal(h.rep.filter((row) => row.reason === 'story_branch_opposing').length, 1);

  completePhysicalIntro(h, mission);
  assert.equal(h.state.story.beatIndex, 5);
  assert.equal(h.credits.filter((row) => row.reason === 'story:pick_a_side').length, 1, 'B4 reward is exact-once');
}

test('47-A B4 makes custody and force distinct completed faction stakes', () => {
  exerciseOutcome('custody');
  exerciseOutcome('force');
});
