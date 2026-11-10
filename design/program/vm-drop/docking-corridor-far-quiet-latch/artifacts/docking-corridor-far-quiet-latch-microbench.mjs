/**
 * Primary KPI: quiet dockingCorridor.update far latch.
 * Before = latch OFF (full station walk + publish every tick).
 * After  = latch ON (skip while far from all docking stations).
 * Soft-GPU fps not claimed.
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
  dockingCorridor,
  setDockingCorridorFarQuietForBench,
} from '../src/systems/dockingCorridor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const mode = process.argv[2] || 'all';

const STATION_R = 1800;
const STATIONS = 3;
const ITERS = 60000;
const RUNS = 11;

function boot() {
  const state = createGameState(29);
  state.mode = 'flight';
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  const stations = [];
  for (let i = 0; i < STATIONS; i++) {
    const ang = (i / STATIONS) * Math.PI * 2;
    stations.push(helpers.spawnEntity({
      type: 'station',
      pos: { x: Math.cos(ang) * STATION_R, z: Math.sin(ang) * STATION_R },
      rot: 0, radius: 120, mass: 1000, hull: 1000, hullMax: 1000, collides: true,
      data: {
        stationId: `mb_st_${i}`,
        collisionProxy: 'station_ring_hub',
        dockRadius: 120,
      },
    }));
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.stations = stations;
    state.entityIndex.dockStations = stations;
    state.entityIndex.version = (state.entityIndex.version | 0) + 1;
  }
  dockingCorridor.init({ state, bus, helpers, registry: null });
  return state;
}

function runOnce() {
  const pairs = [];
  let latched = false;
  let wake = null;
  for (let r = 0; r < RUNS; r++) {
    const stateB = boot();
    setDockingCorridorFarQuietForBench(false);
    for (let i = 0; i < 800; i++) { stateB.tick++; dockingCorridor.update(1 / 60, stateB); }
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) { stateB.tick++; dockingCorridor.update(1 / 60, stateB); }
    const beforeMs = performance.now() - t0;

    const stateA = boot();
    setDockingCorridorFarQuietForBench(true);
    for (let i = 0; i < 800; i++) { stateA.tick++; dockingCorridor.update(1 / 60, stateA); }
    latched = !!(stateA.world && stateA.world.dockingCorridorRuntime && stateA.world.dockingCorridorRuntime.quietLatched);
    const t1 = performance.now();
    for (let i = 0; i < ITERS; i++) { stateA.tick++; dockingCorridor.update(1 / 60, stateA); }
    const afterMs = performance.now() - t1;
    pairs.push({ beforeMs, afterMs, speedup: beforeMs / Math.max(1e-9, afterMs) });
  }

  // Dirty-wake proof on a fresh latched world
  const stateW = boot();
  setDockingCorridorFarQuietForBench(true);
  for (let i = 0; i < 40; i++) { stateW.tick++; dockingCorridor.update(1 / 60, stateW); }
  const beforeWake = !!(stateW.world.dockingCorridorRuntime && stateW.world.dockingCorridorRuntime.quietLatched);
  const player = stateW.entities.get(stateW.playerId);
  player.pos.x = 250;
  stateW.tick++;
  dockingCorridor.update(1 / 60, stateW);
  // Move near a station so re-probe cannot re-arm
  const st = stateW.entityIndex.stations[0];
  player.pos.x = st.pos.x + 60;
  player.pos.z = st.pos.z;
  stateW.entityIndex.version++;
  stateW.tick++;
  dockingCorridor.update(1 / 60, stateW);
  const afterApproach = !!(stateW.world.dockingCorridorRuntime && stateW.world.dockingCorridorRuntime.quietLatched);
  wake = {
    beforeWake,
    afterApproachLatched: afterApproach,
    distCenter: stateW.dockingCorridor && stateW.dockingCorridor.distCenter,
    dirtyWakeOk: beforeWake === true && afterApproach === false && stateW.dockingCorridor.distCenter < 200,
  };

  const speedups = pairs.map((p) => p.speedup).sort((a, b) => a - b);
  const med = speedups[(speedups.length - 1) >> 1];
  return {
    name: 'docking-corridor-far-quiet-latch',
    iters: ITERS,
    stations: STATIONS,
    stationR: STATION_R,
    medianSpeedup: +med.toFixed(3),
    minSpeedup: +Math.min(...speedups).toFixed(3),
    maxSpeedup: +Math.max(...speedups).toFixed(3),
    pairs: speedups.map((x) => +x.toFixed(3)),
    latched,
    wake,
  };
}

function isolated() {
  const script = join(__dirname, 'docking-corridor-far-quiet-latch-microbench.mjs');
  const r = spawnSync(process.execPath, [script, 'once'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status || 1);
  }
  const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop();
  return JSON.parse(line);
}

if (mode === 'once') {
  console.log(JSON.stringify(runOnce()));
} else if (mode === 'floor') {
  const runs = [];
  for (let i = 0; i < 5; i++) {
    const row = isolated();
    runs.push(row);
    console.error(`floor run ${i + 1}: median=${row.medianSpeedup} min=${row.minSpeedup} wake=${row.wake && row.wake.dirtyWakeOk}`);
  }
  const summary = {
    name: 'docking-corridor-far-quiet-latch-floor',
    packageRuns: 5,
    medians: runs.map((r) => r.medianSpeedup),
    mins: runs.map((r) => r.minSpeedup),
    floorMinSpeedup: Math.min(...runs.map((r) => r.minSpeedup)),
    medianOfMedians: [...runs.map((r) => r.medianSpeedup)].sort((a, b) => a - b)[(runs.length - 1) >> 1],
    clears15x: Math.min(...runs.map((r) => r.minSpeedup)) >= 1.5,
    dirtyWakeOk: runs.every((r) => r.wake && r.wake.dirtyWakeOk),
    runs,
  };
  writeFileSync(
    join(__dirname, 'docking-corridor-far-quiet-latch-floor-summary.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} else {
  // primary in-process + one isolated cite
  const primary = runOnce();
  writeFileSync(
    join(__dirname, 'docking-corridor-far-quiet-latch-microbench.json'),
    JSON.stringify(primary, null, 2),
  );
  console.log(JSON.stringify(primary, null, 2));
}
