// BP-13/B7 pirate disguise data + reveal helpers.
//
// This module keeps the scanner contract clean: before reveal, the entity is literally neutral
// traffic data; on scan reveal, we mutate normal AI/team fields so scanner.js sees a regular
// hostile pirate without importing this module or coupling hostility to factionId.
import { barkFor } from './barks.js';
import { pirateDoctrineForEntity } from './pirateDoctrines.js';
import { hash32 } from '../core/rng.js';

export const PIRATE_DISGUISE_SCAN_RADIUS = 1200;

const DISGUISE_SKINS = Object.freeze([
  Object.freeze({ role: 'hauler', label: 'Cargo Hauler', archetype: 'fleeing_trader', team: 2, factionId: 'faction_free' }),
  Object.freeze({ role: 'courier', label: 'Courier', archetype: 'fleeing_trader', team: 2, factionId: 'faction_free' }),
  Object.freeze({ role: 'smuggler', label: 'Smuggler', archetype: 'fleeing_trader', team: 2, factionId: 'faction_mts' }),
]);

export function pirateDisguisePlanForEntity(entityOrId) {
  const doctrine = pirateDoctrineForEntity(entityOrId);
  if (!doctrine || doctrine.disguised !== true) return null;
  return {
    doctrineId: doctrine.id,
    trueDoctrine: doctrine.id,
    trueTeam: 1,
    trueFactionId: 'faction_reach',
    trueArchetype: 'pirate_raider',
    revealSituation: 'warn',
  };
}

export function chooseDisguiseSkin(seed, key) {
  const idx = hash32(seed == null ? 0 : seed, key == null ? 'pirate' : key, 'pirateDisguiseSkin') % DISGUISE_SKINS.length;
  return DISGUISE_SKINS[idx];
}

export function applyPirateDisguise(entity, opts = {}) {
  if (!entity) return null;
  const plan = pirateDisguisePlanForEntity(entity);
  if (!plan) return null;
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  const skin = chooseDisguiseSkin(opts.seed, opts.key || ai.squadId || entity.id);
  entity.team = skin.team;
  entity.factionId = skin.factionId;
  ai.passive = true;
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
  ai.archetype = skin.archetype;
  data.trafficRole = skin.role;
  data.trafficLabel = skin.label;
  data.pirateDisguise = {
    disguised: true,
    disguiseRole: skin.role,
    disguiseLabel: skin.label,
    trueTeam: plan.trueTeam,
    trueFactionId: plan.trueFactionId,
    trueArchetype: plan.trueArchetype,
    trueDoctrine: plan.trueDoctrine,
    revealSituation: plan.revealSituation,
  };
  return data.pirateDisguise;
}

export function shouldRevealOnScan(entity, scanPos, radius = PIRATE_DISGUISE_SCAN_RADIUS) {
  if (!entity || entity.alive === false || !scanPos || !entity.pos) return false;
  const data = entity.data || {};
  if (data.disguiseBlown === true) return false;
  if (!data.pirateDisguise || data.pirateDisguise.disguised !== true) return false;
  const dx = (entity.pos.x || 0) - (scanPos.x || 0);
  const dz = (entity.pos.z || 0) - (scanPos.z || 0);
  return dx * dx + dz * dz <= radius * radius;
}

export function revealPirateDisguise(entity, state, opts = {}) {
  if (!entity) return null;
  const data = entity.data || (entity.data = {});
  const disguise = data.pirateDisguise;
  if (!disguise || data.disguiseBlown === true) return null;
  const ai = data.ai || (data.ai = {});
  const playerTeam = state && state.player && Number.isFinite(state.player.team) ? state.player.team : 0;
  const now = state && Number.isFinite(state.simTime) ? state.simTime : 0;

  data.disguiseBlown = true;
  disguise.revealedAt = now;
  disguise.revealedBy = opts.by || 'scan';
  entity.team = Number.isFinite(disguise.trueTeam) ? disguise.trueTeam : 1;
  entity.factionId = disguise.trueFactionId || entity.factionId || 'faction_reach';
  data.trafficRole = 'raider';
  data.trafficLabel = 'Raider';
  ai.passive = false;
  ai.archetype = disguise.trueArchetype || 'pirate_raider';
  ai.doctrine = disguise.trueDoctrine || ai.doctrine || 'thief';
  ai.forcePlayerTarget = true;
  ai.huntPlayer = true;
  ai.fsm = 'attack';
  const teams = new Set(Array.isArray(ai.hostileTeams) ? ai.hostileTeams : []);
  teams.add(playerTeam);
  ai.hostileTeams = [...teams];
  const combat = data.combat || (data.combat = {});
  if (state && state.playerId != null) combat.targetId = state.playerId;
  const intent = data.intent || (data.intent = {});
  intent.fire = false;

  const situation = disguise.revealSituation || 'warn';
  const seed = state && state.meta && state.meta.seed;
  const text = barkFor(entity.factionId, situation, hash32(seed == null ? 0 : seed, entity.id, 'pirateDisguiseReveal'));
  return {
    entityId: entity.id,
    doctrineId: ai.doctrine,
    by: disguise.revealedBy,
    disguiseRole: disguise.disguiseRole || null,
    situation,
    text,
  };
}

export default {
  PIRATE_DISGUISE_SCAN_RADIUS,
  applyPirateDisguise,
  chooseDisguiseSkin,
  pirateDisguisePlanForEntity,
  revealPirateDisguise,
  shouldRevealOnScan,
};
