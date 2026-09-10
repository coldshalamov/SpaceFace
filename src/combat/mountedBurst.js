// Tactical burst opens a firing window for an armed NPC. Its mounted weapons own damage,
// capacitor and heat; the action must not add an invisible, unavoidable second attack.
export function usesMountedBurst(actor, actionId, playerId) {
  return actionId === 'action_burst' && actor?.type === 'ship' && actor.id !== playerId
    && Array.isArray(actor.data?.weapons) && actor.data.weapons.length > 0;
}

export function mountedBurstRange(actor, fallback) {
  let range = 0;
  for (const weapon of actor?.data?.weapons || []) {
    if (Number.isFinite(weapon.range) && weapon.range > range) range = weapon.range;
  }
  return range || fallback;
}
