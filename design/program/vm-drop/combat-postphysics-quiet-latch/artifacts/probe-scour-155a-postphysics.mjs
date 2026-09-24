/**
 * #155 probe — combat postPhysics residual after #154 prePhysics quiet latch.
 * Soft-GPU fps NOT a KPI.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import {
  getCombatKernel,
  setCombatPrePhysicsQuietLatchForBench,
} from '../src/combat/kernel.js';

const ITERS = 40000;
const WARM = 1500;
const SHIP_N = 48;

function boot() {
  const state = createGameState(1551);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  state.runtime = { profileId: 'production' };
  state.meta = { seed: 1551 };
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 80, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const ships = [player];
  for (let i = 0; i < SHIP_N; i++) {
    const e = helpers.spawnEntity({
      type: 'ship',
      pos: { x: 600 + i * 35, z: (i % 7) * 40 },
      vel: { x: 0, z: 0 },
      radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 0,
      data: { ai: { passive: true } },
    });
    e.physicsSleeping = true;
    ships.push(e);
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.__spacefaceEntityIndexV1 = true;
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.version = 1;
  }
  const ctx = { state, bus, helpers, registry: null };
  const act = Object.assign({}, actions);
  act.init(ctx);
  const cmb = Object.assign({}, combat);
  cmb.init(ctx);
  const kernel = getCombatKernel(ctx);
  return { state, act, cmb, kernel, helpers, ships };
}

function bench(name, fn) {
  for (let i = 0; i < WARM; i++) fn();
  if (global.gc) global.gc();
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) fn();
  const ms = performance.now() - t0;
  const us = (ms * 1000) / ITERS;
  return { name, usPerCall: +us.toFixed(3), msTotal: +ms.toFixed(2) };
}

setCombatPrePhysicsQuietLatchForBench(true);
const { state, act, cmb, kernel, helpers, ships } = boot();

for (let i = 0; i < 30; i++) {
  state.tick++;
  state.simTime += 1 / 60;
  act.update(1 / 60, state);
  kernel.postPhysics();
}

const byId = state.combat?.attachments?.byId || {};
let attN = 0; for (const _ in byId) attN++;

const results = {
  latched: !!state.combatRuntime?.quietLatched,
  census: { ships: ships.length, attachments: attN },
};

results.actPlusPost = bench('act+postPhysics', () => {
  state.tick++;
  state.simTime += 1 / 60;
  act.update(1 / 60, state);
  kernel.postPhysics();
});

results.postPhysicsOnly = bench('postPhysics.only', () => {
  kernel.postPhysics();
});

// Sketch: empty attach already early-outs; skip entity walk when latched
results.postPhysicsSketchSkipWalk = bench('postPhysics.sketchSkipWalk', () => {
  // mimic: reconcile+telemetry only (both empty early-out) — no entity walk
  kernel.reconcilePhysicsAttachments();
  // updateTelemetry is internal; approximate by calling postPhysics replacement:
  // just measure empty work
});

// Rough: measure sortedEntities + ensure + sync cost alone via postPhysics
// vs noop when we monkey-patch — instead time a manual skip vs full
const k = kernel;
results.note = 'postPhysicsOnly is residual after #154 latch (attach empty + ensure/sync walk)';

writeFileSync('artifacts/probe-scour-155a-postphysics.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
