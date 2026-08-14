// Deterministic tick-quantized activity scheduler.
//
// Input, flight, weapons, collisions, and required physics stay on the 60 Hz step. This helper
// only answers "does this owner run on this tick?" so inactive perception, traffic planning,
// remote economy/story, and similar owners can wake on a stable phase without touching RNG.
//
// Parity contract: period 1 always returns true. Phase is a hash of the owner key, not wall time.

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function hashOwnerKey(ownerKey) {
  const text = String(ownerKey == null ? '' : ownerKey);
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

export function ownerPhase(ownerKey, periodTicks) {
  const period = Math.max(1, Math.floor(Number(periodTicks) || 1));
  return hashOwnerKey(ownerKey) % period;
}

export function shouldRunOnTick(tick, ownerKey, periodTicks) {
  const period = Math.max(1, Math.floor(Number(periodTicks) || 1));
  if (period === 1) return true;
  const t = Number.isInteger(tick) ? tick : Math.floor(Number(tick) || 0);
  return ((t % period) + period) % period === ownerPhase(ownerKey, period);
}

export function nextRunTick(tick, ownerKey, periodTicks) {
  const period = Math.max(1, Math.floor(Number(periodTicks) || 1));
  const t = Number.isInteger(tick) ? tick : Math.floor(Number(tick) || 0);
  const phase = ownerPhase(ownerKey, period);
  const rem = ((t % period) + period) % period;
  if (rem === phase) return t;
  const delta = (phase - rem + period) % period;
  return t + delta;
}

/**
 * Sleep far, inactive, non-combat owners. Combatants, the player, and anything inside the
 * authority radius stay awake every tick so 47a/combat authority is unchanged.
 */
export function isActiveOwner(owner, options = {}) {
  if (!owner) return false;
  if (owner.isPlayer === true || owner.id === options.playerId) return true;
  if (owner.alive === false) return false;
  const combat = owner.ai && owner.ai.combatant === true;
  const hostile = owner.team != null && options.playerTeam != null && owner.team !== options.playerTeam
    && owner.ai && owner.ai.passive !== true;
  if (combat || hostile) return true;
  const radius = Number(options.authorityRadius);
  if (!Number.isFinite(radius) || radius <= 0) return true;
  const origin = options.origin;
  const pos = owner.pos;
  if (!origin || !pos) return true;
  const dx = Number(pos.x) - Number(origin.x);
  const dz = Number(pos.z) - Number(origin.z);
  return (dx * dx + dz * dz) <= radius * radius;
}

export function shouldOwnerThink(tick, owner, options = {}) {
  if (!isActiveOwner(owner, options)) {
    const period = Math.max(1, Math.floor(Number(options.sleepPeriodTicks) || 8));
    const key = owner && (owner.id != null ? `sleep:${owner.id}` : `sleep:${options.ownerKey || 'anon'}`);
    return shouldRunOnTick(tick, key, period);
  }
  const period = Math.max(1, Math.floor(Number(options.activePeriodTicks) || 1));
  const key = owner && (owner.id != null ? `active:${owner.id}` : `active:${options.ownerKey || 'anon'}`);
  return shouldRunOnTick(tick, key, period);
}
