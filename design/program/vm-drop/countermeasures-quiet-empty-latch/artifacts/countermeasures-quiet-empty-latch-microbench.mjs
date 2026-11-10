/**
 * Primary KPI: quiet countermeasures update when no CM/PDS interest.
 * Before = latch OFF (4 ships walks every tick).
 * After  = latch ON (membership check only while latched).
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync, renameSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  countermeasures,
  setCountermeasuresQuietLatchForBench,
} from '../src/systems/countermeasures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF = fileURLToPath(import.meta.url);
const mode = process.argv[2] || 'all';

const SHIPS = 64;
const ITERS = 60000;
const RUNS = 11;

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
      pos: { x: i * 10, z: i * 3 },
      data: { fittings: i === 0 ? ['mod_cargo_hold_s'] : [], combat: {} },
    });
  }
  ships[0].isPlayer = true;
  const entities = new Map(ships.map((s) => [s.id, s]));
  return {
    mode: 'flight',
    tick: 1,
    simTime: 1,
    playerId: 1,
    entities,
    entityList: ships,
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      version: 1,
      ships,
      projectiles: [],
    },
    input: {},
    ui: { screenStack: [] },
    _ships: ships,
  };
}

function makeHost() {
  const host = Object.create(countermeasures);
  host.init({ state: null, bus: { emit() {} }, helpers: {} });
  return host;
}

function warm(host, state, latchOn) {
  setCountermeasuresQuietLatchForBench(latchOn);
  host.state = state;
  for (let i = 0; i < 5; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    host.update(1 / 60, state);
  }
}

function benchPair() {
  const pairs = [];
  let wakeDeploy = null;
  let wakeMember = null;
  for (let r = 0; r < RUNS; r++) {
    const hostB = makeHost();
    const sB = makeState();
    warm(hostB, sB, false);
    setCountermeasuresQuietLatchForBench(false);
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      sB.tick++;
      sB.simTime += 1 / 60;
      hostB.update(1 / 60, sB);
    }
    const beforeMs = performance.now() - t0;

    const hostA = makeHost();
    const sA = makeState();
    warm(hostA, sA, true);
    setCountermeasuresQuietLatchForBench(true);
    const t1 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      sA.tick++;
      sA.simTime += 1 / 60;
      hostA.update(1 / 60, sA);
    }
    const afterMs = performance.now() - t1;
    pairs.push(beforeMs / Math.max(1e-9, afterMs));

    if (r === 0) {
      // dirty-wake: deploy edge forces full path (clears latch even if no CM fitted)
      sA.input.deployCountermeasure = true;
      sA.tick++; sA.simTime += 1 / 60;
      hostA.update(1 / 60, sA);
      wakeDeploy = {
        quietLatched: !!(sA.countermeasureRuntime && sA.countermeasureRuntime.quietLatched),
        cmQuiet: hostA._cmQuiet,
      };
      // re-latch
      sA.input.deployCountermeasure = false;
      for (let i = 0; i < 4; i++) {
        sA.tick++; sA.simTime += 1 / 60;
        hostA.update(1 / 60, sA);
      }
      const latched = !!(sA.countermeasureRuntime && sA.countermeasureRuntime.quietLatched);
      // membership wake: new ship with ECM fitted
      sA.entityIndex.version++;
      const newbie = {
        id: 900, type: 'ship', alive: true, pos: { x: 0, z: 0 },
        data: { fittings: ['mod_ecm_jammer_l'], combat: {} },
      };
      sA.entityIndex.ships.push(newbie);
      sA.entities.set(900, newbie);
      sA.tick++; sA.simTime += 1 / 60;
      hostA.update(1 / 60, sA);
      wakeMember = {
        wasLatched: latched,
        quietLatched: !!(sA.countermeasureRuntime && sA.countermeasureRuntime.quietLatched),
        cmQuiet: hostA._cmQuiet,
      };
    }
  }
  return {
    medianSpeedup: +median(pairs).toFixed(3),
    minSpeedup: +Math.min(...pairs).toFixed(3),
    maxSpeedup: +Math.max(...pairs).toFixed(3),
    pairs: pairs.map((x) => +x.toFixed(3)),
    wakeDeploy,
    wakeMember,
  };
}

if (mode === 'worker') {
  const result = benchPair();
  const outPath = process.argv[3];
  writeFileSync(outPath + '.tmp', JSON.stringify(result));
  renameSync(outPath + '.tmp', outPath);
  process.exit(0);
}

if (mode === 'primary' || mode === 'all') {
  const primary = benchPair();
  console.log(JSON.stringify(primary, null, 2));
  writeFileSync(join(ROOT, 'artifacts/countermeasures-quiet-empty-latch-microbench.json'), JSON.stringify(primary, null, 2));
}

if (mode === 'floor' || mode === 'all') {
  const floors = [];
  for (let i = 1; i <= 5; i++) {
    const outPath = join(ROOT, `artifacts/countermeasures-quiet-empty-latch-rebench${i}.json`);
    const r = spawnSync(process.execPath, [SELF, 'worker', outPath], {
      cwd: ROOT, encoding: 'utf8', timeout: 180000,
    });
    if (r.status !== 0) {
      console.error('fail', i, r.stderr || r.stdout);
      process.exit(1);
    }
    const j = JSON.parse(readFileSync(outPath, 'utf8'));
    floors.push(j);
    console.log(`rebench${i}`, j.medianSpeedup, j.minSpeedup);
  }
  const summary = {
    packageMedians: floors.map((f) => f.medianSpeedup),
    packageMins: floors.map((f) => f.minSpeedup),
    floorMinSpeedup: Math.min(...floors.map((f) => f.minSpeedup)),
    floorMedianOfMedians: median(floors.map((f) => f.medianSpeedup)),
  };
  console.log(JSON.stringify(summary, null, 2));
  writeFileSync(join(ROOT, 'artifacts/countermeasures-quiet-empty-latch-floor-summary.json'), JSON.stringify(summary, null, 2));
}
