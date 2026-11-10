// Picture-half weapon families. ONE classifier: the render layer
// (src/render/vfxProfiles.js resolveWeaponPresentationFamily) and the audio layer
// (src/audio/audioSystem.js recipeForWeapon) both read it — a weapon's picture and its voice
// agree because they are literally the same classification (FB-071).
// A null provenance picture means the damage-type chain below still owns that gun.
// These nine are the verbs that were collapsing onto the wrong picture.

import { WEAPONS } from './weapons.js';

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

/**
 * The canonical family -> presentation table. One row per family the render layer knows how to
 * draw; audio maps the same family to one recipe. The gravitic/latch/ram rows (and the five
 * picture-verb rows beside them) reuse the field-ring / filament / wedge primitives already
 * authored — a family is a presentation identity shared by a class of mounts, never a row per
 * weapon id.
 */
export const WEAPON_FAMILY_PRESENTATION = Object.freeze({
  beam: Object.freeze({ family: 'beam', variant: 'continuous-beam' }),
  missile: Object.freeze({ family: 'missile', variant: 'missile' }),
  torpedo: Object.freeze({ family: 'missile', variant: 'torpedo' }),
  emp: Object.freeze({ family: 'emp', variant: 'disruptor' }),
  rail: Object.freeze({ family: 'rail', variant: 'railgun' }),
  siegeRail: Object.freeze({ family: 'rail', variant: 'siege-lance' }),
  thermal: Object.freeze({ family: 'plasma', variant: 'thermal-bolt' }),
  pulse: Object.freeze({ family: 'plasma', variant: 'pulse-bolt' }),
  flak: Object.freeze({ family: 'kinetic', variant: 'flak' }),
  kinetic: Object.freeze({ family: 'kinetic', variant: 'autocannon' }),
  // SF-10 physics-first families: mechanically distinct from the DPS weapons AND from each
  // other — the concussion slam, the deployed mine, and the RCS disruptor's emp do not share.
  concussion: Object.freeze({ family: 'concussion', variant: 'concussion-slug' }),
  mine: Object.freeze({ family: 'mine', variant: 'vector-mine' }),
  // The provenance verbs ride their authored pictures — same objects PROVENANCE_PICTURE holds.
  web: PROVENANCE_PICTURE.snarl_catch,
  gravitic: PROVENANCE_PICTURE.gravity_marker_ping,
  latch: PROVENANCE_PICTURE.momentum_sink_latch,
  well: PROVENANCE_PICTURE.gravity_well_pull,
  ram: PROVENANCE_PICTURE.inertial_shunt_ping,
  sticky: PROVENANCE_PICTURE.sticky_detonator,
  primer: PROVENANCE_PICTURE.conductive_primer,
  cooker: PROVENANCE_PICTURE.thermal_cooker,
  driver: PROVENANCE_PICTURE.mass_driver_slug,
});

// Emergent field-tool primitives (src/data/emergentPrimitives.js): classify on what the mount
// IS — standing-field emitters ride the gravitic family, a control spike the disruptor's, and
// the seismic gong falls through to the kinetic-shove branch below like every concussion gun.
const PRIMITIVE_PRESENTATION = Object.freeze({
  sticky: PROVENANCE_PICTURE.sticky_detonator,
  primer: PROVENANCE_PICTURE.conductive_primer,
  thermal: PROVENANCE_PICTURE.thermal_cooker,
  mass: PROVENANCE_PICTURE.mass_driver_slug,
  grav: PROVENANCE_PICTURE.gravity_marker_ping,
  polarity: PROVENANCE_PICTURE.gravity_marker_ping,
  viscosity: PROVENANCE_PICTURE.gravity_marker_ping,
  quantum: PROVENANCE_PICTURE.gravity_marker_ping,
  prism: PROVENANCE_PICTURE.gravity_marker_ping,
  hijack: WEAPON_FAMILY_PRESENTATION.emp,
});

// Kinetic projectile guns at or above this impulse read as shove weapons (concussion family),
// not bullet streams — the concussion cannons (520/920) and the seismic gong (220).
const CONCUSSION_IMPULSE_MIN = 200;

const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));

/**
 * THE weapon classifier — the one place a mount becomes a presentation family.
 *
 * Branch order (first hit wins):
 *  1. impulseProvenance — the receipt tag the def already carries (PROVENANCE_PICTURE).
 *  2. emergentPrimitive — field tools classify on what the mount IS, before a hitscan or
 *     damage-type field can drag them onto a beam or a generic bolt.
 *  3. continuous / hitscan emitters -> beam.
 *  4. deploy tracking -> mine.
 *  5. homing / missile ids -> missile (torpedo keeps its own variant).
 *  6. emp / ion payloads -> emp.
 *  7. spinal barrels and rail/lance/driver ids -> rail (siege keeps its own variant).
 *  8. kinetic guns at concussion-class impulse -> concussion (the gong lands here too).
 *  9. interceptor mounts / flak ids -> kinetic family, flak variant.
 * 10. thermal / plasma -> plasma family, thermal-bolt variant.
 * 11. energy -> plasma family, pulse-bolt variant.
 * 12. every other mount -> kinetic family, autocannon variant.
 *
 * Returns one of the frozen WEAPON_FAMILY_PRESENTATION / PROVENANCE_PICTURE entries — pooled,
 * never allocated per call.
 */
export function classifyWeaponFamily(weaponId, weaponData = null, fallbackData = null) {
  const fallback = fallbackData || (weaponId ? WEAPON_BY_ID.get(weaponId) : null) || null;
  const data = weaponData || fallback;
  const id = String(weaponId || (data && data.id) || (fallback && fallback.id) || '').toLowerCase();
  const tracking = String((data && data.tracking) ?? (fallback && fallback.tracking) ?? '').toLowerCase();
  const damageType = String(
    (data && (data.damageType ?? data.dmgType))
      ?? (fallback && (fallback.damageType ?? fallback.dmgType))
      ?? '',
  ).toLowerCase();
  const continuous = (data && data.continuous) ?? (fallback && fallback.continuous);
  const projSpeed = (data && data.projSpeed) ?? (fallback && fallback.projSpeed);
  const mount = (data && data.mount) ?? (fallback && fallback.mount);
  const impulsePerHit = (data && data.impulsePerHit) ?? (fallback && fallback.impulsePerHit) ?? 0;
  const intercepts = (data && data.intercepts) ?? (fallback && fallback.intercepts);
  const pictured = pictureForWeapon(id, data);
  if (pictured) return pictured;
  const primitive = (data && data.emergentPrimitive) ?? (fallback && fallback.emergentPrimitive);
  if (primitive && PRIMITIVE_PRESENTATION[primitive]) return PRIMITIVE_PRESENTATION[primitive];

  if (continuous || projSpeed === Infinity || tracking === 'hitscan') {
    return WEAPON_FAMILY_PRESENTATION.beam;
  }
  // A deployed frame is neither projectile nor beam — its own family.
  if (tracking === 'deploy' || id.includes('vector_mine')) {
    return WEAPON_FAMILY_PRESENTATION.mine;
  }
  if (tracking === 'homing' || id.includes('missile') || id.includes('torpedo') || id.includes('rack')) {
    return id.includes('torpedo') ? WEAPON_FAMILY_PRESENTATION.torpedo : WEAPON_FAMILY_PRESENTATION.missile;
  }
  if (damageType === 'emp' || damageType === 'ion' || id.includes('emp') || id.includes('disruptor')) {
    return WEAPON_FAMILY_PRESENTATION.emp;
  }
  if (mount === 'spinal' || id.includes('railgun') || id.includes('lance') || id.includes('driver')) {
    return id.includes('siege') ? WEAPON_FAMILY_PRESENTATION.siegeRail : WEAPON_FAMILY_PRESENTATION.rail;
  }
  // The concussion slug is kinetic mechanically but must NOT read as an autocannon tracer —
  // classify the shove guns by their authored momentum (cannons and the seismic gong), keeping
  // the id substring for catalog rows that never declared an impulse.
  if (id.includes('concussion') || id.includes('seismic')
    || (damageType === 'kinetic' && impulsePerHit >= CONCUSSION_IMPULSE_MIN)) {
    return WEAPON_FAMILY_PRESENTATION.concussion;
  }
  if (intercepts === true || id.includes('flak')) return WEAPON_FAMILY_PRESENTATION.flak;
  if (damageType === 'thermal' || damageType === 'plasma' || id.includes('plasma')) {
    return WEAPON_FAMILY_PRESENTATION.thermal;
  }
  if (damageType === 'energy' || id.includes('pulse_laser')) {
    return WEAPON_FAMILY_PRESENTATION.pulse;
  }
  return WEAPON_FAMILY_PRESENTATION.kinetic;
}
