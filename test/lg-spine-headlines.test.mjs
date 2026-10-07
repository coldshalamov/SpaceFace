import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import {
  BRANCH_HEADLINE_VERBS as LIVE_BRANCH_VERBS,
  STORY_BEATS,
  STORY_BRANCH_INTRO_TAG,
} from '../src/data/missions.js';
import {
  BRANCH_HEADLINE_VERBS,
  BRANCH_IDS,
  CAMPAIGN_BEATS,
} from '../src/story/campaign47a/campaignData.js';
import {
  buildMissionBoardContract,
  describeEmbodiedMission,
  getEmpireSeedProgram,
  headlineVerbForBeat,
  headlineVerbMapForBeat,
  validateEmbodiedMissions,
} from '../src/story/campaign47a/embodiedMissions.js';
import { missions as missionsProto } from '../src/systems/missions.js';

// LG-SPINE-HEADLINES — every story beat names a physical headline verb, resolved per
// run for the branch beats, and the live boards/records carry the same verb through
// the headlineVerb → params.physicalVerb → receipt seam. Fixed seed: 4242.

const SEED = 4242;

// The verb sequence each run actually performs, beat 0..7. Beats 1–3 are the authored
// set pieces every run flies; B4/B5/B7 resolve to the run's own physical work.
const RUNS = Object.freeze({
  combat: Object.freeze({
    branch: 'patrol',
    elroyOutcome: 'custody',
    introStationId: 'station_coalition',
    chainStationId: 'station_coalition',
    verbs: Object.freeze(['mine', 'knock', 'pull', 'tow', 'clear', 'clear', 'deploy', 'jam']),
  }),
  builder: Object.freeze({
    branch: 'traders',
    elroyOutcome: 'force',
    introStationId: 'station_tethys',
    chainStationId: 'station_tethys',
    verbs: Object.freeze(['mine', 'knock', 'pull', 'tow', 'deliver', 'deliver', 'deploy', 'knock']),
  }),
  free: Object.freeze({
    branch: 'free',
    elroyOutcome: 'force',
    verbs: Object.freeze(['mine', 'knock', 'pull', 'tow', 'run', 'run', 'deploy', 'tow']),
  }),
});

test('every beat resolves a physical headline verb on a combat-only and a builder run', () => {
  for (const [label, run] of Object.entries(RUNS)) {
    const resolved = CAMPAIGN_BEATS.map((_, beat) => headlineVerbForBeat(beat, {
      branch: run.branch,
      elroyOutcome: run.elroyOutcome,
    }));
    assert.deepEqual(resolved, [...run.verbs], `${label} run verbs`);
    for (let beat = 0; beat < 8; beat++) {
      assert.equal(
        describeEmbodiedMission(beat, { branch: run.branch, elroyOutcome: run.elroyOutcome }).headlineVerb,
        run.verbs[beat],
        `${label} describe B${beat}`,
      );
      const live = STORY_BEATS[beat];
      const canon = CAMPAIGN_BEATS[beat];
      const named = live.headlineVerb || live.headlineVerbs || canon.headlineVerb || canon.headlineVerbs;
      assert.ok(named, `B${beat} names a verb in the live + canonical tables`);
      if (live.headlineVerbs) assert.equal(live.headlineVerbs[run.branch], run.verbs[beat]);
      if (canon.headlineVerbs) assert.equal(canon.headlineVerbs[run.branch], run.verbs[beat]);
    }
    // The branch map matches the run's intro/chain work — a beat that names a verb the
    // run never performs fails here.
    assert.equal(headlineVerbMapForBeat(4)[run.branch], BRANCH_HEADLINE_VERBS[run.branch]);
    assert.equal(headlineVerbMapForBeat(5)[run.branch], BRANCH_HEADLINE_VERBS[run.branch]);
    assert.deepEqual(
      { ...headlineVerbMapForBeat(7) },
      { patrol: 'jam', traders: 'knock', free: 'tow' },
    );
  }
  assert.deepEqual({ ...LIVE_BRANCH_VERBS }, { ...BRANCH_HEADLINE_VERBS },
    'live spine and sidecar name the same branch verbs');
  assert.equal(validateEmbodiedMissions().ok, true,
    'validator asserts every beat names its verb');
});

function harness(outcome) {
  const state = createGameState(SEED);
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
  const toasts = [];
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
  return { state, bus, missions, toasts };
}

function completePhysically(h, mission) {
  if (mission.type === 'bulk_trade') {
    h.bus.emit('economy:tradeCompleted', {
      side: 'sell', stationId: mission.destStationId,
      commodityId: mission.params.cmdtyId, qty: mission.objectiveTarget,
    });
    return;
  }
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  for (const targetId of [...(mission.targetEntityIds || [])]) {
    h.bus.emit('entity:killed', { id: targetId, killerId: h.state.playerId });
  }
}

function campaignReceipts(h, kind) {
  const own = h.state.story.campaign47a;
  return (own && Array.isArray(own.receipts) ? own.receipts : []).filter((r) => r.kind === kind);
}

function runBeat4(h, run) {
  const board = h.missions.ensureBoard(run.introStationId);
  const offer = board.slots.find((row) => row.storyTag === STORY_BRANCH_INTRO_TAG);
  assert.ok(offer, `${run.branch} intro is posted`);
  assert.equal(offer.storyBranch, run.branch);
  // The generated intro offer names its physical verb through the same params seam the
  // authored set-piece types stamp inline.
  assert.equal(offer.params.physicalVerb, run.verbs[4], `${run.branch} intro names its verb`);
  assert.equal(h.missions.acceptMission(offer.id), true,
    `accept rejected: ${h.toasts.map((row) => row && row.text).filter(Boolean).join(' | ')}`);
  const mission = h.state.missions.active.find((row) => row.storyTag === STORY_BRANCH_INTRO_TAG);
  assert.ok(mission);
  assert.equal(mission.params.physicalVerb, run.verbs[4], 'accepted mission keeps the verb');
  // The sidecar receipt names the verb the player committed to perform.
  const introReceipts = campaignReceipts(h, 'branch_intro_accept');
  assert.equal(introReceipts.length, 1);
  assert.equal(introReceipts[0].physicalVerb, run.verbs[4]);
  completePhysically(h, mission);
  assert.equal(h.state.story.beatIndex, 5);
  assert.equal(h.state.story.branch, run.branch);
}

function runBeat5(h, run) {
  const board = h.missions.ensureBoard(run.chainStationId);
  const tag = `campaign47a:b5:${run.branch}:1`;
  const offer = board.slots.find((row) => row.storyTag === tag);
  assert.ok(offer, `${run.branch} proving leg 1 is posted`);
  // The authored chain leg names the verb on its params — the player reads the same
  // action the beat resolved.
  assert.equal(offer.params.physicalVerb, run.verbs[5], `${run.branch} chain leg names its verb`);
  assert.equal(h.missions.acceptMission(offer.id), true);
  const mission = h.state.missions.active.find((row) => row.storyTag === tag);
  assert.ok(mission);
  completePhysically(h, mission);
  const chainReceipts = campaignReceipts(h, 'chain_progress');
  assert.ok(chainReceipts.length >= 1, 'chain progress recorded');
  assert.equal(chainReceipts[chainReceipts.length - 1].physicalVerb, run.verbs[5],
    'the chain receipt names the performed verb');
  return h.state.story.chainProgress;
}

function runBeat6(h, run) {
  const program = getEmpireSeedProgram(run.elroyOutcome);
  h.bus.emit('asset:deployed', { kind: 'drone', id: 'drone_run_1', defId: 'def_drone_1' });
  h.bus.emit('automation:programAssigned', {
    kind: 'drone', id: 'drone_run_1', defId: 'def_drone_1', templateId: program.templateId,
  });
  assert.equal(h.state.story.beatIndex, 7, 'drone + assigned program completes Empire Seed');
  const steps = campaignReceipts(h, 'step_progress').filter((r) => r.beatIndex === 6);
  assert.ok(steps.length >= 1, 'B6 step recorded');
  assert.equal(steps[steps.length - 1].physicalVerb, 'deploy', 'the deploy step names its verb');
}

test('seed 4242: combat and builder runs carry the named verb through intro, chain, seed, and climax', () => {
  for (const label of ['combat', 'builder']) {
    const run = RUNS[label];
    const h = harness(run.elroyOutcome);
    runBeat4(h, run);
    const legs = Math.max(1, { patrol: 2, traders: 3, free: 2 }[run.branch] - 1);
    runBeat5(h, run);
    // Finish any remaining authored legs on the live board to reach B6 — each leg's
    // offer still names the verb.
    for (let leg = 0; leg < legs && h.state.story.beatIndex === 5; leg++) {
      const board = h.missions.ensureBoard(run.chainStationId);
      const step = h.state.story.chainProgress + 1;
      const tag = `campaign47a:b5:${run.branch}:${step}`;
      const offer = board.slots.find((row) => row.storyTag === tag);
      if (!offer) break;
      assert.equal(offer.params.physicalVerb, run.verbs[5], `${label} leg ${step} names its verb`);
      assert.equal(h.missions.acceptMission(offer.id), true);
      const mission = h.state.missions.active.find((row) => row.storyTag === tag);
      completePhysically(h, mission);
    }
    assert.equal(h.state.story.beatIndex, 6, `${label} run reaches Empire Seed`);
    runBeat6(h, run);
    // B7: the deployed seed asset is what opens the run's climax operation — the flag
    // the deploy wrote is the offer's own key, not a test literal.
    const assetId = h.state.story.flags.empire_seed_asset_id;
    assert.ok(assetId, `${label} seed asset id is on record`);
    const op = buildMissionBoardContract(7, {
      seed: SEED,
      epoch: 0,
      branch: run.branch,
      elroyOutcome: run.elroyOutcome,
      assetId,
    });
    assert.ok(op, `${label} Deep Reach op is offered`);
    assert.equal(op.params.headlineVerb, run.verbs[7], `${label} climax names its verb`);
    // The op's own staged physical verb stays the authored one (knock_down for the siege).
    assert.ok(typeof op.params.physicalVerb === 'string' && op.params.physicalVerb.length > 0,
      `${label} climax carries a staged physical verb`);
  }
});
