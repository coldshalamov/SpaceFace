// PRI-11b — each Brood family's first course wave fields exactly one member first, beside
// the piece of the room that beats it (the recipe's one geometric check); the family's
// remaining share follows on that member's death or at its ceiling. A room that cannot
// satisfy the recipe gets the ordinary arrival — never a stall, never moved scenery.
//
// Drives the REAL wave owner and the REAL arena (with the real Brood engine) on a real
// seed — the same room() fixture swarm-opening-first-three drives — so the arrivals
// asserted here are the same materialization path the game runs, not a stub of it.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { mulberry32 } from '../src/core/rng.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { resetSwarmPressureState } from '../src/data/swarmMode.js';
import { swarmBroodPlan, swarmBroodPopulation } from '../src/data/swarmBrood.js';
import { broodStreamSeed } from '../src/systems/swarmBrood.js';

const DT = 1 / 60;
const ARENA = 'helios_core';
const SEED = 7;

// One wave's live room: a real swarm run state, the real wave owner, the real arena
// and its real Brood engine — the wavePlanned/waveStarted pair the phase machine
// emits, scripted straight onto the bus.
function room(seed = SEED, wave = 1, { retireToken = 1 } = {}) {
  resetSwarmPressureState();
  const state = createGameState(seed);
  state.run = Object.assign(
    createRunState({ kind: 'survival', ruleset: 'swarm', seed }),
    { wave, phase: 'active', retireToken, arenaId: ARENA, arenaMutators: [] },
  );
  state.mode = 'flight';
  const bus = createBus();
  const events = [];
  const emit = bus.emit.bind(bus);
  bus.emit = (event, payload) => { events.push({ event, payload }); emit(event, payload); };
  const player = {
    id: state.nextEntityId++, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 400, rot: 0, data: {},
  };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const budget = makeBudgetApi(state);
  bus.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id, p && p.entity));
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const e = {
        ...spec, id: state.nextEntityId++, alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) }, vel: { ...(spec.vel || { x: 0, z: 0 }) },
      };
      state.entities.set(e.id, e);
      state.entityList.push(e);
      return e;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return;
      entity.alive = false;
      state.entities.delete(id);
      state.entityList = state.entityList.filter((e) => e !== entity);
      bus.emit('entity:destroyed', { id, entity });
    },
  };
  const waveSys = Object.create(survivalWave);
  const ctx = {
    state,
    bus,
    helpers,
    registry: { get: (name) => (name === 'survivalWave' ? waveSys : null) },
  };
  waveSys.init(ctx);
  const arena = Object.create(swarmArena);
  arena.init(ctx);
  return { state, bus, helpers, events, budget, player, waveSys, arena, ctx };
}

function beginWave(h, wave = h.state.run.wave, seed = h.state.run.seed, plan = null) {
  const resolved = plan || planWave({ seed, arenaId: ARENA, wave, ruleset: 'swarm' });
  assert.ok(resolved && resolved.ok !== false, `wave ${wave} plans clean`);
  h.bus.emit('run:wavePlanned', { wave, plan: resolved });
  h.bus.emit('run:waveStarted', { wave });
  return resolved;
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.simTime += DT;
    h.state.tick += 1;
    h.arena.update();
    h.waveSys.update();
  }
}

function engine(h) {
  return h.arena && h.arena._brood;
}

// Live brood count for one family — a real buffer read, the renderer's own view.
function aliveOf(h, familyId) {
  const b = engine(h)._bodies;
  let n = 0;
  for (let i = 0; i < b.alive.length; i++) {
    if (b.alive[i] && b.liveFamilyId[b.family[i]] === familyId) n++;
  }
  return n;
}

// The wave's planned share for one family, straight from the data plan the engine uses.
function planCount(seed, wave, familyId) {
  const row = swarmBroodPlan(wave, mulberry32(broodStreamSeed(seed, wave)))
    .find((part) => part.id === familyId);
  return row ? row.count : 0;
}

// A real solid body in the room — the same entity shape the arena's own debris and the
// physics authority's normalization read: authored radius/mass, a material that is not a
// ghost, a velocity the still-body filter can measure.
function anchor(h, { x, z, radius = 6, mass = 40, material = 'rock', dynamic = true,
  debris = false, type = 'asteroid' } = {}) {
  const entity = {
    id: h.state.nextEntityId++, type, alive: true, collides: true,
    pos: { x, z }, vel: { x: 0, z: 0 }, radius, mass,
    physicsBody: { schemaVersion: 1, dynamic, radius, mass, material },
    data: debris ? { swarmArenaDebris: true, terrainAnchor: true } : {},
  };
  h.state.entities.set(entity.id, entity);
  h.state.entityList.push(entity);
  return entity;
}

function debutPos(h) {
  const d = engine(h)._debut();
  if (!d) return null;
  const b = engine(h)._bodies;
  return { x: b.px[d.slot], z: b.pz[d.slot] };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// ---------------------------------------------------------------------------
// first appearance: one member, its recipe satisfied, the rest of the family held
// ---------------------------------------------------------------------------

test('round 3 Spitter: one arrives alone beyond a real throwable; its cohort is owed', () => {
  const h = room(SEED, 3);
  const rock = anchor(h, { x: 70, z: 0, radius: 6, mass: 40, debris: true });
  beginWave(h, 3);
  tick(h, 2);
  const d = engine(h)._debut();
  assert.ok(d, 'the wave arms and lands its spitter debut');
  assert.equal(d.familyId, 'spitter');
  assert.equal(aliveOf(h, 'spitter'), 1, 'exactly one spitter stands in the room');
  assert.equal(d.held, planCount(SEED, 3, 'spitter') - 1,
    'the family\'s remaining share is held inside the same plan');
  const seat = debutPos(h);
  assert.ok(distance(seat, rock.pos) <= 90,
    `the mark lands beside its ammunition (${distance(seat, rock.pos).toFixed(1)} wu)`);
  // Other families are not held — the whole mite share floods at the open.
  assert.equal(aliveOf(h, 'mite'), planCount(SEED, 3, 'mite'),
    'the mite flood is untouched by the spitter\'s debut');
});

test('round 9 Lantern Cyst: one arrives alone with a lane out; its cohort is owed', () => {
  const h = room(SEED, 9);
  beginWave(h, 9);
  tick(h, 2);
  const d = engine(h)._debut();
  assert.ok(d, 'the wave arms and lands its cyst debut');
  assert.equal(d.familyId, 'lantern_cyst');
  assert.equal(aliveOf(h, 'lantern_cyst'), 1, 'exactly one cyst stands in the room');
  assert.equal(d.held, planCount(SEED, 9, 'lantern_cyst') - 1);
  const seat = debutPos(h);
  assert.ok(distance(seat, h.player.pos) >= 72,
    'the debut keeps the ordinary arrival floor — a bomb, not a spawn-kill');
});

test('round 11 Leecher: one arrives alone opposite a real scrape surface', () => {
  const h = room(SEED, 11);
  const rock = anchor(h, { x: 90, z: 0, radius: 12, mass: 600 });
  beginWave(h, 11);
  tick(h, 2);
  const d = engine(h)._debut();
  assert.ok(d, 'the wave arms and lands its leecher debut');
  assert.equal(d.familyId, 'leecher');
  assert.equal(aliveOf(h, 'leecher'), 1, 'exactly one leecher stands in the room');
  assert.equal(d.held, planCount(SEED, 11, 'leecher') - 1);
  const seat = debutPos(h);
  const along = (seat.x - h.player.pos.x) * (rock.pos.x - h.player.pos.x)
    + (seat.z - h.player.pos.z) * (rock.pos.z - h.player.pos.z);
  assert.ok(along < 0, 'the latch keeps the scrape wall behind the pilot');
});

test('round 13 Glassback: one arrives alone beyond loose mass that can reach it', () => {
  const h = room(SEED, 13);
  const rock = anchor(h, { x: 75, z: 0, radius: 7, mass: 180 });
  beginWave(h, 13);
  tick(h, 2);
  const d = engine(h)._debut();
  assert.ok(d, 'the wave arms and lands its glassback debut');
  assert.equal(d.familyId, 'glassback');
  assert.equal(aliveOf(h, 'glassback'), 1, 'exactly one glassback stands in the room');
  assert.equal(d.held, planCount(SEED, 13, 'glassback') - 1);
  const seat = debutPos(h);
  assert.ok(distance(seat, rock.pos) <= 95,
    `the shell stands beside the mass that kills it (${distance(seat, rock.pos).toFixed(1)} wu)`);
});

test('round 17 Bellows: one arrives alone with a lane out; its cohort is owed', () => {
  const h = room(SEED, 17);
  beginWave(h, 17);
  tick(h, 2);
  const d = engine(h)._debut();
  assert.ok(d, 'the wave arms and lands its bellows debut');
  assert.equal(d.familyId, 'bellows');
  assert.equal(aliveOf(h, 'bellows'), 1, 'exactly one bellows stands in the room');
  assert.equal(d.held, planCount(SEED, 17, 'bellows') - 1);
  const seat = debutPos(h);
  assert.ok(distance(seat, h.player.pos) >= 72);
});

// ---------------------------------------------------------------------------
// the held share follows — on the member's death, or at the family's ceiling
// ---------------------------------------------------------------------------

test('kill the debut member: its family follows through the ordinary arrival', () => {
  const h = room(SEED, 3);
  const rock = anchor(h, { x: 70, z: 0, radius: 6, mass: 40, debris: true });
  beginWave(h, 3);
  tick(h, 2);
  const d = engine(h)._debut();
  assert.ok(d && d.familyId === 'spitter');
  const planned = planCount(SEED, 3, 'spitter');
  assert.ok(planned > 1, 'the wave owes more than the debut member');
  engine(h)._killDirectForTest(d.slot, 'direct');
  // A member that cannot seat on the first pass is owed to the ordinary 0.5 s retry —
  // give the release a full second of ticks to complete its landings, with the pilot
  // parked out of reach so no released body can die inside the window: the family then
  // stands at its plan minus the member whose death opened it.
  h.player.pos.x = 5000;
  h.player.pos.z = 5000;
  tick(h, 60);
  assert.equal(engine(h)._debut(), null, 'the hold ends on the member\'s death');
  assert.equal(aliveOf(h, 'spitter'), planned - 1,
    'the held share arrived through the same plan — the whole family minus its fallen member');
});

test('the ceiling ends the read honestly: the family follows without a kill', () => {
  const h = room(SEED, 3);
  const rock = anchor(h, { x: 70, z: 0, radius: 6, mass: 40, debris: true });
  beginWave(h, 3);
  tick(h, 2);
  const d = engine(h)._debut();
  assert.ok(d && d.familyId === 'spitter');
  const planned = planCount(SEED, 3, 'spitter');
  // Walk the pilot far out of reach so the member cannot die early — the ceiling,
  // not a kill, must be what ends this read.
  h.player.pos.x = 5000;
  h.player.pos.z = 5000;
  tick(h, 8 * 60 + 30); // past the authored eight-second ceiling
  assert.equal(engine(h)._debut(), null, 'the ceiling released the hold');
  assert.equal(aliveOf(h, 'spitter'), planned,
    'the whole family stands — the ceiling admitted the held share');
});

// ---------------------------------------------------------------------------
// honest rooms: unsatisfiable geometry falls back; later rounds keep no debut
// ---------------------------------------------------------------------------

test('round 3 with no throwable in reach: the spitter family arrives the ordinary way', () => {
  const h = room(SEED, 3);
  beginWave(h, 3);
  tick(h, 4);
  assert.equal(engine(h)._debut(), null, 'no debut is claimed in an unsatisfiable room');
  assert.equal(aliveOf(h, 'spitter'), planCount(SEED, 3, 'spitter'),
    'the family fields its whole planned share at the open, exactly as today');
});

test('a later round with the same family keeps no debut', () => {
  const h = room(SEED, 4);
  anchor(h, { x: 70, z: 0, radius: 6, mass: 40, debris: true });
  beginWave(h, 4);
  tick(h, 2);
  assert.equal(engine(h)._debut(), null, 'round 4 holds no debut — the first appearance passed');
  assert.equal(aliveOf(h, 'spitter'), planCount(SEED, 4, 'spitter'),
    'the spitter share floods at the open like every other family');
});

// ---------------------------------------------------------------------------
// determinism and the population law
// ---------------------------------------------------------------------------

test('same seed, same room, same wave: the debut lands identically', () => {
  const a = room(SEED, 3);
  anchor(a, { x: 70, z: 0, radius: 6, mass: 40, debris: true });
  beginWave(a, 3);
  const b = room(SEED, 3);
  anchor(b, { x: 70, z: 0, radius: 6, mass: 40, debris: true });
  beginWave(b, 3);
  assert.deepEqual(debutPos(a), debutPos(b), 'the debut seat is deterministic under one seed');
});

test('the held share never leaves the population law: alive plus owed equals the plan', () => {
  const h = room(SEED, 11);
  anchor(h, { x: 90, z: 0, radius: 12, mass: 600 });
  beginWave(h, 11);
  tick(h, 2);
  const view = engine(h).view;
  assert.ok(view.pendingCount >= 1, 'the held share still reads as owed');
  assert.ok(view.aliveCount + view.pendingCount <= swarmBroodPopulation(11),
    'alive plus owed stays inside the wave\'s planned population');
  const d = engine(h)._debut();
  engine(h)._killDirectForTest(d.slot, 'direct');
  h.player.pos.x = 5000;
  h.player.pos.z = 5000;
  tick(h, 60);
  assert.equal(aliveOf(h, 'leecher'), planCount(SEED, 11, 'leecher') - 1,
    'the released share completes the family minus its fallen member, no more');
});
