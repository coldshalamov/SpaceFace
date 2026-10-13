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
import { swarmArena } from '../src/systems/swarmArena.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import {
  resetCrucibleMetaForTests,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import { CRUCIBLE_ARENA_ID, crucibleSetupFor, requestCrucibleRun } from '../src/ui/crucibleLaunch.js';
import { installSandboxGameStartedHook } from '../src/ui/sandbox/sandboxSetup.js';
import { HIVE_ARENA_ID } from '../src/systems/theHiveArena.js';
import { SHIPS } from '../src/data/ships.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { swarmRosterFor } from '../src/data/swarmMode.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { swarmPilotHasActed } from '../src/systems/swarmSafety.js';

const DT = 1 / 60;
const SEED = 4242;
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
  // everything else the door touches (world/economy) is absent on purpose, which turns
  // those guarded setup steps into no-ops while the run events still fire for real.
  // The ships writer is stubbed, not absent: since the native-boot hardening the door
  // fails the loadout closed without a hull on the player (no hull, no run:loadoutReady,
  // no wave ever plans). The stub grants + fits through the same writer seam production uses.
  const shipsStub = {
    buyShip({ defId, setActive } = {}) {
      if (!defId) return false;
      const p = state.player;
      if (!Array.isArray(p.ownedShips)) p.ownedShips = [];
      let idx = p.ownedShips.findIndex((s) => s && s.defId === defId);
      if (idx < 0) {
        idx = p.ownedShips.length;
        p.ownedShips.push({ defId, fittings: [] });
      }
      if (setActive) p.activeShipIndex = idx;
      return true;
    },
    grantModule({ defId } = {}) {
      if (!defId) return false;
      const p = state.player;
      if (!Array.isArray(p.moduleInventory)) p.moduleInventory = [];
      const inst = { defId, instanceId: `stub-${p.moduleInventory.length + 1}` };
      p.moduleInventory.push(inst);
      return true;
    },
    fitModule({ slotIndex, instanceId, defId } = {}) {
      const p = state.player;
      const owned = Array.isArray(p.ownedShips) ? p.ownedShips[p.activeShipIndex] : null;
      if (!owned || !Number.isInteger(slotIndex) || slotIndex < 0) return false;
      if (!Array.isArray(owned.fittings)) owned.fittings = [];
      const want = instanceId != null
        ? (p.moduleInventory || []).find((m) => m && m.instanceId === instanceId)
        : (p.moduleInventory || []).find((m) => m && m.defId === defId);
      if (!want) return false;
      owned.fittings[slotIndex] = want.defId;
      return true;
    },
  };
  const registry = {
    get: (name) => (name === 'fields' ? fields : name === 'ships' ? shipsStub : null),
  };
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

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
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
function launchCrucible(h, starterId = 'kinetic_baseline', arenaId = CRUCIBLE_ARENA_ID) {
  const setup = crucibleSetupFor({ starterId, seed: SEED, arenaId });
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
  assert.equal(h.state.run.score, 0, 'reward before input stays +0');
  assert.equal(swarmPilotHasActed(h.state), false, 'an idle stick has not latched a pilot act');
  assert.equal(named(h.emitted, 'run:waveCleared').length, 0, 'the round did not resolve itself');
  assert.equal(swarmArena._brood ? swarmArena._brood.census().alive : 0, 0, 'the brood waits with the pack');
  const arenaFields = fields._kernel && typeof fields._kernel.list === 'function'
    ? fields._kernel.list().filter((f) => String(f.id).startsWith('survival_arena_field'))
    : [];
  assert.equal(arenaFields.length, 0, 'the room law waits with the pack');
  survivalArena.reset?.();
});

// Wave-1 cohort doctrine does not ram. swarmDoctrineStamp rewrites wasp_swarmer onto
// pack_pursuit: an orbit at 130 WU with guns on the press phase (combatDoctrine.js),
// not a body impact. explicitRamAuthorization needs intent.ramPlate plus a heavy or
// capital band (operational mass >= 140, aiPorts.operationalBandsFor). The lesson and
// the wave-1 roster are wasp_swarmer, mass 16. detonator_run is a kamikaze and unlocks
// at fromWave 5. Held guns do not hold bodies; this stub has no physics, so a rock
// grind or a hive-wall collision cannot show up here.
const HEAVY_MASS = 140;

function zeroInput(state) {
  const input = state.input || (state.input = {});
  input.fire = false;
  input.moveX = 0;
  input.moveZ = 0;
  input.turnIntent = 0;
  input.boost = false;
  input.brake = false;
  input.autoFire = false;
}

test('an idle 120s on seed 4242 does not win wave 1 in the Foundry or the Hive', () => {
  const starter = COMBAT_LAB_STARTER_PACKAGES.find((p) => p.id === 'ricochet_runner');
  const ship = SHIPS.find((row) => row.id === starter.hullId);
  assert.ok(ship && ship.hull > 0, 'ricochet runner has a hull');
  const waveOne = swarmRosterFor(1).map((entry) => entry.enemyId);
  assert.deepEqual(waveOne, ['wasp_swarmer']);
  for (const id of waveOne) {
    const def = ENEMY_TYPES.find((row) => row.id === id);
    assert.ok(def, id);
    assert.ok(def.mass < HEAVY_MASS, `${id} is not a heavy ram band`);
    assert.notEqual(def.combatDoctrineId, 'detonator_run');
  }

  for (const arenaId of [CRUCIBLE_ARENA_ID, HIVE_ARENA_ID]) {
    resetCrucibleMetaForTests();
    const h = boot();
    armLaunch(h);
    useCrucibleMetaStorage(fakeStorage());
    launchCrucible(h, 'ricochet_runner', arenaId);
    reachWaveOneActive(h);
    assert.equal(h.state.run.phase, 'active', arenaId);
    assert.equal(h.state.run.wave, 1, arenaId);
    assert.equal(h.state.run.arenaId, arenaId);
    zeroInput(h.state);
    // The door's dummy player has no hull field. Stamp the starter's authored full
    // hull; ships.js derivation is not on this stub.
    h.player.hull = ship.hull;
    h.player.hullMax = ship.hull;
    const resolvedAtActive = survivalWave._resolved;
    const cohort = h.spawned.filter((e) => e && e.data && e.data.runCohort);
    assert.ok(cohort.length >= 1, `${arenaId} fields the lesson cohort`);
    for (const body of cohort) {
      const mass = Number(body.mass) || 0;
      const doctrine = body.data.ai && body.data.ai.combatDoctrineId;
      const ramPlate = !!(body.data.intent && body.data.intent.ramPlate === true);
      const ace = body.data.gimmickTag === 'ram-plate';
      assert.equal(doctrine, 'pack_pursuit', `${arenaId} cohort doctrine`);
      assert.ok(mass < HEAVY_MASS, `${arenaId} cohort mass ${mass} is not a ram band`);
      assert.equal(ramPlate, false, `${arenaId} cohort has no ram plate`);
      assert.equal(ace, false, `${arenaId} cohort is not a ram-plate ace`);
      assert.notEqual(doctrine, 'detonator_run');
    }

    tick(h, 120 * 60);
    assert.equal(named(h.emitted, 'run:waveCleared').length, 0, `${arenaId} wave 1 did not clear`);
    assert.equal(h.state.run.wave, 1, arenaId);
    assert.equal(h.state.run.phase, 'active', arenaId);
    assert.equal(survivalWave._resolved, resolvedAtActive, `${arenaId} _resolved stayed put`);
    // Gate rows kills_before_input and reward_before_input. The stub has no
    // solver, so a parked-rock ram cannot show up here; room-settle pins that
    // wave 1 is not parked. This pins the door: nothing died, the latch is
    // still quiet, and a slingshot bank in that gap pays no score.
    assert.equal(named(h.emitted, 'entity:killed').length, 0, `${arenaId} kills before input are 0`);
    assert.equal(swarmPilotHasActed(h.state), false, `${arenaId} idle has no pilot act`);
    assert.equal(h.state.run.score, 0, `${arenaId} reward before input is +0`);
    assert.equal(runSession.award({ score: 202, reason: 'stunt_bank', bankActs: ['Slingshot'] }), false);
    assert.equal(h.state.run.score, 0, `${arenaId} a bank during the idle still pays +0`);
    assert.equal(h.player.hull, ship.hull, `${arenaId} player hull stayed full`);
    assert.equal(h.player.hullMax, ship.hull, arenaId);
    const later = h.spawned.filter((e) => e && e.alive !== false && e.data && e.data.runCohort);
    for (const body of later) {
      const doctrine = body.data.ai && body.data.ai.combatDoctrineId;
      const mass = Number(body.mass) || 0;
      const ramPlate = !!(body.data.intent && body.data.intent.ramPlate === true);
      assert.notEqual(doctrine, 'detonator_run', arenaId);
      assert.ok(mass < HEAVY_MASS && ramPlate !== true, `${arenaId} late cohort does not ram`);
    }
    survivalArena.reset?.();
  }
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
