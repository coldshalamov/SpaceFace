// swarm-overhaul — CALM START. Owner playtest 2026-10-11 (Ricochet Foundry): about four seconds
// after spawning, having done nothing, the round paid a 100-kill chain. Causes found on the
// rendered route: the brood cohort spawned at wave start through the opening-lesson hold, some
// bodies were born inside rocks, self-steered bodies died on still rocks, and the wave's sag well
// dragged the arena furniture before any input. This suite drives the same door idle.
//
// (boot harness copied from round-zero-teaching-bodies.test.mjs)
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
import { survivalArena } from '../src/systems/survivalArena.js';
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
  survivalArena.init(ctx);
  return { state, bus, emitted, helpers, budget, spawned, ctx, player, fieldsSys: fields };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.simTime += DT;
    h.state.tick += 1;
    survivalWave.update(DT);
    survivalRun.update(DT);
    swarmArena.update(DT);
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

test('swarm-overhaul: an idle first round stays calm — no brood, no kills, no drifting room', () => {
  resetCrucibleMetaForTests();
  const h = boot();
  armLaunch(h);
  useCrucibleMetaStorage(fakeStorage());
  launchCrucible(h);
  reachWaveOneActive(h);
  assert.equal(h.state.run.phase, 'active');
  const plan = named(h.emitted, 'run:wavePlanned').at(-1).payload.plan;
  assert.ok(plan.openingLesson);

  tick(h, 10 * 60); // ten idle seconds into the lesson
  assert.equal(named(h.emitted, 'swarm:broodKills').length, 0, 'no brood died while the pilot idled');
  assert.equal(named(h.emitted, 'entity:killed').length, 0, 'nothing died while the pilot idled');
  assert.equal(named(h.emitted, 'run:waveCleared').length, 0, 'the round did not resolve itself');
  assert.equal(swarmArena._brood ? swarmArena._brood.census().alive : 0, 0, 'the brood waits with the pack');
  const arenaFields = fields._kernel && typeof fields._kernel.list === 'function'
    ? fields._kernel.list().filter((f) => String(f.id).startsWith('survival_arena_field'))
    : [];
  assert.equal(arenaFields.length, 0, 'the room law waits with the pack');
  survivalArena.reset?.();
});

test('swarm-overhaul: the lesson well is planted where it pulls no furniture at rest', () => {
  resetCrucibleMetaForTests();
  const h = boot();
  armLaunch(h);
  useCrucibleMetaStorage(fakeStorage());
  launchCrucible(h);
  reachWaveOneActive(h);
  const well = fields._kernel.list().find((f) => f.id === LESSON_WELL_ID);
  assert.ok(well, 'the lesson well exists');
  for (const e of h.state.entities.values()) {
    if (!e || e.alive === false || e.type !== 'asteroid' || e.collides === false) continue;
    if (e.data && e.data.openingLesson) continue;
    const reach = well.radius + (Number.isFinite(e.radius) ? e.radius : 0);
    assert.ok(Math.hypot(e.pos.x - well.center.x, e.pos.z - well.center.z) >= reach,
      `furniture ${e.id} sits outside the lesson well`);
  }
});
