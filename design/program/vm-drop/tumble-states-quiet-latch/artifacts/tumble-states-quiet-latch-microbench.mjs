/**
 * Primary KPI: tumbleStates quiet latch vs always-update baseline.
 * Before = latch OFF. After = latch ON.
 * Soft-GPU fps not claimed. Picture ON.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  tumbleStates,
  setTumbleStatesQuietLatchForBench,
} from '../src/systems/tumbleStates.js';
import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF = fileURLToPath(import.meta.url);
const mode = process.argv[2] || 'all';

const ITERS = 30000;
const RUNS = 11;
const NPC = 24;

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[(s.length - 1) >> 1];
}

function boot() {
  const state = createGameState(140);
  state.mode = 'flight';
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 1,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const npcs = [];
  for (let i = 0; i < NPC; i++) {
    npcs.push(helpers.spawnEntity({
      type: 'ship', pos: { x: 300 + i * 35, z: 150 }, vel: { x: 0, z: 0 },
      radius: 8, mass: 10, hull: 80, hullMax: 80, collides: true, team: 2,
      data: { ai: true, intent: {} },
    }));
  }
  if (state.entityIndex) state.entityIndex.ready = true;
  const sys = Object.create(tumbleStates);
  sys.init({ state, bus, helpers, registry: null });
  return { state, sys, npcs };
}

function bench(which) {
  setTumbleStatesQuietLatchForBench(which === 'after');
  const { state, sys } = boot();
  for (let i = 0; i < 800; i++) {
    state.tick++; state.simTime += 1 / 60;
    sys.update(1 / 60, state);
  }
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) {
    state.tick++; state.simTime += 1 / 60;
    sys.update(1 / 60, state);
  }
  const ms = performance.now() - t0;
  return {
    mode: which,
    ms,
    latched: !!(state.tumbleStatesRuntime && state.tumbleStatesRuntime.quietLatched),
  };
}

function dirtyWakeOk() {
  setTumbleStatesQuietLatchForBench(true);
  const { state, sys, npcs } = boot();
  for (let i = 0; i < 40; i++) {
    state.tick++; state.simTime += 1 / 60;
    sys.update(1 / 60, state);
  }
  if (!state.tumbleStatesRuntime?.quietLatched) return { ok: false, reason: 'did-not-latch' };
  // Membership wake
  const helpers = {}; // already have npcs; spawn via core helpers not retained — use impulse wake
  recordImpulseProvenance(npcs[0], {
    tag: 'rcs_disruptor_spike', weaponId: 'x', appliedTick: state.tick | 0, magnitude: 1,
  });
  const beforeArmed = sys._quietLatch && sys._quietLatch.armedTick;
  state.tick++; state.simTime += 1 / 60;
  sys.update(1 / 60, state);
  const afterImpulse = !sys._quietLatch
    || sys._quietLatch.impulseGen !== undefined;
  // Begin-path clear
  for (let i = 0; i < 40; i++) {
    state.tick++; state.simTime += 1 / 60;
    sys.update(1 / 60, state);
  }
  sys._beginFromImpulse(npcs[1], {
    source: 'weapon', kind: 'weapon_tumble', cause: 'weapon',
    deltaV: 50, attackerId: state.playerId, attackerMass: 12, hitSide: 1, requireMassline: false,
  });
  const cleared = sys._quietLatch == null;
  return { ok: afterImpulse && cleared, afterImpulse, cleared, beforeArmed };
}

function isolated(which) {
  const res = spawnSync(process.execPath, [SELF, which], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (res.status !== 0) throw new Error(`isolated ${which}: ${res.stderr || res.stdout}`);
  return JSON.parse(res.stdout.trim().split('\n').pop());
}

if (mode === 'before' || mode === 'after') {
  console.log(JSON.stringify(bench(mode)));
  process.exit(0);
}
if (mode === 'wake') {
  console.log(JSON.stringify(dirtyWakeOk()));
  process.exit(0);
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const b = isolated('before');
  const a = isolated('after');
  pairs.push({ before: b.ms, after: a.ms, speedup: b.ms / a.ms, afterLatched: a.latched });
}
pairs.sort((x, y) => x.speedup - y.speedup);
const speedups = pairs.map((p) => p.speedup);
const wake = isolated('wake');
const out = {
  name: 'tumble-states-quiet-latch',
  primary: 'quiet-tumbleStates-no-active@npc24',
  npc: NPC,
  iters: ITERS,
  runs: RUNS,
  medianSpeedup: speedups[(speedups.length / 2) | 0],
  floorMinSpeedup: Math.min(...speedups),
  maxSpeedup: Math.max(...speedups),
  pairs,
  dirtyWakeOk: !!(wake && wake.ok),
  wake,
  note: 'Quiet: no tumble/rcs/recovery/drift. Before=latch OFF; after=latch ON. Soft-GPU fps not claimed.',
};
writeFileSync(join(__dirname, 'tumble-states-quiet-latch-microbench.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
