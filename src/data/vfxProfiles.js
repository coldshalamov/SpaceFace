// Picture-half weapon families. Audio keeps its own classifier.
// A null return means the shipped damage-type resolver still owns that gun.
// These nine are the verbs that were collapsing onto the wrong picture.

export const PROVENANCE_PICTURE = Object.freeze({
  snarl_catch: Object.freeze({ family: 'web', variant: 'filament' }),
  gravity_marker_ping: Object.freeze({ family: 'gravitic', variant: 'field-ring' }),
  momentum_sink_latch: Object.freeze({ family: 'latch', variant: 'filament-latch' }),
  gravity_well_pull: Object.freeze({ family: 'well', variant: 'well-collar' }),
  inertial_shunt_ping: Object.freeze({ family: 'ram', variant: 'wedge' }),
  sticky_detonator: Object.freeze({ family: 'sticky', variant: 'sticky-charge' }),
  conductive_primer: Object.freeze({ family: 'primer', variant: 'primer-arc' }),
  thermal_cooker: Object.freeze({ family: 'cooker', variant: 'cooker-seam' }),
  mass_driver_slug: Object.freeze({ family: 'driver', variant: 'driver-slug' }),
});

const PROVENANCE_BY_WEAPON_ID = Object.freeze({
  wpn_snarl_s: 'snarl_catch',
  wpn_gravity_marker_s: 'gravity_marker_ping',
  wpn_momentum_sink_s: 'momentum_sink_latch',
  wpn_gravity_well_m: 'gravity_well_pull',
  wpn_inertial_shunt_s: 'inertial_shunt_ping',
  wpn_sticky_detonator: 'sticky_detonator',
  wpn_conductive_primer: 'conductive_primer',
  wpn_thermal_cooker: 'thermal_cooker',
  wpn_mass_driver: 'mass_driver_slug',
});

/**
 * Distinct picture for a collapsing verb. Returns null for every other weapon,
 * including the shared DPS families the presentation contract already pins.
 */
export function pictureForWeapon(weaponId, weaponData = null) {
  const id = String(weaponId || (weaponData && weaponData.id) || '').toLowerCase();
  const explicit = weaponData && weaponData.impulseProvenance;
  const provenance = String(explicit || PROVENANCE_BY_WEAPON_ID[id] || '');
  if (explicit && PROVENANCE_BY_WEAPON_ID[id] && explicit !== PROVENANCE_BY_WEAPON_ID[id]) {
    return PROVENANCE_PICTURE[explicit] || null;
  }
  return PROVENANCE_PICTURE[provenance] || null;
}
