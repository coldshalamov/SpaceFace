/**
 * Portable CPU microbench: outlaw catch-nets empty quiet latch.
 * Soft-GPU fps not claimed. Picture contract ON / unchanged.
 *
 * Before = latch OFF (non-jettisoned payloads still pay payloads+shipLike census).
 * After  = latch ON (skip census while no nets and no jettisoned pods).
 * Isolated Node child processes per package rebench.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF = fileURLToPath(import.meta.url);
const mode = process.argv[2] || 'all';

const SHIPS = 48;
const PAYLOADS = 16; // non-jettisoned — forces residual census (empty-payloads early-out does not fire)
const ITERS = Number(process.env.CATCH_NETS_ITERS || 60000);
const RUNS = Number(process.env.CATCH_NETS_PAIRS || 11);

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[(s.length - 1) >> 1];
}

function childScript(latchOn) {
  return `
import { performance } from 'node:perf_hooks';
import { createGameState } from './src/core/gameState.js';
import { createBus } from './src/core/eventBus.js';
import { core } from './src/core/coreSystem.js';
import {
  lootShards,
  setCatchNetsEmptyQuietLatchForBench,
  isJettisonedCargoPod,
  isOutlawCatchNet,
} from './src/systems/lootShards.js';

const SHIPS = ${SHIPS};
const PAYLOADS = ${PAYLOADS};
const ITERS = ${ITERS};

const state = createGameState(146);
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
const payloads = [];
for (let i = 0; i < PAYLOADS; i++) {
  payloads.push(helpers.spawnEntity({
    type: 'payload',
    pos: { x: 300 + i * 15, z: -200 },
    radius: 4, mass: 5, hull: 1, hullMax: 1, collides: true,
    data: { commodityId: 'ore_iron', amount: 2, payloadType: 'civilian_manifest' },
  }));
}
if (state.entityIndex) {
  state.entityIndex.ready = true;
  state.entityIndex.__spacefaceEntityIndexV1 = true;
  state.entityIndex.ships = ships;
  state.entityIndex.shipLike = ships;
  state.entityIndex.stations = [];
  state.entityIndex.wrecks = [];
  state.entityIndex.payloads = payloads;
  state.entityIndex.pickups = [];
  state.entityIndex.version = 1;
}
lootShards.init({ state, bus, helpers, registry: null });
setCatchNetsEmptyQuietLatchForBench(${latchOn ? 'true' : 'false'});

// Warm
for (let i = 0; i < 400; i++) {
  state.tick++;
  lootShards.update(1 / 60, state);
}
if (typeof gc === 'function') gc();

const t0 = performance.now();
for (let i = 0; i < ITERS; i++) {
  state.tick++;
  lootShards.update(1 / 60, state);
}
const ms = performance.now() - t0;

// Checksums: no nets/pods classified; latch state matches mode.
let netCount = 0, podCount = 0;
for (const e of payloads) {
  if (isOutlawCatchNet(e)) netCount++;
  if (isJettisonedCargoPod(e)) podCount++;
}
for (const e of ships) {
  if (isOutlawCatchNet(e)) netCount++;
}
const latched = !!(state.lootShardsRuntime && state.lootShardsRuntime.catchNetsQuietLatched);
console.log(JSON.stringify({
  ms, netCount, podCount, latched, latchOn: ${latchOn ? 'true' : 'false'},
  quiet: lootShards._catchNetsQuiet || null,
}));
`;
}

function runOnce(latchOn) {
  const r = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', childScript(latchOn)], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`child failed (${latchOn}): ${r.stderr || r.stdout}`);
  }
  const line = r.stdout.trim().split('\n').pop();
  return JSON.parse(line);
}

function runPairs() {
  const pairs = [];
  for (let i = 0; i < RUNS; i++) {
    const before = runOnce(false);
    const after = runOnce(true);
    if (before.netCount !== 0 || before.podCount !== 0 || after.netCount !== 0 || after.podCount !== 0) {
      throw new Error('checksum: unexpected nets/pods');
    }
    if (after.latched !== true) throw new Error('after must latch');
    const speedup = before.ms / after.ms;
    pairs.push({
      beforeMs: +before.ms.toFixed(3),
      afterMs: +after.ms.toFixed(3),
      speedup: +speedup.toFixed(3),
    });
  }
  const speedups = pairs.map((p) => p.speedup);
  return {
    name: 'catch-nets-empty-quiet-latch',
    iters: ITERS,
    ships: SHIPS,
    payloads: PAYLOADS,
    pairs,
    medianSpeedup: +median(speedups).toFixed(3),
    minSpeedup: +Math.min(...speedups).toFixed(3),
    maxSpeedup: +Math.max(...speedups).toFixed(3),
  };
}

function dirtyWake() {
  const script = `
import { createGameState } from './src/core/gameState.js';
import { createBus } from './src/core/eventBus.js';
import { core } from './src/core/coreSystem.js';
import {
  lootShards,
  setCatchNetsEmptyQuietLatchForBench,
} from './src/systems/lootShards.js';

const state = createGameState(1461);
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
const payloads = [];
for (let i = 0; i < 8; i++) {
  payloads.push(helpers.spawnEntity({
    type: 'payload', pos: { x: 20 + i, z: -20 }, radius: 4, mass: 5, hull: 1, hullMax: 1,
    collides: true, data: { payloadType: 'civilian_manifest', commodityId: 'ore_iron', amount: 1 },
  }));
}
if (state.entityIndex) {
  state.entityIndex.ready = true;
  state.entityIndex.__spacefaceEntityIndexV1 = true;
  state.entityIndex.ships = ships;
  state.entityIndex.shipLike = ships;
  state.entityIndex.payloads = payloads;
  state.entityIndex.stations = [];
  state.entityIndex.wrecks = [];
  state.entityIndex.pickups = [];
  state.entityIndex.version = 1;
}
lootShards.init({ state, bus, helpers, registry: null });
setCatchNetsEmptyQuietLatchForBench(true);
for (let i = 0; i < 5; i++) { state.tick++; lootShards.update(1/60, state); }
const armed = !!(state.lootShardsRuntime && state.lootShardsRuntime.catchNetsQuietLatched);
const net = helpers.spawnEntity({
  type: 'payload', pos: { x: 5, z: 5 }, radius: 8, mass: 10, hull: 1, hullMax: 1, collides: true,
  data: { outlawCatchNet: true, payloadType: 'outlaw_catch_net' },
});
payloads.push(net);
state.entityIndex.payloads = payloads;
state.entityIndex.version = (state.entityIndex.version | 0) + 1;
for (let i = 0; i < 3; i++) { state.tick++; lootShards.update(1/60, state); }
const afterNet = state.lootShardsRuntime && state.lootShardsRuntime.catchNetsQuietLatched;
const pod = helpers.spawnEntity({
  type: 'payload', pos: { x: 6, z: 5 }, radius: 4, mass: 20, hull: 1, hullMax: 1, collides: true,
  data: { payloadType: 'jettisoned_cargo', commodityId: 'ore_iron', amount: 2 },
});
payloads.push(pod);
state.entityIndex.payloads = payloads;
state.entityIndex.version = (state.entityIndex.version | 0) + 1;
for (let i = 0; i < 3; i++) { state.tick++; lootShards.update(1/60, state); }
const afterBoth = state.lootShardsRuntime && state.lootShardsRuntime.catchNetsQuietLatched;
const caught = !!(pod.data && pod.data.caughtByNet);
console.log(JSON.stringify({ armed, afterNet, afterBoth, caught, dirtyWakeOk: armed === true && afterBoth === false && caught === true }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(`dirtyWake failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

if (mode === 'primary' || mode === 'all') {
  const primary = runPairs();
  console.log(JSON.stringify(primary, null, 2));
  writeFileSync(join(ROOT, 'artifacts/catch-nets-empty-quiet-latch-microbench.json'), JSON.stringify(primary, null, 2));
  if (mode === 'all') {
    const wake = dirtyWake();
    console.log('dirtyWake', JSON.stringify(wake));
    primary.dirtyWake = wake;
    writeFileSync(join(ROOT, 'artifacts/catch-nets-empty-quiet-latch-microbench.json'), JSON.stringify(primary, null, 2));
  }
} else if (mode === 'wake') {
  console.log(JSON.stringify(dirtyWake(), null, 2));
} else if (mode === 'floor') {
  // 5 isolated 11-pair floors
  const floors = [];
  for (let f = 0; f < 5; f++) {
    const r = runPairs();
    floors.push({ medianSpeedup: r.medianSpeedup, minSpeedup: r.minSpeedup, maxSpeedup: r.maxSpeedup });
    console.log('floor', f + 1, r.medianSpeedup, r.minSpeedup);
  }
  const summary = {
    name: 'catch-nets-empty-quiet-latch-floor',
    floors,
    medianOfMedians: +median(floors.map((x) => x.medianSpeedup)).toFixed(3),
    floorMin: +Math.min(...floors.map((x) => x.minSpeedup)).toFixed(3),
  };
  writeFileSync(join(ROOT, 'artifacts/catch-nets-empty-quiet-latch-floor-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
