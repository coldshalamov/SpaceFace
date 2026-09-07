// scripts/lib/bench/crucibleSwarmBars.mjs — PQ-174.00 nine-cell BEFORE swarm-bar dump.
//
// Characterization only. Does not retune quota, HP, Pulse, kits, or waves.
// A live cell must print every bar as a number or an honest n/a with a reason — never a fake zero.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

import { formatSwarmBars, measureSwarmRun } from './swarmMetrics.mjs';

export const SWARM_BARS_SCHEMA = 'spaceface.swarmPacing.before.v2';
export const SWARM_BAR_ARENA_ID = 'helios_core';
export const SWARM_BAR_SEEDS = Object.freeze([4242, 8008, 13502]);
export const SWARM_BAR_LOADOUTS = Object.freeze([
  'energy_baseline',
  'physics_toolkit',
  'massline_rig',
]);
export const SWARM_BAR_CELL_PREFIX = 'SWARM_BAR_CELL_JSON:';
export const SWARM_BARS_JSON_REL = 'design/program/roadmap/receipts/PQ-174-00-01-swarm-pacing.json';
export const SWARM_BAR_TICK_CAP = 5400;

/** Tokens that must appear on every formatSwarmBars line. */
export const SWARM_BAR_LINE_KEYS = Object.freeze([
  'loadout=',
  'build=',
  'seed=',
  'firstHostile=',
  'firstKill=',
  'verbs=',
  'moments=',
  'quietAfterW1=',
  'deaths=',
  'waves=',
  'menus=',
  'firstDeath=',
]);

export function serializeSwarmBarCell(swarm, extra = {}) {
  const measured = swarm && swarm.schema
    ? swarm
    : measureSwarmRun(swarm || {});
  return {
    loadoutId: measured.loadoutId ?? extra.loadoutId ?? null,
    seed: measured.seed ?? extra.seed ?? null,
    arenaId: measured.arenaId ?? extra.arenaId ?? null,
    stopReason: measured.stopReason ?? null,
    simSeconds: measured.simSeconds ?? null,
    ticks: measured.ticks ?? null,
    censored: measured.censored === true,
    quotaFromTrace: measured.quotaFromTrace ?? null,
    firstHostile: measured.firstHostile ?? null,
    firstKill: measured.firstKill ?? null,
    verbs: measured.verbs ?? null,
    meaningfulMoments: measured.meaningfulMoments ?? [],
    momentsPerMinute: measured.momentsPerMinute ?? null,
    quietSecondsAfterWave1: measured.quietSecondsAfterWave1 ?? null,
    playerDeaths: measured.playerDeaths ?? [],
    buildIdentity: measured.buildIdentity ?? null,
    waveDurations: measured.waveDurations ?? [],
    cleanupDurations: measured.cleanupDurations ?? [],
    menus: measured.menus ?? null,
    firstDeath: measured.firstDeath ?? null,
    kills: measured.kills ?? null,
    barsLine: extra.barsLine ?? formatSwarmBars(measured),
  };
}

function timedBarOk(obs, label) {
  if (!obs || typeof obs !== 'object') {
    return `${label} missing`;
  }
  if (obs.available === true) {
    if (obs.seconds == null || !Number.isFinite(obs.seconds)) {
      return `${label} marked available without a seconds value`;
    }
    return null;
  }
  if (obs.available === false) {
    if (obs.seconds != null) return `${label} unavailable but still has a seconds value`;
    if (!obs.reason) return `${label} unavailable without a reason`;
    return null;
  }
  return `${label} has no available flag`;
}

function rateOk(value, label) {
  if (!Number.isFinite(value)) return `${label} is not a finite rate`;
  return null;
}

/**
 * Return human-readable gaps. Empty array means every named bar is a number or honest n/a.
 * A fake zero (unavailable field stored as 0) is a gap.
 */
export function missingSwarmBars(swarm) {
  const gaps = [];
  if (!swarm || typeof swarm !== 'object') return ['swarm record missing'];

  const fh = timedBarOk(swarm.firstHostile, 'firstHostile');
  if (fh) gaps.push(fh);
  const fk = timedBarOk(swarm.firstKill, 'firstKill');
  if (fk) gaps.push(fk);

  if (!swarm.verbs || typeof swarm.verbs !== 'object') {
    gaps.push('verbs missing');
  } else {
    const rate = rateOk(swarm.verbs.useRatePerMinute, 'verbs/min');
    if (rate) gaps.push(rate);
  }

  const momentsRate = rateOk(swarm.momentsPerMinute, 'moments/min');
  if (momentsRate) gaps.push(momentsRate);
  if (!Array.isArray(swarm.meaningfulMoments)) gaps.push('meaningfulMoments missing');

  const quiet = swarm.quietSecondsAfterWave1;
  if (!quiet || typeof quiet !== 'object') {
    gaps.push('quietSecondsAfterWave1 missing');
  } else if (quiet.available === true) {
    if (!Number.isFinite(quiet.seconds)) gaps.push('quietSecondsAfterWave1 available without seconds');
  } else if (quiet.available === false) {
    if (quiet.seconds != null) gaps.push('quietSecondsAfterWave1 unavailable with a fake seconds value');
    if (!quiet.reason) gaps.push('quietSecondsAfterWave1 unavailable without a reason');
  } else {
    gaps.push('quietSecondsAfterWave1 has no available flag');
  }

  if (!Array.isArray(swarm.playerDeaths)) {
    gaps.push('playerDeaths missing');
  } else {
    swarm.playerDeaths.forEach((d, i) => {
      if (!d || typeof d !== 'object') {
        gaps.push(`playerDeaths[${i}] missing`);
        return;
      }
      if (d.causeAvailable === true) {
        if (d.cause == null || d.cause === '') gaps.push(`playerDeaths[${i}] cause available but empty`);
      } else if (!d.causeReason) {
        gaps.push(`playerDeaths[${i}] cause unavailable without a reason`);
      }
      if (d.causeAvailable === false && d.cause != null) {
        gaps.push(`playerDeaths[${i}] cause unavailable but still named`);
      }
      if (d.telegraphAvailable === true) {
        if (d.telegraph == null) gaps.push(`playerDeaths[${i}] telegraph available but empty`);
      } else if (!d.telegraphReason) {
        gaps.push(`playerDeaths[${i}] telegraph unavailable without a reason`);
      }
    });
  }

  const build = swarm.buildIdentity;
  if (!build || typeof build !== 'object') {
    gaps.push('buildIdentity missing');
  } else if (build.available === true) {
    if (!build.loadoutId && !build.hullId && !build.code) {
      gaps.push('buildIdentity available without loadout, hull, or code');
    }
  } else if (build.available === false) {
    if (!build.reason) gaps.push('buildIdentity unavailable without a reason');
  } else {
    gaps.push('buildIdentity has no available flag');
  }

  if (!Array.isArray(swarm.waveDurations)) gaps.push('waveDurations missing');
  else if (swarm.waveDurations.length === 0) {
    // Empty is allowed only as honest n/a on the printer; a live Crucible cell always plans wave 1.
    gaps.push('waveDurations empty (no wave duration observed)');
  }

  const menus = swarm.menus;
  if (!menus || typeof menus !== 'object') {
    gaps.push('menus missing');
  } else if (menus.available === true) {
    if (!Number.isFinite(menus.count) || !Number.isFinite(menus.perWave)) {
      gaps.push('menus available without count/perWave');
    }
  } else if (menus.available === false) {
    if (menus.count != null) gaps.push('menus unavailable with a fake count');
    if (!menus.reason) gaps.push('menus unavailable without a reason');
  } else {
    gaps.push('menus has no available flag');
  }

  const death = swarm.firstDeath;
  if (!death || typeof death !== 'object') {
    gaps.push('firstDeath missing');
  } else if (death.censored === true) {
    if (death.seconds != null) gaps.push('firstDeath censored but still has a death time');
    if (!death.reason) gaps.push('firstDeath censored without a reason');
  } else if (death.available === true) {
    if (!Number.isFinite(death.seconds)) gaps.push('firstDeath available without seconds');
  } else if (!death.reason) {
    gaps.push('firstDeath unavailable without a reason');
  }

  const line = swarm.barsLine || formatSwarmBars(swarm);
  for (const key of SWARM_BAR_LINE_KEYS) {
    if (!String(line).includes(key)) gaps.push(`formatSwarmBars missing ${key}`);
  }

  return gaps;
}

export function swarmBarsLineComplete(line) {
  const text = String(line || '');
  return SWARM_BAR_LINE_KEYS.filter((key) => !text.includes(key));
}

export async function runOneSwarmBarCell({
  arenaId = SWARM_BAR_ARENA_ID,
  loadoutId,
  seed,
  tickCap = SWARM_BAR_TICK_CAP,
  simulate,
} = {}) {
  if (typeof simulate !== 'function') {
    throw new Error('runOneSwarmBarCell requires simulate (simulateCrucibleSwarm)');
  }
  const run = await simulate({ arenaId, loadoutId, seed, tickCap });
  const swarm = run.swarm || measureSwarmRun({
    eventTrace: run.eventTrace,
    fitReceipt: run.fitReceipt,
    bodyAdmission: run.bodyAdmission,
    stopReason: run.stopReason,
    ticks: run.ticks,
    simSeconds: run.simSeconds,
    loadoutId,
    seed,
    arenaId,
    hullId: run.fitReceipt && run.fitReceipt.hullId,
    swarmTelemetry: { firstHostile: true, menus: true, deathTelegraph: true },
  });
  const cell = serializeSwarmBarCell(swarm, {
    loadoutId,
    seed,
    arenaId,
    barsLine: formatSwarmBars(swarm),
  });
  return { cell, swarm, run, gaps: missingSwarmBars({ ...swarm, barsLine: cell.barsLine }) };
}

export function parseSwarmBarCellStdout(stdout) {
  const text = String(stdout || '');
  const idx = text.lastIndexOf(SWARM_BAR_CELL_PREFIX);
  if (idx < 0) return null;
  const line = text.slice(idx + SWARM_BAR_CELL_PREFIX.length).split(/\r?\n/, 1)[0];
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function readHistoricalIncomplete(jsonPath) {
  if (!jsonPath || !existsSync(jsonPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    if (raw.historicalIncomplete) return raw.historicalIncomplete;
    if (raw.before || raw.after) {
      return {
        note: 'Prior PQ-174-00-01 snapshot. Missing moments, quiet-after-wave-1, death cause+telegraph, and build identity. Kept for comparison; not the .00 bars.',
        beforeQuota22: raw.before || null,
        afterQuota15Incomplete: raw.after || null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function buildSwarmBarsDocument({
  cells,
  wave1Quota = 15,
  tickCap = SWARM_BAR_TICK_CAP,
  arenaId = SWARM_BAR_ARENA_ID,
  seeds = SWARM_BAR_SEEDS,
  loadouts = SWARM_BAR_LOADOUTS,
  historicalIncomplete = null,
  gitHead = null,
} = {}) {
  return {
    schema: SWARM_BARS_SCHEMA,
    note: 'PQ-174.00 full nine-cell BEFORE dump. Wave-1 quota is the currently shipped 15. PQ-174.01 (pacing) has not landed. This is characterization, not a retune. Every bar is a number or an honest n/a with a reason.',
    capturedAt: new Date().toISOString(),
    gitHead,
    arenaId,
    seeds: [...seeds],
    loadouts: [...loadouts],
    wave1Quota,
    tickCap,
    before: {
      wave1Quota,
      runs: cells,
    },
    barsLines: cells.map((c) => c.barsLine),
    historicalIncomplete: historicalIncomplete || null,
  };
}

export function writeSwarmBarsJson(jsonPath, document) {
  mkdirSync(dirname(jsonPath), { recursive: true });
  const text = `${JSON.stringify(document, null, 1)}\n`.replace(/\r\n/g, '\n');
  writeFileSync(jsonPath, text, 'utf8');
  return jsonPath;
}
