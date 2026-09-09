// W04 point-defense screen policy — pure functions, no world root.
//
// Protection geometry: a defended radius around the escorted charge (ward).
// Target policy: prioritize threats that have entered the screen.
// Saturation: a two-charge acquisition budget with deterministic recovery over sim ticks.
//
// Honest v1: shipped weapons do not consume weapon.intercepts for projectile
// kill/divert at runtime (data-only flag). This module implements
// priority-targeting + recovery-charge cap + doctrine distinction. Projectile
// contacts, when present in the sensor frame, score highest inside the screen.

import { ContactKind, distance2, finite, stableId } from './contracts.js';

export const PD_SCREEN_DEFAULT_RADIUS = 320;
export const PD_SCREEN_MAX_INTERCEPTS = 2;
export const PD_SCREEN_RECOVERY_TICKS = 45;
export const PD_ROLE_IDS = Object.freeze(new Set(['pd_screen_escort']));

/**
 * True when this actor should run PD screen policy (archetype / loot table / flag).
 */
export function isPdScreenActor(entityOrSelf) {
  if (!entityOrSelf) return false;
  if (entityOrSelf.pdScreen === true) return true;
  const data = entityOrSelf.data || null;
  if (data && data.pdScreen === true) return true;
  const role = String(
    (data && (data.lootTableId || data.enemyTypeId || data.role))
    || entityOrSelf.lootTableId
    || entityOrSelf.role
    || '',
  );
  if (PD_ROLE_IDS.has(role)) return true;
  const tags = data && Array.isArray(data.tags) ? data.tags : null;
  if (tags && tags.includes('pd_screen')) return true;
  return false;
}

/**
 * Resolve the escorted charge (ward) for a PD actor.
 * Prefer explicit escortTargetId / activity.targetId / squad leader.
 */
export function resolvePdCharge(self, state, perception = null) {
  const data = (self && self.data) || {};
  const ai = data.ai || {};
  const explicit = ai.escortTargetId != null ? ai.escortTargetId
    : (ai.activity && ai.activity.targetId != null ? ai.activity.targetId : null);
  if (explicit != null && state && state.entities && state.entities.get) {
    const ent = state.entities.get(explicit);
    if (ent && ent.alive) return ent;
  }
  // Squad leader (if this member is not the leader).
  const squadId = ai.squadId;
  if (squadId != null && state && state.entityList) {
    let leader = null;
    for (const e of state.entityList) {
      if (!e || !e.alive || e.id === self.id) continue;
      const eAi = e.data && e.data.ai;
      if (!eAi || eAi.squadId !== squadId) continue;
      if (eAi.encounterRole === 'leader' || eAi.role === 'leader') return e;
      if (!leader) leader = e;
    }
    if (leader) return leader;
  }
  // Perception self formation slot as soft anchor is not an entity; fall back to self (screen self).
  if (perception && perception.self && perception.self.escortTargetId != null) {
    const ent = state && state.entities && state.entities.get(perception.self.escortTargetId);
    if (ent && ent.alive) return ent;
  }
  return self;
}

/**
 * Score a contact for PD interception. Higher = more urgent.
 * Inside-screen threats beat outside; projectiles beat ships inside the screen.
 */
export function scorePdThreat(contact, chargePos, screenRadius, selfPos) {
  if (!contact || contact.alive === false || contact.valid === false) return -Infinity;
  if (contact.hostile === false) return -Infinity;
  if (contact.hostile !== true && contact.kind !== ContactKind.PROJECTILE) return -Infinity;
  // Projectiles from friendlies are not threats (owner team handled by hostile flag when present).
  const pos = contact.pos;
  if (!pos || !chargePos) return -Infinity;
  const distCharge = distance2(pos, chargePos);
  const inside = distCharge <= screenRadius;
  const distSelf = selfPos ? distance2(pos, selfPos) : distCharge;
  let score = 0;
  if (contact.kind === ContactKind.PROJECTILE) {
    score = inside ? 1000 - distCharge * 0.1 : 200 - distCharge * 0.05;
  } else if (contact.kind === ContactKind.SHIP) {
    if (contact.hostile !== true) return -Infinity;
    score = inside ? 500 - distCharge * 0.1 : 50 - distCharge * 0.02;
    score += finite(contact.threat, 0) * 20;
  } else {
    return -Infinity;
  }
  // Prefer nearer to self among equal urgency (engagement feasibility).
  score -= distSelf * 0.01;
  return score;
}

/**
 * Select the best intercept target under saturation.
 * @returns {{ targetId: *, score: number, inside: boolean, kind: string } | null}
 */
export function selectPdInterceptTarget({
  self,
  charge,
  contacts,
  screenRadius = PD_SCREEN_DEFAULT_RADIUS,
  saturation = null,
  tick = 0,
} = {}) {
  if (!self || !Array.isArray(contacts)) return null;
  const chargePos = (charge && charge.pos) || self.pos;
  const selfPos = self.pos;
  const radius = Number.isFinite(screenRadius) ? screenRadius : PD_SCREEN_DEFAULT_RADIUS;

  // Saturation: block new target acquisitions while every recovery charge is spent.
  if (saturation && !pdSaturationAllows(saturation, tick)) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const contact of contacts) {
    if (!contact || contact.id === self.id) continue;
    if (charge && contact.id === charge.id) continue;
    const score = scorePdThreat(contact, chargePos, radius, selfPos);
    if (score <= bestScore) {
      if (score === bestScore && best && stableId(contact.id) < stableId(best.targetId)) {
        // stable tie-break already prefer lower id when scores equal via replacement rule below
      } else {
        continue;
      }
    }
    if (score > bestScore || (score === bestScore && best && stableId(contact.id) < stableId(best.targetId))) {
      bestScore = score;
      const distCharge = distance2(contact.pos, chargePos);
      best = {
        targetId: contact.id,
        score: bestScore,
        inside: distCharge <= radius,
        kind: contact.kind,
      };
    }
  }
  return best;
}

/** Mutable saturation ledger on entity.data.pdScreenRuntime. */
export function ensurePdSaturation(entity) {
  const data = entity.data || (entity.data = {});
  if (!data.pdScreenRuntime) {
    data.pdScreenRuntime = {
      activeIntercepts: 0,
      lastReleaseTick: -Infinity,
      maxIntercepts: PD_SCREEN_MAX_INTERCEPTS,
      recoveryTicks: PD_SCREEN_RECOVERY_TICKS,
      saturationModel: 'recovery_charges',
    };
  }
  return data.pdScreenRuntime;
}

export function pdSaturationAllows(sat, tick) {
  if (!sat) return true;
  const max = Number.isFinite(sat.maxIntercepts) ? sat.maxIntercepts : PD_SCREEN_MAX_INTERCEPTS;
  recoverPdSaturation(sat, tick);
  return (sat.activeIntercepts || 0) < max;
}

export function recoverPdSaturation(sat, tick) {
  if (!sat) return;
  const recovery = Number.isFinite(sat.recoveryTicks) ? sat.recoveryTicks : PD_SCREEN_RECOVERY_TICKS;
  const last = Number.isFinite(sat.lastReleaseTick) ? sat.lastReleaseTick : -Infinity;
  if (!(sat.activeIntercepts > 0)) return;
  if (!Number.isInteger(tick) || tick - last < recovery) return;
  // Recover one slot per recovery window.
  const steps = Math.floor((tick - last) / recovery);
  if (steps <= 0) return;
  sat.activeIntercepts = Math.max(0, (sat.activeIntercepts || 0) - steps);
  sat.lastReleaseTick = last + steps * recovery;
}

export function beginPdIntercept(sat, tick) {
  if (!sat) return false;
  if (!pdSaturationAllows(sat, tick)) return false;
  sat.activeIntercepts = (sat.activeIntercepts || 0) + 1;
  if (!Number.isFinite(sat.lastReleaseTick) || sat.lastReleaseTick < 0) sat.lastReleaseTick = tick;
  return true;
}

/** Free one spent charge early when an authoritative intercept-lifecycle receipt exists. */
export function releasePdIntercept(sat, tick) {
  if (!sat) return;
  sat.activeIntercepts = Math.max(0, (sat.activeIntercepts || 0) - 1);
  sat.lastReleaseTick = tick;
}

/**
 * Balanced / non-PD focus: nearest hostile ship (no screen geometry, no projectile priority).
 * Used by suite to prove measurable doctrine distinction under identical inputs.
 */
export function selectBalancedTarget(contacts, selfPos) {
  if (!Array.isArray(contacts) || !selfPos) return null;
  let best = null;
  let bestD = Infinity;
  for (const c of contacts) {
    if (!c || c.kind !== ContactKind.SHIP || c.hostile !== true || c.alive === false) continue;
    const d = distance2(c.pos, selfPos);
    if (d < bestD || (d === bestD && best && stableId(c.id) < stableId(best.targetId))) {
      bestD = d;
      best = { targetId: c.id, score: -d, inside: false, kind: c.kind };
    }
  }
  return best;
}
