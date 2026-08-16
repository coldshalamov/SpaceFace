import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createSimulation } from '../src/core/sim.js';
import { ENCOUNTERS, ENCOUNTER_MODULES } from '../src/data/encounters/index.generated.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import {
  encounterDirector,
  planEncounters,
  planEncounterShape,
} from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SECTOR_ID = 'sector_pallas_drift';

const CASES = Object.freeze([
  Object.freeze({
    id: 'swarmer_dart_run', order: 337, archetype: 'dart_swarmer', band: [4, 7],
    zoneTypes: ['ambush_lane', 'trade_lane', 'patrol_corridor'],
  }),
  Object.freeze({
    id: 'swarmer_flea_rig', order: 338, archetype: 'flea_swarmer', band: [3, 5],
    zoneTypes: ['outlaw_zone', 'refinery_approach', 'ambush_lane'],
  }),
  Object.freeze({
    id: 'swarmer_skitter_nest', order: 339, archetype: 'skitter_swarmer', band: [3, 6],
    zoneTypes: ['mining_belt'],
  }),
  Object.freeze({
    id: 'swarmer_ember_pack', order: 340, archetype: 'ember_swarmer', band: [2, 4],
    zoneTypes: ['derelict_field', 'outlaw_zone', 'ambush_lane'],
  }),
]);

function firstNaturalRoutes() {
  const routes = new Map();
  const zones = zonesForSector(SECTOR_ID);
  for (let seed = 1; seed <= 512 && routes.size < CASES.length; seed++) {
    const schedule = planEncounters(seed, SECTOR_ID, 0, zones);
    const first = schedule[0];
    if (first && CASES.some((row) => row.id === first.shapeId) && !routes.has(first.shapeId)) {
      routes.set(first.shapeId, { seed, item: first, schedule });
    }
  }
  return routes;
}

const NATURAL_ROUTES = firstNaturalRoutes();

test('generated catalog registers the four ordinary swarmer encounters with exact family bands', () => {
  const freshness = spawnSync(process.execPath, ['scripts/build-encounter-index.mjs', '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(freshness.status, 0, `${freshness.stdout}\n${freshness.stderr}`);

  for (const row of CASES) {
    const module = ENCOUNTER_MODULES.find((candidate) => candidate.encounterOrder === row.order);
    const shape = ENCOUNTERS[row.id];
    assert.ok(module, `${row.id} module is in the generated import graph`);
    assert.equal(module.default, shape, `${row.id} catalog identity comes from its module`);
    assert.equal(shape.script, 'ambush');
    assert.equal(shape.deck, 'combat');
    assert.equal(shape.tier, 'minor');
    assert.ok(shape.weight > 0, `${row.id} has nonzero ordinary schedule weight`);
    assert.ok(shape.cooldownS >= 720, `${row.id} cannot become encounter spam`);
    assert.deepEqual(shape.zoneTypes, row.zoneTypes);
    assert.deepEqual(shape.squad.archetypes, [row.archetype]);
    assert.deepEqual(shape.squad.size, row.band);
    assert.equal(shape.gates.externalOnly, undefined, `${row.id} is not debug/external-only`);
  }
});

test('production squad resolution realizes both edges of every authored composition band', () => {
  const zones = zonesForSector(SECTOR_ID);
  for (const row of CASES) {
    const shape = ENCOUNTERS[row.id];
    const zone = zones.find((candidate) => shape.zoneTypes.includes(candidate.type));
    assert.ok(zone, `${row.id} has a real zone in ${SECTOR_ID}`);

    const minimum = planEncounterShape(shape, zone, SECTOR_ID, 0, row.order, () => 0);
    const maximum = planEncounterShape(shape, zone, SECTOR_ID, 0, row.order, () => 0.999999);
    assert.equal(minimum.ships.length, row.band[0], `${row.id} realizes its lower bound`);
    assert.equal(maximum.ships.length, row.band[1], `${row.id} realizes its upper bound`);
    assert.ok([...minimum.ships, ...maximum.ships]
      .every((ship) => ship.archetype === row.archetype), `${row.id} does not dilute its counter with another role`);
  }
});

test('each swarmer encounter is deterministically reachable in the default sector-day planner', () => {
  assert.equal(NATURAL_ROUTES.size, CASES.length,
    'all four shapes must naturally win a normal weighted slot in the bounded seed/day matrix');
  const zones = zonesForSector(SECTOR_ID);
  for (const row of CASES) {
    const route = NATURAL_ROUTES.get(row.id);
    assert.ok(route, `${row.id} has a natural route`);
    const replay = planEncounters(route.seed, SECTOR_ID, 0, zones);
    assert.deepEqual(replay, route.schedule, `${row.id} schedule is deterministic`);
    assert.equal(replay[0].shapeId, row.id, `${row.id} is the first naturally due item on its route`);
    assert.ok(replay[0].ships.length >= row.band[0] && replay[0].ships.length <= row.band[1]);
  }
});

test('the production director fires and spawns each naturally planned fixed-stat swarmer pack', () => {
  for (const row of CASES) {
    const route = NATURAL_ROUTES.get(row.id);
    assert.ok(route, `${row.id} route exists before runtime exercise`);

    const sim = createSimulation({ seed: route.seed, systems: [spawnBudget, encounterDirector] });
    const { state, bus } = sim;
    state.mode = 'flight';
    state.simTime = 0;
    state.world.currentSectorId = SECTOR_ID;
    state.onboarding = { ...(state.onboarding || {}), active: false, finished: true };
    const player = sim.spawn({
      type: 'ship', team: 0,
      pos: { ...route.item.zoneCenter }, vel: { x: 0, z: 0 },
      hull: 200, hullMax: 200, radius: 8,
    });
    state.playerId = player.id;

    const telegraphs = [];
    const spawned = [];
    bus.on('encounter:telegraph', (payload) => telegraphs.push(payload));
    bus.on('encounter:spawned', (payload) => spawned.push(payload));
    bus.emit('sector:enter', { sectorId: SECTOR_ID });

    const director = sim.registry.get('encounterDirector');
    const pending = state.encounterDirector.pending.find((item) => item.shapeId === row.id);
    assert.ok(pending, `${row.id} survives production sector-entry planning`);
    assert.equal(pending.dueAt, Math.min(...state.encounterDirector.pending.map((item) => item.dueAt)),
      `${row.id} is the normal next due item, not a forced request`);

    player.pos.x = pending.zoneCenter.x;
    player.pos.z = pending.zoneCenter.z;
    state.simTime = pending.dueAt;
    state.encounterDirector.pressure.combat = 140;
    state.encounterDirector.lastMeaningfulAt = state.simTime - 31;
    state.encounterDirector.window = [];
    director.update(1, state);

    const live = state.encounterDirector.live[pending.encounterId];
    assert.ok(live, `${row.id} fires through encounterDirector.update`);
    assert.equal(live.phase, 'offer', `${row.id} enters the shared ambush telegraph window`);
    assert.equal(live.ids.length, pending.ships.length);
    assert.ok(live.ids.length >= row.band[0] && live.ids.length <= row.band[1]);
    assert.ok(telegraphs.some((event) => event.encounterId === live.id));
    assert.ok(spawned.some((event) => event.encounterId === live.id && event.count === live.ids.length));

    const canonical = makeEnemySpawnSpec(row.archetype, 99, { x: 0, z: 0 });
    for (const id of live.ids) {
      const entity = state.entities.get(id);
      assert.ok(entity?.alive, `${row.id} actor ${id} is physical and live`);
      assert.equal(entity.data?.lootTableId, row.archetype);
      assert.equal(entity.data?.ai?.encounterId, live.id);
      assert.equal(entity.data?.ai?.spawnContext, 'encounter');
      assert.equal(entity.mass, canonical.mass);
      assert.equal(entity.hullMax, canonical.hullMax);
      assert.equal(entity.maxSpeed, canonical.maxSpeed);
    }
  }
});
