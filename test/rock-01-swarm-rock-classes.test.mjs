// ROCK-01 — Swarm debris rocks sit on the Line ladder:
//   pebble  = class-I ammunition (every spawnable substance <= 20 t),
//   boulder = class-II ammunition (over class I, under class II),
//   monolith = cover (over class III, its collider-density mass unchanged).
//
// The mass asserted is the one the weight rule reads — `bodyMassT` prefers
// `physicsBody.mass`, which physics derives through `ensurePhysicsBodySpec`.
// PLOUGH-02 found the spawner's spec `mass` field never reached that number
// (asteroid/wreck bodies derive it from collider volume), so 0 of 24 rock bodies
// armed a class-I throw. These tests run the real `_spawnDebrisRock` and the real
// `run:beginRequested`/`run:wavePlanned` path — not fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { ensurePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { mulberry32 } from '../src/core/rng.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { swarmArena, SWARM_DEBRIS_TAG, swarmDebrisLiveMassT } from '../src/systems/swarmArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { ROCK_SUBSTANCES, ROCK_SIZE_CLASSES } from '../src/data/rockSubstances.js';
import { LINE_CLASSES, bodyMassT, entityOverLineClass, isOverLineClass } from '../src/data/lineProgression.js';

const CLASS_I_T = LINE_CLASSES[0].fullControlMassT;    // 20
const CLASS_II_T = LINE_CLASSES[1].fullControlMassT;   // 100
const CLASS_III_T = LINE_CLASSES[2].fullControlMassT;  // 400

function liveMassT(entity) {
  ensurePhysicsBodySpec(entity);
  return bodyMassT(entity);
}

function harness(seed = 4242) {
  const state = createGameState(seed);
  const bus = createBus();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', radius: 16 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.player.tether = { active: false, targetId: null };
  const ctx = { state, bus, helpers };
  const arena = Object.create(swarmArena);
  runSession.init(ctx);
  survivalRun.init(ctx);
  arena.init(ctx);
  return { state, bus, arena, spawned };
}

// pickDebrisSubstance consumes one rng roll: table[floor(rng() * len)]. One constant
// roll selects a substance index deterministically (the same roll then seeds angVel,
// which is irrelevant to mass).
const ROLL = { first: () => 0, last: () => 0.999999 };

function spawnRock(arena, { size, material, roll = ROLL.first }) {
  const id = arena._spawnDebrisRock(1000, 1000, size, roll, 0, { material });
  return arena.state.entities.get(id);
}

// Every (material, substance) pair the spawner can actually mint, with the roll
// that picks it: rock -> [silicate, slag], metal -> [metallic_ore, reef_metal],
// volatile -> [cooked_rock], cryo -> [ice], debris -> wreck ballast (no substance).
const SPAWN_CASES = [
  { material: 'rock', substance: 'silicate', roll: ROLL.first },
  { material: 'rock', substance: 'slag', roll: ROLL.last },
  { material: 'metal', substance: 'metallic_ore', roll: ROLL.first },
  { material: 'metal', substance: 'reef_metal', roll: ROLL.last },
  { material: 'volatile', substance: 'cooked_rock', roll: ROLL.first },
  { material: 'cryo', substance: 'ice', roll: ROLL.first },
  { material: 'debris', substance: null, roll: ROLL.first },
];

test('every Swarm pebble substance is class-I ammunition (<= 20 t live, arms the throw)', () => {
  const { arena, state } = harness();
  state.lineProgression = { classIndex: 1 };
  const radius = ROCK_SIZE_CLASSES.pebble.radius; // 9 — the class the opening pocket plants
  const masses = new Map();
  for (const c of SPAWN_CASES) {
    const rock = spawnRock(arena, { size: radius, material: c.material, roll: c.roll });
    assert.ok(rock, `${c.material} spawn returned a body`);
    assert.equal(rock.data.substance ?? null, c.substance, `${c.material} rolled the wrong substance`);
    const live = liveMassT(rock);
    masses.set(c.substance ?? 'wreck', live);
    assert.ok(live <= CLASS_I_T,
      `${c.substance ?? 'wreck'} pebble reads ${live} t — over the class-I ceiling ${CLASS_I_T}`);
    assert.ok(live >= 10, `${c.substance ?? 'wreck'} pebble reads ${live} t — below the Wasp band`);
    assert.equal(entityOverLineClass(state, rock), false,
      `${c.substance ?? 'wreck'} pebble says TOO HEAVY at class I`);
    // The two-numbers bug is dead: the field the rule reads is the field the spawner wrote.
    assert.equal(rock.mass, rock.physicsBody.mass,
      'spec mass and physics mass disagree again');
  }
  // In-band order: wreck ballast lightest, silicate under metal.
  assert.ok(masses.get('wreck') < masses.get('silicate'), 'wreck ballast must be the lightest');
  assert.ok(masses.get('metallic_ore') > masses.get('silicate'), 'metal must out-weigh silicate');
  assert.ok(masses.get('reef_metal') > masses.get('silicate'), 'reef metal must out-weigh silicate');
});

test('every Swarm boulder is over class I and under class II', () => {
  const { arena, state } = harness();
  state.lineProgression = { classIndex: 1 };
  const radius = ROCK_SIZE_CLASSES.boulder.radius; // 18
  for (const c of SPAWN_CASES) {
    const rock = spawnRock(arena, { size: radius, material: c.material, roll: c.roll });
    const live = liveMassT(rock);
    assert.ok(live > CLASS_I_T,
      `${c.substance ?? 'wreck'} boulder reads ${live} t — should say TOO HEAVY at class I`);
    assert.ok(live <= CLASS_II_T,
      `${c.substance ?? 'wreck'} boulder reads ${live} t — over the class-II ceiling ${CLASS_II_T}`);
    assert.equal(entityOverLineClass(state, rock), true, 'boulder must be over class I');
    assert.equal(isOverLineClass(live, 2), false, 'boulder must be throwable at class II');
    assert.equal(rock.mass, rock.physicsBody.mass);
  }
});

test('every Swarm monolith stays over class III — cover, not ammunition', () => {
  const { arena, state } = harness();
  state.lineProgression = { classIndex: 3 };
  const radius = ROCK_SIZE_CLASSES.monolith.radius; // 30
  for (const c of SPAWN_CASES) {
    const rock = spawnRock(arena, { size: radius, material: c.material, roll: c.roll });
    const live = liveMassT(rock);
    assert.ok(live > CLASS_III_T,
      `${c.substance ?? 'wreck'} monolith reads ${live} t — cover must stay over class III`);
    assert.equal(entityOverLineClass(state, rock), true);
  }
});

test('the band floor/ceiling holds for the whole substance table, not only spawned ones', () => {
  for (const [substanceId, sub] of Object.entries(ROCK_SUBSTANCES)) {
    const pebble = swarmDebrisLiveMassT(ROCK_SIZE_CLASSES.pebble.radius, sub.densityMult);
    const boulder = swarmDebrisLiveMassT(ROCK_SIZE_CLASSES.boulder.radius, sub.densityMult);
    assert.ok(pebble >= 12 && pebble <= 18, `${substanceId} pebble ${pebble} t left the 12–18 band`);
    assert.ok(boulder >= 60 && boulder <= 95, `${substanceId} boulder ${boulder} t left the 60–95 band`);
  }
  assert.equal(swarmDebrisLiveMassT(ROCK_SIZE_CLASSES.monolith.radius, 1), null,
    'monolith keeps the derived density law — no authored mass');
});

test('the real wave-1 field arms its pebbles and keeps its cover heavy', () => {
  const SEED = 4242, ARENA = 'helios_core';
  const { state, bus, spawned } = harness(SEED);
  state.lineProgression = { classIndex: 1 };
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA });
  // teachOpening is the flag survivalRun passes on a first-run wave 1 — the planner then
  // attaches plan.openingLesson and the arena plants its taught rock and well.
  bus.emit('run:wavePlanned', { wave: 1, plan: planWave({ seed: SEED, arenaId: ARENA, wave: 1, ruleset: SWARM_RULESET, teachOpening: true }) });

  const debris = state.entityList.filter((e) => e.alive !== false && e.data?.[SWARM_DEBRIS_TAG] === true);
  assert.ok(debris.length >= 8, `the wave-1 room should field its cover (${debris.length})`);
  let pebbles = 0;
  for (const rock of debris) {
    const live = liveMassT(rock);
    if (rock.radius < 14) {
      pebbles++;
      assert.ok(live <= CLASS_I_T,
        `rock ${rock.id} (r=${rock.radius}, ${rock.data.substance ?? 'wreck'}) reads ${live} t — a pebble over class I`);
      assert.equal(entityOverLineClass(state, rock), false, `pebble ${rock.id} says TOO HEAVY`);
    } else if (rock.radius < 24) {
      assert.ok(live > CLASS_I_T && live <= CLASS_II_T,
        `rock ${rock.id} (r=${rock.radius}) reads ${live} t — a boulder outside class II`);
    } else {
      assert.ok(live > CLASS_III_T,
        `rock ${rock.id} (r=${rock.radius}) reads ${live} t — cover under class III`);
    }
  }
  // §33 row 485: the authored opening pocket guarantees throwables near the pilot.
  assert.ok(pebbles >= 3, `wave 1 must keep at least three class-I rocks in reach (${pebbles})`);
  // The taught rock is ammunition too — the lesson cannot point at a TOO HEAVY wall.
  const lessonRock = debris.find((e) => e.data?.openingLesson === true);
  assert.ok(lessonRock, 'the opening-lesson rock exists');
  assert.ok(liveMassT(lessonRock) <= CLASS_I_T, 'the lesson rock must arm a class-I throw');
  assert.equal(entityOverLineClass(state, lessonRock), false);
});

test('a worn-through monolith leaves band-classed remnants, not TOO HEAVY chunks', () => {
  const { arena, state } = harness();
  state.lineProgression = { classIndex: 1 };
  const parent = spawnRock(arena, { size: ROCK_SIZE_CLASSES.monolith.radius, material: 'metal' });
  const parentMass = liveMassT(parent);
  const before = state.entityList.length;
  assert.notEqual(arena._fractureDebris(parent), false, 'the fracture was refused');
  const remnants = state.entityList.slice(before)
    .filter((e) => e.data?.[SWARM_DEBRIS_TAG] === true && e.data?.isChunk === true);
  assert.ok(remnants.length >= 1, 'the monolith left remnants');
  for (const remnant of remnants) {
    const live = liveMassT(remnant);
    assert.ok(live <= CLASS_II_T,
      `remnant r=${remnant.radius.toFixed(1)} reads ${live} t — chunks must stay liftable`);
    assert.ok(live < parentMass, 'a remnant must be lighter than its parent');
    // The remnant's spec mass keeps its authored r²·5 intent (pinned by the birth-clearance
    // fixture); the weight rule reads physicsBody.mass, which must be the banded live mass.
    assert.equal(remnant.physicsBody.mass, live,
      'the remnant live mass must be authored in physicsBody.mass');
  }
});
