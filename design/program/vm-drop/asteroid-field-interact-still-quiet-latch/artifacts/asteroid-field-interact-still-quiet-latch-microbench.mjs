/**
 * Primary KPI: _tickAsteroidFieldInteractions on quiet parked flight with nearby rocks.
 * Before = latch OFF (queryAsteroidField every tick).
 * After  = latch ON (still-player skip; wake on version/move/unpark/rescan).
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
  setAsteroidFieldInteractStillQuietForBench,
} from '../src/systems/world.js';
import {
  ensureAsteroidField,
  insertAsteroidFieldRock,
} from '../src/world/asteroidField.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] || 'all';

const ITERS = 60000;
const RUNS = 11;

function boot({ nearRocks = true, touching = false } = {}) {
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
  player.maxSpeed = 160;
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    if (!Number.isFinite(state.entityIndex.version)) state.entityIndex.version = 1;
  }
  ensureAsteroidField(state);
  if (nearRocks) {
    const dist = touching ? 10 : 30;
    for (let i = 0; i < 48; i++) {
      const ang = (i / 48) * Math.PI * 2;
      insertAsteroidFieldRock(state, {
        pos: { x: Math.cos(ang) * dist, z: Math.sin(ang) * dist },
        radius: 8,
      });
    }
  }
  return { state, helpers, player };
}

function walk(latchOn, opts = {}) {
  setAsteroidFieldInteractStillQuietForBench(latchOn);
  world._fieldInteractQuiet = null;
  const { state } = boot(opts);
  for (let i = 0; i < 5; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (state.simTime || 0) + 1 / 60;
    world._tickAsteroidFieldInteractions(state);
  }
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (state.simTime || 0) + 1 / 60;
    world._tickAsteroidFieldInteractions(state);
  }
  return performance.now() - t0;
}

function med(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[(s.length - 1) >> 1];
}

function packagePair(opts = {}) {
  const pairs = [];
  for (let r = 0; r < RUNS; r++) {
    const before = walk(false, opts);
    const after = walk(true, opts);
    pairs.push(before / Math.max(1e-9, after));
  }
  return {
    medianSpeedup: +med(pairs).toFixed(3),
    minSpeedup: +Math.min(...pairs).toFixed(3),
    maxSpeedup: +Math.max(...pairs).toFixed(3),
    pairs: pairs.map((x) => +x.toFixed(3)),
  };
}

function runPrimary() {
  const near = packagePair({ nearRocks: true, touching: false });
  const empty = packagePair({ nearRocks: false });
  const flying = (() => {
    // Flying player should NOT latch — speedup ~1.0×
    const pairs = [];
    for (let r = 0; r < RUNS; r++) {
      setAsteroidFieldInteractStillQuietForBench(false);
      world._fieldInteractQuiet = null;
      const { state, player } = boot({ nearRocks: true });
      player.vel.x = 40;
      for (let i = 0; i < 5; i++) {
        state.tick++;
        world._tickAsteroidFieldInteractions(state);
      }
      const t0 = performance.now();
      for (let i = 0; i < ITERS; i++) {
        state.tick++;
        world._tickAsteroidFieldInteractions(state);
      }
      const before = performance.now() - t0;

      setAsteroidFieldInteractStillQuietForBench(true);
      world._fieldInteractQuiet = null;
      const b2 = boot({ nearRocks: true });
      b2.player.vel.x = 40;
      for (let i = 0; i < 5; i++) {
        b2.state.tick++;
        world._tickAsteroidFieldInteractions(b2.state);
      }
      const t1 = performance.now();
      for (let i = 0; i < ITERS; i++) {
        b2.state.tick++;
        world._tickAsteroidFieldInteractions(b2.state);
      }
      const after = performance.now() - t1;
      pairs.push(before / Math.max(1e-9, after));
    }
    return {
      medianSpeedup: +med(pairs).toFixed(3),
      minSpeedup: +Math.min(...pairs).toFixed(3),
      maxSpeedup: +Math.max(...pairs).toFixed(3),
    };
  })();
  const out = {
    name: 'asteroid-field-interact-still-quiet-latch',
    iters: ITERS,
    runs: RUNS,
    quietParkedNearNonempty: near,
    quietParkedEmpty: empty,
    flyingNoLatch: flying,
  };
  console.log(JSON.stringify(out, null, 2));
  writeFileSync(
    join(__dirname, 'asteroid-field-interact-still-quiet-latch-microbench.json'),
    JSON.stringify(out, null, 2),
  );
  return out;
}

function runWorker() {
  const near = packagePair({ nearRocks: true, touching: false });
  const out = {
    quietParkedNearNonempty: near,
  };
  console.log(JSON.stringify(out));
}

if (mode === 'worker') runWorker();
else if (mode === 'primary') runPrimary();
else {
  // default: primary in-process, then isolated child workers for floor
  runPrimary();
}
