// Deterministic tick-quantized activity scheduler.
//
// Input, flight, weapons, collisions, and required physics stay on the 60 Hz step. This helper
// only answers "does this owner run on this tick?" so inactive perception, traffic planning,
// remote economy/story, and similar owners can wake on a stable phase without touching RNG.
//
// Parity contract: period 1 always returns true. Phase is a hash of the owner key, not wall time.
// When world activityRuntime has stamped simTier, S2/S3/S4 owners do no per-tick think.

import { SIM_TIER } from '../world/activityClassification.js';

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
export function ownerAiRecord(owner) {
  if (!owner) return null;
  if (owner.ai && typeof owner.ai === 'object') return owner.ai;
  const data = owner.data;
  if (data && data.ai && typeof data.ai === 'object') return data.ai;
  return null;
}

export function ownerTeamId(owner) {
  if (!owner) return null;
  if (owner.team != null) return owner.team;
  if (owner.data && owner.data.team != null) return owner.data.team;
  return null;
}

export function isActiveOwner(owner, options = {}) {
  if (!owner) return false;
  if (owner.isPlayer === true || owner.id === options.playerId) return true;
  if (owner.alive === false) return false;
  const ai = ownerAiRecord(owner);
  const team = ownerTeamId(owner);
  const combat = ai && ai.combatant === true;
  const hostile = team != null && options.playerTeam != null && team !== options.playerTeam
    && ai && ai.passive !== true;
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

export function shouldAmbientHaulerPlan(tick, owner, options = {}) {
  const ai = ownerAiRecord(owner);
  const team = ownerTeamId(owner);
  const combat = ai && ai.combatant === true;
  const hostile = !!(team != null && options.playerTeam != null
    && team !== options.playerTeam
    && ai && ai.passive !== true);
  if (combat || hostile) return true;
  // Ambient planning is never 60 Hz. Sleep at least as slow as the AI stack (8), not faster.
  const active = Math.max(2, Math.floor(Number(options.activePeriodTicks) || 2));
  const sleep = Math.max(8, Math.floor(Number(options.sleepPeriodTicks) || 8));
  const near = Math.max(2, Math.floor(Number(options.nearPeriodTicks) || 2));
  return shouldOwnerThink(tick, owner, {
    ...options,
    activePeriodTicks: active,
    sleepPeriodTicks: sleep,
    nearPeriodTicks: near,
  });
}

export function shouldOwnerThink(tick, owner, options = {}) {
  const activity = owner && owner.activity;
  const tier = activity && activity.simTier;
  if (tier === SIM_TIER.S2_ABSTRACT || tier === SIM_TIER.S3_DORMANT || tier === SIM_TIER.S4_AGGREGATE) {
    if (!(activity && activity.pinnedExact)) return false;
  }
  if (tier === SIM_TIER.S1_NEAR && !(activity && activity.pinnedExact)) {
    // Own period only. Glass callers pass activePeriodTicks: 1; inheriting that made S1 60 Hz.
    const named = Number(options.nearPeriodTicks);
    const period = Math.max(1, Math.floor(Number.isFinite(named) && named >= 1 ? named : 2));
    const key = owner && (owner.id != null ? `near:${owner.id}` : `near:${options.ownerKey || 'anon'}`);
    return shouldRunOnTick(tick, key, period);
  }
  if (!isActiveOwner(owner, options)) {
    const period = Math.max(1, Math.floor(Number(options.sleepPeriodTicks) || 8));
    const key = owner && (owner.id != null ? `sleep:${owner.id}` : `sleep:${options.ownerKey || 'anon'}`);
    return shouldRunOnTick(tick, key, period);
  }
  const period = Math.max(1, Math.floor(Number(options.activePeriodTicks) || 1));
  const key = owner && (owner.id != null ? `active:${owner.id}` : `active:${options.ownerKey || 'anon'}`);
  return shouldRunOnTick(tick, key, period);
}

export const NEAR_WORK_TOKEN_BUDGET = 16;

function ownerIsAlwaysAwake(owner, state) {
  if (!owner) return false;
  if (owner.isPlayer === true || (state && owner.id === state.playerId)) return true;
  const ai = ownerAiRecord(owner);
  return !!(ai && ai.combatant === true);
}

/**
 * Deterministic slice of S1 civilians that may think this tick. Hostiles and the
 * player are always included and do not consume the budget. Walk order is the
 * live shipLike index (spawn order).
 */
export function stampNearWorkBudget(state, budget = NEAR_WORK_TOKEN_BUDGET) {
  const set = new Set();
  if (!state) return set;
  const ships = (state.entityIndex && state.entityIndex.shipLike) || [];
  const tick = state.tick | 0;
  const limit = Math.max(1, Math.floor(Number(budget) || NEAR_WORK_TOKEN_BUDGET));
  const n = ships.length;
  const start = n ? ((tick * limit) % n) : 0;
  let granted = 0;
  for (let i = 0; i < n; i++) {
    const entity = ships[(start + i) % n];
    if (!entity || entity.alive === false) continue;
    if (ownerIsAlwaysAwake(entity, state)) {
      set.add(entity.id);
      continue;
    }
    const tier = entity.activity && entity.activity.simTier;
    if (tier && tier !== SIM_TIER.S1_NEAR) continue;
    if (granted >= limit) continue;
    set.add(entity.id);
    granted++;
  }
  state.nearWorkIds = set;
  return set;
}

export function hasNearWorkSlot(state, entity) {
  if (!entity) return false;
  if (ownerIsAlwaysAwake(entity, state)) return true;
  const set = state && state.nearWorkIds;
  if (!set) return true;
  return set.has(entity.id);
}

function compareStableIds(left, right) {
  if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Count-based cooperative slice for NEAR owners (traffic/law/npcJobs/scanner).
 * Leftover work resumes next primary tick in stable ID order. Not wall time.
 */
export function takeNearWorkSlice(
  state,
  ownerKey,
  items,
  getId = (item) => item && item.id,
  budget = NEAR_WORK_TOKEN_BUDGET,
) {
  const list = Array.isArray(items) ? items : [];
  const n = list.length;
  if (n === 0) return list;
  const limit = Math.max(1, Math.floor(Number(budget) || NEAR_WORK_TOKEN_BUDGET));
  if (!state || n <= limit) return list;
  const order = list.map((item, index) => ({ item, id: getId(item), index }));
  order.sort((a, b) => {
    const cmp = compareStableIds(a.id, b.id);
    return cmp !== 0 ? cmp : a.index - b.index;
  });
  const cursors = state.nearWorkCursors || (state.nearWorkCursors = Object.create(null));
  const key = String(ownerKey || 'near');
  const cursor = cursors[key] | 0;
  const out = [];
  for (let i = 0; i < limit; i++) out.push(order[(cursor + i) % n].item);
  cursors[key] = (cursor + limit) % n;
  return out;
}
