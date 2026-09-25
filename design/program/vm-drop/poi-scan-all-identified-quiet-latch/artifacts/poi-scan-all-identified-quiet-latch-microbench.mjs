/**
 * Primary KPI: _tickPOIScan when all POIs already identified.
 * Before = latch OFF (walk carriers every tick).
 * After  = latch ON (skip; wake on sector/length/rescan).
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
  world,
  setPoiScanAllIdentifiedQuietForBench,
} from '../src/systems/world.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] || 'all';

const ITERS = 60000;
const RUNS = 11;

function boot({ poiCount = 24, allIdentified = true, oneUnidentified = false } = {}) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.meta.seed = 4242;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  world.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;

  const sectorId = 'sector_bench_poi';
  state.world.currentSectorId = sectorId;
  state.world.discovery = { [sectorId]: { discovered: true, visitedCount: 1, pois: {}, fieldsDepleted: {} } };
  const pois = [];
  for (let i = 0; i < poiCount; i++) {
    const poiId = `poi_${i}`;
    const identified = allIdentified && !(oneUnidentified && i === poiCount - 1);
    state.world.discovery[sectorId].pois[poiId] = { discovered: true, identified, name: poiId };
    const ent = helpers.spawnEntity({
      type: 'beacon',
      pos: { x: 300 + i * 50, z: 200 },
      vel: { x: 0, z: 0 },
      radius: 4,
      collides: false,
    });
    ent.data = { name: poiId, scanRange: 400, poi: true };
    pois.push({ id: ent.id, poiId, type: 'beacon', name: poiId });
  }
  state.world.activeSector = { id: sectorId, stations: [], fields: [], hazards: [], pois, gates: [] };
  return { state, player, pois };
}

function timeLatch(enabled, opts) {
  setPoiScanAllIdentifiedQuietForBench(enabled);
  const { state } = boot(opts);
  // warm / arm
  for (let i = 0; i < 200; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    world._tickPOIScan(state);
  }
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    world._tickPOIScan(state);
  }
  return performance.now() - t0;
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[(s.length - 1) >> 1];
}

function benchScenario(name, opts) {
  const pairs = [];
  for (let r = 0; r < RUNS; r++) {
    const before = timeLatch(false, opts);
    const after = timeLatch(true, opts);
    pairs.push(before / Math.max(1e-9, after));
  }
  return {
    name,
    medianSpeedup: +median(pairs).toFixed(3),
    minSpeedup: +Math.min(...pairs).toFixed(3),
    maxSpeedup: +Math.max(...pairs).toFixed(3),
    pairs: pairs.map((x) => +x.toFixed(3)),
  };
}

function runPrimary() {
  const results = [
    benchScenario('poi-scan-all-identified', { poiCount: 24, allIdentified: true }),
    benchScenario('poi-scan-one-unidentified', { poiCount: 24, allIdentified: true, oneUnidentified: true }),
    benchScenario('poi-scan-ceres-scale-4', { poiCount: 4, allIdentified: true }),
  ];
  console.log(JSON.stringify(results, null, 2));
  writeFileSync(join(__dirname, 'poi-scan-all-identified-quiet-latch-microbench.json'), JSON.stringify(results, null, 2));
  return results;
}

function runWorker() {
  // child mode: one scenario pair dump for floor capture
  const scenario = process.argv[3] || 'poi-scan-all-identified';
  const opts = scenario === 'poi-scan-ceres-scale-4'
    ? { poiCount: 4, allIdentified: true }
    : scenario === 'poi-scan-one-unidentified'
      ? { poiCount: 24, allIdentified: true, oneUnidentified: true }
      : { poiCount: 24, allIdentified: true };
  const before = timeLatch(false, opts);
  const after = timeLatch(true, opts);
  const out = { scenario, beforeMs: before, afterMs: after, speedup: before / Math.max(1e-9, after) };
  console.log(JSON.stringify(out));
}

function runFloor() {
  const self = fileURLToPath(import.meta.url);
  const pairs = [];
  for (let i = 0; i < 11; i++) {
    const r = spawnSync(process.execPath, [self, 'worker', 'poi-scan-all-identified'], {
      encoding: 'utf8',
      cwd: join(__dirname, '..'),
    });
    if (r.status !== 0) {
      console.error(r.stderr || r.stdout);
      process.exit(r.status || 1);
    }
    const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop();
    const row = JSON.parse(line);
    pairs.push(row.speedup);
    console.error(`floor pair ${i + 1}: ${row.speedup.toFixed(3)}×`);
  }
  const summary = {
    name: 'poi-scan-all-identified-floor',
    medianSpeedup: +median(pairs).toFixed(3),
    minSpeedup: +Math.min(...pairs).toFixed(3),
    maxSpeedup: +Math.max(...pairs).toFixed(3),
    pairs: pairs.map((x) => +x.toFixed(3)),
  };
  console.log(JSON.stringify(summary, null, 2));
  writeFileSync(join(__dirname, 'poi-scan-all-identified-quiet-latch-floor-summary.json'), JSON.stringify(summary, null, 2));
}

if (mode === 'worker') runWorker();
else if (mode === 'floor') runFloor();
else runPrimary();
