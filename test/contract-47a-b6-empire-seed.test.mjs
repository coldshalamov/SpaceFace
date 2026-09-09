import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const EXPECTED = Object.freeze({
  custody: Object.freeze({ branch: 'patrol', program: 'patrol_guard', variant: 'custody_watch' }),
  force: Object.freeze({ branch: 'traders', program: 'mine_to_depot', variant: 'force_logistics' }),
});

function harness(outcome) {
  const expected = EXPECTED[outcome];
  const state = createGameState(outcome === 'custody' ? 479 : 480);
  state.mode = 'flight';
  state.simTime = 70;
  state.playerId = 1;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  state.entities.set(player.id, player);
  const bus = createBus();
  const credits = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers: { voice: { say: () => true } }, registry: { get: () => null } });
  missions.newGame();
  state.missions.active = [];
  state.ui.trackedMissionId = null;
  state.nav.waypoint = null;
  state.story.beatIndex = 6;
  state.story.branch = expected.branch;
  state.story.flags.elroy_outcome = outcome;
  state.story.flags.proving_ground_complete = true;
  missions._syncCampaignSidecarAfterAdvance();
  missions._refreshNavigation({ forceStory: true, silent: true });
  return { state, bus, missions, credits, expected };
}

function exerciseOutcome(outcome) {
  const h = harness(outcome);
  assert.equal(h.state.nav.waypoint.storyBeat, 6);
  assert.match(h.state.nav.waypoint.reason, new RegExp(h.expected.program.replace(/_/g, ' '), 'i'));

  h.bus.emit('asset:deployed', { kind: 'trader', id: 'cycle-pulse' });
  assert.equal(h.state.story.beatIndex, 6, 'an unrelated trader pulse cannot settle Empire Seed');

  h.bus.emit('asset:deployed', { kind: 'drone', id: 'seed-1', defId: 'drone_mk1', sectorId: 'sector_helios_prime' });
  assert.equal(h.state.story.beatIndex, 6, 'deployment alone cannot settle Empire Seed');
  assert.equal(h.state.story.flags.empire_seed_pending_id, 'seed-1');

  h.bus.emit('automation:assetLost', { kind: 'drone', id: 'seed-1', sectorId: 'sector_helios_prime' });
  assert.equal(h.state.story.beatIndex, 6);
  assert.equal(h.state.story.flags.empire_seed_pending_id, undefined, 'loss clears the pending seed');

  h.bus.emit('asset:deployed', { kind: 'drone', id: 'seed-2', defId: 'drone_mk1', sectorId: 'sector_tethys_junction' });
  h.bus.emit('automation:programAssigned', { kind: 'drone', id: 'seed-2', templateId: 'scout_report' });
  assert.equal(h.state.story.beatIndex, 6, 'the wrong program remains recoverable');

  h.bus.emit('automation:programAssigned', { kind: 'drone', id: 'seed-2', templateId: h.expected.program });
  assert.equal(h.state.story.beatIndex, 7);
  assert.equal(h.state.story.flags.empire_seed_complete, true);
  assert.equal(h.state.story.flags.empire_seed_variant, h.expected.variant);
  assert.equal(h.state.story.flags.empire_seed_asset_id, 'seed-2');
  assert.equal(h.credits.filter((row) => row.reason === 'story:empire_seed').length, 1);

  h.bus.emit('automation:programAssigned', { kind: 'drone', id: 'seed-2', templateId: h.expected.program });
  assert.equal(h.state.story.beatIndex, 7);
  assert.equal(h.credits.filter((row) => row.reason === 'story:empire_seed').length, 1, 'B6 reward is exact-once');
}

test('47-A B6 recovers and programs custody or force empire seeds', () => {
  exerciseOutcome('custody');
  exerciseOutcome('force');
});
