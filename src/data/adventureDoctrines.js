// PQ-133.11 / CRU-060 — Crucible wave roles → living Adventure doctrines.
// Pure frozen data. Uses existing enemy ids and CombatDoctrineId values. No new hulls.
// Campaign pacing stays with the encounter director; this only names who flies the role.

import { SURVIVAL_WAVE_ROLES } from './survivalWaves.js';

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}

export const ADVENTURE_ROLE_DOCTRINES = freezeDeep([
  {
    role: 'mass',
    enemyId: 'wasp_swarmer',
    combatDoctrineId: 'interceptor_flyby',
    living: 'packs in mining belts and claim shadows',
    blurb: 'The Crucible swarm is Reach skiffs that already live in the belt.',
  },
  {
    role: 'pressure',
    enemyId: 'reaver_pirate',
    combatDoctrineId: 'interceptor_flyby',
    living: 'ambush lanes and loaded-hauler hunts',
    blurb: 'Pressure is a commit hull, not a wave timer.',
  },
  {
    role: 'control',
    enemyId: 'tether_control_raider',
    combatDoctrineId: 'tether_control_raider',
    living: 'anti-piracy patrols and Reach Massline theft',
    blurb: 'The tether cutter from the Foundry becomes a living Massline specialist.',
  },
  {
    role: 'reach',
    enemyId: 'quiet_ghost',
    combatDoctrineId: 'ranged_disengager',
    living: 'long-range watches off trade lanes',
    blurb: 'Ghosts already disengage and return on a new bearing.',
  },
  {
    role: 'support',
    enemyId: 'pd_screen_escort',
    combatDoctrineId: 'interceptor_flyby',
    living: 'advanced faction fleets screening a leader',
    blurb: 'The cleanser/screen from the exam wave is a point-defense escort.',
    industrial: { enemyId: 'mule_trader', living: 'repair and haul traffic in industrial sites' },
  },
  {
    role: 'anchor',
    enemyId: 'field_anchor_controller',
    combatDoctrineId: 'field_anchor_controller',
    living: 'convoy defense and claimed-wreck holds',
    blurb: 'The snare barge is a slow command hull that sits on a haul.',
  },
  {
    role: 'disruptor',
    enemyId: 'mine_layer_jackal',
    combatDoctrineId: 'ranged_disengager',
    living: 'refinery routes and salted wakes',
    blurb: 'The mine-layer from the Foundry salts industrial approaches.',
  },
  {
    role: 'elite',
    enemyId: 'corsair_raider',
    combatDoctrineId: 'interceptor_flyby',
    living: 'named aces and faction elites, not a wave-10 clock',
    blurb: 'Elite is a person who comes back, not a boss timer.',
  },
]);

export const ADVENTURE_ROLE_DOCTRINE_BY_ROLE = freezeDeep(
  Object.fromEntries(ADVENTURE_ROLE_DOCTRINES.map((row) => [row.role, row])),
);

export function assertRoleDoctrinesComplete(roles = SURVIVAL_WAVE_ROLES) {
  const mapped = new Set(ADVENTURE_ROLE_DOCTRINES.map((row) => row.role));
  const missing = [];
  for (const role of roles) {
    if (!mapped.has(role)) missing.push(role);
  }
  return { ok: missing.length === 0, missing };
}
