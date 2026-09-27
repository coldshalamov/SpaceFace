// PQ-135 live cohort opt-in — fodder choreography reaches the ordinary encounter route.
//
// The cohort director (river/crescent) shipped behind `ai.cohortRecipe`, but nothing on the
// live route stamped it: survivalSwarm and the Crucible role-stamp owned the only producers,
// and the receipt noted "nothing opts in until an encounter assigns a river or crescent."
// This test pins the opt-in contract end to end:
//   1. Authored Reach fodder squads declare `squad.cohortRecipe` (data reachability).
//   2. The planner carries it onto every member stub; `spawnShips` stamps only swarmer
//      archetypes — the anchor stays on the full tactical stack.
//   3. `gatherCohorts` then groups the stamped members under their squad id.
//   4. Caller-triggered swarm-screen reinforcements stamp the same recipe; the untouched
//      fixture package stays unstamped.

import test from 'node:test';
import assert from 'node:assert/strict';

import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { gatherCohorts } from '../src/systems/tacticalAI.js';
import { encounterDirector, planEncounterShape } from '../src/systems/encounterDirector.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { world } from '../src/systems/world.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

const IO_REACH = 'sector_io_reach';
const DT = 1 / 60;

const SWARM_ZONE = {
  id: 'test_derelict',
  name: 'Test derelict field',
  type: 'derelict_field',
  center: { x: 0, z: 0 },
  radius: 300,
  threat: 0.5,
};

const COHORT_SQUADS = [
  { id: 'foreman_lane_toll', recipe: 'fodder_crescent', anchor: 'mirrorjaw_foreman' },
  { id: 'scavengers_fresh_wreck', recipe: 'fodder_river', anchor: 'reaver_pirate' },
  { id: 'foreman_wreck_herd', recipe: 'fodder_crescent', anchor: 'mirrorjaw_foreman' },
];

test('the authored fodder squads declare a cohort recipe', () => {
  for (const row of COHORT_SQUADS) {
    const enc = ENCOUNTERS[row.id];
    assert.ok(enc, `${row.id} loads into ENCOUNTERS`);
    assert.ok(enc.squad, `${row.id} authors a squad`);
    assert.equal(enc.squad.cohortRecipe, row.recipe, `${row.id} squad opts into ${row.recipe}`);
  }
});

test('the planner carries the recipe onto member stubs, anchors included', () => {
  const rng = mulberry32(hash32('cohort-opt-in', 'lane-toll'));
  const plan = planEncounterShape(ENCOUNTERS.foreman_lane_toll, SWARM_ZONE, IO_REACH, 1, 7, rng);
  assert.ok(plan.ships.length >= 3, 'lane toll realizes a full squad');
  for (const ship of plan.ships) {
    assert.equal(ship.cohortRecipe, 'fodder_crescent',
      `${ship.archetype} stub carries the squad's declared recipe (archetype filter runs at spawn)`);
  }
});

function spawnFixturePlayer(sim) {
  const origin = sectorGlobalOrigin(IO_REACH);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { ...origin }, vel: { x: 0, z: 0 },
    radius: 5, mass: 10, hull: 100, hullMax: 100, flags: {},
  });
  player.isPlayer = true;
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  return player;
}

function makeLive() {
  return {
    id: 'cohort-encounter', squadId: 'cohort-encounter', sectorId: IO_REACH,
    zoneId: 'fixture-zone', zoneName: 'Fixture Zone', shapeId: 'foreman_lane_toll',
    shape: ENCOUNTERS.foreman_lane_toll,
    plan: { motive: 'fixture', engagementTrigger: 'fixture', ships: [] },
    causality: null, ids: [], roles: {},
  };
}

test('spawnShips stamps the recipe on swarmer hulls only', () => {
  const sim = createSimulation({ seed: 47, systems: [spawnBudget, encounterDirector] });
  spawnFixturePlayer(sim);
  sim.state.world.currentSectorId = IO_REACH;
  const director = sim.registry.get('encounterDirector');
  const live = makeLive();
  const ships = [
    { archetype: 'mirrorjaw_foreman', compositionRole: 'identity_anchor', level: 8, context: 'encounter',
      factionId: 'faction_reach', role: 'squad', cohortRecipe: 'fodder_crescent', pos: { x: 100, z: 200 } },
    { archetype: 'wasp_swarmer', compositionRole: 'light', level: 2, context: 'encounter',
      factionId: 'faction_reach', role: 'squad', cohortRecipe: 'fodder_crescent', pos: { x: 140, z: 200 } },
    { archetype: 'wasp_swarmer', compositionRole: 'light', level: 2, context: 'encounter',
      factionId: 'faction_reach', role: 'squad', cohortRecipe: 'fodder_crescent', pos: { x: 160, z: 220 } },
    // Same squad without the declaration: a plain swarmer must not inherit a recipe.
    { archetype: 'wasp_swarmer', compositionRole: 'light', level: 2, context: 'encounter',
      factionId: 'faction_reach', role: 'squad', pos: { x: 190, z: 240 } },
  ];
  const ids = director.spawnShips(live, ships);
  assert.equal(ids.length, 4);

  const anchor = sim.state.entities.get(ids[0]);
  const cutters = [sim.state.entities.get(ids[1]), sim.state.entities.get(ids[2])];
  const plain = sim.state.entities.get(ids[3]);
  assert.equal(anchor.data.ai.cohortRecipe, undefined,
    'the foreman anchor keeps the full tactical stack');
  for (const cutter of cutters) {
    assert.equal(cutter.data.ai.cohortRecipe, 'fodder_crescent',
      'swarmer members join the crescent cohort');
  }
  assert.equal(plain.data.ai.cohortRecipe, undefined,
    'undeclared squads never stamp a recipe');

  const groups = gatherCohorts(sim.state);
  const cohort = groups.find((g) => g.id === 'cohort-encounter');
  assert.ok(cohort, 'gatherCohorts assembles the stamped squad');
  assert.equal(cohort.recipeId, 'fodder_crescent');
  assert.deepEqual(
    cohort.members.map((e) => e.id).sort((a, b) => a - b),
    [ids[1], ids[2]].sort((a, b) => a - b),
    'the cohort holds exactly the two stamped cutters',
  );
  sim.dispose();
});

function makeHarness(seed = 0x4706c0) {
  const state = createGameState(seed);
  state.mode = 'flight';
  const listeners = new Map();
  const bus = {
    on(event, fn) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, set = new Set());
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(event, payload) {
      for (const fn of [...(listeners.get(event) || [])]) fn(payload, event);
    },
    queue(event, payload) { this.emit(event, payload); },
    flush() {},
  };
  const helpers = {};
  const ctx = { state, bus, helpers, registry: { get() { return null; } } };
  const h = {
    state, bus, helpers, ctx,
    core: Object.create(core),
    aiPorts: Object.create(aiPorts),
    aiEncounter: Object.create(aiEncounter),
  };
  h.core.init(ctx);
  h.aiPorts.init(ctx);
  h.aiEncounter.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', alive: true, collides: true, radius: 12, mass: 32,
    pos: { x: 25, z: -15 }, vel: { x: 0, z: 0 }, rot: 0, team: 0,
    factionId: 'faction_free', hull: 150, hullMax: 150,
    data: { role: 'player_anchor', combatProfileId: 'combat_profile_standard_ship' },
  });
  state.playerId = player.id;
  state.spatialHash.rebuild(state.entityList);
  return h;
}

function stepFor(h, ticks) {
  for (let i = 0; i < ticks; i++) {
    h.core.preStep(DT, h.state);
    h.state.tick += 1;
    h.aiEncounter.update(DT, h.state);
  }
}

test('swarm-screen reinforcements stamp the crescent; the fixture package stays plain', () => {
  const h = makeHarness();
  h.helpers.aiEncounter.issue({ tick: 0, type: 'request_reinforcement', packageId: 'reaver_swarm_screen' });
  h.aiEncounter.update(DT, h.state);
  const pendings = h.state.aiEncounter.owner.pendingReinforcements;
  assert.ok(pendings.length >= 1, 'the call queues arrivals');
  for (const pending of pendings) {
    assert.equal(pending.cohortRecipe, 'fodder_crescent', 'the package declares its choreography');
  }

  const spawnedBefore = h.state.entityList.length;
  stepFor(h, 120); // delayTicks 90 → arrivals land well inside the window
  const arrivals = h.state.entityList.slice(spawnedBefore);
  assert.equal(arrivals.length, pendings.length, 'every due member spawned');
  for (const entity of arrivals) {
    assert.equal(entity.data.ai.cohortRecipe, 'fodder_crescent',
      'screen arrivals join the cohort on the live seam');
  }

  const h2 = makeHarness();
  h2.helpers.aiEncounter.issue({ tick: 0, type: 'request_reinforcement', packageId: 'fixture_wing_pair' });
  h2.aiEncounter.update(DT, h.state);
  const fixtureSpawnedBefore = h2.state.entityList.length;
  stepFor(h2, 30);
  const fixtureArrivals = h2.state.entityList.slice(fixtureSpawnedBefore);
  assert.ok(fixtureArrivals.length >= 1, 'fixture members spawned');
  for (const entity of fixtureArrivals) {
    assert.equal(entity.data.ai.cohortRecipe, undefined,
      'the undeclared fixture package stays off the cohort director');
  }
});
