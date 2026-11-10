// scripts/lib/bench/packetBars.mjs — PQ-174 packet bars: death window + whole-run quiet seconds.
//
// Extends the existing swarm-bars bench. Does not fork a second simulator.
// Caps at death or 20 simulated minutes. Does not retune kits, HP, Pulse, or waves.
//
//   node scripts/lib/bench/packetBars.mjs
//   node scripts/lib/bench/packetBars.mjs --cell --loadout=energy_baseline --seed=4242
//
// What "competent" means here (and what it does not): the driver is the existing Crucible
// chase-bot. It aims at the nearest cohort hostile, holds the trigger in range, and fires
// the kit's verbs on a seeded cadence. At a real draft it takes the first seeded offer;
// at a refit it closes without changing fittings. That is a scripted proxy, not a competent
// player. Numbers from this harness are not the 8–14 minute human-play bar.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { simulateCrucibleSwarm } from './crucibleBench.mjs';
import {
  SWARM_BAR_ARENA_ID,
  SWARM_BAR_CELL_PREFIX,
  SWARM_BAR_CENSOR_SECONDS,
  SWARM_BAR_LOADOUTS,
  SWARM_BAR_SEEDS,
  SWARM_BAR_TICK_CAP,
  SWARM_BAR_WAVE_TARGET,
  missingSwarmBars,
  parseSwarmBarCellStdout,
  runOneSwarmBarCell,
} from './crucibleSwarmBars.mjs';

export const PACKET_BARS_SCHEMA = 'spaceface.pq174.packetBars.v1';
export const PACKET_BARS_COMPETENT_PLAY = Object.freeze({
  kind: 'scripted_chase_bot',
  isCompetentPlayer: false,
  hullAim: 'nearest live swarm-cohort hostile',
  fire: 'hold trigger in range; physics kit also stations off a backstop rock',
  verbs: 'seeded cadence on wells/shove (physics) or latch/reel/throw (massline)',
  draft: 'first seeded offer, or skip if the surface is empty',
  refit: 'close immediately; fittings unchanged',
  note: 'A scripted bot is not a competent player. These numbers measure the proxy, not the Outcome sentence.',
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const thisFile = fileURLToPath(import.meta.url);
const SCRATCH_REL = '.devshots/camp0909/scratch/pq-174-packet-bars.json';
const CELL_HEAP_MB = 8192;
const CELL_TIMEOUT_MS = 30 * 60 * 1000;

function parseArgs(argv) {
  const out = {
    cell: false,
    inProcess: false,
    arenaId: SWARM_BAR_ARENA_ID,
    loadoutId: null,
    seed: null,
    loadouts: [...SWARM_BAR_LOADOUTS],
    seeds: [...SWARM_BAR_SEEDS],
    tickCap: SWARM_BAR_TICK_CAP,
    waveCount: SWARM_BAR_WAVE_TARGET,
    out: join(ROOT, SCRATCH_REL),
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
    } else if (a.startsWith('--wave-count=')) {
      out.waveCount = Number(a.slice('--wave-count='.length));
    } else if (a.startsWith('--out=')) {
      out.out = a.slice('--out='.length);
    }
  }
  return out;
}

function fail(message, extra) {
  console.error(`packet-bars: FAIL ${message}`);
  if (extra) console.error(extra);
  process.exit(1);
}

export function packetBarRow(cell, extra = {}) {
  const death = cell && cell.firstDeath;
  const pd = Array.isArray(cell && cell.playerDeaths) ? cell.playerDeaths[0] : null;
  const story = pd && pd.story ? pd.story : null;
  return {
    loadoutId: cell.loadoutId ?? null,
    seed: cell.seed ?? null,
    stopReason: cell.stopReason ?? extra.stopReason ?? null,
    simSeconds: cell.simSeconds ?? null,
    simMinutes: Number.isFinite(cell.simSeconds) ? Math.round((cell.simSeconds / 60) * 1e6) / 1e6 : null,
    ticks: cell.ticks ?? null,
    wallMs: extra.wallMs ?? null,
    msPerTick: extra.msPerTick ?? null,
    wave: extra.wave ?? null,
    firstDeathSeconds: death && death.available ? death.seconds : null,
    firstDeathMinutes: death && death.available ? death.minutes : null,
    firstDeathCensored: death ? death.censored === true : null,
    firstDeathCensoredAtMinutes: death && death.censored ? death.censoredAtMinutes : null,
    quietSeconds: cell.quietSeconds && cell.quietSeconds.available ? cell.quietSeconds.seconds : null,
    quietSecondsAfterWave1: cell.quietSecondsAfterWave1 && cell.quietSecondsAfterWave1.available
      ? cell.quietSecondsAfterWave1.seconds
      : null,
    quietAfterWave1Reason: cell.quietSecondsAfterWave1 && cell.quietSecondsAfterWave1.available !== true
      ? cell.quietSecondsAfterWave1.reason
      : null,
    quietSecondsInWaves: cell.quietSecondsInWaves && cell.quietSecondsInWaves.available
      ? cell.quietSecondsInWaves.seconds
      : null,
    deathCause: story && story.causeText ? story.causeText : (pd && pd.causeAvailable ? pd.cause : null),
    telegraphName: story && story.telegraphName ? story.telegraphName : (pd && pd.telegraphAvailable ? pd.telegraph : null),
    telegraphLeadMs: story && Number.isFinite(story.telegraphLeadMs) ? story.telegraphLeadMs : (pd && pd.telegraphLeadMs),
    telegraphSource: story && story.telegraphSource ? story.telegraphSource : null,
    counterplay: story && story.counterplay ? story.counterplay : null,
    waves: Array.isArray(cell.waveDurations)
      ? cell.waveDurations.map((w) => ({
        wave: w.wave,
        status: w.status,
        durationSeconds: w.durationSeconds,
      }))
      : [],
    barsLine: cell.barsLine ?? null,
  };
}

export async function runPacketBarCell({
  arenaId = SWARM_BAR_ARENA_ID,
  loadoutId,
  seed,
  tickCap = SWARM_BAR_TICK_CAP,
  waveCount = SWARM_BAR_WAVE_TARGET,
} = {}) {
  const result = await runOneSwarmBarCell({
    arenaId,
    loadoutId,
    seed,
    tickCap,
    waveCount,
    simulate: simulateCrucibleSwarm,
  });
  const row = packetBarRow(result.cell, {
    stopReason: result.run && result.run.stopReason,
    wallMs: result.run && result.run.wallMs,
    msPerTick: result.run && result.run.msPerTick,
    wave: result.run && result.run.wave,
  });
  return { ...result, row };
}

function runCellInChild(opts) {
  const script = thisFile;
  const args = [
    `--max-old-space-size=${CELL_HEAP_MB}`,
    script,
    '--cell',
    `--arena=${opts.arenaId}`,
    `--loadout=${opts.loadoutId}`,
    `--seed=${opts.seed}`,
    `--tick-cap=${opts.tickCap}`,
    `--wave-count=${opts.waveCount}`,
  ];
  const spawned = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: CELL_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
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
  const rowLine = String(spawned.stdout || '').split(/\r?\n/).find((l) => l.startsWith('PACKET_BAR_ROW_JSON:'));
  let row = null;
  if (rowLine) {
    try { row = JSON.parse(rowLine.slice('PACKET_BAR_ROW_JSON:'.length)); } catch { row = null; }
  }
  return { cell, swarm: cell, gaps, row: row || packetBarRow(cell), stdout: spawned.stdout };
}

function writeScratch(outPath, document) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return outPath;
}

export function buildPacketBarsDocument({
  rows,
  tickCap = SWARM_BAR_TICK_CAP,
  waveCount = SWARM_BAR_WAVE_TARGET,
  arenaId = SWARM_BAR_ARENA_ID,
  seeds = SWARM_BAR_SEEDS,
  loadouts = SWARM_BAR_LOADOUTS,
} = {}) {
  return {
    schema: PACKET_BARS_SCHEMA,
    capturedAt: new Date().toISOString(),
    arenaId,
    seeds: [...seeds],
    loadouts: [...loadouts],
    tickCap,
    censorSeconds: tickCap / 60,
    waveCount,
    competentPlay: PACKET_BARS_COMPETENT_PLAY,
    rows,
  };
}

const isMain = Boolean(process.argv[1]) && resolve(process.argv[1]) === thisFile;
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.cell) {
    if (!opts.loadoutId || !Number.isFinite(opts.seed)) {
      fail('--cell requires --loadout and --seed');
    }
    const result = await runPacketBarCell({
      arenaId: opts.arenaId,
      loadoutId: opts.loadoutId,
      seed: opts.seed,
      tickCap: opts.tickCap,
      waveCount: opts.waveCount,
    });
    console.log(result.cell.barsLine);
    console.log(`PACKET_BAR_ROW_JSON:${JSON.stringify(result.row)}`);
    console.log(SWARM_BAR_CELL_PREFIX + JSON.stringify(result.cell));
    if (result.gaps.length) {
      fail(`${opts.loadoutId} seed=${opts.seed} missing bars: ${result.gaps.join('; ')}`);
    }
    process.exit(0);
  }

  const loadouts = opts.loadoutId ? [opts.loadoutId] : opts.loadouts;
  const seeds = Number.isFinite(opts.seed) ? [opts.seed] : opts.seeds;
  const rows = [];
  console.log(
    `[packet-bars] arena=${opts.arenaId} loadouts=${loadouts.join(',')} seeds=${seeds.join(',')} `
    + `tickCap=${opts.tickCap} (${opts.tickCap / 60}s / ${SWARM_BAR_CENSOR_SECONDS}s named) `
    + `waveCount=${opts.waveCount} cells=${loadouts.length * seeds.length}`,
  );
  console.log(`[packet-bars] competent-play: ${PACKET_BARS_COMPETENT_PLAY.note}`);

  for (const loadoutId of loadouts) {
    for (const seed of seeds) {
      console.log(`[packet-bars] ${loadoutId} seed=${seed}...`);
      const result = opts.inProcess
        ? await runPacketBarCell({
          arenaId: opts.arenaId,
          loadoutId,
          seed,
          tickCap: opts.tickCap,
          waveCount: opts.waveCount,
        })
        : runCellInChild({
          arenaId: opts.arenaId,
          loadoutId,
          seed,
          tickCap: opts.tickCap,
          waveCount: opts.waveCount,
        });
      if (result.gaps.length) {
        fail(`${loadoutId} seed=${seed} missing bars: ${result.gaps.join('; ')}`);
      }
      rows.push(result.row);
      console.log(result.cell.barsLine);
      const document = buildPacketBarsDocument({
        rows,
        tickCap: opts.tickCap,
        waveCount: opts.waveCount,
        arenaId: opts.arenaId,
        seeds,
        loadouts,
      });
      writeScratch(opts.out, document);
    }
  }

  console.log(`[packet-bars] wrote ${rows.length} cells → ${opts.out}`);
  for (const row of rows) {
    const death = row.firstDeathCensored
      ? `censored@${row.firstDeathCensoredAtMinutes}min`
      : `${row.firstDeathMinutes}min`;
    console.log(
      `[packet-bars] ${row.loadoutId} ${row.seed} death=${death} quiet=${row.quietSeconds}s `
      + `quietAfterW1=${row.quietSecondsAfterWave1 ?? row.quietAfterWave1Reason} `
      + `cause=${row.deathCause || 'none'}`,
    );
  }
  console.log('packet-bars: PASS');
}
