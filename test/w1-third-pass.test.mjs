// W1 third-pass regressions: B0 stale-save backfill and post-ending act suppression.
// Run: node --test test/w1-third-pass.test.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { missions as missionsProto, CONTRACT_47A_SAMPLE_ID } from '../src/systems/missions.js';
import { getBeatStepStatus } from '../src/story/campaign47a/index.js';
import { recommendedActions } from '../src/ui/screens/missionLog.js';
import { flightDestinationSurface } from '../src/ui/hud.js';
import { isDurableStoryReceipt } from '../src/ui/comms.js';
import { journeyActForBeat, JOURNEY_ACTS } from '../src/data/journeyActs.js';

function bootColdStart() {
  const state = createGameState(47);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 200 };
  state.factions = state.factions || {};
  for (const id of ['faction_scn', 'faction_mts', 'faction_free', 'faction_dmc']) {
    state.factions[id] = state.factions[id] || { rep: 0, aggro: false };
    state.factions[id].rep = 0;
  }
  state.entities = state.entities || new Map();
  state.entities.set(1, { id: 1, team: 'player', pos: { x: 0, y: 0, z: 0 }, flags: {}, hull: 100, maxHull: 100 });
  state.entityList = [...state.entities.values()];
  state.onboarding = { active: false, finished: true };
  if (state.settings?.gameplay) state.settings.gameplay.tutorialHints = false;
  state.world.currentSectorId = 'sector_helios_prime';
  const bus = createBus();
  const helpers = {
    spawnEntity: (spec) => {
      const id = state.entities.size ? Math.max(...state.entities.keys()) + 1 : 1;
      const entity = { id, alive: true, ...spec, data: structuredClone(spec.data || {}) };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: null });
  missions._installContract47aColdStart();
  return { state, bus, missions };
}

test('a B0 save with sampleRecovered but no sidecar mine step backfills before the dock guard', () => {
  const h = bootColdStart();
  const b0 = h.state.missions.active.find((m) => m?.storyTag === 'campaign47a:b0:recovery');
  assert.ok(b0, 'the cold-start contract is active');
  b0.params.sampleRecovered = true;
  b0.params.sampleRecoveredAt = h.state.simTime;
  b0.objectiveProgress = 1;
  // Simulate the stale save: the physical sample is aboard, but the ordered sidecar step is absent.
  const steps = h.state.story.campaign47a?.stepProgress?.['0']?.completed || [];
  assert.equal(steps.includes('mine'), false, 'the stale save has no recorded mine step');
  const status = getBeatStepStatus(h.state, 0);
  assert.equal((status?.steps || []).some((s) => s.id === 'mine' && s.done), false);

  const resolved = h.missions._resolveContract47aSkimForDock('station_helios');
  assert.equal(resolved, true, 'the dock guard accepts the recovered sample as proof of the mine');
  assert.equal(b0.params.skimResolved, true, 'the skim resolves instead of being skipped');
  const after = getBeatStepStatus(h.state, 0);
  assert.equal((after?.steps || []).some((s) => s.id === 'mine' && s.done), true,
    'the sidecar mine step is backfilled');
});

test('the durable act receipt is the comms class that bypasses the Adventure/attention gates', () => {
  assert.equal(isDurableStoryReceipt({ id: 'act:II' }), true);
  assert.equal(isDurableStoryReceipt({ storyReceipt: true }), true);
  assert.equal(isDurableStoryReceipt({ id: 'b0_skim_killfeed' }), false);
  assert.equal(isDurableStoryReceipt(null), false);
});

test('the flight tracker shows the act beside a waypoint in mode flight', () => {  const state = {
    mode: 'flight',
    simTime: 10,
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 } }]]),
    playerId: 1,
    story: { beatIndex: 2, flags: {} },
    missions: { active: [] },
    nav: { waypoint: { reason: 'Recover the marked sample', pos: { x: 400, z: 0 }, label: '47-A Recovery Site' } },
    ui: {},
  };
  const dest = flightDestinationSurface(state, {
    owner: 'navigation',
    waypoint: state.nav.waypoint,
  });
  assert.equal(dest.show, true);
  assert.equal(dest.actLine, 'ACT II - THE CINDER BOARD');
  assert.match(dest.line, /Recover the marked sample/);
});

test('the Journal recommendation does not attach an act after the book closes', () => {
  const state = {
    story: { beatIndex: 7, flags: { endgame: true } },
    player: { credits: 5000, cargo: { items: {}, capVolume: 10, usedVolume: 0, capMass: 10, usedMass: 0 } },
    missions: { active: [] },
    ui: {},
  };
  const actions = recommendedActions(state, [], null);
  for (const action of actions) {
    assert.doesNotMatch(String(action.meta || ''), /ACT (I|II|III|IV)/,
      'no post-ending row names a live act');
    assert.equal(action.actLine, undefined, 'no dead actLine field survives the endgame guard');
  }
});

test('W1 act receipts do not move the ship, draw RNG, or emit combat/flight events', () => {
  const state = createGameState(47);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.story = { beatIndex: 0, flags: {}, journeyActs: { seen: [], current: null } };
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    data: {
      fittings: ['wpn_pulse_laser_s', 'mod_mining_laser_s', 'mod_engine_ion_m', 'mod_shield_liner_s', 'mod_drill_amp'],
      derived: { mass: 33, dryMass: 33, shield: 210, shieldMax: 210, maxSpeed: 142.129201 },
    },
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const motionEvents = [];
  for (const event of ['combat:fire', 'combat:damage', 'projectile:hit', 'ship:thrust', 'ship:boostStart', 'physics:impulse', 'tether:attached']) {
    bus.on(event, () => motionEvents.push(event));
  }
  const system = Object.assign({}, missionsProto);
  system.state = state;
  system.bus = bus;
  const fittingsBefore = structuredClone(player.data.fittings);
  const derivedBefore = structuredClone(player.data.derived);
  const rngBefore = structuredClone(state.rng.getState());

  for (const act of JOURNEY_ACTS) system._announceJourneyAct(act);
  state.story.beatIndex = 2;
  system._reconcileJourneyAct();

  assert.deepEqual(player.data.fittings, fittingsBefore, 'act framing never rewrites the starter fit');
  assert.deepEqual(player.data.derived, derivedBefore, 'act framing never rewrites flight-derived stats');
  assert.deepEqual(state.rng.getState(), rngBefore, 'act framing draws no simulation RNG');
  assert.deepEqual(motionEvents, [], 'act framing emits no combat/flight/physics event');
  assert.deepEqual(state.story.journeyActs.seen, ['I', 'II', 'III', 'IV'], 'the act record still advances');
  assert.equal(state.story.journeyActs.current, 'II');
});

