/**
 * Regression for the campaign-47a truth packet:
 *  - Pick a Side must not pin to one door when the live register wrote elroy_outcome.
 *  - Cold Start's dock step only files at Helios, and the re-arming dock counts once.
 *  - A lost Beat-7 seed can be redeployed and rebound (no Deep Reach softlock).
 *  - NG+ leftover continuity progresses while the fresh run's own endgame is unresolved.
 * Run: node --test test/campaign-truth-fixes.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  campaign47aOutcomeKey,
  campaign47aRouteKind,
  missions as missionsProto,
} from '../src/systems/missions.js';
import { story as storyProto } from '../src/systems/story.js';
import { createPostEndingContinuity } from '../src/story/endings/resolve.js';
import {
  completeBeatStepsForLegacy,
  failEncounter,
  initCampaignSidecar,
  recordBeatStep,
} from '../src/story/campaign47a/campaignTransitions.js';
import { ensureCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { liveBranchIntroPayload, makeCampaignState } from './story-campaign47a-fixtures.mjs';

const stepsDone = (state, beat) => (
  state.story.campaign47a.stepProgress[String(beat)]?.completed || []
);

test('elroy token stamped by the live register does not pin Pick a Side to one door', () => {
  // Live route: the b2:elroy contract records its step BEFORE stamping elroy_outcome.
  const live = makeCampaignState();
  ensureCampaign47aState(live);
  live.story.flags.elroy_outcome = 'custody';
  live.story.campaign47a.stepProgress['2'] = {
    completed: ['cinder_board', 'compost', 'nest', 'elroy'], updatedAtS: 10,
  };
  assert.equal(campaign47aRouteKind(live), 'live');
  live.story.branch = 'traders';
  assert.equal(campaign47aOutcomeKey(live), 'force', 'the taken door names the token, not the stamp');
  live.story.branch = 'patrol';
  assert.equal(campaign47aOutcomeKey(live), 'custody');

  // Pinned legacy-shaped save: token present, no register step record — the pin still holds.
  const pinned = makeCampaignState();
  pinned.story.flags.elroy_outcome = 'custody';
  pinned.story.branch = 'traders';
  assert.equal(campaign47aRouteKind(pinned), 'pinned');
  assert.equal(campaign47aOutcomeKey(pinned), 'custody');

  // Explicit legacy stamp always wins, even beside live-looking sidecar rows.
  const legacy = makeCampaignState();
  ensureCampaign47aState(legacy);
  legacy.story.flags.elroy_outcome = 'custody';
  legacy.story.flags.elroy_outcome_legacy = true;
  legacy.story.campaign47a.stepProgress['2'] = { completed: ['elroy'], updatedAtS: 10 };
  assert.equal(campaign47aRouteKind(legacy), 'legacy');
});

test('Cold Start closes only on the Helios dock the recovery contract delivers to', () => {
  const s = makeCampaignState();
  initCampaignSidecar(s, 0);
  assert.equal(recordBeatStep(s, 'mining:yield', {}, 1).ok, true);
  assert.equal(recordBeatStep(s, 'story:skimResolved', {}, 2).ok, true);
  const wrong = recordBeatStep(s, 'dock:docked', { stationId: 'station_tethys' }, 3);
  assert.equal(stepsDone(s, 0).includes('dock'), false,
    `a berth at Tethys must not close the Pit step (got ${JSON.stringify(wrong)})`);
  assert.equal(recordBeatStep(s, 'dock:docked', { stationId: 'station_helios' }, 4).ok, true);
  assert.ok(stepsDone(s, 0).includes('dock'));
});

test('the signal that re-arms a failed beat also records its step', () => {
  const s = makeCampaignState();
  initCampaignSidecar(s, 0);
  recordBeatStep(s, 'mining:yield', {}, 1);
  recordBeatStep(s, 'story:skimResolved', {}, 2);
  const failed = failEncounter(s, 'mission_failed', 3, { encounterId: 'e1' });
  assert.equal(failed.ok, true);
  // Beat 0 re-arms on dock:docked; that same Helios dock is the work, not a throwaway.
  const rearmed = recordBeatStep(s, 'dock:docked', { stationId: 'station_helios' }, 20);
  assert.equal(rearmed.ok, true, JSON.stringify(rearmed));
  assert.ok(stepsDone(s, 0).includes('dock'), 'the re-arming dock must count the first time');
});

test('branch intro accept is the door, not the beat — required steps stay open', () => {
  const s = makeCampaignState();
  s.story.beatIndex = 4;
  initCampaignSidecar(s, 0);
  const out = recordBeatStep(s, 'mission:accepted', liveBranchIntroPayload('patrol'), 40);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.stepsComplete, false,
    'Spine Break / the Weighing / Barn Raising still have to run after the intro');
});

test('legacy step fill never fabricates optional gate-audit welds', () => {
  const s = makeCampaignState();
  s.story.beatIndex = 3;
  initCampaignSidecar(s, 0);
  const out = completeBeatStepsForLegacy(s, 3, 50, 'legacy:test');
  assert.ok(out && out.ok !== false, JSON.stringify(out));
  const done = stepsDone(s, 3);
  // Required book steps fill for a pre-book save; the optional Kepler weld must not.
  assert.ok(done.length > 0, 'required steps still fill');
  assert.equal(done.includes('gate_audit_kepler'), false,
    'a pre-book save never welded Kepler — the fill must not record one');
});

function b6Harness(outcome) {
  const program = outcome === 'custody' ? 'patrol_guard' : 'mine_to_depot';
  const state = createGameState(outcome === 'custody' ? 479 : 480);
  state.mode = 'flight';
  state.simTime = 70;
  state.playerId = 1;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  const bus = createBus();
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers: { voice: { say: () => true } }, registry: { get: () => null } });
  missions.newGame();
  state.missions.active = [];
  state.story.beatIndex = 6;
  state.story.branch = outcome === 'custody' ? 'patrol' : 'traders';
  state.story.flags.elroy_outcome = outcome;
  state.story.flags.proving_ground_complete = true;
  missions._syncCampaignSidecarAfterAdvance();
  return { state, bus, missions, program };
}

test('a destroyed Deep Reach seed is recoverable: redeploy, reprogram, repost', () => {
  const { state, bus, program } = b6Harness('custody');
  bus.emit('asset:deployed', { kind: 'drone', id: 'seed-1', defId: 'drone_mk1', sectorId: 'sector_helios_prime' });
  bus.emit('automation:programAssigned', { kind: 'drone', id: 'seed-1', templateId: program });
  assert.equal(state.story.beatIndex, 7);
  assert.equal(state.story.flags.empire_seed_asset_id, 'seed-1');

  // The climax drone dies before the operation runs — this used to strand the flag cleared.
  bus.emit('automation:assetLost', { kind: 'drone', id: 'seed-1', sectorId: 'sector_helios_prime' });
  assert.equal(state.story.flags.empire_seed_asset_id, undefined);
  assert.equal(state.story.flags.deep_reach_asset_lost, true);

  bus.emit('asset:deployed', { kind: 'drone', id: 'seed-2', defId: 'drone_mk1', sectorId: 'sector_helios_prime' });
  assert.equal(state.story.flags.empire_seed_pending_id, 'seed-2');
  bus.emit('automation:programAssigned', { kind: 'drone', id: 'seed-2', templateId: program });
  assert.equal(state.story.flags.empire_seed_asset_id, 'seed-2');
  assert.equal(state.story.flags.deep_reach_asset_lost, undefined,
    'rebound seed clears the lost mark so the Deep Reach offer reposts');
});

test('NG+ leftover continuity progresses while the new run endgame is unresolved', () => {
  const state = createGameState(4242);
  state.simTime = 100;
  const bus = createBus();
  const events = [];
  bus.on('story:continuationAccess', (p) => events.push(p));
  const sys = Object.assign({}, storyProto);
  sys.state = state;
  sys.bus = bus;
  sys.helpers = { voice: { say: () => true } };
  sys.registry = { get: () => null };

  // A fresh NG+ run: the previous ending's directive is live, the new campaign is not filed.
  state.story.newGamePlus = { schema: 1, endingId: 'A', worldFacts: {} };
  state.story.postEnding = createPostEndingContinuity('A', state.simTime, state.meta?.seed);
  assert.ok(state.story.postEnding, 'ending A carries a continuity directive');
  state.story.endgameResolved = false;
  state.story.endgameChoice = null;

  const ok = sys._onContinuationMission({ type: 'patrol_clear', missionId: 'm1' });
  assert.equal(ok, true, 'a permitted patrol job must advance the leftover watch');
  assert.equal(events.length, 1);
  assert.equal(events[0].choice, 'A');
  assert.equal(events[0].permitted, true);
  assert.equal(state.story.postEnding.progress, 1);
  // The new run still owns its own endgame — the latch must not pretend it is filed.
  assert.equal(state.story.endgameResolved, false);
  assert.equal(state.story.endgameChoice, null);
});
