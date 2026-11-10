// scripts/lib/bench/crucibleKitOrder.mjs — PQ-137.05 kit-balance: Pulse vs physics kit.
//
// Headless, real-path: simulateCrucibleSwarm + isHostileKill / isAttributedPhysicsKill.
// Does not read WEAPONS[].dps. Does not launch a browser.

import {
  CRUCIBLE_TICK_CAP,
  simulateCrucibleSwarm,
} from './crucibleBench.mjs';
import { countKitKills } from './swarmMetrics.mjs';

export const KIT_ORDER_ARENA_ID = 'helios_core';
export const KIT_ORDER_ENERGY_ID = 'energy_baseline';
export const KIT_ORDER_PHYSICS_ID = 'physics_toolkit';
export const KIT_ORDER_TICK_CAP = CRUCIBLE_TICK_CAP;

/** Pinned 20-seed set. Must include 4242, 8008, 13502. */
export const KIT_ORDER_SEEDS = Object.freeze([
  4242, 8008, 13502, 17, 41, 73, 128, 256, 512, 777,
  1024, 2048, 3331, 4096, 5000, 6502, 7777, 9001, 12321, 31415,
]);

export function median(values) {
  const xs = (Array.isArray(values) ? values : [])
    .filter((n) => Number.isFinite(n))
    .slice()
    .sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = (xs.length - 1) / 2;
  return (xs[Math.floor(mid)] + xs[Math.ceil(mid)]) / 2;
}

export function formatKitOrderReport(result) {
  const lines = [];
  lines.push('[pq-137.05] kit-order Pulse (energy_baseline) vs physics_toolkit');
  lines.push(`seeds: ${result.seeds.join(',')}`);
  lines.push(`tickCap: ${result.tickCap} arena: ${result.arenaId}`);
  for (const cell of result.cells) {
    lines.push(
      `  ${cell.loadoutId} seed=${cell.seed} hostile=${cell.hostile} `
      + `physics=${cell.physics} gun=${cell.gun} stop=${cell.stopReason} `
      + `ticks=${cell.ticks} waves=${cell.wavesCleared}`,
    );
  }
  lines.push(
    `ENERGY median hostile kills: ${result.energyMedianHostile}`,
  );
  lines.push(
    `PHYSICS median hostile kills: ${result.physicsMedianHostile}`,
  );
  lines.push(
    `ENERGY median gun kills: ${result.energyMedianGun}`,
  );
  lines.push(
    `PHYSICS median physics-attributed kills: ${result.physicsMedianPhysics}`,
  );
  lines.push(`pass: ${result.ok ? 'YES' : 'NO'} (${result.reason})`);
  return lines.join('\n');
}

/**
 * 20-seed (or requested) headless comparison on the real Crucible swarm bench.
 *
 * @param {object} [options]
 * @param {number[]} [options.seeds]
 * @param {number} [options.tickCap]
 * @param {function} [options.log]
 */
export async function runCrucibleKitOrder({
  seeds = KIT_ORDER_SEEDS,
  tickCap = KIT_ORDER_TICK_CAP,
  arenaId = KIT_ORDER_ARENA_ID,
  log = console.log,
} = {}) {
  const seedList = Array.isArray(seeds) && seeds.length ? seeds.map((s) => s | 0) : [...KIT_ORDER_SEEDS];
  const cap = Number.isFinite(tickCap) ? (tickCap | 0) : KIT_ORDER_TICK_CAP;
  const kits = [KIT_ORDER_ENERGY_ID, KIT_ORDER_PHYSICS_ID];
  const cells = [];

  for (const loadoutId of kits) {
    for (const seed of seedList) {
      log(`[pq-137.05] ${loadoutId} seed=${seed} tickCap=${cap}...`);
      const run = await simulateCrucibleSwarm({
        arenaId,
        loadoutId,
        seed,
        tickCap: cap,
      });
      const counts = countKitKills(run.eventTrace);
      const cell = {
        loadoutId,
        seed,
        arenaId,
        tickCap: cap,
        hostile: counts.hostile,
        physics: counts.physics,
        gun: counts.gun,
        stopReason: run.stopReason,
        ticks: run.ticks,
        wavesCleared: run.metrics && Number.isFinite(run.metrics.wavesCleared)
          ? run.metrics.wavesCleared
          : 0,
        wallMs: run.wallMs,
      };
      log(
        `[pq-137.05]   hostile=${cell.hostile} physics=${cell.physics} gun=${cell.gun} `
        + `stop=${cell.stopReason} ticks=${cell.ticks} wall=${cell.wallMs}ms`,
      );
      cells.push(cell);
    }
  }

  const energy = cells.filter((c) => c.loadoutId === KIT_ORDER_ENERGY_ID);
  const physics = cells.filter((c) => c.loadoutId === KIT_ORDER_PHYSICS_ID);
  const energyMedianHostile = median(energy.map((c) => c.hostile));
  const physicsMedianHostile = median(physics.map((c) => c.hostile));
  const energyMedianGun = median(energy.map((c) => c.gun));
  const physicsMedianGun = median(physics.map((c) => c.gun));
  const physicsMedianPhysics = median(physics.map((c) => c.physics));
  const energyAnyKill = energy.some((c) => c.hostile >= 1);
  const physicsAnyKill = physics.some((c) => c.hostile >= 1);

  let ok = true;
  let reason = 'physics median hostile kills exceed Pulse';
  if (!energyAnyKill || !physicsAnyKill) {
    ok = false;
    reason = 'at least one seed on each kit must record ≥ 1 hostile kill';
  } else if (!(physicsMedianHostile > energyMedianHostile)) {
    ok = false;
    reason = `physics median ${physicsMedianHostile} is not greater than Pulse median ${energyMedianHostile}`;
  } else if (energyMedianGun > physicsMedianGun && physicsMedianPhysics <= 0) {
    // Pulse still wins on gun-only, and the physics kit produced no attributed physics kills —
    // the total-kill win would be raw DPS wearing a physics label.
    ok = false;
    reason = 'Pulse still wins gun-only median and the physics kit recorded no physics-attributed kills';
  }

  const result = {
    ok,
    reason,
    arenaId,
    tickCap: cap,
    seeds: seedList,
    energyMedianHostile,
    physicsMedianHostile,
    energyMedianGun,
    physicsMedianGun,
    physicsMedianPhysics,
    energyAnyKill,
    physicsAnyKill,
    cells,
  };
  log(formatKitOrderReport(result));
  return result;
}
