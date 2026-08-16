import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createSimulation } from '../src/core/sim.js';
import { ENCOUNTERS, ENCOUNTER_MODULES } from '../src/data/encounters/index.generated.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SECTOR_ID = 'sector_pallas_drift';
const MAX_SEED = 512;

const CASES = Object.freeze([
  Object.freeze({
    id: 'medium_marauder_rockbreaker', order: 346, identity: 'marauder_brawler',
    source: '346-medium-marauder-rockbreaker.js', companions: ['skitter_swarmer'],
  }),
  // Existing ordinary production reachability: Plan 13 reuses the repeatable, nonzero-weight H6
  // patrol battle instead of cloning a second Lancer-only row.
  Object.freeze({
    id: 'depth_h6_patrol_ambush', order: 270, identity: 'lancer_sniper',
    source: '270-depth-h6-patrol-ambush.js', companions: ['lancer_sniper', 'reaver_pirate', 'wasp_swarmer'],
  }),
  Object.freeze({
    id: 'medium_interceptor_cutoff', order: 347, identity: 'hostile_interceptor',
    source: '347-medium-interceptor-cutoff.js', companions: ['dart_swarmer'],
  }),
  Object.freeze({
    id: 'medium_bulwark_wing', order: 348, identity: 'bulwark_escort',
    source: '348-medium-bulwark-wing.js', companions: ['hostile_interceptor'],
  }),
  // The cargo-cut is already the ordinary Corsair route and remains the only row owning its
  // carrier/tow premise.
  Object.freeze({
    id: 'corsair_cargo_cut', order: 341, identity: 'corsair_raider',
    source: '341-corsair-cargo-cut.js', companions: ['mule_trader', 'pd_screen_escort'],
  }),
  Object.freeze({
    id: 'medium_torcher_fireline', order: 349, identity: 'torcher_denial',
    source: '349-medium-torcher-fireline.js', companions: ['flea_swarmer'],
  }),
]);

function firstNaturalRoutes() {
  const routes = new Map();
  const zones = zonesForSector(SECTOR_ID);
  for (let seed = 1; seed <= MAX_SEED && routes.size < CASES.length; seed++) {
    const schedule = planEncounters(seed, SECTOR_ID, 0, zones);
    const first = schedule[0];
    if (first && CASES.some((row) => row.id === first.shapeId) && !routes.has(first.shapeId)) {
      routes.set(first.shapeId, { seed, item: first, schedule });
    }
  }
  return routes;
}

const NATURAL_ROUTES = firstNaturalRoutes();

function fireNaturalRoute(row) {
  const route = NATURAL_ROUTES.get(row.id);
  assert.ok(route, `${row.id} has a natural route before runtime exercise`);

  const budgetSystem = Object.create(spawnBudget);
  const directorSystem = Object.create(encounterDirector);
  const sim = createSimulation({ seed: route.seed, systems: [budgetSystem, directorSystem] });
  const { state } = sim;
  state.mode = 'flight';
  state.simTime = 0;
  state.world.currentSectorId = SECTOR_ID;
  state.world.activeSector = { stations: [] };
  state.story = { ...(state.story || {}), beatIndex: 7 };
  state.onboarding = { ...(state.onboarding || {}), active: false, finished: true };
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: { ...route.item.zoneCenter }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;

  sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  const director = sim.registry.get('encounterDirector');
  const pending = state.encounterDirector.pending.find((item) => item.shapeId === row.id);
  assert.ok(pending, `${row.id} survives production sector-entry planning`);
  assert.equal(pending.dueAt, Math.min(...state.encounterDirector.pending.map((item) => item.dueAt)),
    `${row.id} is the ordinary next due item, not a forced authored request`);

  player.pos.x = pending.zoneCenter.x;
  player.pos.z = pending.zoneCenter.z;
  state.simTime = pending.dueAt;
  state.encounterDirector.pressure.combat = 140;
  state.encounterDirector.lastMeaningfulAt = state.simTime - 31;
  state.encounterDirector.window = [];
  director.update(1, state);

  const live = state.encounterDirector.live[pending.encounterId];
  assert.ok(live, `${row.id} fires through encounterDirector.update`);
  assert.ok(live.ids.length > 0, `${row.id} physically materializes its production composition`);
  return { sim, state, live, route };
}

test('the generated catalog keeps four new medium compositions beside the existing Lancer and Corsair routes', () => {
  const freshness = spawnSync(process.execPath, ['scripts/build-encounter-index.mjs', '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(freshness.status, 0, `${freshness.stdout}\n${freshness.stderr}`);

  for (const row of CASES) {
    const module = ENCOUNTER_MODULES.find((candidate) => candidate.encounterOrder === row.order);
    const shape = ENCOUNTERS[row.id];
    assert.ok(module, `${row.source} is in the generated import graph`);
    assert.equal(module.default, shape);
    assert.equal(shape.deck, 'combat');
    assert.equal(shape.tier, 'minor');
    assert.ok(shape.weight > 0, `${row.id} has nonzero ordinary schedule weight`);
    assert.equal(shape.gates?.externalOnly, undefined, `${row.id} is not debug/external-only`);
    assert.ok(shape.zoneTypes.length > 0, `${row.id} has ordinary authored zone reachability`);
  }

  const bulwark = ENCOUNTERS.medium_bulwark_wing;
  assert.equal(bulwark.squad.anchorArchetype, 'bulwark_escort');
  assert.deepEqual(bulwark.squad.archetypes, ['hostile_interceptor']);
  assert.ok(bulwark.squad.size[0] >= 2, 'every Bulwark roll includes at least one allied wing hull');
  assert.deepEqual(ENCOUNTERS.medium_torcher_fireline.squad.size, [2, 2],
    'the Torcher lane stays sparse enough to reverse through its own trail');
});

test('all six fixed-stat mediums naturally win a planner slot and physically spawn through the production director', () => {
  assert.equal(NATURAL_ROUTES.size, CASES.length,
    `all six mediums must win an ordinary first slot within seeds 1..${MAX_SEED}`);
  const zones = zonesForSector(SECTOR_ID);

  for (const row of CASES) {
    const route = NATURAL_ROUTES.get(row.id);
    assert.ok(route, `${row.id} has a bounded natural route`);
    assert.deepEqual(planEncounters(route.seed, SECTOR_ID, 0, zones), route.schedule,
      `${row.id} ordinary selection is deterministic`);
    assert.equal(route.schedule[0].shapeId, row.id);
    assert.ok(route.item.ships.some((ship) => ship.archetype === row.identity),
      `${row.id} planner composition carries ${row.identity}`);
    for (const companion of row.companions) {
      assert.ok(route.item.ships.some((ship) => ship.archetype === companion),
        `${row.id} composition preserves its readable ${companion} role`);
    }

    const { state, live } = fireNaturalRoute(row);
    const actors = live.ids.map((id) => state.entities.get(id)).filter(Boolean);
    const identityActors = actors.filter((entity) => entity.data?.lootTableId === row.identity);
    assert.ok(identityActors.length >= 1, `${row.identity} exists as a live physical actor`);

    const canonical = makeEnemySpawnSpec(row.identity, 99, { x: 0, z: 0 });
    for (const actor of identityActors) {
      assert.equal(actor.alive, true);
      assert.equal(actor.data?.ai?.encounterId, live.id);
      assert.equal(actor.data?.ai?.spawnContext, row.id === 'depth_h6_patrol_ambush' ? 'patrol' : 'encounter');
      assert.equal(actor.mass, canonical.mass);
      assert.equal(actor.hullMax, canonical.hullMax);
      assert.equal(actor.maxSpeed, canonical.maxSpeed);
    }

    if (row.identity === 'bulwark_escort') {
      const bulwark = identityActors[0];
      const allies = actors.filter((entity) => entity.id !== bulwark.id && entity.team === bulwark.team);
      assert.ok(allies.length >= 1, 'the physical Bulwark has an actual same-team wing to project onto');
    }
  }
});
