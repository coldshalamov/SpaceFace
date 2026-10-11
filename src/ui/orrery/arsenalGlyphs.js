// Authored optical drawings on a 24-unit grid. Every silhouette depicts the weapon's
// physical verb; size/unique variants retain their family and add a readable outer feature.
// Shared by outfit rows, Swarm's armory and the flight sockets. No fonts, filters or animation.
import { arsenalIdentity } from '../../data/arsenalIdentity.js';

const P = (d) => ({ tag: 'path', d });
const C = (cx, cy, r) => ({ tag: 'circle', cx, cy, r });
const raw = {
  pulse: [P('M3 15 10 8 14 8 7 15Z M12 16 19 9 M15 19 22 12')],
  slug: [P('M5 18V9L8 4 11 9V18Z M5 13H11 M15 6V11 M19 9V14 M15 17 20 17')],
  flak: [P('M4 20 8 16H16L20 20Z M10 16V11H14V16 M8 10 5 7 M16 10 19 7 M12 8V3 M3 12H6 M18 12H21')],
  concussion: [P('M3 9H9L12 12 9 15H3Z M14 6Q21 12 14 18 M18 3Q27 12 18 21')],
  bank: [P('M3 20 15 8H21 M14 4H21V11 M3 13 8 8 M8 21 13 16 M4 4 7 4')],
  beam: [P('M4 9H8V15H4Z M8 12H21 M11 8H19 M11 16H19')],
  rail: [P('M4 20 18 6 M8 22 22 8 M12 14 21 5 M16 4 21 3 20 8')],
  siege: [P('M4 21 4 14 14 4 20 4 20 10 10 20Z M8 16 17 7 M3 8 8 3 M16 21 21 16')],
  plasma: [P('M12 3C15 7 19 8 19 13A7 7 0 0 1 5 13C5 10 8 8 9 6L10 12Z'), C(12,15,2)],
  missile: [P('M10 16V7L13 3 16 7V16L13 19Z M10 12 6 16V19L10 17 M16 12 20 16V19L16 17 M12 21V23')],
  torpedo: [P('M8 16V7L12 2 16 7V16L12 20Z M8 10H16 M8 13 4 16V20L8 18 M16 13 20 16V20L16 18 M10 22H14')],
  emp: [P('M3 5 8 3V7 M3 5V12Q3 18 8 21 M21 5 16 3V7 M21 5V12Q21 18 16 21 M13 3 8 12H14L10 21 17 10H11')],
  web: [P('M3 5 12 2 21 5 19 16 12 22 5 16Z M3 5 12 11 21 5 M5 16 12 11 19 16 M12 2V22 M5 9 12 6 19 9')],
  marker: [C(12,12,3), P('M3 9V3H9 M15 3H21V9 M21 15V21H15 M9 21H3V15 M8 12H16 M12 8V16')],
  sink: [C(5,12,2), C(19,12,2), P('M7 12H17 M9 6 12 9 15 6 M9 18 12 15 15 18 M3 5V3H7 M17 21H21V17')],
  shunt: [P('M3 5H8L13 12 8 19H3L8 12Z M14 5 20 12 14 19 M20 3V8 M20 16V21')],
  'vector-mine': [C(12,12,4), P('M12 2V6 M12 18V22 M2 12H6 M18 12H22 M8 4 12 2 16 4 M20 8 22 12 20 16 M8 20 12 22 16 20 M4 8 2 12 4 16')],
  wellhead: [C(12,9,3), P('M4 8A8 8 0 0 1 20 8 M5 13 8 18H16L19 13 M8 22H16 M2 6 4 9 7 7 M17 7 20 9 22 6')],
  rcs: [P('M12 6 17 15H7Z M4 8 2 12 5 16 M20 8 22 12 19 16 M8 4H16 M8 20H16 M4 3 20 21')],
  sticky: [C(12,10,5), P('M9 5V2 M15 5V2 M7 10H4 M17 10H20 M7 18H17 M5 21H19 M10 15V18 M14 15V18'), C(12,10,1)],
  primer: [P('M4 4 9 9 M3 12 9 12 M5 20 10 15 M14 4 12 9 17 9 14 14 M12 17 16 21 21 16 17 12Z')],
  'grav-anchor': [C(4,12,2), C(20,12,2), P('M6 12 8 8 10 16 12 8 14 16 16 8 18 12 M8 3 12 5 16 3 M8 21 12 19 16 21')],
  cooker: [P('M3 8H7V16H3Z M7 10H14 M7 14H13 M18 3C14 8 22 9 18 14C14 18 21 20 18 22 M12 3V6 M12 19V22')],
  'mass-driver': [P('M3 9H8V15H3Z M8 12H13 M14 8 19 6 22 10 20 16 15 17 12 13Z M6 4 2 7 M6 20 2 17')],
  polarity: [C(6,7,4), C(18,17,4), P('M4 7H8 M6 5V9 M16 17H20 M10 5Q20 3 21 11 M14 19Q4 21 3 13')],
  viscosity: [P('M3 5Q6 2 9 5T15 5T21 5 M3 19Q6 22 9 19T15 19T21 19 M6 8V16 M11 9V15 M16 10V14 M19 11V13')],
  prism: [P('M12 3 21 19H3Z M1 12H10L20 7 M10 12 21 13 M10 12 21 19')],
  hijacker: [P('M8 5 16 5 18 15 12 19 6 15Z M8 9H16 M9 15 7 21 M12 17V23 M15 15 17 21 M3 13A10 10 0 0 1 12 2 M3 8V13H8')],
  gong: [C(12,12,5), C(12,12,1), P('M4 6A10 10 0 0 0 4 18 M20 6A10 10 0 0 1 20 18 M8 4H16 M12 2V7 M8 21H16')],
  sympathy: [P('M2 8 6 4 10 8 6 12Z M14 16 18 12 22 16 18 20Z M8 10 16 14 M10 4Q20 2 20 10 M4 14Q4 22 14 20')],
  frag: [P('M7 5H17L20 9V18L16 21H8L4 18V9Z M8 3H16 M8 9H16 M8 14H16 M9 7V19 M15 7V19')],
  drum: [P('M8 5H16V19H8Z M8 8H16 M8 16H16 M4 6Q0 12 4 18 M20 6Q24 12 20 18'), C(12,12,2)],
  singularity: [C(12,12,2), P('M4 12C4 1 20 1 20 12S4 23 4 12 M12 4C1 4 1 20 12 20S23 4 12 4')],
  tar: [P('M7 3H17V7C17 10 22 12 20 17Q20 21 16 20Q13 24 10 20Q4 22 3 18C1 12 7 10 7 7Z M7 6H17'), C(8,16,1), C(16,15,1)],
  static: [P('M8 3H16L19 7V18L16 21H8L5 18V7Z M13 6 9 12H14L10 18 M2 8V11 M22 13V16')],
  thermite: [P('M8 4H16V18L13 21H7L5 18V8Z M8 7H16 M8 11H12 M8 15H11 M18 8C22 12 17 13 20 18')],
  havoc: [P('M9 4 18 6 21 14 14 20 5 18 3 10Z M4 4Q1 13 6 18 M3 4H7 M20 20Q24 11 19 6 M17 20H21 M9 9 15 15 M15 9 9 15')],
  ballast: [P('M7 4H17L20 9V18L16 21H8L4 18V9Z M8 8H16 M8 12H16 M8 16H16 M2 4V9 M22 4V9')],
  charge: [P('M6 7 12 3 18 7V15L12 19 6 15Z M9 9H15 M12 6V12 M3 18H7 M17 18H21 M8 22H16')],
  detonate: [P('M12 2 14 8 21 5 17 11 23 14 16 15 16 22 11 17 5 22 7 15 1 12 8 10 6 3Z')],
  massline: [C(4,19,2), P('M5 17 17 5 M13 3H21V11 M17 5 21 3 M9 11 13 15')],
  seed: [C(12,12,4), P('M12 2V6 M12 18V22 M2 12H6 M18 12H22 M5 5 7 7 M17 17 19 19 M5 19 7 17 M17 7 19 5')],
  well: [C(12,12,3), P('M3 8Q5 2 11 3 M3 8H8V3 M21 16Q19 22 13 21 M21 16H16V21 M8 21Q2 19 3 13 M16 3Q22 5 21 11')],
  repulsor: [C(12,12,3), P('M9 9 3 3 M3 8V3H8 M15 15 21 21 M16 21H21V16 M15 9 21 3 M16 3H21V8 M9 15 3 21 M3 16V21H8')],
  cone: [P('M3 10 20 3V21L3 14Z M9 8V16 M15 6V18 M4 12H20 M17 10 20 12 17 14')],
  skim: [P('M3 15 7 20H17L21 15Z M5 4V12 M10 3V12 M15 5V12 M20 4V12 M8 9 10 12 12 9')],
  snare: [C(12,12,3), P('M4 5Q22 0 20 12Q18 24 5 18 M4 5 4 11 9 8 M5 18 10 17 M12 5V8 M19 12H16')],
  gyre: [P('M2 10 11 5 M2 14 11 19 M3 12H8'), C(15,12,5), C(12,8,2), C(19,11,2), C(15,16,2), P('M17 3 21 6 M19 2 21 6 17 6')],
  scan: [C(6,18,2), P('M6 12A6 6 0 0 1 12 18 M6 6A12 12 0 0 1 18 18 M6 2A16 16 0 0 1 22 18 M7 17 18 6')],
  time: [C(12,12,9), P('M12 5V12L16 15 M2 12H5 M19 12H22 M12 19V22')],
  bumper: [P('M7 21 12 13 17 21 M5 14Q12 4 19 14 M3 9Q12-2 21 9 M12 3V8')],
  'fire-lance': [P('M7 21 12 15 17 21 M9 15 12 2 15 15 M4 13 7 17 M20 13 17 17 M12 18V22')],
  grip: [P('M7 22 12 16 17 22 M7 16 3 9 5 4 8 5 7 9 10 13 M17 16 21 9 19 4 16 5 17 9 14 13'), C(12,7,3)],
  tractor: [P('M3 9 17 3 M3 15 17 21 M4 12H11 M8 9 5 12 8 15 M16 8 21 10 21 15 16 17 13 12Z')],
  whip: [P('M3 20Q6 9 12 12T21 4 M3 20 6 21 M8 5 12 3 16 5 M18 3 21 4 21 8')],
  coupler: [P('M3 8H8V16H3Z M16 8H21V16H16Z M8 10H16 M8 14H16 M5 5V8 M19 16V19')],
  filament: [P('M2 20 20 2 M2 16 7 21 M13 4 20 11 M9 3 8 8 3 9 M15 21 16 16 21 15')],
  transverse: [P('M3 5 21 19 M3 19 21 5 M4 3V7 M20 17V21 M9 7 12 3 15 7 M9 17 12 21 15 17')],
  bridle: [C(4,5,2), C(20,5,2), P('M4 7 12 19 20 7 M4 7H20 M9 22H15')],
  blink: [P('M3 19 8 9 12 19Z M13 14 18 4 22 14Z M3 5H9 M2 8H6 M14 20H21')],
  cloak: [P('M12 3 20 18 16 21 12 17 8 21 4 18Z M12 7V13 M2 7 5 9 M19 9 22 7 M2 14H4 M20 14H22')],
  chaff: [P('M9 16H15V21H9Z M12 16V7 M5 4 7 8 M19 4 17 8 M3 11 7 12 M21 11 17 12 M11 3H13')],
  decoy: [P('M12 8 16 16H8Z M6 6A9 9 0 0 0 6 18 M18 6A9 9 0 0 1 18 18 M3 3 6 5 M21 3 18 5 M11 20H13')],
  jammer: [P('M4 6 8 10 4 14 8 18 M20 6 16 10 20 14 16 18 M12 3V21 M9 6H15 M9 18H15')],
  drone: [P('M8 9 12 6 16 9V15L12 18 8 15Z M8 10 3 7V16L8 14 M16 10 21 7V16L16 14 M10 21H14')],
  mining: [P('M3 20 9 14 12 17 6 23Z M10 14 15 9 M14 3 20 3 23 9 19 14 14 10 11 7Z M16 5 17 10 21 9')],
  trap: [P('M4 17H20L17 21H7Z M5 15 2 7 8 11 M19 15 22 7 16 11 M12 4V13 M9 7 12 4 15 7')],
  flail: [C(17,6,4), P('M14 9 4 19 M2 18 6 22 M16 1V3 M20 3 22 1 M20 9 22 11')],
  swing: [C(16,7,2), P('M15 9 6 19 M3 8A9 9 0 0 0 19 19 M15 18 19 19 20 15 M4 18 8 22')],
  boost: [P('M6 15V7L12 2 18 7V15L12 19Z M8 19V22 M12 21V24 M16 19V22')],
  magnet: [P('M5 4H9V13A3 3 0 0 0 15 13V4H19V13A7 7 0 0 1 5 13Z M5 8H9 M15 8H19 M10 2H14')],
  split: [P('M12 22V13L4 5 M12 13 20 5 M2 9V3H8 M16 3H22V9')],
  pierce: [P('M2 20 22 2 M6 5 19 18 M3 9 15 21 M18 2H22V6')],
  fork: [P('M2 20 10 12 21 12 M10 12V3 M17 8 21 12 17 16 M6 7 10 3 14 7')],
  chain: [C(4,18,2), C(12,6,2), C(21,14,2), P('M5 16 8 12 6 10 10 8 M14 7 18 8 16 11 19 13')],
  cryo: [P('M12 2V22 M3 7 21 17 M3 17 21 7 M9 4 12 7 15 4 M9 20 12 17 15 20 M4 10 7 10 7 7 M17 17 17 14 20 14')],
  gyros: [C(12,12,5), C(4,8,2), C(20,16,2), P('M4 12Q3 22 14 21 M20 12Q21 2 10 3 M12 8V16 M9 10 15 14 M9 14 15 10')],
  fan: [P('M12 22V3 M12 22 4 6 M12 22 20 6 M8 6 12 3 16 6 M2 10 4 6 8 7 M16 7 20 6 22 10')],
  capacitor: [C(4,18,2), C(20,6,2), P('M6 16 10 12 M14 8 18 4 M8 8 16 16 M11 5 19 13')],
};
// Variants are readable family derivatives, never unrelated equipment or a text initial.
const variants = {
  'pulse-heavy': ['pulse', 'M3 3H8 M3 6H6'], 'pulse-mirror': ['pulse', 'M2 8 8 2 M16 22 22 16'],
  'slug-heavy': ['slug', 'M2 4V20 M12 4V20'], 'slug-ironsong': ['slug', 'M15 3 19 5 23 3 M15 21 19 19 23 21'],
  'concussion-heavy': ['concussion', 'M3 5H10 M3 19H10'],
  'beam-veil': ['beam', 'M10 3 21 6 M10 21 21 18'], 'beam-heavy': ['beam', 'M2 5H8V19H2'],
  'beam-lighthouse': ['beam', 'M9 3 21 3 M9 21 21 21 M19 1V5 M19 19V23'],
  'missile-nest': ['missile', 'M4 7 6 3 8 7 M19 7 21 3 23 7'],
  'bumper-heavy': ['bumper', 'M2 19 4 22 M22 19 20 22'],
  'fire-lance-heavy': ['fire-lance', 'M3 5 6 11 M21 5 18 11'],
  'grip-heavy': ['grip', 'M1 17 4 21 M23 17 20 21'],
};
for (const [id, [base, extra]] of Object.entries(variants)) raw[id] = [...raw[base], P(extra)];

const equipment = {
  mod_mining_laser_s: 'mining', mod_mining_beam_m: 'mining', mod_mining_pulverizer_l: 'mining', mod_mining_industrial_l: 'mining',
  mod_repulsion_trap_s: 'trap', mod_tractor_beam_m: 'tractor', unique_tideline_tractor: 'tractor',
  mod_elastic_whip_m: 'whip', unique_broken_ring_whip: 'whip', mod_frame_coupler_m: 'coupler',
  mod_monofilament_sweep_m: 'filament', unique_no_cut_filament: 'filament', mod_transverse_snare_m: 'transverse',
  mod_twin_bridle_m: 'bridle', unique_toll_saint_bridle: 'bridle', mod_mass_flail_rig_m: 'flail',
  mod_swing_drive_s: 'swing', mod_swing_drive_m: 'swing', mod_veil_step: 'blink',
  mod_cloak_mk1: 'cloak', mod_cloak_mk2: 'cloak', unique_quietcloak: 'cloak',
  mod_charge_rack: 'charge', mod_charge_vector_rack: 'vector-mine',
  mod_chaff_dispenser_m: 'chaff', unique_smokesong_chaff: 'chaff', mod_decoy_buoy_s: 'decoy',
  mod_ecm_jammer_l: 'jammer', mod_pds_servo_s: 'flak', mod_drone_bay_l: 'drone', mod_ram_plate: 'shunt',
  mod_afterburner_m: 'boost', mod_splitburner_m: 'boost', mod_loot_magnet_s: 'magnet', mod_deep_scoop_array_m: 'skim',
  mod_survey_suite: 'scan', unique_deepsurvey_suite: 'scan', mod_drill_amp: 'mining',
  mod_winch_hd: 'massline', mod_massline_spool_m: 'massline', mod_massline_spool_l: 'massline', mod_sanction_spool: 'massline',
  mod_twin_mount: 'split', mod_triad_mount: 'fan', mod_piercing_core: 'pierce', mod_forked_core: 'fork',
  mod_bank_shot: 'bank', mod_smart_bank: 'bank', mod_ion_payload: 'emp', mod_incendiary_payload: 'plasma',
  mod_gravity_tag: 'marker', mod_relay_arc: 'chain', mod_bank_relay: 'chain', mod_tether_capacitor: 'capacitor',
  mod_conductive_path: 'primer', mod_cryo_payload: 'cryo', mod_cryo_gyros: 'gyros', mod_herald_fan: 'fan', mod_storm_carom: 'chain',
};

export const ARSENAL_TOOL_IDS = Object.freeze(Object.keys(equipment));
export const ARSENAL_GLYPHS = Object.freeze(raw);
const equipmentTrim = Object.freeze({
  mod_mining_industrial_l: 'M2 3V9 M5 2V7 M8 2V5',
  mod_drill_amp: 'M2 2 6 6 M1 8 5 8',
  mod_smart_bank: 'M16 17H22V23 M19 20H22',
  mod_bank_relay: 'M3 3H8V8',
  mod_storm_carom: 'M18 2 15 6H19L16 10',
  mod_herald_fan: 'M2 15 6 19 M22 15 18 19',
  mod_sanction_spool: 'M2 2 6 4 10 2 M3 6H9',
  mod_deep_scoop_array_m: 'M2 2 5 2 M19 2H22',
});

export function arsenalGlyph(id) {
  const key = typeof id === 'string' ? id : id?.defId || id?.id;
  const identity = arsenalIdentity(key);
  if (identity) return raw[identity.glyph] || null;
  const kind = equipment[key];
  if (!kind) return null;
  // Size and unique trim remain simple enough to read on a 24px socket.
  const trim = key.startsWith('unique_') ? 'M2 2 5 4 8 2 M16 22 19 20 22 22'
    : /_l$/.test(key) ? 'M2 2H8 M2 5H6 M16 22H22 M18 19H22'
      : /_m$|mk2$/.test(key) ? 'M2 2H7 M17 22H22' : '';
  const extra = equipmentTrim[key] || '';
  return trim || extra ? [...raw[kind], P([trim, extra].filter(Boolean).join(' '))] : raw[kind];
}

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function arsenalIcon(id, size = 24, label = '') {
  const paths = arsenalGlyph(id);
  if (!paths) return '';
  const dimension = Number.isFinite(Number(size)) ? Math.max(8, Math.min(128, Number(size))) : 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="dp-icon arsenal-icon" viewBox="0 0 24 24" width="${dimension}" height="${dimension}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${escape(label)}"` : 'aria-hidden="true" focusable="false"'} data-arsenal="${escape(id)}">${paths.map(({ tag, ...attrs }) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${escape(value)}"`).join(' ')}/>`).join('')}</svg>`;
}
