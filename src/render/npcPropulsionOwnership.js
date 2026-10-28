// New ordinary-NPC propulsion belongs to a currently presented hull. This is not an
// authored-asset gate: visible procedural hulls use the same ownership contract.
export const NPC_PROPULSION_ANCESTOR_LIMIT = 64;

export function npcPropulsionVisible(state, entity, scene) {
  // Player propulsion and unrelated effect types retain their existing admission policies.
  if (!entity || (entity.type !== 'ship' && entity.type !== 'drone') || entity.id === state?.playerId) return true;
  if (!entity.alive || state?.entities?.get?.(entity.id) !== entity) return false;
  if (!scene || scene !== state?.render?.scene) return false;
  let node = entity.mesh;
  for (let depth = 0; node && depth < NPC_PROPULSION_ANCESTOR_LIMIT; depth++) {
    if (node.visible === false) return false;
    if (node === scene) return true;
    node = node.parent;
  }
  // Missing/detached/wrong-scene roots and malformed or excessively deep chains
  // cannot prove ownership. Never traverse siblings or inspect asset readiness.
  return false;
}
