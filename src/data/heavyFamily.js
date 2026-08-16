// Plan 14 heavy/capital identity and physical-part recipes.
//
// This module is deliberately data-only. It gives the upcoming heavy-part runtime stable physical
// identities and unambiguous bindings without pretending that parts can already be shot off. The
// bindings reuse the standard combat profile/subsystem vocabulary; the distinct part ids are what
// the physical-part runtime will own when it is wired.

export const HEAVY_FAMILY_ENEMY_IDS = Object.freeze([
  'heavy_gunship',
  'heavy_ramscoop',
  'heavy_carrier_lite',
  'heavy_foundry',
]);

export const IRON_MAW_ENEMY_ID = 'dreadnought_boss';

const WIRED_PART_OUTCOMES = new Set([
  'detach_as_momentum_debris',
  'disable_drive_and_leave_drifting_barge',
  'disable_committed_burn',
  'remove_ram_plate_authority',
  'disable_drive',
  'reduce_capital_drive_authority',
  'weaken_pd_screen',
  'disable_bound_launch_bay',
  'disable_charged_ore_mine_release',
]);
const partBehavior = (fields) => Object.freeze({
  runtime: fields && WIRED_PART_OUTCOMES.has(fields.onDestroyed) ? 'physical_parts_v1' : 'unwired',
  ...fields,
});
const binding = (fields) => Object.freeze({ ...fields });
const physicalSocket = (fields) => {
  if (!fields) return null;
  const x = Number(fields.x);
  const z = Number(fields.z);
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 1 || Math.abs(z) > 1) {
    throw new Error(`heavy physical socket ${fields.id || 'unnamed'} must use finite normalized coordinates`);
  }
  return Object.freeze({
    id: String(fields.id || ''),
    space: 'parent_radius',
    x,
    z,
  });
};
const part = (id, partRole, subsystemId, partBinding, behaviorFields, socketFields = null) => {
  const socket = physicalSocket(socketFields);
  return Object.freeze({
    id,
    partRole,
    subsystemId,
    binding: binding(partBinding),
    behavior: partBehavior(behaviorFields),
    ...(socket ? { physicalSocket: socket } : {}),
  });
};
const phase = (id, fields) => Object.freeze({
  id,
  runtime: fields.runtime || 'unwired',
  ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [
    key,
    Array.isArray(value) ? Object.freeze([...value]) : value,
  ])),
});
const recipe = (fields) => {
  const { behaviorRuntime = 'unwired', ...authored } = fields;
  return Object.freeze({
    ...authored,
    runtime: 'physical_parts_v1',
    combatProfileId: 'combat_profile_standard_ship',
    behavior: Object.freeze({ runtime: behaviorRuntime, ...fields.behavior }),
    parts: Object.freeze(fields.parts),
    phases: Object.freeze(fields.phases || []),
  });
};

export const HEAVY_PART_RECIPES = Object.freeze([
  recipe({
    id: 'heavy_parts_gunship_v1',
    enemyTypeId: 'heavy_gunship',
    class: 'heavy',
    behavior: {
      fightShape: 'turret_boat_strip_to_drifting_barge',
      counterVerb: 'strip_turrets_then_shove_or_ignore',
      tell: 'wide_hull_and_visible_turret_rings',
    },
    parts: [
      part('heavy_gunship_turret_ring_port', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_autocannon_m', ordinal: 0 },
        { onDestroyed: 'detach_as_momentum_debris' }),
      part('heavy_gunship_turret_ring_starboard', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_autocannon_m', ordinal: 1 },
        { onDestroyed: 'detach_as_momentum_debris' }),
      part('heavy_gunship_pd_ring', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_flak_turret_s', ordinal: 0 },
        { onDestroyed: 'detach_as_momentum_debris' },
        { id: 'aft_pd_ring', x: -0.98, z: 0.12 }),
      part('heavy_gunship_drive_cluster', 'drive', 'subsystem_drive',
        { kind: 'subsystem', socket: 'aft_drive_cluster' },
        { onDestroyed: 'disable_drive_and_leave_drifting_barge' }),
    ],
  }),
  recipe({
    id: 'heavy_parts_ramscoop_v1',
    enemyTypeId: 'heavy_ramscoop',
    class: 'heavy',
    behavior: {
      fightShape: 'committed_ram_and_geometry_overshoot',
      counterVerb: 'dodge_then_use_terrain_against_its_mass',
      tell: 'reinforced_wedge_nose_and_oversized_plume',
    },
    parts: [
      part('heavy_ramscoop_armored_prow', 'prow', 'subsystem_power',
        { kind: 'collision_prow', socket: 'forward_wedge' },
        { onDestroyed: 'remove_ram_plate_authority' }),
      part('heavy_ramscoop_drive_cluster', 'drive', 'subsystem_drive',
        { kind: 'subsystem', socket: 'aft_oversized_drive' },
        { onDestroyed: 'disable_committed_burn' }),
      part('heavy_ramscoop_missile_rack', 'rack', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_missile_rack_m', ordinal: 0 },
        { onDestroyed: 'detach_as_momentum_debris' }),
    ],
  }),
  recipe({
    id: 'heavy_parts_carrier_lite_v1',
    enemyTypeId: 'heavy_carrier_lite',
    class: 'heavy',
    behaviorRuntime: 'physical_parts_v1',
    behavior: {
      fightShape: 'launches_small_screen_until_bays_are_stripped',
      counterVerb: 'destroy_launch_bays_before_the_screen_grows',
      tell: 'paired_hangar_slots_and_launch_flashes',
    },
    parts: [
      part('heavy_carrier_lite_bay_port', 'bay', 'subsystem_weapon',
        { kind: 'launch_bay', launchFamily: 'mote_or_wasp', capacity: 2 },
        { onDestroyed: 'disable_bound_launch_bay' },
        { id: 'launch_bay_port', x: 0.08, z: 0.98 }),
      part('heavy_carrier_lite_bay_starboard', 'bay', 'subsystem_weapon',
        { kind: 'launch_bay', launchFamily: 'mote_or_wasp', capacity: 3 },
        { onDestroyed: 'disable_bound_launch_bay' },
        { id: 'launch_bay_starboard', x: 0.08, z: -0.98 }),
      part('heavy_carrier_lite_pd_ring', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_flak_turret_s', ordinal: 0 },
        { onDestroyed: 'detach_as_momentum_debris' }),
      part('heavy_carrier_lite_laser_ring', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_pulse_laser_m', ordinal: 0 },
        { onDestroyed: 'detach_as_momentum_debris' }),
      part('heavy_carrier_lite_drive_cluster', 'drive', 'subsystem_drive',
        { kind: 'subsystem', socket: 'aft_drive_cluster' },
        { onDestroyed: 'disable_drive' }),
    ],
  }),
  recipe({
    id: 'heavy_parts_foundry_v1',
    enemyTypeId: 'heavy_foundry',
    class: 'heavy',
    behaviorRuntime: 'physical_parts_v1',
    behavior: {
      fightShape: 'close_range_cutters_and_charged_ore_mines',
      counterVerb: 'detonate_or_repulse_the_ore_then_strip_the_rack',
      tell: 'industrial_spine_drill_head_and_yellow_hazard_zones',
    },
    parts: [
      part('heavy_foundry_cutter_port', 'cutter', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_beam_laser_m', ordinal: 0 },
        { onDestroyed: 'detach_as_momentum_debris' },
        { id: 'industrial_cutter_port', x: 0.72, z: 0.72 }),
      part('heavy_foundry_cutter_starboard', 'cutter', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_beam_laser_m', ordinal: 1 },
        { onDestroyed: 'detach_as_momentum_debris' },
        { id: 'industrial_cutter_starboard', x: 0.72, z: -0.72 }),
      part('heavy_foundry_ore_mine_rack', 'rack', 'subsystem_weapon',
        { kind: 'ore_mine_rack', capacity: 3 },
        { onDestroyed: 'disable_charged_ore_mine_release' },
        { id: 'charged_ore_rack', x: -0.2, z: 0.98 }),
      part('heavy_foundry_drive_cluster', 'drive', 'subsystem_drive',
        { kind: 'subsystem', socket: 'aft_industrial_drive' },
        { onDestroyed: 'disable_drive' }),
    ],
  }),
  recipe({
    id: 'capital_parts_iron_maw_v1',
    enemyTypeId: IRON_MAW_ENEMY_ID,
    class: 'capital',
    behaviorRuntime: 'capital_phase_runtime_v1',
    behavior: {
      fightShape: 'pd_screen_then_drives_then_stationary_hulk_decision',
      counterVerb: 'strip_pd_kill_drives_then_salvage_board_or_destroy',
      tell: 'broadside_batteries_pd_screen_and_exposed_drive_quarters',
    },
    parts: [
      part('iron_maw_pd_port_fore', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_flak_turret_s', ordinal: 0 },
        { onDestroyed: 'weaken_pd_screen' }),
      part('iron_maw_pd_port_aft', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_flak_turret_s', ordinal: 1 },
        { onDestroyed: 'weaken_pd_screen' }),
      part('iron_maw_pd_starboard_fore', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_flak_turret_s', ordinal: 2 },
        { onDestroyed: 'weaken_pd_screen' }),
      part('iron_maw_pd_starboard_aft', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_flak_turret_s', ordinal: 3 },
        { onDestroyed: 'weaken_pd_screen' }),
      part('iron_maw_torpedo_tube_port', 'rack', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_torpedo_l', ordinal: 0 },
        { onDestroyed: 'detach_as_momentum_debris' }),
      part('iron_maw_torpedo_tube_starboard', 'rack', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_torpedo_l', ordinal: 1 },
        { onDestroyed: 'detach_as_momentum_debris' }),
      part('iron_maw_broadside_port', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_heavy_beam_l', ordinal: 0 },
        { onDestroyed: 'detach_as_momentum_debris' }),
      part('iron_maw_broadside_starboard', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_heavy_beam_l', ordinal: 1 },
        { onDestroyed: 'detach_as_momentum_debris' }),
      part('iron_maw_autocannon_port_fore', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_autocannon_m', ordinal: 0 },
        { onDestroyed: 'detach_as_momentum_debris' }),
      part('iron_maw_autocannon_port_mid', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_autocannon_m', ordinal: 1 },
        { onDestroyed: 'detach_as_momentum_debris' }),
      part('iron_maw_autocannon_port_aft', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_autocannon_m', ordinal: 2 },
        { onDestroyed: 'detach_as_momentum_debris' }),
      part('iron_maw_autocannon_starboard_fore', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_autocannon_m', ordinal: 3 },
        { onDestroyed: 'detach_as_momentum_debris' }),
      part('iron_maw_autocannon_starboard_mid', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_autocannon_m', ordinal: 4 },
        { onDestroyed: 'detach_as_momentum_debris' }),
      part('iron_maw_autocannon_starboard_aft', 'weapon', 'subsystem_weapon',
        { kind: 'weapon', weaponId: 'wpn_autocannon_m', ordinal: 5 },
        { onDestroyed: 'detach_as_momentum_debris' }),
      part('iron_maw_drive_port', 'drive', 'subsystem_drive',
        { kind: 'subsystem', socket: 'aft_drive_port' },
        { onDestroyed: 'reduce_capital_drive_authority' }),
      part('iron_maw_drive_starboard', 'drive', 'subsystem_drive',
        { kind: 'subsystem', socket: 'aft_drive_starboard' },
        { onDestroyed: 'reduce_capital_drive_authority' }),
      part('iron_maw_boarding_spine', 'bay', 'subsystem_power',
        { kind: 'decision_bay', socket: 'dorsal_boarding_spine' },
        { onExposed: 'offer_board_salvage_or_destroy_decision' }),
    ],
    phases: [
      phase('iron_maw_phase_pd_screen', {
        runtime: 'capital_phase_runtime_v1',
        objectivePartIds: [
          'iron_maw_pd_port_fore',
          'iron_maw_pd_port_aft',
          'iron_maw_pd_starboard_fore',
          'iron_maw_pd_starboard_aft',
        ],
        nextPhaseId: 'iron_maw_phase_drive_kill',
      }),
      phase('iron_maw_phase_drive_kill', {
        runtime: 'capital_phase_runtime_v1',
        requiresPhaseId: 'iron_maw_phase_pd_screen',
        objectivePartIds: ['iron_maw_drive_port', 'iron_maw_drive_starboard'],
        nextPhaseId: 'iron_maw_phase_hulk_decision',
      }),
      phase('iron_maw_phase_hulk_decision', {
        runtime: 'capital_phase_runtime_v1',
        requiresPhaseId: 'iron_maw_phase_drive_kill',
        objectivePartIds: ['iron_maw_boarding_spine'],
        choices: ['board_lite', 'tow', 'destroy'],
      }),
    ],
  }),
]);

export const HEAVY_PART_RECIPE_BY_ENEMY_ID = Object.freeze(Object.fromEntries(
  HEAVY_PART_RECIPES.map((row) => [row.enemyTypeId, row]),
));

export function heavyPartRecipeForEnemy(enemyTypeId) {
  return HEAVY_PART_RECIPE_BY_ENEMY_ID[enemyTypeId] || null;
}
