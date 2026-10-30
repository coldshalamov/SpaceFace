// PQ-147.01 — NPC roles use the same field tools the player has.
// Policy only: scavengers plow a cone through loose cargo/debris/wrecks.
// Anchor specialists already register wells via hull `fieldAnchor` (spawn-time).
// This module never writes physics, HP, or a second field kernel.

import { FIELD_DEFS } from '../data/fields.js';

export const CIVILIAN_CLEARING_TUNING = Object.freeze({
  radius: 120,
  strength: 32,
  clearingSpeed: 18,
  responseS: 0.6,
});
export const CIVILIAN_CLEARING_TYPES = Object.freeze(['pickup', 'wreck', 'payload']);

export const NPC_FIELD_ROLES = Object.freeze({
  SCAVENGER_CONE: 'scavenger_cone',
  ANCHOR_WELL: 'anchor_well',
});

// Ordinary-traffic wreck workers share the player's clearing cone. Combat scavenger
// doctrine stays on the same tool. Sweeper / salvor already exist in TRAFFIC_ROLES.
const CONE_TRAFFIC_ROLES = new Set(['scavenger', 'scavengers', 'sweeper', 'salvor']);

const LOOSE_MASS_TYPES = new Set(['pickup', 'wreck', 'payload']);

const EMPTY_AI = Object.freeze({});

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function npcFieldRole(entity) {
  if (!entity || entity.alive === false || entity.type !== 'ship') return null;
  if (entity.id != null && entity.isPlayer) return null;
  const data = entity.data || {};
  const ai = data.ai || EMPTY_AI;
  // Traffic/doctrine bindings are authored at spawn and almost never rewritten in place. Cache the
  // resolved role against the live data/ai object identities so fields.js stops re-stringifying
  // every ship every tick (fresh profile: npcFieldRole ~20 ms self / 60 s).
  if (entity._sfNpcFieldData === data
    && entity._sfNpcFieldAi === ai
    && entity._sfNpcFieldRoleCached === true) {
    return entity._sfNpcFieldRole;
  }
  const loot = data.lootTableId || data.enemyTypeId;
  let role = null;
  if (loot === 'field_anchor_controller' || ai.combatDoctrineId === 'field_anchor_controller') {
    role = NPC_FIELD_ROLES.ANCHOR_WELL;
  } else {
    const doctrine = String(ai.doctrine || '');
    const trafficRole = String(data.trafficRole || data.role || ai.role || '').toLowerCase();
    if (doctrine === 'scavenger' || CONE_TRAFFIC_ROLES.has(trafficRole)) {
      role = NPC_FIELD_ROLES.SCAVENGER_CONE;
    }
  }
  entity._sfNpcFieldData = data;
  entity._sfNpcFieldAi = ai;
  entity._sfNpcFieldRole = role;
  entity._sfNpcFieldRoleCached = true;
  return role;
}

function looseMassLists(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1) {
    return [index.pickups, index.wrecks, index.payloads];
  }
  return [state && state.entityList];
}

export function nearbyLooseMass(entity, state, radius = 260) {
  if (!entity || !entity.pos || !state) return null;
  const r2 = radius * radius;
  const lists = looseMassLists(state);
  for (let i = 0; i < lists.length; i++) {
    const list = lists[i];
    if (!list) continue;
    for (let j = 0; j < list.length; j++) {
      const other = list[j];
      if (!other || other === entity || other.alive === false || !other.pos) continue;
      if (!LOOSE_MASS_TYPES.has(other.type) && !(other.data && other.data.majorDebris)) continue;
      const dx = finite(other.pos.x) - finite(entity.pos.x);
      const dz = finite(other.pos.z) - finite(entity.pos.z);
      if (dx * dx + dz * dz <= r2) return other;
    }
  }
  return null;
}

// A civilian worker clears one loose workpiece. Combat scavengers keep the full physical
// cone; an ordinary salvage shift must not turn the whole asteroid belt into ammunition.
export function isCivilianClearingWorker(entity) {
  const data = entity?.data || EMPTY_AI, ai = data.ai || EMPTY_AI;
  const role = String(data.trafficRole || data.role || '').toLowerCase();
  return (role === 'salvor' || role === 'sweeper')
    && ai.passive !== false && ai.doctrine !== 'scavenger';
}

function civilianWorkTarget(entity, state, opts) {
  const tuning = CIVILIAN_CLEARING_TUNING, def = FIELD_DEFS.cone;
  const dirX = Math.cos(finite(entity.rot)), dirZ = Math.sin(finite(entity.rot));
  const x = finite(entity.pos?.x) + dirX * def.originGap;
  const z = finite(entity.pos?.z) + dirZ * def.originGap;
  const radius = Math.min(tuning.radius, Number.isFinite(opts.radius) && opts.radius > 0 ? opts.radius : tuning.radius);
  let best = null, bestDistance = Infinity;
  const lists = looseMassLists(state);
  for (let i = 0; i < lists.length; i++) {
    const list = lists[i];
    if (!list) continue;
    for (let j = 0; j < list.length; j++) {
      const candidate = list[j];
      if (!candidate || candidate === entity || candidate.alive === false || !candidate.pos
        || !CIVILIAN_CLEARING_TYPES.includes(candidate.type) || candidate.physicsBody?.dynamic === false) continue;
      const dx = finite(candidate.pos.x) - x, dz = finite(candidate.pos.z) - z;
      const distance = dx * dx + dz * dz, along = dx * dirX + dz * dirZ;
      if (!(distance < radius * radius) || along < 0
        || Math.abs(dx * dirZ - dz * dirX) > along * Math.tan(def.halfAngleRad)) continue;
      const vx = finite(candidate.vel?.x) - finite(entity.vel?.x);
      const vz = finite(candidate.vel?.z) - finite(entity.vel?.z);
      // Already-fast material keeps its momentum. A worker simply stops adding force to it.
      if (Math.hypot(vx, vz) >= tuning.clearingSpeed) continue;
      const sameLife = candidate.id === opts.targetId
        && (!Number.isSafeInteger(opts.targetGeneration) || candidate.occupantGeneration === opts.targetGeneration);
      if (sameLife) return { target: candidate, radius, alongSpeed: vx * dirX + vz * dirZ };
      if (distance < bestDistance || (distance === bestDistance && String(candidate.id) < String(best?.id))) {
        best = candidate; bestDistance = distance;
      }
    }
  }
  if (!best) return null;
  return { target: best, radius,
    alongSpeed: (finite(best.vel?.x) - finite(entity.vel?.x)) * dirX
      + (finite(best.vel?.z) - finite(entity.vel?.z)) * dirZ };
}

/**
 * Pure intent: whether this NPC should hold a field this tick.
 * Anchor wells stay on the spawn-time fieldAnchor owner — do not double-deploy.
 */
export function planNpcFieldDeploy(entity, state, opts = {}) {
  const role = npcFieldRole(entity);
  if (!role) return null;
  if (role === NPC_FIELD_ROLES.ANCHOR_WELL) return null;
  const industrial = isCivilianClearingWorker(entity);
  if (entity.flags && entity.flags.docked) {
    return { action: 'off', kind: 'cone', role, reason: 'docked', ...(industrial ? { industrial: true } : {}) };
  }
  if (industrial) {
    const work = civilianWorkTarget(entity, state, opts);
    if (!work) return { action: 'off', kind: 'cone', role, reason: 'no_workpiece', industrial: true };
    const tuning = CIVILIAN_CLEARING_TUNING;
    return { action: 'on', kind: 'cone', role, reason: 'clearing_workpiece', industrial: true,
      massId: work.target.id, massGeneration: work.target.occupantGeneration,
      radius: work.radius, strength: Math.min(tuning.strength,
        Math.max(0, tuning.clearingSpeed - work.alongSpeed) / tuning.responseS) };
  }
  const radius = Number.isFinite(opts.radius) && opts.radius > 0 ? opts.radius : 260;
  const mass = nearbyLooseMass(entity, state, radius);
  if (!mass) return { action: 'off', kind: 'cone', role, reason: 'no_loose_mass' };
  return {
    action: 'on',
    kind: 'cone',
    role,
    reason: 'loose_mass',
    massId: mass.id,
  };
}

export function applyNpcFieldDeploy(entity, state, fieldsSys) {
  if (!fieldsSys || typeof fieldsSys.applyNpcFieldPlan !== 'function') return null;
  return fieldsSys.applyNpcFieldPlan(state, entity);
}
