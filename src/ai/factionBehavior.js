// Typed K1 behavior profile shared by authored presence data and the live SG-06 adapters.
// Incomplete rows fail closed: tactical code never invents pursuit, range, formation, retreat,
// or doctrine values for a faction presence that omitted them.

const LIVE_FORMATIONS = new Set(['line', 'ring', 'wedge']);
const COMBAT_DOCTRINES = new Set(['interceptor_flyby', 'tether_control_raider', 'ranged_disengager']);

export function normalizeFactionBehaviorProfile(value) {
  if (!value || typeof value !== 'object') return null;
  const pursuitCommitment = Number(value.pursuitCommitment);
  const preferredRange = Number(value.preferredRange);
  const liveFormation = String(value.liveFormation || '');
  const retreatHullFraction = Number(value.retreatHullFraction);
  const combatDoctrineId = String(value.combatDoctrineId || '');
  if (!Number.isFinite(pursuitCommitment) || pursuitCommitment < 0 || pursuitCommitment > 1) return null;
  if (!Number.isFinite(preferredRange) || preferredRange <= 0) return null;
  if (!LIVE_FORMATIONS.has(liveFormation)) return null;
  if (!Number.isFinite(retreatHullFraction) || retreatHullFraction <= 0 || retreatHullFraction >= 1) return null;
  if (!COMBAT_DOCTRINES.has(combatDoctrineId)) return null;
  if (typeof value.disableThenRun !== 'boolean') return null;
  if (typeof value.firstFire !== 'boolean') return null;
  const firstFireAgainst = Array.isArray(value.firstFireAgainst)
    ? value.firstFireAgainst.filter((id) => typeof id === 'string' && id).map(String)
    : [];
  const stationDefenseAggression = Number(value.stationDefenseAggression);
  const disableChance = Number(value.disableChance ?? value.disableIntent);
  if (!Number.isFinite(stationDefenseAggression) || stationDefenseAggression < 0 || stationDefenseAggression > 1) return null;
  if (!Number.isFinite(disableChance) || disableChance < 0 || disableChance > 1) return null;
  if (typeof value.destroyTarget !== 'boolean') return null;
  return Object.freeze({
    pursuitCommitment,
    preferredRange,
    liveFormation,
    retreatHullFraction,
    combatDoctrineId,
    disableThenRun: value.disableThenRun,
    firstFire: value.firstFire,
    firstFireAgainst: Object.freeze(firstFireAgainst),
    firstFireCondition: typeof value.firstFireCondition === 'string' ? value.firstFireCondition : null,
    stationDefenseAggression,
    disableChance,
    destroyTarget: value.destroyTarget,
    fixedRoute: value.fixedRoute === true,
  });
}

export function sameFactionBehaviorProfile(a, b) {
  const left = normalizeFactionBehaviorProfile(a);
  const right = normalizeFactionBehaviorProfile(b);
  return !!left && !!right
    && left.pursuitCommitment === right.pursuitCommitment
    && left.preferredRange === right.preferredRange
    && left.liveFormation === right.liveFormation
    && left.retreatHullFraction === right.retreatHullFraction
    && left.combatDoctrineId === right.combatDoctrineId
    && left.disableThenRun === right.disableThenRun
    && left.firstFire === right.firstFire
    && left.firstFireAgainst.join('|') === right.firstFireAgainst.join('|')
    && left.firstFireCondition === right.firstFireCondition
    && left.stationDefenseAggression === right.stationDefenseAggression
    && left.disableChance === right.disableChance
    && left.destroyTarget === right.destroyTarget
    && left.fixedRoute === right.fixedRoute;
}
