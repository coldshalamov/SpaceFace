/**
 * Primary KPI: StuntFlightObserver.update residual under registry.step after #49+#40.
 * Before = bench toggle off (always record nearby-body history every tick).
 * After  = quiet history skip (no history while tracks empty + no projectiles;
 *          odd quiet ticks also skip bodyLife). Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');

function seedWorld({ nShips = 120, nDyn = 40 } = {}) {
  const entities = new Map();
  const ships = [];
  const drones = [];
  const projectiles = [];
  const movables = [];
  const spatialDynamics = [];
  let id = 1;
  const player = {
    id: id++, type: 'ship', alive: true, isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 },
    mass: 18, radius: 6, hull: 100, hullMax: 100,
    data: { defId: 'ship_kestrel' },
    collides: true,
  };
  entities.set(player.id, player);
  ships.push(player);
  movables.push(player);
  spatialDynamics.push(player);
  for (let i = 0; i < nShips; i++) {
    const e = {
      id: id++, type: 'ship', alive: true, team: 1,
      pos: { x: ((i * 97) % 5000) - 2500, z: ((i * 53) % 5000) - 2500 },
      vel: { x: (i % 5) - 2, z: (i % 3) - 1 },
      mass: 14, radius: 5, hull: 80, hullMax: 80,
      data: { ai: { passive: true }, combat: {} },
      collides: true,
    };
    entities.set(e.id, e);
    ships.push(e);
    movables.push(e);
    spatialDynamics.push(e);
  }
  for (let i = 0; i < nDyn; i++) {
    const e = {
      id: id++, type: 'asteroid', alive: true,
      pos: { x: ((i * 41) % 800) - 400, z: ((i * 37) % 800) - 400 },
      vel: { x: 0.2, z: -0.1 },
      mass: 40, radius: 8, hull: 50, hullMax: 50,
      data: {}, collides: true,
    };
    entities.set(e.id, e);
    movables.push(e);
    spatialDynamics.push(e);
  }
  return {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: player.id,
    entities,
    entityList: [...entities.values()],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      ships,
      drones,
      projectiles,
      shipLike: ships,
      movables,
      spatialDynamics,
      collidables: movables,
    },
    input: {},
    settings: {},
    combat: {},
  };
}

async function runChild(mode, ticks) {
  const { bindStuntEvidence, unbindStuntEvidence } = await import('../src/combat/stuntEvidence.js');
  const {
    StuntFlightObserver,
    setStuntFlightHistoryQuietSkipForBench,
  } = await import('../src/combat/stuntFlightEvidence.js');

  const state = seedWorld();
  bindStuntEvidence(state);
  const observer = new StuntFlightObserver();
  setStuntFlightHistoryQuietSkipForBench(mode === 'after');

  for (let t = 0; t < 60; t++) {
    state.tick = t;
    state.simTime = t / 60;
    observer.update(state);
  }

  const t0 = performance.now();
  for (let t = 0; t < ticks; t++) {
    state.tick = 1000 + t;
    state.simTime = state.tick / 60;
    observer.update(state);
  }
  const wall = performance.now() - t0;
  unbindStuntEvidence(state);
  setStuntFlightHistoryQuietSkipForBench(true);
  return { wall, histLen: observer.history.length, tracks: observer.tracks.size };
}

const mode = process.argv[2];
const ticks = Number(process.argv[3] || 8000);
if (mode === 'before' || mode === 'after') {
  const r = await runChild(mode, ticks);
  process.stdout.write(JSON.stringify(r) + '\n');
  process.exit(0);
}

const RUNS = 7;
const TICKS = 8000;
const befores = [];
const afters = [];
for (let i = 0; i < RUNS; i++) {
  for (const m of ['before', 'after']) {
    const r = spawnSync(process.execPath, [__filename, m, String(TICKS)], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    if (r.status !== 0) {
      console.error(r.stderr || r.stdout);
      process.exit(1);
    }
    const j = JSON.parse(r.stdout.trim().split('\n').pop());
    (m === 'before' ? befores : afters).push(j.wall);
  }
}
befores.sort((a, b) => a - b);
afters.sort((a, b) => a - b);
const med = (a) => a[Math.floor(a.length / 2)];
const beforeMed = med(befores);
const afterMed = med(afters);
const paired = [];
for (let i = 0; i < RUNS; i++) paired.push(befores[i] / afters[i]);
paired.sort((a, b) => a - b);
const out = {
  label: 'stunt-flight-history-quiet-skip',
  nShips: 120,
  nDynNear: 40,
  ticks: TICKS,
  isolatedPairs: RUNS,
  beforeMedMs: +beforeMed.toFixed(3),
  afterMedMs: +afterMed.toFixed(3),
  minSpeedup: +paired[0].toFixed(3),
  medSpeedup: +(beforeMed / afterMed).toFixed(3),
  maxSpeedup: +paired[paired.length - 1].toFixed(3),
  beforeRuns: befores.map((x) => +x.toFixed(2)),
  afterRuns: afters.map((x) => +x.toFixed(2)),
  primary: `~${(beforeMed / afterMed).toFixed(2)}×`,
  ship_bar: 1.5,
  clears_bar: beforeMed / afterMed >= 1.5 && paired[0] >= 1.5,
};
console.log(JSON.stringify(out, null, 2));
writeFileSync(join(dirname(__filename), 'stunt-flight-history-quiet-skip-microbench.json'), JSON.stringify(out, null, 2));
