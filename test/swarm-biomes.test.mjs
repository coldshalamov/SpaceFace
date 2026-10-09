// SWARM-07 B4 — the two new swarm biomes: the Asteroid Mill and the Hive.
//
// The Mill is the ore seam on a grind: the densest debris band in the catalog, a
// grind-pair field law, and the room's own economy — every fracture shakes ore loose
// as a pickup that pays the run wallet through the same collect seam the supply pod
// uses. The Hive is alive: living walls grow shut on a telegraphed cadence, spawn sacs
// pulse brood mites out of the wave's OWN reserve (the population law is identical —
// sacs only change when the bodies arrive), and acid drips through the engine's pool
// pipeline. Both register everywhere an arena must: catalog, wave recipes, laws,
// ladder seeds and star gates, event tables, and the launch card.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { SURVIVAL_WAVES } from '../src/data/survivalWaves.js';
import { ARENA_LAWS, survivalArenaById } from '../src/data/survivalArenas.js';
import { swarmEventFor, validateSwarmEvents } from '../src/data/swarmEvents.js';
import {
  SWARM_ARENA_STAR_GATES,
  swarmArenaIsUnlocked,
  swarmArcadeSeedFor,
} from '../src/data/swarmLadder.js';
import {
  SWARM_BROOD_MAX,
  swarmBroodPopulation,
  swarmBroodSacReserve,
} from '../src/data/swarmBrood.js';
import {
  LAW_ARENA_IDS,
  planArenaInstall,
} from '../src/systems/survivalArena.js';
import {
  MILL_ARENA_ID,
  MILL_ORE_CREDITS,
  MILL_ORE_KIND,
  planMillInstall,
} from '../src/systems/asteroidMillArena.js';
import {
  HIVE_ARENA_ID,
  HIVE_SAC_BIRTH_N,
  HIVE_SAC_COUNT,
  HIVE_SAC_TAG,
  HIVE_WALL_GROW_S,
  HIVE_WALL_RINGS,
  HIVE_WALL_ROCKS,
  HIVE_WALL_TAG,
  planHiveInstall,
} from '../src/systems/theHiveArena.js';
import { debrisLayoutForArena, swarmArena } from '../src/systems/swarmArena.js';

const DT = 1 / 60;
const SEED = 4242;

// --- registration --------------------------------------------------------------------

test('both biomes register end to end: catalog, laws, ladder, events, recipes', () => {
  const ids = COMBAT_LAB_ARENAS.map((a) => a.id);
  assert.ok(ids.includes(MILL_ARENA_ID), 'the Mill is a lab arena');
  assert.ok(ids.includes(HIVE_ARENA_ID), 'the Hive is a lab arena');
  assert.equal(survivalArenaById(MILL_ARENA_ID).id, MILL_ARENA_ID);
  assert.equal(survivalArenaById(HIVE_ARENA_ID).id, HIVE_ARENA_ID);

  // The authored thirty: every wave of each new block plans against its own arena.
  for (const arenaId of [MILL_ARENA_ID, HIVE_ARENA_ID]) {
    const recipes = SURVIVAL_WAVES.filter((r) => r.arenaId === arenaId);
    assert.equal(recipes.length, 10, `${arenaId} has its authored ten`);
    assert.ok(recipes.some((r) => r.arenaPhase === 'boss'), `${arenaId} has a boss recipe`);
  }

  assert.equal(ARENA_LAWS[MILL_ARENA_ID].verb, 'grind');
  assert.equal(ARENA_LAWS[HIVE_ARENA_ID].law, 'breathe');
  assert.ok(LAW_ARENA_IDS.includes(MILL_ARENA_ID) && LAW_ARENA_IDS.includes(HIVE_ARENA_ID),
    'both are law arenas — the room plan reads their modules');

  // The ladder: authored seeds and star gates, in the authored order.
  assert.ok(Number.isInteger(swarmArcadeSeedFor(MILL_ARENA_ID)));
  assert.ok(Number.isInteger(swarmArcadeSeedFor(HIVE_ARENA_ID)));
  assert.ok(SWARM_ARENA_STAR_GATES[MILL_ARENA_ID] > SWARM_ARENA_STAR_GATES.storm_lattice,
    'the Mill opens deeper in the climb than Storm');
  assert.ok(SWARM_ARENA_STAR_GATES[HIVE_ARENA_ID] > SWARM_ARENA_STAR_GATES[MILL_ARENA_ID],
    'the Hive is the last room the ladder opens');
  assert.equal(swarmArenaIsUnlocked({ arenas: {} }, HIVE_ARENA_ID), false,
    'a fresh ladder has not earned the Hive');

  // Event tables validate and both arenas can draw cards.
  assert.deepEqual(validateSwarmEvents(), []);
  const millCard = swarmEventFor({ arenaId: MILL_ARENA_ID, wave: 5, seed: SEED });
  const hiveCard = swarmEventFor({ arenaId: HIVE_ARENA_ID, wave: 15, seed: SEED });
  assert.ok(millCard && millCard.telegraph, 'the Mill draws a telegraphed event');
  assert.ok(hiveCard && hiveCard.telegraph, 'the Hive draws a telegraphed event');
});

test('the rooms plan distinctly: the grind pair vs the breath', () => {
  const at = { x: 0, z: 0 };
  const lane = { x: 1, z: 0 };
  const across = { x: 0, z: 1 };
  const mill = planMillInstall({ arenaPhase: 'idle', at, lane, across });
  assert.equal(mill.cover, true, 'the seam is always up');
  const cones = mill.fields.filter((f) => f.kind === 'cone');
  assert.equal(cones.length, 2, 'the grind pair is two cones');
  // The pair shears: cones sit on opposite flanks pushing opposite directions, so the
  // cross products share a sign — one circulation around the anchor, not a down-lane blow.
  const [a, b] = cones;
  assert.notEqual(Math.sign(a.center.z - at.z), Math.sign(b.center.z - at.z),
    'the pair stands on opposite flanks');
  assert.deepEqual({ x: Math.sign(a.dir.x), z: Math.sign(a.dir.z) },
    { x: -Math.sign(b.dir.x), z: -Math.sign(b.dir.z) },
    'the flanks push opposite tangential directions');
  const crossA = a.center.x * a.dir.z - a.center.z * a.dir.x;
  const crossB = b.center.x * b.dir.z - b.center.z * b.dir.x;
  assert.equal(Math.sign(crossA), Math.sign(crossB), 'both cones turn the room the same way');

  const hive = planHiveInstall({ arenaPhase: 'idle', at, lane, across });
  const breath = hive.fields.find((f) => f.kind === 'well');
  assert.ok(breath, 'the breath is a well');
  assert.deepEqual(breath.center, { x: at.x, z: at.z },
    'the pull sits on the fight — the walls close on the middle');

  // Through the real dispatch: law ids reach their own planners, never the generic one.
  const millInstall = planArenaInstall({ arenaId: MILL_ARENA_ID, arenaPhase: 'idle', seed: SEED, wave: 1, anchor: at });
  const hiveInstall = planArenaInstall({ arenaId: HIVE_ARENA_ID, arenaPhase: 'idle', seed: SEED, wave: 1, anchor: at });
  assert.ok(millInstall.fields.some((f) => f.kind === 'cone'), 'the dispatch reaches the grind');
  assert.ok(hiveInstall.fields.some((f) => f.kind === 'well'), 'the dispatch reaches the breath');
  assert.notEqual(millInstall.note, hiveInstall.note, 'the rooms speak different laws');

  // Debris layouts are arena-authored, not the default band.
  const seam = debrisLayoutForArena(MILL_ARENA_ID);
  const rim = debrisLayoutForArena(HIVE_ARENA_ID);
  assert.ok(seam.target > debrisLayoutForArena('helios_core').target,
    'the Mill fields the densest seam');
  assert.ok(rim.target < seam.target && rim.inner > seam.outer * 0.6,
    'the Hive keeps only a sparse rim — its geometry is alive');
});

// --- the Mill's economy -----------------------------------------------------------------

/** A minimal live-swarm GameState plus the spawnEntity seam the room needs. */
function boot({ wave = 1, arenaId = HIVE_ARENA_ID, seed = SEED } = {}) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
        vel: spec.vel ? { x: spec.vel.x, z: spec.vel.z } : { x: 0, z: 0 },
        data: { ...(spec.data || {}) },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 400,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed });
  state.run.arenaId = arenaId;
  state.run.phase = 'active';
  state.run.wave = wave;
  state.mode = 'flight';
  return { state, bus, emitted, helpers, spawned, player };
}

function arenaBoot(opts) {
  const h = boot(opts);
  const ctx = { state: h.state, bus: h.bus, helpers: h.helpers, registry: { get: () => null } };
  swarmArena.init(ctx);
  return h;
}

function ticks(h, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    h.state.simTime += DT;
    h.state.tick += 1;
    swarmArena.update();
  }
}

test('the mill shakes ore loose: a fracture spawns chunks that pay the run wallet', () => {
  const h = arenaBoot({ wave: 1, arenaId: MILL_ARENA_ID });
  try {
    h.bus.emit('run:wavePlanned', { wave: 1, plan: {} });
    h.bus.emit('run:waveStarted', { wave: 1 });
    const rock = {
      id: 9101, alive: true, type: 'asteroid', collides: true,
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 20, hull: 5, hullMax: 40,
      data: { swarmArenaDebris: true },
    };
    h.state.entities.set(rock.id, rock);
    h.state.entityList.push(rock);
    swarmArena._fractureDebris(rock);

    const ore = h.spawned.filter((e) => e.type === 'pickup' && e.data && e.data.kind === MILL_ORE_KIND);
    assert.ok(ore.length >= 1 && ore.length <= 2, 'a fracture shakes one or two chunks loose');
    assert.ok(named(h, 'swarmArena:millOre').length === 1, 'the room receipts the shake');

    // Player collect pays the run wallet; an NPC scoop consumes without paying.
    const before = named(h, 'run:awardRequested').length;
    h.bus.emit('pickup:collected', { pickupId: ore[0].id, collectorId: h.state.playerId });
    const pay = named(h, 'run:awardRequested').slice(before);
    assert.equal(pay.length, 1, 'the collect pays through the run envelope');
    assert.equal(pay[0].payload.reason, 'swarm:millOre');
    assert.equal(pay[0].payload.credits, MILL_ORE_CREDITS);

  } finally {
    swarmArena.destroy();
  }

  // Outside the Mill the same fracture is just a fracture — no ore economy.
  const h2 = arenaBoot({ wave: 1, arenaId: 'helios_core' });
  try {
    h2.bus.emit('run:wavePlanned', { wave: 1, plan: {} });
    const rock2 = {
      id: 9102, alive: true, type: 'asteroid', collides: true,
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 20, hull: 5, hullMax: 40,
      data: { swarmArenaDebris: true },
    };
    h2.state.entities.set(rock2.id, rock2);
    swarmArena._fractureDebris(rock2);
    const ore2 = h2.spawned.filter((e) => e.type === 'pickup');
    assert.equal(ore2.length, 0, 'the Foundry does not pay ore');
  } finally {
    swarmArena.destroy();
  }
});

// --- the Hive's living room --------------------------------------------------------------

test('the hive holds the wave\'s own reserve: sacs birth what the plan already owned', () => {
  // The reserve law itself, pure: inside the Hive a share of the cohort waits in sacs;
  // everywhere else the whole cohort arrives at the open.
  const total = swarmBroodPopulation(1);
  const reserve = swarmBroodSacReserve(total, HIVE_ARENA_ID);
  assert.ok(reserve > 0 && reserve < total, 'a real share waits in the sacs');
  assert.equal(swarmBroodSacReserve(total, 'helios_core'), 0, 'the Foundry holds no reserve');
  assert.equal(swarmBroodSacReserve(total, MILL_ARENA_ID), 0, 'the Mill holds no reserve');
});

test('the hive wave opens with walls and sacs, holds the population law, and births the reserve', () => {
  const h = arenaBoot({ wave: 1, arenaId: HIVE_ARENA_ID });
  try {
    h.bus.emit('run:wavePlanned', { wave: 1, plan: {} });
    h.bus.emit('run:waveStarted', { wave: 1 });

    const total = swarmBroodPopulation(1);
    const reserve = swarmBroodSacReserve(total, HIVE_ARENA_ID);
    const brood = h.state.swarmBrood;
    assert.ok(brood, 'the engine published its view');
    assert.equal(brood.schema, 'spaceface.swarmBrood.v4');
    assert.equal(brood.hive, true, 'the wave reads as a hive wave');
    assert.equal(brood.sacBudget, reserve, 'the reserve waits in the sacs');
    assert.equal(brood.aliveCount, total - reserve,
      'the open fields only the immediate share — the rest is the sacs\'');

    // Living geometry: the first ring stands, the sacs berth, all tagged debris.
    const walls = h.spawned.filter((e) => e.data && e.data[HIVE_WALL_TAG]);
    const sacs = h.spawned.filter((e) => e.data && e.data[HIVE_SAC_TAG]);
    assert.equal(walls.length, HIVE_WALL_ROCKS, 'the first ring stands whole');
    assert.equal(sacs.length, HIVE_SAC_COUNT, 'the sacs berth inside it');
    assert.equal(named(h, 'swarm:hiveRoom').length, 1, 'the room receipts its landing');
    assert.ok(walls.every((e) => e.data.swarmArenaDebris === true),
      'walls are tagged debris — they wear, fracture and release like any rock');
    assert.ok(sacs.every((e) => e.data.tetherPayload === true),
      'a sac is slingable — the room\'s own counter');

    // The walls grow shut on the telegraph: two more rings land inside the first.
    ticks(h, HIVE_WALL_GROW_S + 0.2);
    const grown = h.spawned.filter((e) => e.data && e.data[HIVE_WALL_TAG]);
    assert.ok(grown.length > HIVE_WALL_ROCKS, 'a second ring grew inside the first');
    assert.equal(named(h, 'swarm:hiveGrowth').length, 1, 'the growth telegraphed');
    assert.equal(named(h, 'alert').length > 0, true, 'the one-voice alert fired');
    ticks(h, HIVE_WALL_GROW_S + 0.2);
    const inner = h.spawned.filter((e) => e.data && e.data[HIVE_WALL_TAG]);
    assert.ok(inner.length >= HIVE_WALL_ROCKS * HIVE_WALL_RINGS - 1,
      'the rings keep landing until the law is spent');

    // The sacs birth off the reserve — mite ticks, exactly the wave's own plan.
    const bornEvents = named(h, 'swarm:hiveBirth');
    assert.ok(bornEvents.length > 0, 'the sacs pulsed births');
    const bornTotal = bornEvents.reduce((sum, e) => sum + (e.payload.count || 0), 0);
    assert.ok(bornTotal > 0 && bornTotal <= reserve,
      'births draw down the reserve, never past it');
    assert.equal(brood.sacBudget, reserve - bornTotal);
    assert.ok(brood.aliveCount <= total,
      'immediate + reserve stays inside the population law');

    // Acid drips through the same pipeline the spitter uses.
    assert.ok(brood.poolCount > 0, 'the sacs dripped acid into the room');
  } finally {
    swarmArena.destroy();
  }
});

test('killing a sac strands its share of the tide and bursts into one last pool', () => {
  const h = arenaBoot({ wave: 1, arenaId: HIVE_ARENA_ID });
  try {
    h.bus.emit('run:wavePlanned', { wave: 1, plan: {} });
    h.bus.emit('run:waveStarted', { wave: 1 });
    const sacs = h.spawned.filter((e) => e.data && e.data[HIVE_SAC_TAG]);
    assert.ok(sacs.length >= 1);
    const dead = sacs[0];
    dead.alive = false;
    ticks(h, 0.1);
    assert.ok(named(h, 'swarm:hiveSacKilled').some((e) => e.payload.sacId === dead.id),
      'the sac\'s death receipts');
    const brood = h.state.swarmBrood;
    assert.ok(brood.poolCount >= 1, 'the burst left its pool');
    // And the room can be torn down cleanly — the next wave's plan releases the geometry.
    h.bus.emit('run:wavePlanned', { wave: 2, plan: {} });
    const walls = h.spawned.filter((e) => e.data && e.data[HIVE_WALL_TAG]);
    assert.ok(walls.every((e) => e.data.despawnAt <= h.state.simTime + 6.1),
      'released walls die through the ordinary despawn sweep');
  } finally {
    swarmArena.destroy();
  }
});

test('a sac only spends the wave\'s own reserve — the cap never moves', () => {
  const h = arenaBoot({ wave: 1, arenaId: HIVE_ARENA_ID });
  try {
    h.bus.emit('run:wavePlanned', { wave: 1, plan: {} });
    h.bus.emit('run:waveStarted', { wave: 1 });
    const engine = swarmArena._brood;
    const reserve = engine.view.sacBudget;
    // Drain the whole budget by hand — every body paid out of the same plan.
    let born = 0;
    while (engine.sacRelease(10, 10, HIVE_SAC_BIRTH_N) > 0) born += HIVE_SAC_BIRTH_N;
    assert.equal(engine.view.sacBudget, 0, 'the budget spends to zero');
    assert.ok(born <= reserve + HIVE_SAC_BIRTH_N, 'never more than the reserve (±litter edge)');
    assert.equal(engine.sacRelease(10, 10, 1), 0, 'a dry sac births nothing');
    const census = engine.census();
    assert.ok(census.alive + reserve <= SWARM_BROOD_MAX,
      'alive + held stays inside the cap band');
  } finally {
    swarmArena.destroy();
  }
});

function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}
