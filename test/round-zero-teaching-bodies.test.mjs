// Phase 5.3 — ROUND ZERO (build_map §25 / ZERO_TO_HERO Phase 5.3).
//
// The first-ever Crucible run opens wave 1 with three teaching bodies and nothing else: a rock
// worth throwing, one light hull worth shoving, and a well field worth dropping — then the pack
// arrives on its authored schedule shifted by 45 sim-seconds. No modal, no paragraph.
//
// First-run detection is the Crucible meta profile (`sf.save.crucible_meta`): a launch whose
// profile carries no settled history gets `openingLesson` on `run:beginRequested`, and only that
// flag makes the planner author the lesson. Every later run gets the untouched wave 1.
//
// These tests drive the REAL door (requestCrucibleRun -> game:started -> applySandboxSetup ->
// run:beginRequested), the REAL phase machine, the REAL wave owner through the REAL spawn budget,
// and the REAL arena/fields systems — the same seams the game runs.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { fields } from '../src/systems/fields.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { OPENING_LESSON_HOLD_TICKS } from '../src/systems/survivalWavePlanner.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { SWARM_RULESET, SWARM_SPAWN_DISTANCE, swarmConcurrent } from '../src/data/swarmMode.js';
import {
  emptyCrucibleProfile,
  resetCrucibleMetaForTests,
  saveCrucibleMeta,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import { crucibleSetupFor, requestCrucibleRun } from '../src/ui/crucibleLaunch.js';
import { installSandboxGameStartedHook } from '../src/ui/sandbox/sandboxSetup.js';

const DT = 1 / 60;
const SEED = 4242;
// Teaching reach sits strictly INSIDE the wave's authored gate ring (SWARM_SPAWN_DISTANCE,
// 165 wu, minus its 18% radius jitter -> >= ~135): the lesson bodies land at handshake
// distance while every ordinary arrival holds the ring.
const TEACHING_REACH = 120;
const GATE_RING_FLOOR = SWARM_SPAWN_DISTANCE * 0.82 - 1;
const LESSON_WELL_ID = 'swarm-opening-lesson-well';

function boot() {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  // swarmArena asks the registry for the fields system when it plants the lesson well;
  // everything else the door touches (ships/world/economy) is absent on purpose, which turns
  // those guarded setup steps into no-ops while the run events still fire for real.
  const registry = { get: (name) => (name === 'fields' ? fields : null) };
  const ctx = { state, bus, helpers, registry };
  fields.init(ctx);
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  return { state, bus, emitted, helpers, budget, spawned, ctx, player, fieldsSys: fields };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.simTime += DT;
    h.state.tick += 1;
    survivalWave.update(DT);
    survivalRun.update(DT);
  }
}

/** Hostiles = the run cohort mark, not "everything that is not the player". */
function liveHostiles(h) {
  const out = [];
  for (const entity of h.state.entities.values()) {
    if (entity.id === h.player.id || entity.alive === false) continue;
    if (!(entity.data && entity.data.runCohort === SURVIVAL_COHORT_TAG)) continue;
    out.push(entity);
  }
  return out;
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function distanceFromPlayer(h, pos) {
  return Math.hypot(pos.x - h.player.pos.x, pos.z - h.player.pos.z);
}

// The sandbox game:started hook is a module singleton: the first bus it binds to keeps the
// subscription, so every launch arm reuses that bus while `launchCtx` repoints the ctx.
let launchBus = null;
let launchCtx = null;
function armLaunch(h) {
  launchCtx = h.ctx;
  if (launchBus) return;
  launchBus = h.bus;
  installSandboxGameStartedHook(h.bus, () => launchCtx);
}

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(key),
  };
}

/** Drive the real door: launch config -> game:new -> game:started -> run:beginRequested. */
function launchCrucible(h, starterId = 'kinetic_baseline') {
  const setup = crucibleSetupFor({ starterId, seed: SEED });
  assert.equal(setup.ok, true, 'the Crucible starter validates');
  requestCrucibleRun(h.bus, setup.value);
  launchBus.emit('game:started');
}

function reachWaveOneActive(h) {
  tick(h, 1);                            // loadout -> arena_intro
  tick(h, SURVIVAL_ARENA_INTRO_TICKS);   // arena_intro -> wave_intro (plans wave 1)
  tick(h, SURVIVAL_WAVE_INTRO_TICKS);    // wave_intro -> active (dispatches tick-0 batches)
}

// ---------------------------------------------------------------------------

test('a first Crucible run asks for the lesson and stages three teaching bodies', () => {
  resetCrucibleMetaForTests();
  const h = boot();
  armLaunch(h);
  useCrucibleMetaStorage(fakeStorage()); // no profile on disk: this player has never run it

  launchCrucible(h);

  const begins = named(h.emitted, 'run:beginRequested');
  assert.equal(begins.length, 1);
  assert.equal(begins[0].payload.kind, 'survival');
  assert.equal(begins[0].payload.ruleset, SWARM_RULESET);
  assert.equal(begins[0].payload.seed, SEED);
  assert.equal(begins[0].payload.openingLesson, true, 'empty meta history marks the first run');

  reachWaveOneActive(h);
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.state.run.wave, 1);

  // The plan itself carries the lesson: the pack's schedule is shifted, one light hull stays
  // early, and the rock + well ride on the plan for the arena to place.
  const plan = named(h.emitted, 'run:wavePlanned').at(-1).payload.plan;
  assert.ok(plan.openingLesson, 'wave 1 was planned with the teaching beat');
  assert.equal(plan.openingLesson.holdTicks, OPENING_LESSON_HOLD_TICKS);
  assert.equal(OPENING_LESSON_HOLD_TICKS, 45 * 60);

  // BODY ONE — the rock: a real asteroid, terrain-anchor marked so the massline's existing
  // anchor logic treats it like the rocks it already knows, and physically latchable.
  const rock = [...h.state.entities.values()].find(
    (entity) => entity.data && entity.data.openingLesson === true && entity.type === 'asteroid',
  );
  assert.ok(rock, 'the teaching rock is staged');
  assert.equal(rock.data.terrainAnchor, true);
  assert.equal(rock.data.typeId, 'ast_common_rock');
  assert.ok(distanceFromPlayer(h, rock.pos) < TEACHING_REACH, 'the rock is inside teaching reach');
  assert.ok(
    isAttachable(rock, h.state.playerId, h.state),
    'the massline can latch the teaching rock',
  );

  // BODY TWO — one light hull: the wave's own lightest hostile, donated from the pack count,
  // alone inside the arena rather than at the spawn ring.
  const hulls = liveHostiles(h);
  assert.equal(hulls.length, 1, 'one light hull is staged, not the pack');
  assert.equal(hulls[0].data.runWave, 1);
  assert.ok(
    distanceFromPlayer(h, hulls[0].pos) < TEACHING_REACH,
    'the sparring hull arrives at handshake distance, inside the gate ring',
  );

  // BODY THREE — the well: a planted environmental gravity field on the same kernel the
  // player's own Well deploy writes to (no bespoke force path, no emitter body needed).
  const well = h.fieldsSys._kernel.get(LESSON_WELL_ID);
  assert.ok(well, 'the teaching well is planted in the field kernel');
  assert.equal(well.kind, 'well');
  assert.equal(well.tag, 'environmental');
  assert.ok(
    Math.hypot(well.center.x - h.player.pos.x, well.center.z - h.player.pos.z) < TEACHING_REACH,
    'the well sits inside teaching reach',
  );

  // Nothing else hostile materializes for the authored 45 sim-seconds: the pack's schedule
  // entries all landed past the hold, and the reinforcement stream is held by the same mark.
  tick(h, OPENING_LESSON_HOLD_TICKS - 120);
  assert.equal(liveHostiles(h).length, 1, 'no pack body materialized during round zero');
  assert.equal(
    named(h.emitted, 'run:waveMaterialized').length,
    1,
    'only the lesson batch has dispatched',
  );

  // After the hold the same wave's burst lands on its shifted schedule — same bodies, no extra
  // budget spent.
  tick(h, 240);
  assert.ok(liveHostiles(h).length > 1, 'the pack arrives once the lesson window passes');
});

test('the same first run is byte-deterministic on the same seed', () => {
  resetCrucibleMetaForTests();
  const first = boot();
  armLaunch(first);
  useCrucibleMetaStorage(fakeStorage());
  launchCrucible(first);
  reachWaveOneActive(first);

  resetCrucibleMetaForTests();
  const second = boot();
  launchCtx = second.ctx; // same singleton hook, fresh ctx
  useCrucibleMetaStorage(fakeStorage());
  launchCrucible(second);
  reachWaveOneActive(second);

  const lessonEntities = (h) => [...h.state.entities.values()]
    .filter((e) => e.data && (e.data.openingLesson === true || e.data.runCohort === SURVIVAL_COHORT_TAG))
    .map((e) => `${e.type}|${e.data.typeId ?? ''}|${e.pos.x}|${e.pos.z}`)
    .sort();
  assert.deepEqual(lessonEntities(second), lessonEntities(first));

  const well = (h) => {
    const record = h.fieldsSys._kernel.get(LESSON_WELL_ID);
    return record && `${record.center.x}|${record.center.z}|${record.radius}`;
  };
  assert.equal(well(second), well(first));
});

test('a player with settled history gets the ordinary wave 1 — pack on time, no lesson props', () => {
  resetCrucibleMetaForTests();
  const h = boot();
  armLaunch(h);
  // A profile that has already settled a run: history non-empty means this is NOT the first run.
  const store = fakeStorage();
  saveCrucibleMeta({
    ...emptyCrucibleProfile(),
    history: [{ outcome: 'defeat', wave: 3, seed: SEED, kills: 12, score: 400 }],
    records: { byKey: {}, lifetime: { runs: 1, victories: 0, defeats: 1, aborted: 0, deepestWave: 3, bestScore: 400, bestKills: 12 } },
  }, store);
  useCrucibleMetaStorage(store);

  launchCrucible(h);

  const begin = named(h.emitted, 'run:beginRequested').at(-1).payload;
  assert.equal(begin.ruleset, SWARM_RULESET);
  assert.notEqual(begin.openingLesson, true, 'history on the profile means no teaching beat');

  reachWaveOneActive(h);
  assert.equal(h.state.run.phase, 'active');
  const plan = named(h.emitted, 'run:wavePlanned').at(-1).payload.plan;
  assert.equal(plan.openingLesson, undefined, 'an ordinary wave 1 carries no lesson block');
  assert.ok(
    plan.schedule.some((entry) => entry.atTick < 24),
    'the ordinary schedule opens inside the first half-second',
  );

  // No teaching bodies are staged.
  const lessonRocks = [...h.state.entities.values()].filter(
    (entity) => entity.data && entity.data.openingLesson === true,
  );
  assert.equal(lessonRocks.length, 0, 'no lesson rock');
  assert.equal(h.fieldsSys._kernel.has(LESSON_WELL_ID), false, 'no lesson well');

  // The pack materializes on its authored timing — full pressure immediately, out on the
  // wave's authored gate ring, never at handshake distance.
  tick(h, 30);
  assert.equal(liveHostiles(h).length, swarmConcurrent(1), 'the room opened at full strength');
  for (const hostile of liveHostiles(h)) {
    assert.ok(
      distanceFromPlayer(h, hostile.pos) >= GATE_RING_FLOOR,
      'ordinary arrivals hold the wave gate ring',
    );
  }
});

test('missing, empty, or malformed profile history all read as a first run', () => {
  resetCrucibleMetaForTests();
  const h = boot();
  armLaunch(h);

  // Missing key entirely.
  useCrucibleMetaStorage(fakeStorage());
  launchCrucible(h);
  assert.equal(named(h.emitted, 'run:beginRequested').at(-1).payload.openingLesson, true);

  // Malformed payload: the parser falls back to an empty profile rather than trusting it.
  const bad = fakeStorage();
  bad.setItem('sf.save.crucible_meta', '{"unterminated');
  useCrucibleMetaStorage(bad);
  const h2 = boot();
  launchCtx = h2.ctx;
  launchCrucible(h2);
  assert.equal(named(h2.emitted, 'run:beginRequested').at(-1).payload.openingLesson, true);

  resetCrucibleMetaForTests();
});
