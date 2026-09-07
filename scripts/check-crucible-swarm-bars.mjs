#!/usr/bin/env node
// scripts/check-crucible-swarm-bars.mjs — PQ-174.00 print the nine-cell BEFORE swarm bars.
//
//   node scripts/check-crucible-swarm-bars.mjs
//   node scripts/check-crucible-swarm-bars.mjs --cell --loadout=energy_baseline --seed=4242
//
// Headless. Real-path simulateCrucibleSwarm + measureSwarmRun + formatSwarmBars.
// Does not retune quota, HP, Pulse, kits, or waves. Does not add an npm script.
// The 9-cell node:test is gated behind SWARM_BARS_FULL=1; this script is the dump.

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CRUCIBLE_TICK_CAP,
  simulateCrucibleSwarm,
} from './lib/bench/crucibleBench.mjs';
import {
  SWARM_BAR_ARENA_ID,
  SWARM_BAR_CELL_PREFIX,
  SWARM_BAR_LOADOUTS,
  SWARM_BAR_SEEDS,
  SWARM_BARS_JSON_REL,
  buildSwarmBarsDocument,
  missingSwarmBars,
  parseSwarmBarCellStdout,
  readHistoricalIncomplete,
  runOneSwarmBarCell,
  writeSwarmBarsJson,
} from './lib/bench/crucibleSwarmBars.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CELL_HEAP_MB = 8192;
const CELL_TIMEOUT_MS = 12 * 60 * 1000;

function parseArgs(argv) {
  const out = {
    cell: false,
    inProcess: false,
    arenaId: SWARM_BAR_ARENA_ID,
    loadoutId: null,
    seed: null,
    loadouts: [...SWARM_BAR_LOADOUTS],
    seeds: [...SWARM_BAR_SEEDS],
    tickCap: CRUCIBLE_TICK_CAP,
    out: join(ROOT, SWARM_BARS_JSON_REL),
  };
  for (const a of argv) {
    if (a === '--cell') out.cell = true;
    else if (a === '--in-process') out.inProcess = true;
    else if (a.startsWith('--arena=')) out.arenaId = a.slice('--arena='.length);
    else if (a.startsWith('--loadout=')) out.loadoutId = a.slice('--loadout='.length);
    else if (a.startsWith('--seed=')) out.seed = Number(a.slice('--seed='.length));
    else if (a.startsWith('--loadouts=')) {
      out.loadouts = a.slice('--loadouts='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--seeds=')) {
      out.seeds = a.slice('--seeds='.length).split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
    } else if (a.startsWith('--tick-cap=')) {
      out.tickCap = Number(a.slice('--tick-cap='.length));
    } else if (a.startsWith('--out=')) {
      out.out = resolve(ROOT, a.slice('--out='.length));
    }
  }
  return out;
}

function gitHead() {
  const spawned = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (spawned.status !== 0) return null;
  return String(spawned.stdout || '').trim() || null;
}

function fail(message, extra) {
  console.error(`check-crucible-swarm-bars: FAIL ${message}`);
  if (extra) console.error(extra);
  process.exit(1);
}

async function runCellInProcess(opts) {
  return runOneSwarmBarCell({
    arenaId: opts.arenaId,
    loadoutId: opts.loadoutId,
    seed: opts.seed,
    tickCap: opts.tickCap,
    simulate: simulateCrucibleSwarm,
  });
}

function runCellInChild(opts) {
  const script = fileURLToPath(import.meta.url);
  const args = [
    `--max-old-space-size=${CELL_HEAP_MB}`,
    script,
    '--cell',
    `--arena=${opts.arenaId}`,
    `--loadout=${opts.loadoutId}`,
    `--seed=${opts.seed}`,
    `--tick-cap=${opts.tickCap}`,
  ];
  const spawned = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: CELL_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    env: process.env,
  });
  if (spawned.status !== 0) {
    fail(
      `child ${opts.loadoutId} seed=${opts.seed} exited ${spawned.status}`,
      `${spawned.stderr || ''}\n${spawned.stdout || ''}`,
    );
  }
  const cell = parseSwarmBarCellStdout(spawned.stdout);
  if (!cell) {
    fail(
      `child ${opts.loadoutId} seed=${opts.seed} did not print a cell JSON line`,
      spawned.stdout || '',
    );
  }
  const gaps = missingSwarmBars(cell);
  return { cell, swarm: cell, gaps, stdout: spawned.stdout };
}

const opts = parseArgs(process.argv.slice(2));

if (opts.cell) {
  if (!opts.loadoutId || !Number.isFinite(opts.seed)) {
    fail('--cell requires --loadout and --seed');
  }
  const result = await runCellInProcess({
    arenaId: opts.arenaId,
    loadoutId: opts.loadoutId,
    seed: opts.seed,
    tickCap: opts.tickCap,
  });
  console.log(result.cell.barsLine);
  console.log(SWARM_BAR_CELL_PREFIX + JSON.stringify(result.cell));
  if (result.gaps.length) {
    fail(`${opts.loadoutId} seed=${opts.seed} missing bars: ${result.gaps.join('; ')}`);
  }
  process.exit(0);
}

const loadouts = opts.loadoutId ? [opts.loadoutId] : opts.loadouts;
const seeds = Number.isFinite(opts.seed) ? [opts.seed] : opts.seeds;
const cells = [];
const historicalIncomplete = readHistoricalIncomplete(opts.out);

console.log(
  `[swarm-bars] BEFORE dump arena=${opts.arenaId} loadouts=${loadouts.join(',')} `
  + `seeds=${seeds.join(',')} tickCap=${opts.tickCap} cells=${loadouts.length * seeds.length}`,
);

for (const loadoutId of loadouts) {
  for (const seed of seeds) {
    console.log(`[swarm-bars] ${loadoutId} seed=${seed}...`);
    const result = opts.inProcess
      ? await runCellInProcess({
        arenaId: opts.arenaId,
        loadoutId,
        seed,
        tickCap: opts.tickCap,
      })
      : runCellInChild({
        arenaId: opts.arenaId,
        loadoutId,
        seed,
        tickCap: opts.tickCap,
      });
    if (result.gaps.length) {
      fail(`${loadoutId} seed=${seed} missing bars: ${result.gaps.join('; ')}`);
    }
    cells.push(result.cell);
    console.log(result.cell.barsLine);
    const document = buildSwarmBarsDocument({
      cells,
      wave1Quota: 15,
      tickCap: opts.tickCap,
      arenaId: opts.arenaId,
      seeds,
      loadouts,
      historicalIncomplete,
      gitHead: gitHead(),
    });
    writeSwarmBarsJson(opts.out, document);
  }
}

if (cells.length !== loadouts.length * seeds.length) {
  fail(`expected ${loadouts.length * seeds.length} cells, wrote ${cells.length}`);
}

console.log(`[swarm-bars] wrote ${cells.length} cells → ${opts.out}`);
for (const cell of cells) console.log(cell.barsLine);
console.log('check-crucible-swarm-bars: PASS');
