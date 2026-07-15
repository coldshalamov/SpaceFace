// Depth Program W1 planet-state data contract.
// Immutable authored identities and future hooks only: no render, scanner, gameplay, or save state.
import { hash32 } from '../core/rng.js';

const EMPTY_ASSIGNMENTS = Object.freeze([]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function stateDef(id, label, baseType, visualRoles, gameplayHooks) {
  return deepFreeze({ id, label, baseType, visualRoles, gameplayHooks });
}

export const PLANET_STATE_DEFS = deepFreeze({
  planet_state_shatterstone: stateDef(
    'planet_state_shatterstone', 'Shatterstone', 'scorched',
    ['fracture_web', 'mantle_bite', 'magma_terminator', 'debris_ring'],
    ['dmc_distress_beacons', 'rare_exotic_ring'],
  ),
  planet_state_vestas_burn: stateDef(
    'planet_state_vestas_burn', "Vesta's Burn", 'lava',
    ['animated_fire_front', 'soot_cloud_band', 'orange_atmosphere', 'seeded_flare_spikes'],
    ['thermal_proximity', 'refined_alloy_cinders'],
  ),
  planet_state_razor_ring: stateDef(
    'planet_state_razor_ring', 'The Razor-Ring', 'ice',
    ['pulverized_ring', 'polar_aurora', 'tilted_crown_variant'],
    ['ring_plane_kinetic_damage', 'crystalline_ring_mining', 'flagship_black_box_bounty'],
  ),
  planet_state_reach_scrawl: stateDef(
    'planet_state_reach_scrawl', 'The Reach Scrawl', 'dead',
    ['planetary_gang_tags', 'emissive_reach_sigils', 'named_ace_kill_tallies'],
    ['named_ace_sector_challenge', 'planetary_tag_bounty_board'],
  ),
});

function placement({ bodyId, stateId, sectorId, variantId, scannerKind, scannerLabel, gameplayHooks, challenge = null }) {
  const seedKey = `w1-v1|${sectorId}|${bodyId}|${variantId}`;
  const row = {
    bodyId,
    stateId,
    sectorId,
    variantId,
    seedKey,
    seed: hash32(...seedKey.split('|')),
    scannerSignal: {
      id: `signal:planet:${bodyId}`,
      kind: scannerKind,
      sourceId: bodyId,
      label: scannerLabel,
    },
    gameplayHooks,
  };
  if (challenge) row.challenge = challenge;
  return deepFreeze(row);
}

export const PLANET_STATE_ASSIGNMENTS = Object.freeze([
  placement({
    bodyId: 'planet_shatterstone', stateId: 'planet_state_shatterstone',
    sectorId: 'sector_charon_expanse', variantId: 'whole',
    scannerKind: 'distress', scannerLabel: 'Pulsing DMC distress signature',
    gameplayHooks: ['dmc_distress_beacons', 'rare_exotic_ring'],
  }),
  placement({
    bodyId: 'planet_vestas_burn', stateId: 'planet_state_vestas_burn',
    sectorId: 'sector_vesta_forge', variantId: 'whole',
    scannerKind: 'anomaly', scannerLabel: 'Heat-plume anomaly',
    gameplayHooks: ['thermal_proximity', 'refined_alloy_cinders'],
  }),
  placement({
    bodyId: 'planet_razor_ring', stateId: 'planet_state_razor_ring',
    sectorId: 'sector_vesta_forge', variantId: 'razor',
    scannerKind: 'ore', scannerLabel: 'Dense crystalline ring',
    gameplayHooks: ['ring_plane_kinetic_damage', 'crystalline_ring_mining', 'polar_radiation'],
  }),
  placement({
    bodyId: 'planet_crown_of_thorns', stateId: 'planet_state_razor_ring',
    sectorId: 'sector_sker_haven', variantId: 'crown_of_thorns',
    scannerKind: 'salvage', scannerLabel: 'Crown of Thorns wreck ring',
    gameplayHooks: ['ring_plane_kinetic_damage', 'wreck_shard_salvage', 'flagship_black_box_bounty'],
  }),
  placement({
    bodyId: 'planet_reach_scrawl_sker', stateId: 'planet_state_reach_scrawl',
    sectorId: 'sector_sker_haven', variantId: 'sker',
    scannerKind: 'ambush', scannerLabel: 'Reach ace challenge tag',
    gameplayHooks: ['named_ace_sector_challenge', 'planetary_tag_bounty_board'],
    challenge: { trigger: 'sector:enter', aceId: 'ace_yara_no_cut' },
  }),
  placement({
    bodyId: 'planet_reach_scrawl_ashfall', stateId: 'planet_state_reach_scrawl',
    sectorId: 'sector_ashfall_reach', variantId: 'ashfall',
    scannerKind: 'ambush', scannerLabel: 'Reach ace challenge tag',
    gameplayHooks: ['named_ace_sector_challenge', 'planetary_tag_bounty_board'],
    challenge: { trigger: 'sector:enter', aceId: 'ace_toll_saint_venn' },
  }),
]);

const ASSIGNMENTS_BY_SECTOR = new Map();
for (const assignment of PLANET_STATE_ASSIGNMENTS) {
  const current = ASSIGNMENTS_BY_SECTOR.get(assignment.sectorId) || [];
  current.push(assignment);
  ASSIGNMENTS_BY_SECTOR.set(assignment.sectorId, current);
}
for (const [sectorId, assignments] of ASSIGNMENTS_BY_SECTOR) {
  ASSIGNMENTS_BY_SECTOR.set(sectorId, Object.freeze(assignments));
}

export function planetStatesForSector(sectorId) {
  return ASSIGNMENTS_BY_SECTOR.get(String(sectorId || '')) || EMPTY_ASSIGNMENTS;
}

/** Project immutable authored planet-state assignments without mutating canonical sector data. */
export function applyPlanetStateAssignments(sector) {
  if (!sector) return sector;
  const assignments = planetStatesForSector(sector.id);
  if (!assignments.length) return sector;
  return { ...sector, planetStates: assignments };
}
