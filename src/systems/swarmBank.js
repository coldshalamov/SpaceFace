// The Bank is an opening composition, using the arena's existing throwable stones.
// It never repositions terrain or live bodies, and spends no random stream or population.
import { physicsBodyNativeReady, resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { PHYSICS_MATERIALS } from '../data/physicsMaterials.js';
import { isSwarmBossWave } from '../data/swarmMode.js';
import { isFoundryWreckKept } from '../data/swarmFoundryWreck.js';
import { findSwarmArrival, swarmPlacementIsClear, sweptDiscsOverlap } from './swarmSafety.js';

// The first Charger starts 90 WU behind the pilot and can dash at most 210 WU.
// A nearby pebble leaves room to sidestep and still puts its body on that pass.
export const BANK_STONE_MIN_DISTANCE = 80;
export const BANK_STONE_MAX_DISTANCE = 95;
export const BANK_CHARGER_START_DISTANCE = 90;

const bodyEnabled = entity => entity?.physicsBody !== false
  && entity?.physicsBody?.material !== 'sensor'
  && PHYSICS_MATERIALS[entity?.physicsBody?.material]?.ghost !== true;

export function swarmBankEligible(run, wave, plan) {
  return !(run?.arenaId !== 'helios_core' || wave < 7 || isSwarmBossWave(wave)
      || (Array.isArray(run.arenaMutators) && run.arenaMutators.length)
      || !Array.isArray(plan) || (plan.find(p => p.id === 'charger')?.count || 0) < 2
      || (plan.find(p => p.id === 'spitter')?.count || 0) < 1);
}

export function planSwarmBank(state, run, wave, plan, candidate = null) {
  if (!swarmBankEligible(run, wave, plan)) return null;
  const player = state?.entities?.get?.(state.playerId);
  if (!player?.pos || !bodyEnabled(player) || !Number.isFinite(player.pos.x) || !Number.isFinite(player.pos.z)
      || !state?.entities?.values) return null;
  const ax = player.pos.x, az = player.pos.z;
  const pilotRadius = Math.max(6, player.radius || 0, resolvePhysicsBodySpec(player)?.radius || 0);
  // Keep explicit bodyless sentinels out of every geometry query. The shared radius
  // reader normalizes absent bodies; a preview must not turn a disabled one back on.
  const occupants = [...state.entities.values()].filter(bodyEnabled);
  const placementState = { playerId: state.playerId, entities: {
    get: id => state.entities.get(id), values: () => occupants.values(),
  } };
  const solids = occupants.filter(entity => entity !== player
    && (['asteroid', 'wreck', 'station', 'ship', 'drone'].includes(entity?.type)
      || entity?.physicsBody?.schemaVersion === 1));
  // The stock line can throw a <= 9 WU pebble. Prefer the closest genuine arena rock,
  // then try other candidates if its approaches or one escape flank are occupied.
  const rocks = [];
  function consider(e) {
    const offcut = wave === 7 && isFoundryWreckKept(state, e)
      && physicsBodyNativeReady(e)
      && !Number.isFinite(e.data?.despawnAt)
      && Number.isFinite(e.vel?.x) && Number.isFinite(e.vel?.z)
      && Math.hypot(e.vel.x, e.vel.z) <= 6;
    if ((!offcut && (e?.type !== 'asteroid' || !e.data?.swarmArenaDebris))
        || e.alive === false || e.collides === false || !bodyEnabled(e) || !e.pos
        || !Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)
        || !(e.radius > 0 && e.radius <= 9)) return;
    const d = Math.hypot(e.pos.x - ax, e.pos.z - az);
    const body = resolvePhysicsBodySpec(e);
    if (d < BANK_STONE_MIN_DISTANCE || d > BANK_STONE_MAX_DISTANCE || !body?.dynamic
      || (offcut && (!(body.radius > 0 && body.radius <= 9) || !(body.mass > 0)))) return;
    rocks.push({ e, d, offcut });
  }
  for (const e of state.entities.values()) consider(e);
  if (candidate) consider(candidate);
  // Use the original the pilot kept in reach before an anonymous pebble. If its
  // approaches fail, the existing stone search still owns the ordinary fallback.
  rocks.sort((a, b) => Number(b.offcut) - Number(a.offcut) || a.d - b.d || (String(a.e.id) < String(b.e.id) ? -1
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
      const second = findSwarmArrival(placementState, secondWanted, 3.8, opts);
      if (!swarmPlacementIsClear(placementState, first, 3.8, opts)
          || !second || Math.hypot(second.x - ax, second.z - az) > 220
          || Math.hypot(second.x - first.x, second.z - first.z) < 20
          || !swarmPlacementIsClear(placementState, spitter, 3.4, opts)
          || !swarmPlacementIsClear(placementState, escape, pilotRadius, opts)) continue;
      // A clear endpoint is not an escape if the pilot must cross a solid on the way.
      // Probe the same 65 WU sidestep with the full native hull and the room's existing
      // moving-disc law. This only chooses a flank; flight and collisions still own it.
      if (solids.some(other => sweptDiscsOverlap(player.pos, pilotRadius, other, {
        horizon: 1, clearance: 4, velocity: { x: -sx * side * 65, z: -sz * side * 65 },
      }))) continue;
      return { first, second, spitter, rockId: e.id, flankX: sx * side, flankZ: sz * side };
    }
  }
  return null;
}
