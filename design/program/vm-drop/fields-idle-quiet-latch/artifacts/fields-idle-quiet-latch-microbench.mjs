/**
 * Portable CPU microbench: fields idle quiet latch.
 * Soft-GPU fps not claimed. Picture contract ON / unchanged.
 *
 * Isolated Node child processes per package rebench. Before = latch OFF
 * (idle still pays cadenced discover + publish every tick). After = latch ON.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { FIELD_FLAGS } from '../src/data/fields.js';
import {
  fields,
  setFieldsIdleQuietLatchForBench,
} from '../src/systems/fields.js';

const ITERS = Number(process.env.FIELDS_IDLE_ITERS || 60000);
const PAIRS = Number(process.env.FIELDS_IDLE_PAIRS || 11);
const SHIPS = 64;

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
      pos: { x: i * 40, z: i * 13 },
      rot: 0.1 * i,
      vel: { x: 0, z: 0 },
      flags: {},
      physicsSleeping: i > 3,
      data: {
        ai: { doctrine: i % 19 === 0 ? 'scavenger' : 'patrol' },
        trafficRole: i % 19 === 0 ? 'scavenger' : 'hauler',
      },
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
      aiShips: ships.filter((s) => !s.isPlayer),
      projectiles: [],
      wrecks: [],
      pickups: [],
      payloads: [],
    },
    input: { actions: {} },
    ui: { screenStack: [] },
    planet: { player: { collectorOn: false } },
    fields: null,
  };
}

function makeHost(state) {
  const host = Object.create(fields);
  host.init({
    state,
    bus: { on() { return () => {}; }, emit() {} },
    helpers: {},
    registry: null,
  });
  return host;
}

function runPair() {
  FIELD_FLAGS.enabled = true;
  const stateOff = makeState();
  const hostOff = makeHost(stateOff);
  setFieldsIdleQuietLatchForBench(false);
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
  setFieldsIdleQuietLatchForBench(true);
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
  const latched = !!(stateOn.fieldsRuntime && stateOn.fieldsRuntime.quietLatched);

  // Dirty-wake: bump membership → unlatch window runs discover.
  const memBefore = hostOn._fieldsIdleQuiet && hostOn._fieldsIdleQuiet.membership;
  stateOn.entityIndex.version++;
  stateOn.tick++;
  hostOn.update(1 / 60, stateOn);
  const woke = !(hostOn._fieldsIdleQuiet && hostOn._fieldsIdleQuiet.membership === memBefore
    && hostOn._fieldsIdleQuiet.armedTick < stateOn.tick - 1);

  return {
    offMs: +offMs.toFixed(3),
    onMs: +onMs.toFixed(3),
    speedup: +speedup.toFixed(3),
    latched,
    wokeOnMembership: woke,
  };
}

function main() {
  if (process.env.FIELDS_IDLE_WORKER === '1') {
    const one = runPair();
    process.stdout.write(JSON.stringify(one));
    return;
  }
  const pairs = [];
  for (let i = 0; i < PAIRS; i++) {
    const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname], {
      env: { ...process.env, FIELDS_IDLE_WORKER: '1' },
      encoding: 'utf8',
    });
    if (r.status !== 0) {
      console.error(r.stderr || r.stdout);
      process.exit(r.status || 1);
    }
    pairs.push(JSON.parse(r.stdout.trim()));
  }
  const speedups = pairs.map((p) => p.speedup);
  const result = {
    iters: ITERS,
    pairs: PAIRS,
    ships: SHIPS,
    medianSpeedup: +median(speedups).toFixed(3),
    minSpeedup: +Math.min(...speedups).toFixed(3),
    maxSpeedup: +Math.max(...speedups).toFixed(3),
    pairRows: pairs,
    allLatched: pairs.every((p) => p.latched),
    allWoke: pairs.every((p) => p.wokeOnMembership),
  };
  writeFileSync('artifacts/fields-idle-quiet-latch-microbench.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main();
