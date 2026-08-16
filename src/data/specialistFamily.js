// Plan 15 specialist identity grammar.
//
// Specialists attack one player verb and expose one physical/readable answer. This module binds
// each design role to exactly one stable enemy id without pretending that identity data is a live
// mechanic. Runtime labels are deliberately per capability: an existing hull or encounter does
// not make its planned specialist verb real.

import { ENEMY_TYPES } from './enemies.js';

export const SPECIALIST_ENEMY_IDS = Object.freeze([
  'tether_control_raider',
  'pd_screen_escort',
  'jammer_specialist',
  'bulwark_escort',
  'hostile_repair_tender',
  'mine_layer_jackal',
  'field_anchor_controller',
  'harrier_kiter',
]);

const contract = (fields) => Object.freeze({
  ...fields,
  behavior: Object.freeze(fields.behavior),
  worldTell: Object.freeze(fields.worldTell),
});

export const SPECIALIST_FAMILY = Object.freeze([
  contract({
    key: 'tether_cutter',
    enemyId: 'tether_control_raider',
    attacksVerb: 'massline',
    counterVerb: 'kill_first_or_bait_cut_then_relatch',
    behavior: {
      capability: 'charged_player_tether_shear',
      runtime: 'existing',
      owner: 'tether_cutter_action_cut_v1',
      invariant: 'only the authored cutter objective may shear a foreign player line',
    },
    worldTell: {
      cue: 'glowing_shear_rig_and_charge_whine',
      runtime: 'existing',
      owner: 'tether_cutter_shear_rig_v1',
    },
  }),
  contract({
    key: 'pd_screen',
    enemyId: 'pd_screen_escort',
    attacksVerb: 'missiles_and_ordnance',
    counterVerb: 'guns_beams_or_displace_into_mine',
    behavior: {
      capability: 'ordnance_interception_bubble',
      runtime: 'unwired',
    },
    worldTell: {
      cue: 'interceptor_flashes_around_hull',
      runtime: 'unwired',
    },
  }),
  contract({
    key: 'jammer',
    enemyId: 'jammer_specialist',
    attacksVerb: 'radar_and_targeting',
    counterVerb: 'kill_or_close_inside_fuzz',
    behavior: {
      capability: 'presentation_only_contact_smear',
      runtime: 'existing',
      owner: 'radar_jamming_presentation_v1',
      invariant: 'simulation_contacts_remain_exact',
    },
    worldTell: {
      cue: 'antenna_fan_and_static_shimmer',
      runtime: 'existing',
      owner: 'jammer_antenna_static_comb_v1',
    },
  }),
  contract({
    key: 'shield_projector',
    enemyId: 'bulwark_escort',
    attacksVerb: 'focused_damage',
    counterVerb: 'emp_strip_or_physically_separate_from_wing',
    behavior: {
      capability: 'bounded_wing_shield_projection',
      runtime: 'existing',
      owner: 'bulwark_projected_shield_v1',
    },
    worldTell: {
      cue: 'projector_lines_to_linked_allies',
      runtime: 'unwired',
    },
  }),
  contract({
    key: 'tender',
    enemyId: 'hostile_repair_tender',
    attacksVerb: 'attrition',
    counterVerb: 'kill_or_catch_tender_and_drone_in_well',
    behavior: {
      capability: 'bounded_hull_repair_drone',
      runtime: 'unwired',
    },
    worldTell: {
      cue: 'green_weld_flashes_on_repair_target',
      runtime: 'unwired',
    },
  }),
  contract({
    key: 'minelayer',
    enemyId: 'mine_layer_jackal',
    attacksVerb: 'chase_lines',
    counterVerb: 'detonate_at_range_or_repulse_field',
    behavior: {
      capability: 'dynamic_mine_wake',
      runtime: 'unwired',
    },
    worldTell: {
      cue: 'rack_spine_and_drifting_payload',
      runtime: 'unwired',
    },
  }),
  contract({
    key: 'anchor',
    enemyId: 'field_anchor_controller',
    attacksVerb: 'mobility',
    counterVerb: 'destroy_or_displace_source_hull',
    behavior: {
      capability: 'hull_anchored_snare_field',
      runtime: 'existing',
      owner: 'field_anchor_controller_v1',
    },
    worldTell: {
      cue: 'world_space_field_rim_and_slow_turn',
      runtime: 'existing',
      owner: 'field_anchor_controller_v1',
    },
  }),
  contract({
    key: 'kiter',
    enemyId: 'harrier_kiter',
    attacksVerb: 'patience',
    counterVerb: 'ignore_and_kill_wing',
    behavior: {
      capability: 'low_dps_long_range_disengage',
      runtime: 'unwired',
    },
    worldTell: {
      cue: 'distant_tracer_flashes',
      runtime: 'unwired',
    },
  }),
]);

const BY_ENEMY_ID = new Map(SPECIALIST_FAMILY.map((row) => [row.enemyId, row]));
const BY_KEY = new Map(SPECIALIST_FAMILY.map((row) => [row.key, row]));

export function specialistRecordFor(enemyId) {
  return BY_ENEMY_ID.get(String(enemyId || '')) || null;
}

export function specialistRecordByKey(key) {
  return BY_KEY.get(String(key || '')) || null;
}

export function validateSpecialistFamily(enemyTypes = ENEMY_TYPES) {
  const problems = [];
  const byId = new Map((enemyTypes || []).map((row) => [row.id, row]));
  const seen = new Set();

  if (SPECIALIST_FAMILY.length !== 8) {
    problems.push(`specialist family has ${SPECIALIST_FAMILY.length} roles instead of 8`);
  }
  for (const row of SPECIALIST_FAMILY) {
    if (seen.has(row.enemyId)) problems.push(`${row.key}: enemy id ${row.enemyId} is reused`);
    seen.add(row.enemyId);
    const def = byId.get(row.enemyId);
    if (!def) {
      problems.push(`${row.key}: enemy id ${row.enemyId} is not in the production catalog`);
      continue;
    }
    if (!(Number(def.mass) > 0)) problems.push(`${row.key}: invalid mass ${def.mass}`);
    if (!row.attacksVerb || !row.counterVerb) problems.push(`${row.key}: missing attack/counter verb`);
    if (!row.behavior?.capability || !row.behavior?.runtime) problems.push(`${row.key}: incomplete behavior contract`);
    if (!row.worldTell?.cue || !row.worldTell?.runtime) problems.push(`${row.key}: incomplete world-tell contract`);
  }
  return problems;
}
