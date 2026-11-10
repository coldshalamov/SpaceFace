/**
 * Portable CPU microbench: customs scan-cones empty quiet latch.
 * Soft-GPU fps not claimed. Picture contract ON / unchanged.
 *
 * Before = latch OFF (empty still pays forEachJobInteractable + customsScanConeOf census).
 * After  = latch ON (skip census while no scanners and no jettisoned pods).
 * Isolated Node child processes per package rebench.
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
  lawSecurity,
  setCustomsConesEmptyQuietLatchForBench,
  customsScanConeOf,
} from '../src/systems/lawSecurity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF = fileURLToPath(import.meta.url);
const mode = process.argv[2] || 'all';

const SHIPS = 48;
const STATIONS = 4;
const WRECKS = 8;
const PAYLOADS = 8;
const PICKUPS = 12;
const ITERS = Number(process.env.CUSTOMS_CONES_ITERS || 60000);
const RUNS = Number(process.env.CUSTOMS_CONES_PAIRS || 11);

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[(s.length - 1) >> 1];
}

function boot() {
  const state = createGameState(145);
  state.mode = 'flight';
  state.tick = 0;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
  });
  state.playerId = player.id;
  const ships = [player];
  for (let i = 0; i < SHIPS; i++) {
    ships.push(helpers.spawnEntity({
      type: 'ship',
      pos: { x: 100 + i * 20, z: 50 },
      vel: { x: 0, z: 0 },
      radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 1,
      data: { ai: { passive: true } },
    }));
  }
  const stations = [];
  for (let i = 0; i < STATIONS; i++) {
    stations.push(helpers.spawnEntity({
      type: 'station',
      pos: { x: 2000 + i * 400, z: 0 },
      radius: 120, mass: 1000, hull: 1000, hullMax: 1000, collides: true,
      data: { stationId: `st_${i}` },
    }));
  }
  const wrecks = [];
  for (let i = 0; i < WRECKS; i++) {
    wrecks.push(helpers.spawnEntity({
      type: 'wreck',
      pos: { x: -500 - i * 30, z: 200 },
      radius: 10, mass: 20, hull: 1, hullMax: 1, collides: true, data: {},
    }));
  }
  const payloads = [];
  for (let i = 0; i < PAYLOADS; i++) {
    payloads.push(helpers.spawnEntity({
      type: 'payload',
      pos: { x: 300 + i * 15, z: -200 },
      radius: 4, mass: 5, hull: 1, hullMax: 1, collides: true,
      data: { commodityId: 'ore_iron', amount: 2 }, // not jettisoned cargo pod
    }));
  }
  const pickups = [];
  for (let i = 0; i < PICKUPS; i++) {
    pickups.push(helpers.spawnEntity({
      type: 'pickup',
      pos: { x: -100 - i * 10, z: -100 },
      radius: 2, mass: 1, hull: 1, hullMax: 1, collides: true, data: { amount: 1 },
    }));
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    state.entityIndex.__spacefaceEntityIndexV1 = true;
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    state.entityIndex.stations = stations;
    state.entityIndex.wrecks = wrecks;
    state.entityIndex.payloads = payloads;
    state.entityIndex.pickups = pickups;
    state.entityIndex.version = 1;
  }
  lawSecurity.init({ state, bus, helpers, registry: null });
  return { state, bus, helpers };
}

function runOnce() {
  const pairs = [];
  for (let r = 0; r < RUNS; r++) {
    const before = boot();
    setCustomsConesEmptyQuietLatchForBench(false);
    for (let i = 0; i < 400; i++) {
      before.state.tick++;
      lawSecurity.update(1 / 60, before.state);
    }
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      before.state.tick++;
      lawSecurity.update(1 / 60, before.state);
    }
    const beforeMs = performance.now() - t0;

    const after = boot();
    setCustomsConesEmptyQuietLatchForBench(true);
    for (let i = 0; i < 400; i++) {
      after.state.tick++;
      lawSecurity.update(1 / 60, after.state);
    }
    const latched = !!(after.state.lawSecurityRuntime && after.state.lawSecurityRuntime.customsConesQuietLatched);
    const t1 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      after.state.tick++;
      lawSecurity.update(1 / 60, after.state);
    }
    const afterMs = performance.now() - t1;
    pairs.push({ beforeMs, afterMs, speedup: beforeMs / Math.max(1e-9, afterMs), latched });
  }

  // Dirty-wake: spawn a customs scanner → membership bump → latch clears
  const wake = boot();
  setCustomsConesEmptyQuietLatchForBench(true);
  for (let i = 0; i < 40; i++) {
    wake.state.tick++;
    lawSecurity.update(1 / 60, wake.state);
  }
  const beforeWake = !!(wake.state.lawSecurityRuntime && wake.state.lawSecurityRuntime.customsConesQuietLatched);
  const scanner = wake.helpers.spawnEntity({
    type: 'ship',
    pos: { x: 50, z: 50 },
    vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 2,
    data: { customsScanner: true, role: 'customs', defId: 'customs_cutter' },
  });
  wake.state.entityIndex.ships.push(scanner);
  wake.state.entityIndex.shipLike.push(scanner);
  wake.state.entityIndex.version++;
  wake.state.tick++;
  lawSecurity.update(1 / 60, wake.state);
  const afterWakeLatched = !!(wake.state.lawSecurityRuntime && wake.state.lawSecurityRuntime.customsConesQuietLatched);
  const cone = customsScanConeOf(scanner);
  const dirtyWakeOk = beforeWake === true && afterWakeLatched === false && !!cone;

  const speedups = pairs.map((p) => p.speedup);
  return {
    name: 'customs-cones-empty-quiet-latch',
    primary: 'quiet-job-interactable-census-no-scanner-no-pod',
    iters: ITERS,
    runs: RUNS,
    roster: { ships: SHIPS + 1, stations: STATIONS, wrecks: WRECKS, payloads: PAYLOADS, pickups: PICKUPS },
    pairs,
    medianSpeedup: median(speedups),
    minSpeedup: Math.min(...speedups),
    maxSpeedup: Math.max(...speedups),
    dirtyWakeOk,
    note: 'Soft-GPU fps not claimed. Picture unchanged (no cones when empty).',
  };
}

if (mode === 'child') {
  const out = runOnce();
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

function isolated() {
  const r = spawnSync(process.execPath, ['--expose-gc', SELF, 'child'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error(`child failed status=${r.status}`);
  }
  return JSON.parse(r.stdout);
}

const primary = isolated();
writeFileSync(join(__dirname, 'customs-cones-empty-quiet-latch-microbench.json'), JSON.stringify(primary, null, 2));
console.log(JSON.stringify({
  medianSpeedup: primary.medianSpeedup,
  minSpeedup: primary.minSpeedup,
  maxSpeedup: primary.maxSpeedup,
  dirtyWakeOk: primary.dirtyWakeOk,
}, null, 2));
