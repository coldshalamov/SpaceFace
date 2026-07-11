import { normalizeCombatDoctrineId } from './combatDoctrine.js';
import { RulesOfEngagement, normalizeActivity, normalizeRoe } from './doctrine.js';
import { bubblesFor } from '../data/stationBubbles.js';
import { isPlayerWanted } from '../systems/heat.js';
import { isHostileToPlayer } from '../systems/scanner.js';

const TICKS_PER_SECOND = 60;
const MIN_RESPONSE_WINDOW_S = 0.5;
const HELIOS_PROTECTION_RADIUS = 1200;
const LAWFUL_STATION_PROTECTION_MIN = 600;
const LAWFUL_STATION_FACTIONS = new Set([
  'faction_scn',
  'faction_mts',
  'faction_dmc',
  'faction_free',
]);
const DOCTRINE_FIRE_PHASES = Object.freeze({
  interceptor_flyby: new Set(['strike', 'commit']),
  ranged_disengager: new Set(['fire_window']),
  tether_control_raider: new Set(),
});

/**
 * The final fail-closed gate shared by ordinary weapon intent and SG-03 damage actions.
 * Squad selection is advisory; this function revalidates live hostility, authored motive,
 * response/telegraph time, doctrine phase, leash, and station jurisdiction at execution time.
 */
export function authorizeAIEngagement({
  state,
  self,
  target,
  tick = state && state.tick,
  objectiveReason = null,
  hostile = null,
  wanted = isPlayerWanted(state),
  recentlyDamaged = false,
} = {}) {
  if (!state || !self || !target || self.alive === false || target.alive === false) return denied('actor_or_target_missing');
  if (self.id == null || target.id == null || self.id === target.id) return denied('invalid_target');
  const ai = self.data && self.data.ai;
  if (!ai || ai.passive) return denied('passive');
  if (normalizeRoe(ai.roe) === RulesOfEngagement.HOLD_FIRE) return denied('hold_fire');

  for (const key of ['motive', 'engagementTrigger', 'zoneId', 'approachTelegraph']) {
    if (!nonEmpty(ai[key])) return denied(key);
  }
  const doctrineId = normalizeCombatDoctrineId(ai.combatDoctrineId);
  if (!doctrineId) return denied('combat_doctrine');
  const activity = normalizeActivity(ai.activity);
  if (!activity) return denied('activity');

  const liveHostile = hostile == null ? isHostileForAI(state, self, target) : hostile === true;
  if (!liveHostile) return denied('target_not_hostile');

  const windowS = Number(ai.noFireResponseWindowS);
  if (!Number.isFinite(windowS) || windowS < MIN_RESPONSE_WINDOW_S) return denied('noFireResponseWindowS');
  const nowTick = Number.isInteger(tick) ? tick : 0;
  const armedTick = activity.startedTick + Math.ceil(windowS * TICKS_PER_SECOND);
  if (nowTick < armedTick) return denied('response_window');

  const phase = doctrinePhase(objectiveReason, doctrineId);
  if (!phase || !DOCTRINE_FIRE_PHASES[doctrineId]?.has(phase)) return denied('doctrine_fire_window');

  const protection = protectedStationAt(state, target);
  if (protection) {
    const lawfulEnforcement = !!ai.lawful && (wanted || recentlyDamaged)
      && (ai.engagementTrigger === 'wanted_status' || ai.engagementTrigger === 'player_attack'
        || ai.engagementTrigger === 'security_response');
    if (!lawfulEnforcement) return denied('station_protection');
  }

  return allowed();
}

/** Fresh hostility oracle for tactical perception and final execution authority. */
export function isHostileForAI(state, self, other) {
  if (!self || !other || self.team == null || other.team == null) return false;
  if (self.id === other.id || self.team === other.team) return false;

  const selfIsPlayer = !!(state && self.id === state.playerId);
  const otherIsPlayer = !!(state && other.id === state.playerId);
  if (selfIsPlayer) return isHostileToPlayer(other, self.team, state);
  if (otherIsPlayer) return isHostileToPlayer(self, other.team, state);

  const selfAi = self.data && self.data.ai || {};
  const otherAi = other.data && other.data.ai || {};
  if (selfAi.passive || otherAi.passive || self.team === 2 || other.team === 2) return false;
  if (selfAi.lawful && otherIsPlayer) return isPlayerWanted(state);
  if (otherAi.lawful && selfIsPlayer) return isPlayerWanted(state);
  return self.team !== other.team;
}

/** Damage-bearing actions are offensive regardless of their display/action id. */
export function isOffensiveActionDef(def) {
  if (!def || typeof def !== 'object') return false;
  const tags = Array.isArray(def.tags) ? def.tags : [];
  if (tags.some((tag) => tag === 'weapon' || tag === 'burst' || tag === 'attack' || tag === 'disable')) return true;
  return Array.isArray(def.effects) && def.effects.some((effect) => effect && effect.type === 'damage');
}

/**
 * Deterministic jurisdiction lookup. Helios deliberately owns a broad starter protection volume;
 * other lawful stations use at least their patrol ring. Pirate/outlaw stations provide no shield.
 */
export function protectedStationAt(state, entity) {
  if (!state || !entity || !entity.pos) return null;
  const stations = stationEntities(state);
  for (const station of stations) {
    if (!station || station.alive === false || !station.pos) continue;
    const stationId = station.data && station.data.stationId || station.stationId || station.id;
    const factionId = station.factionId || station.data && station.data.factionId || null;
    if (stationId !== 'station_helios' && !LAWFUL_STATION_FACTIONS.has(factionId)) continue;
    const rings = bubblesFor(station);
    const radius = stationId === 'station_helios'
      ? Math.max(HELIOS_PROTECTION_RADIUS, rings.patrol.radius)
      : Math.max(LAWFUL_STATION_PROTECTION_MIN, rings.patrol.radius);
    const dx = entity.pos.x - station.pos.x;
    const dz = entity.pos.z - station.pos.z;
    if (dx * dx + dz * dz > radius * radius) continue;
    return Object.freeze({ stationId: String(stationId), factionId, radius });
  }
  return null;
}

function doctrinePhase(reason, doctrineId) {
  const prefix = `combat_doctrine:${doctrineId}:`;
  const text = String(reason || '');
  return text.startsWith(prefix) ? text.slice(prefix.length) : null;
}

function stationEntities(state) {
  if (Array.isArray(state.entityList)) return state.entityList.filter((entity) => entity && entity.type === 'station');
  if (state.entities && typeof state.entities.values === 'function') {
    return [...state.entities.values()].filter((entity) => entity && entity.type === 'station');
  }
  return [];
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function allowed() {
  return { ok: true, reason: 'authorized' };
}

function denied(reason) {
  return { ok: false, reason };
}
