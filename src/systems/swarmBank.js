// The Bank is an opening composition, using the arena's existing throwable stones.
// It never repositions terrain or live bodies, and spends no random stream or population.
import { resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { isSwarmBossWave } from '../data/swarmMode.js';
import { findSwarmArrival, swarmPlacementIsClear } from './swarmSafety.js';

// The first Charger starts 90 WU behind the pilot and can dash at most 210 WU.
// A nearby pebble leaves room to sidestep and still puts its body on that pass.
export const BANK_STONE_MIN_DISTANCE = 80;
export const BANK_STONE_MAX_DISTANCE = 95;
export const BANK_CHARGER_START_DISTANCE = 90;

export function swarmBankEligible(run, wave, plan) {
  return !(run?.arenaId !== 'helios_core' || wave < 7 || isSwarmBossWave(wave)
      || (Array.isArray(run.arenaMutators) && run.arenaMutators.length)
      || !Array.isArray(plan) || (plan.find(p => p.id === 'charger')?.count || 0) < 2
      || (plan.find(p => p.id === 'spitter')?.count || 0) < 1);
}

export function planSwarmBank(state, run, wave, plan, candidate = null) {
  if (!swarmBankEligible(run, wave, plan)) return null;
  const player = state?.entities?.get?.(state.playerId);
  if (!player?.pos || !Number.isFinite(player.pos.x) || !Number.isFinite(player.pos.z)
      || !state?.entities?.values) return null;
  const ax = player.pos.x, az = player.pos.z;
  // The stock line can throw a <= 9 WU pebble. Prefer the closest genuine arena rock,
  // then try other candidates if its approaches or one escape flank are occupied.
  const rocks = [];
  function consider(e) {
    if (e?.type !== 'asteroid' || e.alive === false || e.collides === false
        || e.physicsBody === false || !e.data?.swarmArenaDebris || !e.pos
        || !Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)
        || !(e.radius > 0 && e.radius <= 9)) return;
    const d = Math.hypot(e.pos.x - ax, e.pos.z - az);
    if (d < BANK_STONE_MIN_DISTANCE || d > BANK_STONE_MAX_DISTANCE || !resolvePhysicsBodySpec(e)?.dynamic) return;
    rocks.push({ e, d });
  }
  for (const e of state.entities.values()) consider(e);
  if (candidate) consider(candidate);
  rocks.sort((a, b) => a.d - b.d || (String(a.e.id) < String(b.e.id) ? -1
    : String(a.e.id) > String(b.e.id) ? 1 : 0));
  for (const { e, d } of rocks) {
    const ux = (e.pos.x - ax) / d, uz = (e.pos.z - az) / d;
    const sx = -uz, sz = ux;
    // The first pass approaches from the opposite side of the pilot to the stone.
    // A separate clear flank is the dodge; the marked lob pressures the other side.
    for (const side of [1, -1]) {
      const first = { x: ax - ux * BANK_CHARGER_START_DISTANCE, z: az - uz * BANK_CHARGER_START_DISTANCE };
      const secondWanted = { x: ax - ux * 145 + sx * side * 48, z: az - uz * 145 + sz * side * 48 };
      const spitter = { x: ax + sx * side * 150, z: az + sz * side * 150 };
      const escape = { x: ax - sx * side * 65, z: az - sz * side * 65 };
      const opts = { clearance: 8 };
      const second = findSwarmArrival(state, secondWanted, 3.8, opts);
      if (!swarmPlacementIsClear(state, first, 3.8, opts)
          || !second || Math.hypot(second.x - ax, second.z - az) > 220
          || Math.hypot(second.x - first.x, second.z - first.z) < 20
          || !swarmPlacementIsClear(state, spitter, 3.4, opts)
          || !swarmPlacementIsClear(state, escape, Math.max(6, player.radius || 6), opts)) continue;
      return { first, second, spitter, rockId: e.id, flankX: sx * side, flankZ: sz * side };
    }
  }
  return null;
}
