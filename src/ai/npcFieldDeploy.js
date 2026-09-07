// PQ-147.01 — NPC roles use the same field tools the player has.
// Policy only: scavengers plow a cone through loose cargo/debris/wrecks.
// Anchor specialists already register wells via hull `fieldAnchor` (spawn-time).
// This module never writes physics, HP, or a second field kernel.

export const NPC_FIELD_ROLES = Object.freeze({
  SCAVENGER_CONE: 'scavenger_cone',
  ANCHOR_WELL: 'anchor_well',
});

const LOOSE_MASS_TYPES = new Set(['pickup', 'wreck', 'payload']);

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function npcFieldRole(entity) {
  if (!entity || entity.alive === false || entity.type !== 'ship') return null;
  if (entity.id != null && entity.isPlayer) return null;
  const data = entity.data || {};
  const ai = data.ai || {};
  const loot = data.lootTableId || data.enemyTypeId;
  if (loot === 'field_anchor_controller' || ai.combatDoctrineId === 'field_anchor_controller') {
    return NPC_FIELD_ROLES.ANCHOR_WELL;
  }
  const doctrine = String(ai.doctrine || '');
  const role = String(data.trafficRole || data.role || ai.role || '');
  if (doctrine === 'scavenger' || role === 'scavenger' || role === 'scavengers') {
    return NPC_FIELD_ROLES.SCAVENGER_CONE;
  }
  return null;
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

/**
 * Pure intent: whether this NPC should hold a field this tick.
 * Anchor wells stay on the spawn-time fieldAnchor owner — do not double-deploy.
 */
export function planNpcFieldDeploy(entity, state, opts = {}) {
  const role = npcFieldRole(entity);
  if (!role) return null;
  if (role === NPC_FIELD_ROLES.ANCHOR_WELL) return null;
  if (entity.flags && entity.flags.docked) {
    return { action: 'off', kind: 'cone', role, reason: 'docked' };
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
