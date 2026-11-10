import { authoritativeAssignmentTargetId } from '../ai/doctrine.js';
import { CONTACT_HAIL_RANGE } from '../data/contactHail.js';
import { isPlayerWanted } from './heat.js';

export const SCANNER_CONTACT_RANGE = CONTACT_HAIL_RANGE;

const UNSAFE_PLAYER_SECURITY = 0.45;
const LANE_CONTEXT_INNER_R = 900;
const LANE_CONTEXT_OUTER_R = 2200;
const PLAYER_DANGER_CONTEXTS = new Set([
  'interdiction', 'spawn_request', 'bounty_hunter', 'mission', 'encounter', 'tutorial_pirate',
  'zone_hostile',
]);

const NONCOMBAT_TRAFFIC_ROLES = new Set([
  'hauler', 'courier', 'miner', 'mining_barge', 'surveyor', 'salvor', 'tender', 'ore_carrier',
  'express', 'liner', 'rescue', 'tourist', 'tanker', 'arclight', 'civilian', 'trader',
  'fleeing_trader', 'smuggler', 'barge',
]);

function factionAggroOnPlayer(e, state) {
  const factions = state && state.factions;
  if (!factions || e.factionId == null) return false;
  const rec = factions[e.factionId];
  return !!(rec && rec.aggro === true);
}

function aggroCombatCapable(e, ai, data, state) {
  if (!e || (e.type !== 'ship' && e.type !== 'drone')) return false;
  if (ai && ai.passive) return false;
  const trafficRole = String(data.trafficRole || data.role || data.presentationRole || '').toLowerCase();
  if (NONCOMBAT_TRAFFIC_ROLES.has(trafficRole)) return false;
  if (Array.isArray(data.weapons) && data.weapons.length > 0) return true;
  const runtime = state && state.combat && state.combat.entities
    ? state.combat.entities[String(e.id)]
    : null;
  const caps = runtime && runtime.capabilities;
  if (Array.isArray(caps)) return caps.includes('ranged');
  return !!(caps && caps.ranged === true);
}

export function isHostileToPlayer(e, playerTeam, state) {
  if (!e || e.team === playerTeam || e.team === 0) return false;
  const playerId = state && state.playerId;
  const data = e.data || {};
  const ai = data.ai || null;
  const combat = data.combat || null;
  const intent = data.intent || null;
  const targetsPlayer = !!(combat && playerId != null && (combat.targetId === playerId || combat.lockTarget === playerId));
  if (ai && ai.passive) return false;
  if (e.team === 2) return false;
  const factionAggro = factionAggroOnPlayer(e, state);
  if (ai && ai.lawful) return ai.securityTargetId === playerId || isPlayerWanted(state) || factionAggro;
  if (ai && ai.retaliationTargetId === playerId) return true;
  if (ai && Array.isArray(ai.hostileTeams) && ai.hostileTeams.includes(playerTeam)) return true;
  if (targetsPlayer) return true;
  if (intent && intent.fire && targetsPlayer) return true;
  if (ai && (ai.forcePlayerTarget || ai.huntPlayer)) return true;
  if (ai && playerId != null && authoritativeAssignmentTargetId(ai.activity) === playerId) return true;
  if (data.encounter) return true;
  const standingHostileBelow = ai && ai.standingHostileBelow;
  if (Number.isFinite(standingHostileBelow) && e.factionId) {
    const standing = state && state.factions && state.factions[e.factionId];
    const rep = standing && Number.isFinite(Number(standing.rep)) ? Number(standing.rep) : 0;
    if (rep >= standingHostileBelow) return false;
  }
  const context = String((ai && (ai.spawnContext || ai.context)) || '');
  if (PLAYER_DANGER_CONTEXTS.has(context)) return true;
  if (data.onboardingRaidWing === true && state?.onboarding?.raid?.active && !state?.onboarding?.raid?.wingDone) return true;
  const archetype = String((ai && (ai.archetype || ai.doctrine || ai.role)) || data.role || data.scenarioRole || '').toLowerCase();
  if (archetype.includes('trad') || archetype.includes('miner') || archetype.includes('civilian')) return false;
  if (context !== 'ambient' && archetype.includes('pirate')) return true;
  if (factionAggro && aggroCombatCapable(e, ai, data, state)) return true;
  if (data.foldAberrant) return false;
  const security = finiteNumber(ai && ai.sectorSecurity, currentSectorSecurity(state));
  const tier = finiteNumber(ai && ai.sectorTier, currentSectorTier(state));
  if ((security <= UNSAFE_PLAYER_SECURITY || tier >= 2) && playerIsInLaneDanger(state)) return true;
  return false;
}

function currentSector(state) {
  const world = state && state.world;
  const id = world && world.currentSectorId;
  return id && world && world.sectors ? world.sectors[id] : null;
}

function currentSectorSecurity(state) {
  const sector = currentSector(state);
  return Number.isFinite(sector && sector.security) ? sector.security : 1;
}

function currentSectorTier(state) {
  const sector = currentSector(state);
  return Number.isFinite(sector && sector.tier) ? sector.tier : 0;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function playerIsInLaneDanger(state) {
  const player = state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  const active = state && state.world && state.world.activeSector;
  const gates = active && Array.isArray(active.gates) ? active.gates : [];
  const hazards = active && Array.isArray(active.hazards) ? active.hazards : [];
  if (!player || !player.pos) return false;
  const inner2 = LANE_CONTEXT_INNER_R * LANE_CONTEXT_INNER_R;
  const outer2 = LANE_CONTEXT_OUTER_R * LANE_CONTEXT_OUTER_R;
  for (const gate of gates) {
    if (!gate || !gate.pos) continue;
    const dx = player.pos.x - gate.pos.x;
    const dz = player.pos.z - gate.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= inner2 && d2 <= outer2) return true;
  }
  for (const hazard of hazards) {
    if (!hazard || !hazard.center || !Number.isFinite(hazard.radius)) continue;
    const dx = player.pos.x - hazard.center.x;
    const dz = player.pos.z - hazard.center.z;
    const radius = Math.max(0, hazard.radius);
    if (dx * dx + dz * dz <= radius * radius) return true;
  }
  return false;
}

const THREAT_MASS_TIERS = [300, 1200, 4000];

export function contactMass(e) {
  if (!e) return 0;
  if (typeof e.mass === 'number') return e.mass;
  return (e.data && typeof e.data.mass === 'number') ? e.data.mass : 0;
}

export function contactThreatTier(e, hostile) {
  const m = contactMass(e);
  let tier = 0;
  for (let i = 0; i < THREAT_MASS_TIERS.length; i++) if (m >= THREAT_MASS_TIERS[i]) tier = i + 1;
  if (hostile && tier < 1) tier = 1;
  return tier;
}
