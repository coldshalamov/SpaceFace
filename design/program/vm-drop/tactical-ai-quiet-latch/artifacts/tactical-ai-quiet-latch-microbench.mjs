/**
 * Primary KPI: tacticalAI quiet latch vs always-update baseline.
 * Before = latch OFF. After = latch ON (production ports-via-helpers).
 * Soft-GPU fps not claimed. Picture ON.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  createTacticalAISystem,
  setTacticalAiQuietLatchForBench,
  getTacticalAiQuietLatchForBench,
} from '../src/systems/tacticalAI.js';
import { SIM_TIER } from '../src/world/activityClassification.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF = fileURLToPath(import.meta.url);
const mode = process.argv[2] || 'all';

const ITERS = 20000;
const RUNS = 11;

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[(s.length - 1) >> 1];
}

function stubHelpers(helpers) {
  helpers.aiSensors = {
    frameFor(entityId, tick) {
      return {
        tick,
        self: {
          id: entityId, team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
          radius: 12, hullFraction: 1, energyFraction: 1, heatFraction: 0,
          disabled: false, tethered: false, capabilities: ['drive', 'weapon', 'ranged'],
          subsystemFractions: {}, activity: null, roe: 'weapons_free', combatDoctrineId: null,
        },
        contacts: [], events: [],
      };
    },
  };
  helpers.aiRoster = { listSquads() { return []; }, liveListSquads() { return []; } };
  helpers.aiManeuver = { request(req) { return req; } };
}

function idleActions() {
  return {
    list() { return []; },
    canStart() { return { ok: false, reason: 'idle_fixture' }; },
    start() { return null; },
    status() { return 'idle'; },
    interrupt() { return true; },
  };
}

function boot(nNpc) {
  const state = createGameState(31 + nNpc);
  state.mode = 'flight';
  state.runtime = { profileId: 'production' };
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  stubHelpers(helpers);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 12,
    hull: 100, hullMax: 100, collides: true, team: 1,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  for (let i = 0; i < nNpc; i++) {
    const e = helpers.spawnEntity({
      type: 'ship', pos: { x: 800 + i * 40, z: 200 }, vel: { x: 0, z: 0 }, radius: 8, mass: 10,
      hull: 80, hullMax: 80, collides: true, team: 2,
      data: { ai: true, intent: {} },
    });
    e.activity = {
      simTier: SIM_TIER.S3_DORMANT,
      nextEventAtT: 1e9,
      pinnedExact: false,
    };
  }
  if (state.entityIndex) state.entityIndex.ready = true;
  const tactical = createTacticalAISystem({ actionPortFactory: idleActions });
  tactical.init({ state, bus, helpers, registry: null });
  return { state, tactical };
}

function restamp(state) {
  const t = (state.simTime || 0) + 1e9;
  for (const e of state.entityList) {
    if (e && e.id !== state.playerId && e.type === 'ship') {
      e.activity = { simTier: SIM_TIER.S3_DORMANT, nextEventAtT: t, pinnedExact: false };
    }
  }
}

function runPairs(nNpc) {
  const pairs = [];
  for (let r = 0; r < RUNS; r++) {
    const { state, tactical } = boot(nNpc);
    // Warm classify once so far NPCs settle dormant; do not fight classify each tick.
    setTacticalAiQuietLatchForBench(false);
    for (let i = 0; i < 90; i++) {
      state.tick++; state.simTime = (state.simTime || 0) + 1 / 60;
      tactical.update(1 / 60, state);
    }
    // Re-assert far dormant after warm (classify may have stamped; keep no-think).
    restamp(state);
    for (let i = 0; i < 30; i++) {
      state.tick++; state.simTime = (state.simTime || 0) + 1 / 60;
      restamp(state);
      tactical.update(1 / 60, state);
    }
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      state.tick++; state.simTime = (state.simTime || 0) + 1 / 60;
      restamp(state);
      tactical.update(1 / 60, state);
    }
    const before = performance.now() - t0;

    setTacticalAiQuietLatchForBench(true);
    restamp(state);
    for (let i = 0; i < 60; i++) {
      state.tick++; state.simTime = (state.simTime || 0) + 1 / 60;
      restamp(state);
      tactical.update(1 / 60, state);
    }
    const t1 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      state.tick++; state.simTime = (state.simTime || 0) + 1 / 60;
      restamp(state);
      tactical.update(1 / 60, state);
    }
    const after = performance.now() - t1;
    pairs.push(before / Math.max(1e-9, after));
    setTacticalAiQuietLatchForBench(true);
  }
  return pairs;
}

function dirtyWakeOk() {
  const { state, tactical, } = (() => {
    const b = boot(0);
    return b;
  })();
  setTacticalAiQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++; state.simTime = (state.simTime || 0) + 1 / 60;
    tactical.update(1 / 60, state);
  }
  if (!(state.tacticalAiRuntime && state.tacticalAiRuntime.quietLatched)) return false;
  // Spawn hostile without activity → must wake
  const helpers = {};
  // get helpers from tactical via re-boot with spawn
  const bus = createBus();
  // Use entityList push via core helpers — re-boot properly
  const full = boot(0);
  setTacticalAiQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    full.state.tick++; full.state.simTime = (full.state.simTime || 0) + 1 / 60;
    full.tactical.update(1 / 60, full.state);
  }
  if (!(full.state.tacticalAiRuntime && full.state.tacticalAiRuntime.quietLatched)) return false;
  // Access helpers through a fresh boot that keeps helpers
  return true;
}

function dirtyWakeDetailed() {
  const state = createGameState(99);
  state.mode = 'flight';
  state.runtime = { profileId: 'production' };
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  stubHelpers(helpers);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 12,
    hull: 100, hullMax: 100, collides: true, team: 1,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  if (state.entityIndex) state.entityIndex.ready = true;
  const tactical = createTacticalAISystem({ actionPortFactory: idleActions });
  tactical.init({ state, bus, helpers, registry: null });
  setTacticalAiQuietLatchForBench(true);
  for (let i = 0; i < 5; i++) {
    state.tick++; state.simTime = (state.simTime || 0) + 1 / 60;
    tactical.update(1 / 60, state);
  }
  const latched = !!(state.tacticalAiRuntime && state.tacticalAiRuntime.quietLatched);
  const hostile = helpers.spawnEntity({
    type: 'ship', pos: { x: 50, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 10,
    hull: 80, hullMax: 80, collides: true, team: 2,
    data: { ai: true, intent: {} },
  });
  state.tick++; state.simTime = (state.simTime || 0) + 1 / 60;
  tactical.update(1 / 60, state);
  const wokeMembership = !(state.tacticalAiRuntime && state.tacticalAiRuntime.quietLatched);

  // Dormant → due (park far so classify keeps S3 / no-think)
  hostile.pos.x = 2500;
  hostile.pos.z = 2500;
  hostile.activity = { simTier: SIM_TIER.S3_DORMANT, nextEventAtT: 1e9, pinnedExact: false };
  for (let i = 0; i < 8; i++) {
    state.tick++; state.simTime = (state.simTime || 0) + 1 / 60;
    hostile.activity = { simTier: SIM_TIER.S3_DORMANT, nextEventAtT: state.simTime + 1e6, pinnedExact: false };
    tactical.update(1 / 60, state);
  }
  const relatched = !!(state.tacticalAiRuntime && state.tacticalAiRuntime.quietLatched);
  hostile.activity = { simTier: SIM_TIER.S0_EXACT, nextEventAtT: -1, pinnedExact: true };
  state.tick++; state.simTime = (state.simTime || 0) + 1 / 60;
  tactical.update(1 / 60, state);
  const wokeThink = !(state.tacticalAiRuntime && state.tacticalAiRuntime.quietLatched);

  setTacticalAiQuietLatchForBench(false);
  for (let i = 0; i < 3; i++) {
    state.tick++; state.simTime = (state.simTime || 0) + 1 / 60;
    tactical.update(1 / 60, state);
  }
  const offRefuses = !(state.tacticalAiRuntime && state.tacticalAiRuntime.quietLatched);
  setTacticalAiQuietLatchForBench(true);

  return {
    dirtyWakeOk: latched && wokeMembership && relatched && wokeThink && offRefuses,
    latched, wokeMembership, relatched, wokeThink, offRefuses,
  };
}

function summarize(name, pairs, extra = {}) {
  return {
    name,
    medianSpeedup: +median(pairs).toFixed(3),
    minSpeedup: +Math.min(...pairs).toFixed(3),
    maxSpeedup: +Math.max(...pairs).toFixed(3),
    pairs: pairs.map((x) => +x.toFixed(3)),
    ...extra,
  };
}

if (mode === 'worker') {
  const nNpc = Number(process.argv[3] || 0);
  const pairs = runPairs(nNpc);
  const wake = dirtyWakeDetailed();
  const out = summarize(`tactical-ai-quiet-latch@npc${nNpc}`, pairs, wake);
  writeFileSync(process.argv[4], JSON.stringify(out));
  process.exit(0);
}

function isolated(nNpc, label) {
  const outPath = join(ROOT, 'artifacts', `tactical-ai-quiet-latch-${label}.json.tmp`);
  const r = spawnSync(process.execPath, [SELF, 'worker', String(nNpc), outPath], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error(`worker failed status=${r.status}`);
  }
  const raw = JSON.parse(awaitImportFs(outPath));
  renameSync(outPath, outPath.replace(/\.tmp$/, ''));
  return raw;
}

function awaitImportFs(p) {
  return require('fs').readFileSync(p, 'utf8');
}

import { readFileSync } from 'node:fs';

function isolated2(nNpc, label) {
  const outPath = join(ROOT, 'artifacts', `tactical-ai-quiet-latch-${label}.json.tmp`);
  const r = spawnSync(process.execPath, [SELF, 'worker', String(nNpc), outPath], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error(`worker failed status=${r.status}`);
  }
  const raw = JSON.parse(readFileSync(outPath, 'utf8'));
  renameSync(outPath, join(ROOT, 'artifacts', `tactical-ai-quiet-latch-${label}.json`));
  return raw;
}

const primary0 = isolated2(0, 'primary-npc0');
const primary12 = isolated2(12, 'primary-npc12');
const floorRuns = [];
for (let i = 1; i <= 5; i++) {
  floorRuns.push(isolated2(0, `rebench${i}`));
}
const floorSummary = {
  medians: floorRuns.map((r) => r.medianSpeedup),
  mins: floorRuns.map((r) => r.minSpeedup),
  packageFloorMin: Math.min(...floorRuns.map((r) => r.minSpeedup)),
  packageMedianRange: [Math.min(...floorRuns.map((r) => r.medianSpeedup)), Math.max(...floorRuns.map((r) => r.medianSpeedup))],
  dirtyWakeOk: floorRuns.every((r) => r.dirtyWakeOk),
};

const out = {
  primary0,
  primary12,
  floorRuns,
  floorSummary,
  latchDefault: getTacticalAiQuietLatchForBench(),
};
console.log(JSON.stringify(out, null, 2));
writeFileSync(join(ROOT, 'artifacts/tactical-ai-quiet-latch-microbench.json'), JSON.stringify(out, null, 2));
writeFileSync(join(ROOT, 'artifacts/tactical-ai-quiet-latch-floor-summary.json'), JSON.stringify(floorSummary, null, 2));
