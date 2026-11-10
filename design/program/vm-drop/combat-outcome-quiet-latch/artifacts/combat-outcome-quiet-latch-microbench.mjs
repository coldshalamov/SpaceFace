/**
 * #163 — combatOutcome quiet-latch portable microbench.
 * Soft-GPU fps not a KPI. Picture contract ON.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  combatOutcome,
  setCombatOutcomeQuietLatchForBench,
} from '../src/systems/combatOutcome.js';

const N = Number(process.env.N || 40);
const ITERS = Number(process.env.ITERS || 30000);
const WARM = Number(process.env.WARM || 600);
const MODE = process.env.MODE || 'pair';
const OUT = process.env.OUT || 'artifacts/combat-outcome-quiet-latch-microbench.json';

function boot() {
  const state = createGameState(1631);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  state.runtime = { profileId: 'production' };
  state.meta = { seed: 1631 };
  state.world = { currentSectorId: 'sector_ceres_belt', sectors: {} };
  state.sector = { id: 'sector_ceres_belt' };
  state.ui = {};
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 }, rot: 0,
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0,
    flags: { docked: false }, data: { ai: { passive: true } },
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const ships = [player];
  for (let i = 0; i < N; i++) {
    ships.push(helpers.spawnEntity({
      type: 'ship',
      pos: { x: 400 + i * 50, z: (i % 5) * 40 },
      vel: { x: 0, z: 0 }, rot: 0,
      radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true,
      team: (i % 7 === 0) ? 1 : 0,
      physicsSleeping: true,
      data: { ai: { passive: true } },
    }));
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.__spacefaceEntityIndexV1 = true;
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.version = 1;
  }
  const sys = Object.create(combatOutcome);
  sys.init({ state, bus, helpers, registry: null });
  return { state, sys };
}

function bench(label, fn) {
  for (let i = 0; i < WARM; i++) fn();
  if (global.gc) global.gc();
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) fn();
  return { label, us: +(((performance.now() - t0) * 1000) / ITERS).toFixed(4) };
}

function runMode(on) {
  setCombatOutcomeQuietLatchForBench(on);
  const { state, sys } = boot();
  for (let i = 0; i < 40; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    sys.update(1 / 60, state);
  }
  const row = bench(on ? 'on' : 'off', () => {
    state.tick++;
    state.simTime += 1 / 60;
    sys.update(1 / 60, state);
  });
  return { ...row, quietLatched: !!state.combatOutcomeRuntime?.quietLatched };
}

const out = { N, ITERS, modes: {} };
if (MODE === 'off' || MODE === 'pair') out.modes.off = runMode(false);
if (MODE === 'on' || MODE === 'pair') out.modes.on = runMode(true);
setCombatOutcomeQuietLatchForBench(true);
if (out.modes.off && out.modes.on) {
  out.speedup = +(out.modes.off.us / Math.max(1e-9, out.modes.on.us)).toFixed(3);
  out.absBeforeUs = out.modes.off.us;
  out.absAfterUs = out.modes.on.us;
}
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
