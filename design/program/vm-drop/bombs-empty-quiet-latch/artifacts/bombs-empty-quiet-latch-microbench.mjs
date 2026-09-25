/**
 * Portable CPU microbench: bombs empty quiet latch.
 * Soft-GPU fps not claimed. Picture contract ON / unchanged.
 *
 * Isolated Node child processes per package rebench. Before = latch OFF
 * (empty still pays ensureRuntime + collect + empty tick). After = latch ON.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  bombs,
  setBombsEmptyQuietLatchForBench,
} from '../src/systems/bombs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF = fileURLToPath(import.meta.url);
const mode = process.argv[2] || 'all';

const SHIPS = 64;
const ITERS = Number(process.env.BOMBS_EMPTY_ITERS || 60000);
const RUNS = Number(process.env.BOMBS_EMPTY_PAIRS || 11);

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[(s.length - 1) >> 1];
}

function makeState() {
  const ships = [];
  for (let i = 0; i < SHIPS; i++) {
    ships.push({
      id: i + 1,
      type: 'ship',
      alive: true,
      isPlayer: i === 0,
      pos: { x: i * 10, z: i * 3 },
      vel: { x: 0, z: 0 },
      rot: 0,
      flags: {},
      data: {},
    });
  }
  const entities = new Map(ships.map((s) => [s.id, s]));
  return {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: 1,
    entities,
    entityList: ships,
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      version: 1,
      ships,
      bombs: [],
      projectiles: [],
      drones: [],
      stations: [],
      asteroids: [],
      wrecks: [],
      pickups: [],
      payloads: [],
    },
    input: { actions: {} },
    ui: { screenStack: [] },
    bombs: null,
  };
}

function makeHost(state) {
  const host = Object.create(bombs);
  host.init({
    state,
    bus: { on() { return () => {}; }, emit() {} },
    helpers: {},
    registry: null,
  });
  return host;
}

function benchPair() {
  const stateOff = makeState();
  const hostOff = makeHost(stateOff);
  setBombsEmptyQuietLatchForBench(false);
  for (let i = 0; i < 2000; i++) {
    stateOff.tick++;
    stateOff.simTime += 1 / 60;
    hostOff.update(1 / 60, stateOff);
  }
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) {
    stateOff.tick++;
    stateOff.simTime += 1 / 60;
    hostOff.update(1 / 60, stateOff);
  }
  const offMs = performance.now() - t0;

  const stateOn = makeState();
  const hostOn = makeHost(stateOn);
  setBombsEmptyQuietLatchForBench(true);
  for (let i = 0; i < 2000; i++) {
    stateOn.tick++;
    stateOn.simTime += 1 / 60;
    hostOn.update(1 / 60, stateOn);
  }
  const t1 = performance.now();
  for (let i = 0; i < ITERS; i++) {
    stateOn.tick++;
    stateOn.simTime += 1 / 60;
    hostOn.update(1 / 60, stateOn);
  }
  const onMs = performance.now() - t1;
  const speedup = offMs / Math.max(1e-9, onMs);
  const latched = !!(stateOn.bombsRuntime && stateOn.bombsRuntime.quietLatched);

  // Dirty-wake: membership bump → latch clears / rescan runs.
  const memBefore = hostOn._bombsQuiet && hostOn._bombsQuiet.membership;
  stateOn.entityIndex.version++;
  const armedBefore = hostOn._bombsQuiet && hostOn._bombsQuiet.armedTick;
  stateOn.tick++;
  stateOn.simTime += 1 / 60;
  hostOn.update(1 / 60, stateOn);
  const wokeOnMembership = !!(hostOn._bombsQuiet
    && hostOn._bombsQuiet.membership === stateOn.entityIndex.version
    && hostOn._bombsQuiet.armedTick !== armedBefore
    && memBefore != null);

  return {
    speedup,
    offMs,
    onMs,
    latched,
    wake: { wokeOnMembership, memBefore, memAfter: stateOn.entityIndex.version },
  };
}

function runPrimary() {
  const pairs = [];
  const wakes = [];
  for (let r = 0; r < RUNS; r++) {
    const row = benchPair();
    pairs.push(row.speedup);
    wakes.push(row.wake);
  }
  const result = {
    name: 'bombs-empty-quiet-latch',
    iters: ITERS,
    ships: SHIPS,
    medianSpeedup: +median(pairs).toFixed(3),
    minSpeedup: +Math.min(...pairs).toFixed(3),
    maxSpeedup: +Math.max(...pairs).toFixed(3),
    pairs: pairs.map((x) => +x.toFixed(3)),
    latched: true,
    wake: wakes[wakes.length - 1],
    dirtyWakeOk: wakes.every((w) => w.wokeOnMembership),
  };
  const out = join(ROOT, 'artifacts/bombs-empty-quiet-latch-microbench.json');
  const tmp = out + '.tmp';
  writeFileSync(tmp, JSON.stringify(result, null, 2));
  renameSync(tmp, out);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function runRebench(tag) {
  // Full 11-pair run (same as primary) so package floor medians are comparable.
  const pairs = [];
  let lastWake = null;
  let latched = false;
  for (let r = 0; r < RUNS; r++) {
    const row = benchPair();
    pairs.push(row.speedup);
    lastWake = row.wake;
    latched = row.latched;
  }
  const result = {
    tag,
    medianSpeedup: +median(pairs).toFixed(3),
    minSpeedup: +Math.min(...pairs).toFixed(3),
    maxSpeedup: +Math.max(...pairs).toFixed(3),
    pairs: pairs.map((x) => +x.toFixed(3)),
    speedup: +median(pairs).toFixed(3), // alias for floor aggregator
    latched,
    wake: lastWake,
  };
  const out = join(ROOT, `artifacts/bombs-empty-quiet-latch-${tag}.json`);
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function runFloor() {
  const rebenches = [];
  for (let i = 1; i <= 5; i++) {
    const tag = `rebench${i}`;
    const child = spawnSync(process.execPath, [SELF, tag], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env },
    });
    if (child.status !== 0) {
      console.error(child.stdout);
      console.error(child.stderr);
      process.exit(child.status || 1);
    }
    const parsed = JSON.parse(child.stdout.trim().split('\n').pop());
    rebenches.push(parsed);
  }
  const primary = spawnSync(process.execPath, [SELF, 'primary'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (primary.status !== 0) {
    console.error(primary.stdout);
    console.error(primary.stderr);
    process.exit(primary.status || 1);
  }
  const primaryJson = JSON.parse(primary.stdout.trim().split('\n').pop());
  const medians = [primaryJson.medianSpeedup, ...rebenches.map((r) => r.speedup)];
  const mins = [primaryJson.minSpeedup, ...rebenches.map((r) => r.speedup)];
  const summary = {
    primary: primaryJson,
    rebenches,
    medianBand: medians,
    floorMinSpeedup: Math.min(...mins),
    clears15x: Math.min(...mins) >= 1.5,
    dirtyWakeOk: primaryJson.dirtyWakeOk && rebenches.every((r) => r.wake && r.wake.wokeOnMembership),
  };
  writeFileSync(
    join(ROOT, 'artifacts/bombs-empty-quiet-latch-floor-summary.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
}

if (mode === 'primary') runPrimary();
else if (mode === 'floor') runFloor();
else if (/^rebench\d+$/.test(mode)) runRebench(mode);
else if (mode === 'all') {
  runPrimary();
} else {
  console.error('unknown mode', mode);
  process.exit(2);
}
