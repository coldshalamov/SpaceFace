/**
 * Portable CPU microbench: sanctuary empty quiet latch.
 * Soft-GPU fps not claimed. Picture contract ON / unchanged.
 *
 * Before = latch OFF (idle armed+unlawful NPCs still pay aiShips walk).
 * After  = latch ON (skip walk while no aggressive chase/fire signal).
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

const SHIPS = 48; // lawful patrols
const PIRATES = 8; // idle unlawful — forces residual walk (no targets)
const ITERS = Number(process.env.SANCTUARY_ITERS || 60000);
const RUNS = Number(process.env.SANCTUARY_PAIRS || 11);

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
  lawSecurity,
  setSanctuaryEmptyQuietLatchForBench,
} from './src/systems/lawSecurity.js';

const SHIPS = ${SHIPS};
const PIRATES = ${PIRATES};
const ITERS = ${ITERS};

const state = createGameState(147);
state.mode = 'flight';
state.tick = 0;
state.world = state.world || {};
state.world.currentSectorId = 'sector_ceres';
const bus = createBus();
const helpers = {};
core.init({ state, bus, helpers, registry: null });

const player = helpers.spawnEntity({
  type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
});
state.playerId = player.id;

helpers.spawnEntity({
  type: 'station', pos: { x: 800, z: 0 }, radius: 80, mass: 1000,
  hull: 1000, hullMax: 1000, collides: true, team: 0,
  factionId: 'faction_dmc',
  data: { stationId: 'station_ceres' },
});

const ships = [player];
const aiShips = [];
for (let i = 0; i < SHIPS; i++) {
  const e = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 100 + i * 20, z: 50 },
    vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 1,
    factionId: 'faction_scn',
    data: { ai: { passive: true, lawful: true }, role: 'patrol' },
  });
  ships.push(e);
  aiShips.push(e);
}
for (let i = 0; i < PIRATES; i++) {
  const e = helpers.spawnEntity({
    type: 'ship',
    pos: { x: -300 - i * 25, z: -200 },
    vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 2,
    factionId: 'faction_reach',
    data: {
      ai: { passive: true, lawful: false, archetype: 'raider' },
      combat: {},
      intent: {},
      role: 'raider',
    },
  });
  ships.push(e);
  aiShips.push(e);
}

if (state.entityIndex) {
  state.entityIndex.ready = true;
  state.entityIndex.__spacefaceEntityIndexV1 = true;
  state.entityIndex.ships = ships;
  state.entityIndex.shipLike = ships;
  state.entityIndex.aiShips = aiShips;
  state.entityIndex.stations = ships.filter(() => false);
  // rebuild stations list from entities
  const stations = [];
  for (const e of state.entityList || []) {
    if (e && e.type === 'station') stations.push(e);
  }
  state.entityIndex.stations = stations;
  state.entityIndex.version = 1;
}

lawSecurity.init({ state, bus, helpers, registry: null });
setSanctuaryEmptyQuietLatchForBench(${latchOn ? 'true' : 'false'});

for (let i = 0; i < 400; i++) {
  state.tick++;
  lawSecurity._enforceSanctuaryWithdrawals(state);
}
if (typeof gc === 'function') gc();

const t0 = performance.now();
for (let i = 0; i < ITERS; i++) {
  state.tick++;
  lawSecurity._enforceSanctuaryWithdrawals(state);
}
const ms = performance.now() - t0;

const latched = !!(state.lawSecurityRuntime && state.lawSecurityRuntime.sanctuaryQuietLatched);
console.log(JSON.stringify({
  ms, latchOn: ${latchOn ? 'true' : 'false'}, latched,
  ships: SHIPS, pirates: PIRATES, iters: ITERS,
}));
`;
}

function runChild(latchOn) {
  const r = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', childScript(latchOn)], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  if (r.status !== 0) {
    throw new Error(`child failed latchOn=${latchOn}: ${r.stderr || r.stdout}`);
  }
  const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop();
  return JSON.parse(line);
}

function dirtyWake() {
  const script = `
import { createGameState } from './src/core/gameState.js';
import { createBus } from './src/core/eventBus.js';
import { core } from './src/core/coreSystem.js';
import {
  lawSecurity,
  setSanctuaryEmptyQuietLatchForBench,
} from './src/systems/lawSecurity.js';

const state = createGameState(1471);
state.mode = 'flight';
state.tick = 0;
state.world = state.world || {};
state.world.currentSectorId = 'sector_ceres';
const bus = createBus();
const helpers = {};
core.init({ state, bus, helpers, registry: null });
const player = helpers.spawnEntity({
  type: 'ship', pos: { x: 800, z: 0 }, vel: { x: 0, z: 0 },
  radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
});
state.playerId = player.id;
helpers.spawnEntity({
  type: 'station', pos: { x: 800, z: 0 }, radius: 80, mass: 1000,
  hull: 1000, hullMax: 1000, collides: true, team: 0,
  factionId: 'faction_dmc',
  data: { stationId: 'station_ceres' },
});
const pirate = helpers.spawnEntity({
  type: 'ship',
  pos: { x: 820, z: 10 },
  vel: { x: 0, z: 0 },
  radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 2,
  factionId: 'faction_reach',
  data: {
    ai: { passive: false, lawful: false, archetype: 'raider' },
    combat: {},
    intent: {},
    role: 'raider',
  },
});
const ships = [player, pirate];
const stations = [];
for (const e of state.entityList || []) if (e && e.type === 'station') stations.push(e);
if (state.entityIndex) {
  state.entityIndex.ready = true;
  state.entityIndex.__spacefaceEntityIndexV1 = true;
  state.entityIndex.ships = ships;
  state.entityIndex.shipLike = ships;
  state.entityIndex.aiShips = [pirate];
  state.entityIndex.stations = stations;
  state.entityIndex.version = 1;
}
lawSecurity.init({ state, bus, helpers, registry: null });
setSanctuaryEmptyQuietLatchForBench(true);

// Arm quiet latch (no target yet).
for (let i = 0; i < 40; i++) {
  state.tick++;
  lawSecurity._enforceSanctuaryWithdrawals(state);
}
const latchedBefore = !!(state.lawSecurityRuntime && state.lawSecurityRuntime.sanctuaryQuietLatched);

// Acquire chase on player inside sanctuary — force rescan by advancing past window
// AND bumping membership so latch cannot stay armed on stale aggression.
pirate.data.ai.forcePlayerTarget = true;
pirate.data.combat.targetId = player.id;
state.entityIndex.version = (state.entityIndex.version | 0) + 1;
state.tick += 40;
lawSecurity._enforceSanctuaryWithdrawals(state);
const withdrawn = pirate.data.ai.sanctuaryWithdrawn === true;
const latchedAfter = !!(state.lawSecurityRuntime && state.lawSecurityRuntime.sanctuaryQuietLatched);
console.log(JSON.stringify({
  ok: latchedBefore === true && withdrawn === true && latchedAfter === false,
  latchedBefore, withdrawn, latchedAfter,
  engagement: pirate.data.ai.engagementTrigger || null,
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`dirtyWake failed: ${r.stderr || r.stdout}`);
  }
  const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop();
  return JSON.parse(line);
}

if (mode === 'before' || mode === 'after') {
  console.log(JSON.stringify(runChild(mode === 'after')));
  process.exit(0);
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const before = runChild(false);
  const after = runChild(true);
  const speedup = before.ms / Math.max(1e-9, after.ms);
  pairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup,
    afterLatched: after.latched,
  });
}
const speedups = pairs.map((p) => p.speedup);
const out = {
  name: 'sanctuary-empty-quiet-latch',
  iters: ITERS,
  ships: SHIPS,
  pirates: PIRATES,
  pairs,
  medianSpeedup: median(speedups),
  minSpeedup: Math.min(...speedups),
  maxSpeedup: Math.max(...speedups),
  dirtyWake: dirtyWake(),
};
writeFileSync(join(ROOT, 'artifacts/sanctuary-empty-quiet-latch-microbench.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
