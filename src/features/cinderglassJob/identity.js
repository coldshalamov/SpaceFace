import { occupantGenerationOf } from '../../core/entity.js';

// Tokens identify a retained runtime life, not a world clock or a recycled entity id.
let ownerLifetime = 0; // bounded scalar identity; never saved or used for simulation outcomes
export function nextCinderglassLife(state) {
  const serial = ++ownerLifetime;
  return `cinderglass:${state.meta?.seed ?? 0}:${serial}`;
}
export function currentRole(sys, state, key, allowDead = false) {
  const row = sys._bindings?.get(key);
  const entity = row && state.entities?.get(row.entity.id);
  return !!row && entity === row.entity && entity.data === row.data
    && occupantGenerationOf(entity) === row.generation
    && entity.data.cinderglassOperationId === sys._cg?.operationId
    && (allowDead || entity.alive !== false) ? entity : null;
}
export function bindRole(sys, key, entity) {
  if (!entity || !entity.data || occupantGenerationOf(entity) == null) return false;
  sys._bindings ||= new Map();
  sys._bindings.set(key, { entity, data: entity.data, generation: occupantGenerationOf(entity) });
  sys._cg.entities[key] = entity.id;
  return true;
}
export function exactRoleEvent(sys, state, key, payload) {
  const entity = currentRole(sys, state, key, true);
  if (!entity || !payload) return null;
  const id = payload.entityId ?? payload.targetId ?? payload.id;
  if (id !== entity.id) return null;
  const generation = payload.occupantGeneration ?? payload.entityGeneration ?? payload.targetGeneration;
  // Missing generation is acceptable only while the actual witnessed occupant has died.
  if (generation == null ? entity.alive !== false && entity.hull > 0 : generation !== occupantGenerationOf(entity)) return null;
  return entity;
}
