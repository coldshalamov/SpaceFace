// S3 — fair credit (design/program/finish/swarm/PLANS.md §S3): idling earns nothing.
// The chain, PILE-UP/DOUBLE callouts, kill popups and run awards may only reflect what
// the player caused — a body the arena killed without player impulse is environmental.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun, SURVIVAL_ARENA_INTRO_TICKS, SURVIVAL_WAVE_INTRO_TICKS } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { swarmChain } from '../src/systems/swarmChain.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import { BROOD_EXPLOSION_EVENTS, SWARM_BROOD_MAX, BROOD_MAX_SPEED } from '../src/data/swarmBrood.js';
import { createBroodEngine, BROOD_PHASE_DASH, BROOD_PHASE_FLOCK } from '../src/systems/swarmBrood.js';
import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import { createRunState } from '../src/core/runState.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { resetSwarmPressureState, bindSwarmPressureContext } from '../src/data/swarmMode.js';

const DT = 1 / 60;
const SEED = 2438149869;
const ARENA = 'helios_core';

function boot(seed = SEED) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
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
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 400,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.mode = 'flight';
  state.player = state.player || { tether: null };
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  const ctx = { state, bus, helpers, registry: { get: () => null } };
  resetSwarmPressureState();
  bindSwarmPressureContext(null);
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  swarmChain.init(ctx);
  swarmJuice.init(ctx);
  return { state, bus, emitted, helpers, budget, spawned, ctx, player };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.simTime += DT;
    h.state.tick += 1;
    survivalWave.update(DT);
    survivalRun.update(DT);
    swarmArena.update(DT, h.state);
    swarmChain.update(DT, h.state);
    if (typeof swarmJuice.update === 'function') swarmJuice.update(DT, h.state);
  }
}

function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}

/** Credited brood kills (count > 0), not environmental removals. */
function creditedBroodReceipts(h) {
  return named(h, 'swarm:broodKills').filter((e) => (e.payload && e.payload.count) > 0);
}

function beginSwarm(h) {
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA });
  h.bus.emit('run:loadoutReady', {});
  tick(h, 1);
  tick(h, SURVIVAL_ARENA_INTRO_TICKS);
  tick(h, SURVIVAL_WAVE_INTRO_TICKS);
}

test('a parked ship earns nothing — the chain, popups, callouts and awards stay at zero', () => {
  const h = boot();
  beginSwarm(h);
  // Ship at rest, no input: the whole of round 1's opening minute idles by.
  tick(h, 600);
  const credited = creditedBroodReceipts(h);
  assert.equal(credited.length, 0,
    `environmental brood deaths paid as player kills: ${JSON.stringify(credited.map((e) => e.payload.count))}`);
  const popups = named(h, 'swarm:killPopup');
  assert.equal(popups.length, 0,
    `kill popups spoke for kills the player did not cause: ${JSON.stringify(popups.map((e) => e.payload))}`);
  const announces = named(h, 'swarm:announce')
    .filter((e) => e.payload && (e.payload.kind === 'pileup' || e.payload.kind === 'multikill'));
  assert.equal(announces.length, 0,
    `idle run still called a ${JSON.stringify(announces.map((e) => e.payload.text))}`);
  const chainAwards = named(h, 'run:awardRequested')
    .filter((e) => e.payload && (e.payload.reason === 'chain' || e.payload.reason === 'brood'));
  assert.equal(chainAwards.length, 0,
    `idle run paid score/credits: ${JSON.stringify(chainAwards.map((e) => e.payload))}`);
  assert.equal(swarmChain.chainState().chain, 0, 'the chain counted environmental deaths');
  swarmChain.destroy();
  swarmJuice.destroy();
  swarmArena.destroy();
});

/** Standalone brood engine over a live Swarm run — the arena host's same wiring, one rock lane. */
function bootBrood({ wave = 1, phase = 'active' } = {}) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 400,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.entityIndex = {
    __spacefaceEntityIndexV1: true, ready: true, shipLike: [player], asteroids: [],
  };
  state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  state.run.phase = phase;
  state.run.wave = wave;
  state.mode = 'flight';
  state.player = state.player || { tether: null };
  const engine = createBroodEngine({ bus, getState: () => state, fieldList: () => null });
  for (const name of BROOD_EXPLOSION_EVENTS) bus.on(name, (p) => engine.onExplosion(p));
  engine.prepareWave(state.run, wave);
  engine.spawnWave(state);
  return { state, bus, emitted, player, engine };
}

// A body in its own attack dive slamming the room's face is machinery the player did not
// trigger — the same environmental death as a drifting body, never a player kill.
test('a brood body that kills itself on a rock mid-dash is environmental, not credited', () => {
  const h = bootBrood();
  let slot = -1;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) if (h.engine._bodies.alive[i]) { slot = i; break; }
  assert.ok(slot >= 0, 'the wave spawned brood');
  const rock = {
    id: 9001, alive: true, type: 'asteroid', collides: true,
    pos: { x: h.engine._bodies.px[slot] + 40, z: h.engine._bodies.pz[slot] },
    vel: { x: 0, z: 0 }, radius: 20, mass: 99999,
  };
  h.state.entityIndex.asteroids.push(rock);
  h.state.entityList.push(rock);
  // The dash is the body's own committed attack steer — nothing the player did.
  h.engine._bodies.phase[slot] = BROOD_PHASE_DASH;
  h.engine._bodies.vx[slot] = BROOD_MAX_SPEED;
  h.engine._bodies.vz[slot] = 0;
  const before = h.engine.census().alive;
  for (let i = 0; i < 12; i++) {
    if (h.engine._bodies.alive[slot]) h.engine._bodies.phase[slot] = BROOD_PHASE_DASH;
    h.state.simTime += DT; h.state.tick += 1; h.engine.step(h.state);
  }
  assert.ok(h.engine.census().alive < before, 'the dash slam killed the body');
  const terrain = named(h, 'swarm:broodKills').find((e) => e.payload && e.payload.cause === 'terrain');
  assert.ok(terrain, 'the rock death filed a terrain receipt');
  assert.equal(terrain.payload.count, 0,
    `the body's own dash slam was credited to the player (count ${terrain.payload.count})`);
  const pay = named(h, 'run:awardRequested').filter((e) => e.payload && e.payload.reason === 'brood');
  assert.equal(pay.length, 0, 'a self-caused dash death paid out');
});

// The fair-credit positive half: a rock the player just shoved IS the player's momentum —
// the brood it kills pays, exactly like a throw.
test('a rock the player shoved pays its brood kills', () => {
  const h = bootBrood();
  let slot = -1;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) if (h.engine._bodies.alive[i]) { slot = i; break; }
  assert.ok(slot >= 0);
  const rock = {
    id: 9002, alive: true, type: 'asteroid', collides: true,
    pos: { x: h.engine._bodies.px[slot] + 40, z: h.engine._bodies.pz[slot] },
    vel: { x: 0, z: 0 }, radius: 20, mass: 99999,
  };
  h.state.entityIndex.asteroids.push(rock);
  h.state.entityList.push(rock);
  // The player's last impulse owns this rock — the same stamp a tether release applies.
  recordImpulseProvenance(rock, { actorId: h.player.id, appliedTick: h.state.tick, tag: 'thrown' });
  h.engine._bodies.vx[slot] = BROOD_MAX_SPEED;
  h.engine._bodies.vz[slot] = 0;
  const before = h.engine.census().alive;
  for (let i = 0; i < 12; i++) { h.state.simTime += DT; h.state.tick += 1; h.engine.step(h.state); }
  assert.ok(h.engine.census().alive < before, 'the slam killed the body');
  const terrain = named(h, 'swarm:broodKills').find((e) => e.payload && e.payload.cause === 'terrain');
  assert.ok(terrain, 'the rock death filed a terrain receipt');
  assert.ok(terrain.payload.count >= 1, 'a player-shoved rock credits its kills');
});

test('a player-owned detonation still pays — credited kills step the chain and the callouts', () => {
  const h = boot();
  beginSwarm(h);
  tick(h, 60);
  // A player-owned explosion at the pack: BROOD_EXPLOSION_EVENTS is the same seam bombs use.
  const brood = h.state.swarmBrood;
  assert.ok(brood && brood.aliveCount > 0, 'the wave spawned its brood before the throw');
  const hit = { x: brood.px ? brood.px[0] : 0, z: brood.pz ? brood.pz[0] : 0 };
  h.bus.emit(BROOD_EXPLOSION_EVENTS[0], {
    pos: hit, radius: 60, ownerId: h.player.id,
  });
  tick(h, 5);
  const credited = creditedBroodReceipts(h);
  assert.ok(credited.length > 0, 'a player detonation pays');
  assert.ok(named(h, 'swarm:killPopup').length > 0, 'the popup names a real player kill');
  assert.ok(swarmChain.chainState().chain > 0, 'the chain counts what the player caused');
  swarmChain.destroy();
  swarmJuice.destroy();
  swarmArena.destroy();
});
