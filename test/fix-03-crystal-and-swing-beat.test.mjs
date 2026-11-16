// FIX-03 — two recoveries in one packet:
//
//   1. Until the crystal body asset is real it renders as a bare placeholder octahedron,
//      so NO Swarm arena may mint the `crystal` debris substance — not just the Foundry
//      (the old filter covered helios_core only). Proof: rounds 1–10 of every arena, and
//      a direct crystal-material call into _spawnDebrisRock, never produce it. Adventure
//      keeps its crystal — the hold-out is the Swarm roll alone.
//
//   2. Beat 4 ("Swing the rock through the wreck") can no longer stick: the first
//      massline:throw of ANY body completes it (ACCEPT-02's pilot threw two ordinary
//      rocks and sat eight minutes on an objective pointing at a body that was gone),
//      and when the authored lesson rock is destroyed or lost the objective retargets
//      the nearest loose throwable — retry, never a wall.
//
// Both halves drive the real systems over real events: swarmArena through the run
// wavePlanned/waveStarted rotation, onboarding through tether/massline/entity:killed
// payloads on the production-shaped harness.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import {
  SWARM_DEBRIS_TAG,
  environmentFamiliesFor,
  pickDebrisSubstance,
  swarmArena,
} from '../src/systems/swarmArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { SURVIVAL_LIVE_CIRCUIT_ARENAS } from '../src/data/survivalWaves.js';
import { ARENA_LAWS } from '../src/data/survivalArenas.js';
import { adventureMaterialFor, environmentMaterialOf } from '../src/data/environmentMaterials.js';
import { RESCUE_PROOF_SEED } from '../src/onboarding/rescueOpening.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat } from '../src/systems/heat.js';
import { ONBOARDING_CHOICE_SOURCE, missions as missionsProto } from '../src/systems/missions.js';
import { BEATS, onboarding } from '../src/systems/onboarding.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

// Every room a Swarm run can launch in: the five-arena live circuit, the law rooms that
// add the Mill and the Hive, and the two catalog labs (ceres_belt, tethys_hub) — the
// packet's "every Swarm arena", discovered from the live lists rather than re-pinned.
const SWARM_ARENAS = [...new Set([
  ...SURVIVAL_LIVE_CIRCUIT_ARENAS,
  ...Object.keys(ARENA_LAWS),
  'ceres_belt',
  'tethys_hub',
])];

const SEED = 4242;

// ── Swarm harness (same production route as crucible-swarm-arena.test.mjs) ────────────
function bootSwarm(arenaId) {
  const state = createGameState(SEED);
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
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;

  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId });
  return { state, bus, helpers, spawned, player, ctx };
}

function debrisRocks(h) {
  return h.state.entityList.filter(
    (e) => e.alive !== false && e.data && e.data[SWARM_DEBRIS_TAG] === true,
  );
}

function assertNoCrystalDebris(h, where) {
  for (const rock of debrisRocks(h)) {
    assert.notEqual(rock.data.substance, 'crystal',
      `${where}: debris rock #${rock.id} must never mint the placeholder substance`);
    assert.notEqual(rock.data.typeId, 'ast_crystalline',
      `${where}: debris rock #${rock.id} must never take the crystal typeId`);
    assert.notEqual(environmentMaterialOf(rock), 'crystal',
      `${where}: debris rock #${rock.id} must never resolve the crystal material`);
  }
}

// ── Onboarding harness (same production-shaped rail as pq-163) ──────────────────────
function stubElement() {
  return {
    children: [], style: {}, dataset: {}, textContent: '', innerHTML: '',
    classList: { contains: () => false, add: () => {}, remove: () => {}, toggle: () => {} },
    appendChild() {}, prepend() {}, remove() {},
    setAttribute() {}, getAttribute: () => null, hasAttribute: () => false, removeAttribute() {},
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
  };
}
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  head: stubElement(),
  body: stubElement(),
  documentElement: null,
  createElement: () => stubElement(),
};

function makeRailState() {
  const state = createGameState(RESCUE_PROOF_SEED);
  const player = makeEntity({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8,
    data: { weapons: [{ defId: 'pulse_laser_s', _heat: 0, heatMax: 100 }], combat: {}, ai: {} },
  });
  player.id = 1;
  state.mode = 'flight';
  state.simTime = 10;
  state.tick = 40;
  state.playerId = 1;
  state.player.hints = {};
  state.player.targetId = null;
  state.player.heat = 0;
  state.player.credits = NEW_GAME.credits;
  state.entities = new Map([[1, player]]);
  state.entityList = [player];
  state.nextEntityId = 10;
  state.nav = {};
  state.combat = { attachments: { byId: {} } };
  state.world.currentSectorId = 'sector_helios_prime';
  if (!state.world.activeSector) state.world.activeSector = { stations: [], gates: [] };
  state.story = { beatIndex: 0 };
  if (!state.ui) state.ui = {};
  state.ui.dockedStationId = null;
  if (!state.input) state.input = {};
  state.settings.gameplay = Object.assign({}, state.settings.gameplay, { tutorialHints: true });
  return state;
}

function bootRail() {
  const bus = createBus();
  const state = makeRailState();
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
    hash32,
    mulberry32,
    voice: { say: () => true },
  };
  const systems = new Map();
  const registry = { get: (name) => systems.get(name) || null };
  const missions = Object.create(missionsProto);
  missions.init({ state, bus, helpers, registry });
  systems.set('missions', missions);
  const law = Object.create(lawSecurity);
  law.init({ state, bus, helpers, registry });
  systems.set('lawSecurity', law);
  const heatSys = Object.create(heat);
  heatSys.init({ state, bus, helpers, registry });
  systems.set('heat', heatSys);
  const sys = Object.create(onboarding);
  sys.init({ state, bus, helpers, registry });
  helpers.spawnEntity({
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: 620, z: 140 }, radius: 42,
    data: { stationId: 'station_helios', name: 'Helios Station', dockRadius: 80, factionId: 'faction_scn' },
  });
  return { bus, state, sys, helpers, missions, law, heat: heatSys };
}

function tickRail(h, dt = 0.25) {
  h.state.simTime += dt;
  h.sys.update(dt, h.state);
  h.heat.update(dt, h.state);
}

function rescueActor(h, slot) {
  const id = h.state.onboarding.rescue && h.state.onboarding.rescue.ids[slot];
  return id == null ? null : h.state.entities.get(id);
}

// The same drive pq-163's OPENING-1b proof uses: the tether lesson's derelict, one
// latch + release, then the rescue funnel hands the rail to the swing beat.
function driveToSwing(h) {
  h.bus.emit('game:started', {});
  tickRail(h);
  const derelictId = h.sys._derelictId;
  assert.ok(derelictId != null, 'the tether lesson stages its derelict');
  h.state.player.targetId = derelictId;
  h.bus.emit('tether:latched', { targetId: derelictId });
  h.bus.emit('tether:released', { targetId: derelictId });
  tickRail(h);
  tickRail(h, 5);
  assert.equal(h.state.onboarding.rescue.current, 'swing', 'the rail reaches beat 4');
}

function looseRock(h, x, z, data = {}) {
  return h.helpers.spawnEntity({
    type: 'asteroid', team: 0,
    pos: { x, z }, vel: { x: 0, z: 0 }, radius: 11,
    mass: 4840, hull: 900, collides: true,
    data: { throwable: true, ...data },
  });
}

function scrapPickups(h) {
  return h.state.entityList.filter(
    (e) => e.alive !== false && e.type === 'pickup' && e.data && e.data.kind === 'cargo'
      && e.data.commodityId === 'cmdty_salvage_electronics',
  );
}

// ══ Part 1 — no Swarm arena spawns the placeholder crystal substance ═══════════════════

test('FIX-03: no Swarm arena rolls the crystal material family', () => {
  for (const arenaId of [...SWARM_ARENAS, 'an_arena_that_does_not_exist']) {
    assert.equal(environmentFamiliesFor(arenaId).includes('crystal'), false,
      `${arenaId} must not roll the placeholder family`);
    assert.ok(environmentFamiliesFor(arenaId).length >= 5,
      `${arenaId} keeps every real family`);
  }
});

test('FIX-03: rounds 1-10 of every Swarm arena never spawn crystal debris', () => {
  for (const arenaId of SWARM_ARENAS) {
    const h = bootSwarm(arenaId);
    assert.ok(h.state.run && h.state.run.kind === 'survival', `${arenaId}: the run launches`);
    for (let wave = 1; wave <= 10; wave++) {
      h.state.run.wave = wave;
      h.bus.emit('run:wavePlanned', {
        wave,
        plan: planWave({ seed: SEED, arenaId, wave, ruleset: SWARM_RULESET }),
      });
      h.bus.emit('run:waveStarted', { wave });
      h.state.simTime += 1;
      swarmArena.update();
      assertNoCrystalDebris(h, `${arenaId} wave ${wave}`);
    }
    assert.ok(debrisRocks(h).length > 0, `${arenaId}: the proof actually fielded debris`);
  }
});

test('FIX-03: a caller that still hands crystal to _spawnDebrisRock gets ordinary rock', () => {
  const h = bootSwarm('helios_core');
  h.state.run.wave = 1;
  h.bus.emit('run:wavePlanned', {
    wave: 1,
    plan: planWave({ seed: SEED, arenaId: 'helios_core', wave: 1, ruleset: SWARM_RULESET }),
  });
  // An opening station, reef recipe or mutator that still names the family — the guard
  // converts it to ordinary rock before substance, typeId or skin are chosen.
  const id = swarmArena._spawnDebrisRock(900, 400, 24, mulberry32(77), h.state.simTime,
    { material: 'crystal' });
  assert.ok(id != null, 'the guarded spawn still lands');
  const rock = h.state.entities.get(id);
  assert.ok(rock && rock.data[SWARM_DEBRIS_TAG] === true, 'the body is ordinary arena debris');
  assert.notEqual(rock.data.substance, 'crystal');
  assert.notEqual(rock.data.typeId, 'ast_crystalline');
  assert.notEqual(environmentMaterialOf(rock), 'crystal');
});

test('FIX-03: Adventure keeps its crystal — the hold-out is Swarm-only', () => {
  assert.equal(adventureMaterialFor('ast_crystalline', SEED, 'field_a', 0), 'crystal',
    'the Adventure material table is unchanged');
  assert.equal(pickDebrisSubstance('crystal', mulberry32(1)), 'crystal',
    'the substance table still carries the authored body for when the asset lands');
});

// ══ Part 2 — beat 4 cannot stick ═════════════════════════════════════════════════════

test('FIX-03: the first throw of ANY body completes the swing beat, scrap still drops', () => {
  const h = bootRail();
  driveToSwing(h);
  const rock = rescueActor(h, 'rock');
  assert.ok(rock, 'the authored lesson rock is staged');
  const wreck = rescueActor(h, 'derelict');
  assert.ok(wreck, 'the wreck stands for the scrap drop');
  // What the ACCEPT-02 pilot actually did: latched and threw a plain room rock, never
  // the lesson's body.
  const other = looseRock(h, 60, 0);
  const scrapBefore = scrapPickups(h).length;
  h.bus.emit('massline:throw', { payloadId: other.id, releaseId: 'r-any' });
  assert.equal(h.state.onboarding.rescue.beats.swing.state, 'done',
    'a non-lesson payload clears beat 4');
  assert.equal(h.state.onboarding.firstThrowSeen, true);
  assert.ok(scrapPickups(h).length > scrapBefore, 'the wreck-scrap reward still drops');
  // A duplicate/stale throw event cannot double-pay or reopen the beat.
  h.bus.emit('massline:throw', { payloadId: rock.id, releaseId: 'r-dup' });
  assert.equal(h.state.onboarding.rescue.beats.swing.state, 'done');
  assert.equal(scrapPickups(h).length, scrapBefore + 2, 'the reward lands exactly once');
});

test('FIX-03: losing the lesson rock retargets the objective at the nearest loose throwable', () => {
  const h = bootRail();
  driveToSwing(h);
  const rescue = h.state.onboarding.rescue;
  const rock = rescueActor(h, 'rock');
  assert.ok(rock && rock.data.rescue === true, 'the lesson rock is the rail-authored body');
  // A real loose throwable farther out, and a plain asteroid closer still — the ammo
  // rule (throwable or chunk, same as masslineThrow.isThrowArmPayload) picks the rock.
  const substitute = looseRock(h, 140, 0);
  const decoy = h.helpers.spawnEntity({
    type: 'asteroid', team: 0, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, radius: 11,
    data: { },
  });
  // "Lost" means the body is gone entirely — no kill receipt ever arrives.
  h.state.entities.delete(rock.id);
  h.state.entityList.splice(h.state.entityList.indexOf(rock), 1);
  tickRail(h);
  assert.equal(rescue.ids.rock, substitute.id,
    'the objective adopts the nearest loose throwable, not the missing body');
  assert.notEqual(rescue.ids.rock, decoy.id, 'a plain asteroid is not throw-arm ammo');
  assert.equal(rescue.beats.swing.state, 'current', 'the beat stays open — no fail');
  assert.equal(rescue.beats.swing.fails || 0, 0, 'retargeting is not a fail');
  const wp = h.state.nav.waypoint;
  assert.ok(wp && wp.onboarding === true && wp.markerId === 'rescue:swing',
    'the objective marker stays onboarding-owned');
  assert.equal(Math.round(wp.pos.x), Math.round(substitute.pos.x),
    'the marker now points at the substitute');
  assert.equal(Math.round(wp.pos.z), Math.round(substitute.pos.z));
  // And the whole point: the player throws it and the beat closes.
  h.bus.emit('massline:throw', { payloadId: substitute.id, releaseId: 'r-sub' });
  assert.equal(rescue.beats.swing.state, 'done');
});

test('FIX-03: a destroyed lesson rock retargets instead of failing', () => {
  const h = bootRail();
  driveToSwing(h);
  const rescue = h.state.onboarding.rescue;
  const rock = rescueActor(h, 'rock');
  const substitute = looseRock(h, 90, 30);
  rock.alive = false; // a real kill leaves the body dead in the world
  h.bus.emit('entity:killed', { id: rock.id });
  assert.equal(rescue.ids.rock, substitute.id, 'the kill retargets at the loose throwable');
  assert.equal(rescue.beats.swing.fails || 0, 0, 'no fail counted');
  assert.equal(rescue.beats.swing.state, 'current');
});

test('FIX-03: an empty pocket still restages a fresh authored rock — retry, never a wall', () => {
  const h = bootRail();
  driveToSwing(h);
  const rescue = h.state.onboarding.rescue;
  const rock = rescueActor(h, 'rock');
  h.state.entities.delete(rock.id);
  h.state.entityList.splice(h.state.entityList.indexOf(rock), 1);
  tickRail(h);
  assert.equal(rescue.beats.swing.fails, 1, 'with nothing throwable in reach the beat retries');
  const staged = rescueActor(h, 'rock');
  assert.ok(staged && staged.alive !== false, 'a fresh lesson rock stands');
  assert.ok(staged.data && staged.data.rescue === true, 'the retry is the rail-authored body');
});

test('FIX-03: the rail never deletes an adopted world rock on restage or teardown', () => {
  const h = bootRail();
  driveToSwing(h);
  const rescue = h.state.onboarding.rescue;
  const rock = rescueActor(h, 'rock');
  const substitute = looseRock(h, 120, 0);
  h.state.entities.delete(rock.id);
  h.state.entityList.splice(h.state.entityList.indexOf(rock), 1);
  tickRail(h);
  assert.equal(rescue.ids.rock, substitute.id);
  // Beat teardown (rail torn down for a new game / finish) drops the pointer, not the body.
  h.sys._removeRescueActors();
  assert.equal(h.state.entities.get(substitute.id) && h.state.entities.get(substitute.id).alive !== false,
    true, 'the adopted rock is the world\'s, not the tableau\'s');
});
