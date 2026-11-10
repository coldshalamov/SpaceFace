// Shared law-protection classification for simulation adjudication and read-only presentation.
// Keep this module independent of the law system so advisory UI does not import its runtime owner.

export const CERES_AMBUSH_HAULER_SLOT = 'ceres_ambush_loaded_hauler';

const LAW_FACTIONS = new Set(['faction_scn', 'faction_mts', 'faction_dmc', 'faction_free']);

export function isLawfulEntity(entity) {
  if (!entity) return false;
  const ai = entity.data && entity.data.ai || {};
  return ai.lawful === true || (entity.type === 'station' && LAW_FACTIONS.has(entity.factionId));
}

export function isProtectedCivilian(entity) {
  if (!entity || entity.type !== 'ship') return false;
  const data = entity.data || {};
  if (data.activityActorSlotId === CERES_AMBUSH_HAULER_SLOT) return true;
  const ai = data.ai || {};
  const role = String(data.trafficRole || data.role || ai.role || ai.archetype || '').toLowerCase();
  return entity.team === 2 || ai.spawnContext === 'convoy_civilian'
    || ['hauler', 'courier', 'miner', 'trader', 'civilian', 'fleeing_trader'].some((word) => role.includes(word));
}

export function isLawProtectedBody(entity) {
  return isLawfulEntity(entity) || isProtectedCivilian(entity);
}
