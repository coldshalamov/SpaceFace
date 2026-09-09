// PQ-133.11 — developer-only Adventure Combat Lab shortcuts.
// Not imported by combatLab.js, combatLabSetups.js, or any UI. Tests and the migration
// helper are the only consumers. These must never appear on a player path.

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}

/** Hitch slot order: weapon, shield, engine, cargo, mining, utility. */
const HITCH_BASE = Object.freeze([
  'wpn_pulse_laser_s',
  'mod_shield_booster_s',
  'mod_engine_ion_m',
  null,
  'mod_mining_laser_s',
  null,
]);

export const ADVENTURE_COMBAT_LAB_SHORTCUTS = freezeDeep([
  {
    id: 'dev_volley_hitch',
    developerOnly: true,
    label: 'DEV Hitch volley',
    hullId: 'ship_kestrel',
    fittings: [
      'wpn_pulse_laser_s',
      'mod_shield_booster_s',
      'mod_engine_ion_m',
      null,
      'mod_mining_laser_s',
      'mod_twin_mount',
    ],
    kind: 'VOLLEY',
  },
  {
    id: 'dev_bank_hitch',
    developerOnly: true,
    label: 'DEV Hitch bank',
    hullId: 'ship_kestrel',
    fittings: [
      'wpn_pulse_laser_s',
      'mod_shield_booster_s',
      'mod_engine_ion_m',
      null,
      'mod_mining_laser_s',
      'mod_bank_shot',
    ],
    kind: 'BANK',
  },
  {
    id: 'dev_chain_hitch',
    developerOnly: true,
    label: 'DEV Hitch chain',
    hullId: 'ship_kestrel',
    fittings: [
      'wpn_pulse_laser_s',
      'mod_shield_booster_s',
      'mod_engine_ion_m',
      null,
      'mod_mining_laser_s',
      'mod_relay_arc',
    ],
    kind: 'CHAIN',
  },
  {
    id: 'dev_three_kind_hitch',
    developerOnly: true,
    label: 'DEV Hitch volley+bank+chain',
    hullId: 'ship_kestrel',
    fittings: [
      'unique_mirrorjaw_pulse',
      'mod_shield_booster_s',
      'mod_engine_ion_m',
      null,
      'mod_mining_laser_s',
      'mod_twin_mount',
    ],
    kind: 'COMBINED',
  },
]);

export const ADVENTURE_COMBAT_LAB_SHORTCUT_BY_ID = freezeDeep(
  Object.fromEntries(ADVENTURE_COMBAT_LAB_SHORTCUTS.map((row) => [row.id, row])),
);

export const ADVENTURE_HITCH_BASE_FITTINGS = HITCH_BASE;
