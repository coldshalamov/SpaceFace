import { resolveWeaponPresentationFamily } from '../vfxProfiles.js';

/**
 * Carried-energy / carried-matter wake cross-sections, authored per family.
 *
 * These are SHAPE records, not tints. Each profile owns a different lateral density curve,
 * a different internal structure and a different silhouette, so the families stay apart in a
 * grayscale, bloom-off frame. One recoloured tracer serving the whole arsenal is the failure
 * this table exists to prevent. The renderer for them lives in `ribbonPool.js`; the enum lives
 * here so the recipe table stays free of a Three.js dependency.
 */
export const RIBBON_PROFILE = Object.freeze({
  CORD: 0, // machined impulse - hard-edged ionisation cord with world-pinned shock beads
  BRAID: 1, // transported plasma - two counter-wound convection lobes that cross
  FORK: 2, // induced current - twin conductors with real open air between them
  SHEET: 3, // staged motor - twin vapour banks around a dark exhaust channel
  FILAMENT: 4, // coherent energy - collimated afterimage, ceramic edge, no combustion detail
});

/**
 * Authored default when a caller does not name a profile. Width alone cannot separate a plasma
 * braid from a motor vapour sheet, so an explicit `ribbonProfile` is the authoritative channel;
 * this fallback only guarantees that the ballistic cord, the induction fork and the coherent
 * filament never collapse into one shape on the live route.
 */
export function ribbonProfileForWidth(width) {
  const w = Number(width) || 0;
  if (w <= 0.22) return RIBBON_PROFILE.CORD;
  if (w <= 0.45) return RIBBON_PROFILE.FORK;
  if (w <= 0.62) return RIBBON_PROFILE.FILAMENT;
  return RIBBON_PROFILE.BRAID;
}

export const FLIGHT_MODE = Object.freeze({
  ENERGY_CARD: 'energy-card',
  MESH: 'mesh',
  BEAM: 'beam',
  NONE: 'none',
});

export const BOLT_VARIANT = Object.freeze({
  PULSE: 0,
  PLASMA: 1,
  KINETIC: 2,
  RAIL: 3,
  EMP: 4,
  CONCUSSION: 5,
  FLAK: 6,
  SIEGE: 7,
  MOTOR: 8,
  HEAVY_MOTOR: 9,
});

export const WEAPON_SOCKET_NAME = 'SOCKET_Weapon_Front';

/** Starter pulse muzzle light. Sky plates stay under this and under the engine core. */
export const STARTER_PULSE_MUZZLE_LIGHT_PEAK = 3.1;

const PULSE = Object.freeze({
  family: 'plasma',
  variant: 'pulse-bolt',
  muzzle: Object.freeze({
    surface: true,
    life: 0.11,
    width: 1.55,
    height: 2.6,
    bore: true,
    boreLife: 0.32,
    haze: 0.42,
    lightPeak: STARTER_PULSE_MUZZLE_LIGHT_PEAK,
    lightDistance: 16,
    coreColor: '#34cfff',
    accentColor: '#5ff0ff',
    lightColor: '#39d0ff',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD,
    boltVariant: BOLT_VARIANT.PULSE,
    dashLength: 6.5,
    width: 2.6,
    intensity: 2.15,
    pixelFloor: 9,
    ribbon: true,
    ribbonWidth: 0.52,
    ribbonLinger: 0.075,
    ribbonProfile: RIBBON_PROFILE.FILAMENT,
    coreColor: '#34cfff',
    sheathColor: '#5f80ff',
  }),
  shield: Object.freeze({
    contact: true,
    surface: true,
    life: 0.16,
    haze: 0.55,
  }),
  hull: Object.freeze({
    scorch: true,
    scorchLife: 4.2,
    surface: true,
    sparks: true,
    sparkScale: 0.85,
  }),
});

const THERMAL = Object.freeze({
  family: 'plasma',
  variant: 'thermal-bolt',
  muzzle: Object.freeze({
    surface: true,
    life: 0.16,
    width: 2.2,
    height: 2.4,
    bore: true,
    boreLife: 0.4,
    haze: 0.85,
    lightPeak: 3.6,
    lightDistance: 18,
    coreColor: '#fff1c8',
    accentColor: '#ff6a28',
    lightColor: '#ff8040',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD,
    boltVariant: BOLT_VARIANT.PLASMA,
    dashLength: 7.2,
    width: 2.6,
    intensity: 2.6,
    pixelFloor: 14,
    ribbon: true,
    ribbonWidth: 0.9,
    ribbonLinger: 0.18,
    ribbonProfile: RIBBON_PROFILE.BRAID,
    coreColor: '#ffb451',
    sheathColor: '#c94d22',
    enemyCoreColor: '#ff6040',
    enemySheathColor: '#ff4020',
  }),
  shield: Object.freeze({
    contact: true,
    surface: true,
    life: 0.28,
    haze: 0.8,
  }),
  hull: Object.freeze({
    scorch: true,
    scorchLife: 5.5,
    surface: true,
    sparks: true,
    sparkScale: 1.35,
  }),
});

const AUTOCANNON = Object.freeze({
  family: 'kinetic',
  variant: 'autocannon',
  muzzle: Object.freeze({
    surface: true,
    life: 0.08,
    width: 1.2,
    height: 1.8,
    bore: true,
    boreLife: 0.14,
    haze: 0.12,
    casings: true,
    lightPeak: 2.4,
    lightDistance: 12,
    coreColor: '#ffffff',
    accentColor: '#ffcc88',
    lightColor: '#ffaa66',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD,
    boltVariant: BOLT_VARIANT.KINETIC,
    dashLength: 9.5,
    width: 0.95,
    intensity: 2.6,
    pixelFloor: 11,
    ribbon: true,
    ribbonWidth: 0.16,
    ribbonLinger: 0.05,
    ribbonProfile: RIBBON_PROFILE.CORD,
    coreColor: '#eeddbb',
    sheathColor: '#ffcc88',
  }),
  shield: Object.freeze({
    contact: true,
    surface: true,
    life: 0.12,
    haze: 0.2,
  }),
  hull: Object.freeze({
    scorch: true,
    scorchLife: 5.0,
    surface: true,
    sparks: true,
    sparkScale: 1.15,
  }),
});

const FLAK = Object.freeze({
  family: 'kinetic',
  variant: 'flak',
  muzzle: Object.freeze({
    surface: true,
    life: 0.07,
    width: 1.0,
    height: 1.6,
    bore: true,
    boreLife: 0.12,
    haze: 0.1,
    lightPeak: 1.8,
    lightDistance: 10,
    coreColor: '#fff4d2',
    accentColor: '#ff8a3c',
    lightColor: '#ffaa66',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD,
    boltVariant: BOLT_VARIANT.FLAK,
    dashLength: 5.2,
    width: 0.62,
    intensity: 2.0,
    pixelFloor: 8,
    ribbon: false,
    ribbonWidth: 0,
    ribbonLinger: 0,
    ribbonProfile: RIBBON_PROFILE.CORD,
    coreColor: '#fff4d2',
    sheathColor: '#ffcc88',
  }),
  shield: Object.freeze({
    contact: false,
    surface: false,
    life: 0.2,
    haze: 0.4,
  }),
  hull: Object.freeze({
    scorch: false,
    scorchLife: 0,
    surface: false,
    sparks: true,
    sparkScale: 1.6,
  }),
});

const RAIL = Object.freeze({
  family: 'rail',
  variant: 'railgun',
  muzzle: Object.freeze({
    surface: true,
    life: 0.09,
    width: 1.1,
    height: 4.6,
    bore: true,
    boreLife: 0.22,
    haze: 0.2,
    lightPeak: 4.6,
    lightDistance: 22,
    coreColor: '#f4fbff',
    accentColor: '#9edcff',
    lightColor: '#d8f0ff',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD,
    boltVariant: BOLT_VARIANT.RAIL,
    dashLength: 24,
    width: 0.7,
    intensity: 1.85,
    pixelFloor: 8,
    ribbon: true,
    ribbonWidth: 0.12,
    ribbonLinger: 0.07,
    ribbonProfile: RIBBON_PROFILE.CORD,
    coreColor: '#c4d6df',
    sheathColor: '#bf8952',
  }),
  shield: Object.freeze({
    contact: true,
    surface: true,
    life: 0.12,
    haze: 0.3,
  }),
  hull: Object.freeze({
    scorch: true,
    scorchLife: 3.6,
    surface: true,
    sparks: true,
    sparkScale: 0.7,
  }),
});

const SIEGE = Object.freeze({
  family: 'rail',
  variant: 'siege-lance',
  muzzle: Object.freeze({
    ...RAIL.muzzle,
    width: 1.6,
    height: 6.2,
    lightPeak: 6.0,
    lightDistance: 26,
    coreColor: '#9ec9ec',
    accentColor: '#dd9250',
    lightColor: '#d5a071',
  }),
  flight: Object.freeze({
    ...RAIL.flight,
    boltVariant: BOLT_VARIANT.SIEGE,
    dashLength: 18,
    width: 4.1,
    pixelFloor: 15,
    intensity: 1.65,
    ribbonWidth: 0.7,
    ribbonProfile: RIBBON_PROFILE.FILAMENT,
    coreColor: '#87c6ea',
    sheathColor: '#d28a42',
  }),
  shield: RAIL.shield,
  hull: Object.freeze({ ...RAIL.hull, scorchLife: 6.0, sparkScale: 1.1 }),
});

const EMP = Object.freeze({
  family: 'emp',
  variant: 'disruptor',
  muzzle: Object.freeze({
    surface: true,
    life: 0.14,
    width: 1.8,
    height: 2.2,
    bore: true,
    boreLife: 0.24,
    haze: 0.3,
    lightPeak: 3.4,
    lightDistance: 14,
    coreColor: '#f2ffff',
    accentColor: '#668cff',
    lightColor: '#88aaff',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD,
    boltVariant: BOLT_VARIANT.EMP,
    dashLength: 8.4,
    width: 2.6,
    intensity: 1.65,
    pixelFloor: 15,
    ribbon: true,
    ribbonWidth: 0.34,
    ribbonLinger: 0.1,
    ribbonProfile: RIBBON_PROFILE.FORK,
    coreColor: '#a7a9e9',
    sheathColor: '#7356b7',
  }),
  shield: Object.freeze({
    contact: true,
    surface: true,
    life: 0.22,
    haze: 0.45,
  }),
  hull: Object.freeze({
    scorch: false,
    scorchLife: 0,
    surface: true,
    sparks: true,
    sparkScale: 1.0,
  }),
});

const CONCUSSION = Object.freeze({
  family: 'concussion',
  variant: 'concussion-slug',
  muzzle: Object.freeze({
    surface: true,
    life: 0.14,
    width: 1.8,
    height: 1.6,
    bore: true,
    boreLife: 0.18,
    haze: 0.22,
    lightPeak: 3.6,
    lightDistance: 18,
    coreColor: '#fff0d0',
    accentColor: '#c98a4a',
    lightColor: '#ffb35c',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD,
    boltVariant: BOLT_VARIANT.CONCUSSION,
    dashLength: 4.8,
    width: 2.2,
    intensity: 1.35,
    pixelFloor: 14,
    ribbon: false,
    ribbonWidth: 0,
    ribbonLinger: 0,
    ribbonProfile: RIBBON_PROFILE.CORD,
    coreColor: '#ffe0a8',
    sheathColor: '#c98a4a',
  }),
  shield: Object.freeze({
    contact: true,
    surface: true,
    life: 0.2,
    haze: 0.5,
  }),
  hull: Object.freeze({
    scorch: true,
    scorchLife: 6.0,
    surface: true,
    sparks: true,
    sparkScale: 1.5,
  }),
});

const MISSILE = Object.freeze({
  family: 'missile',
  variant: 'missile',
  muzzle: Object.freeze({
    surface: true,
    life: 0.16,
    width: 2.0,
    height: 2.2,
    bore: false,
    boreLife: 0,
    haze: 0.35,
    lightPeak: 3.4,
    lightDistance: 14,
    coreColor: '#fff0d0',
    accentColor: '#ff8844',
    lightColor: '#ffb35c',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.MESH,
    boltVariant: BOLT_VARIANT.MOTOR,
    motor: true,
    dashLength: 8,
    width: 2.1,
    intensity: 1.55,
    pixelFloor: 8,
    ribbon: true,
    ribbonWidth: 0.45,
    ribbonLinger: 0.16,
    ribbonProfile: RIBBON_PROFILE.SHEET,
    coreColor: '#f2a45b',
    sheathColor: '#973b25',
  }),
  shield: Object.freeze({
    contact: true,
    surface: true,
    life: 0.28,
    haze: 0.7,
  }),
  hull: Object.freeze({
    scorch: true,
    scorchLife: 6.5,
    surface: true,
    sparks: true,
    sparkScale: 1.8,
  }),
});

const TORPEDO = Object.freeze({
  ...MISSILE,
  variant: 'torpedo',
  muzzle: Object.freeze({ ...MISSILE.muzzle, width: 2.4, height: 2.6, lightPeak: 4.8, lightDistance: 18 }),
  flight: Object.freeze({ ...MISSILE.flight, boltVariant: BOLT_VARIANT.HEAVY_MOTOR,
    dashLength: 13, width: 3.2, pixelFloor: 12, ribbonWidth: .82, ribbonLinger: .27,
    coreColor: '#c3c9e0', sheathColor: '#b36935' }),
  hull: Object.freeze({ ...MISSILE.hull, scorchLife: 8.0, sparkScale: 2.2 }),
});

const BEAM = Object.freeze({
  family: 'beam',
  variant: 'continuous-beam',
  muzzle: Object.freeze({
    surface: true,
    life: 0.08,
    width: 1.3,
    height: 2.0,
    bore: true,
    boreLife: 0.18,
    haze: 0.25,
    lightPeak: 2.2,
    lightDistance: 12,
    coreColor: '#d8f0ff',
    accentColor: '#66ccff',
    lightColor: '#88ddff',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.BEAM,
    boltVariant: BOLT_VARIANT.PULSE,
    dashLength: 0,
    width: 0,
    intensity: 0,
    pixelFloor: 8,
    ribbon: false,
    ribbonWidth: 0,
    ribbonLinger: 0,
    ribbonProfile: RIBBON_PROFILE.FILAMENT,
    coreColor: '#f4fbff',
    sheathColor: '#56cfff',
  }),
  shield: Object.freeze({
    contact: true,
    surface: false,
    life: 0.08,
    haze: 0.35,
  }),
  hull: Object.freeze({
    scorch: true,
    scorchLife: 2.4,
    surface: false,
    sparks: false,
    sparkScale: 0.4,
  }),
});

const MINE = Object.freeze({
  family: 'mine',
  variant: 'vector-mine',
  muzzle: Object.freeze({
    surface: false,
    life: 0,
    width: 0,
    height: 0,
    bore: false,
    boreLife: 0,
    haze: 0,
    lightPeak: 0,
    lightDistance: 8,
    coreColor: '#cfe8ff',
    accentColor: '#5aa0ff',
    lightColor: '#88bbff',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.NONE,
    boltVariant: BOLT_VARIANT.KINETIC,
    dashLength: 0,
    width: 0,
    intensity: 0,
    pixelFloor: 0,
    ribbon: false,
    ribbonWidth: 0,
    ribbonLinger: 0,
    ribbonProfile: RIBBON_PROFILE.SHEET,
    coreColor: '#cfe8ff',
    sheathColor: '#5aa0ff',
  }),
  shield: Object.freeze({
    contact: false,
    surface: true,
    life: 0.28,
    haze: 0.9,
  }),
  hull: Object.freeze({
    scorch: false,
    scorchLife: 0,
    surface: true,
    sparks: true,
    sparkScale: 1.4,
  }),
});

// Provenance pictures. Each tuple (flight, muzzle, contact) is a different silhouette from the
// DPS guns and from the other rows here. A missing entry falls through to the autocannon.
const FILAMENT = Object.freeze({
  family: 'web',
  variant: 'filament',
  muzzle: Object.freeze({
    surface: true, life: 0.16, width: 0.48, height: 3.6, bore: true, boreLife: 0.2,
    haze: 0.08, lightPeak: 1.4, lightDistance: 9,
    coreColor: '#d7fff4', accentColor: '#3d8f86', lightColor: '#b6ffe8',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD, boltVariant: BOLT_VARIANT.KINETIC,
    dashLength: 14.2, width: 0.38, intensity: 1.4, pixelFloor: 8,
    ribbon: true, ribbonWidth: 0.07, ribbonLinger: 0.22, ribbonProfile: RIBBON_PROFILE.FILAMENT,
    coreColor: '#d7fff4', sheathColor: '#3d8f86',
  }),
  shield: Object.freeze({ contact: true, surface: false, life: 0.2, haze: 0.15 }),
  hull: Object.freeze({ scorch: true, scorchLife: 1.15, surface: false, sparks: false, sparkScale: 0.3 }),
});

const FIELD_RING = Object.freeze({
  family: 'gravitic',
  variant: 'field-ring',
  muzzle: Object.freeze({
    surface: true, life: 0.2, width: 2.85, height: 0.62, bore: false, boreLife: 0.1,
    haze: 0.2, lightPeak: 1.8, lightDistance: 11,
    coreColor: '#7ee7ff', accentColor: '#2450aa', lightColor: '#9af0ff',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD, boltVariant: BOLT_VARIANT.EMP,
    dashLength: 9.4, width: 4.6, intensity: 1.2, pixelFloor: 10,
    ribbon: true, ribbonWidth: 0.71, ribbonLinger: 0.08, ribbonProfile: RIBBON_PROFILE.FORK,
    coreColor: '#7ee7ff', sheathColor: '#2450aa',
  }),
  shield: Object.freeze({ contact: true, surface: true, life: 0.22, haze: 0.4 }),
  hull: Object.freeze({ scorch: true, scorchLife: 0.82, surface: false, sparks: false, sparkScale: 0.2 }),
});

const FILAMENT_LATCH = Object.freeze({
  family: 'latch',
  variant: 'filament-latch',
  muzzle: Object.freeze({
    surface: true, life: 0.18, width: 1.08, height: 1.32, bore: true, boreLife: 0.16,
    haze: 0.16, lightPeak: 2.1, lightDistance: 10,
    coreColor: '#ffb15a', accentColor: '#6a3418', lightColor: '#ffc888',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD, boltVariant: BOLT_VARIANT.CONCUSSION,
    dashLength: 6.15, width: 1.48, intensity: 1.5, pixelFloor: 9,
    ribbon: true, ribbonWidth: 0.27, ribbonLinger: 0.34, ribbonProfile: RIBBON_PROFILE.SHEET,
    coreColor: '#ffb15a', sheathColor: '#6a3418',
  }),
  shield: Object.freeze({ contact: true, surface: true, life: 0.18, haze: 0.25 }),
  hull: Object.freeze({ scorch: true, scorchLife: 2.05, surface: true, sparks: false, sparkScale: 0.4 }),
});

const WELL_COLLAR = Object.freeze({
  family: 'well',
  variant: 'well-collar',
  muzzle: Object.freeze({
    surface: false, life: 0.4, width: 0.4, height: 0.2, bore: false, boreLife: 0,
    haze: 0, lightPeak: 0.6, lightDistance: 8,
    coreColor: '#9ecbff', accentColor: '#3a4d88', lightColor: '#c6dcff',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.NONE, boltVariant: BOLT_VARIANT.KINETIC,
    dashLength: 0, width: 0, intensity: 0, pixelFloor: 0,
    ribbon: false, ribbonWidth: 0, ribbonLinger: 0, ribbonProfile: RIBBON_PROFILE.SHEET,
    coreColor: '#9ecbff', sheathColor: '#3a4d88',
  }),
  shield: Object.freeze({ contact: true, surface: false, life: 0.4, haze: 0.2 }),
  hull: Object.freeze({ scorch: false, scorchLife: 1.1, surface: false, sparks: false, sparkScale: 0 }),
});

const WEDGE = Object.freeze({
  family: 'ram',
  variant: 'wedge',
  muzzle: Object.freeze({
    surface: true, life: 0.1, width: 2.2, height: 0.78, bore: true, boreLife: 0.12,
    haze: 0.1, lightPeak: 2.2, lightDistance: 12,
    coreColor: '#e7eefc', accentColor: '#6d7ea8', lightColor: '#f4f7ff',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD, boltVariant: BOLT_VARIANT.KINETIC,
    dashLength: 6.8, width: 3.35, intensity: 2.2, pixelFloor: 11,
    ribbon: true, ribbonWidth: 1.05, ribbonLinger: 0.06, ribbonProfile: RIBBON_PROFILE.CORD,
    coreColor: '#e7eefc', sheathColor: '#6d7ea8',
  }),
  shield: Object.freeze({ contact: true, surface: true, life: 0.1, haze: 0.18 }),
  hull: Object.freeze({ scorch: true, scorchLife: 1.55, surface: true, sparks: true, sparkScale: 0.7 }),
});

const STICKY_CHARGE = Object.freeze({
  family: 'sticky',
  variant: 'sticky-charge',
  muzzle: Object.freeze({
    surface: true, life: 0.22, width: 1.72, height: 1.42, bore: true, boreLife: 0.2,
    haze: 0.3, lightPeak: 2.6, lightDistance: 12,
    coreColor: '#ffcf70', accentColor: '#a85a18', lightColor: '#ffe0a0',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD, boltVariant: BOLT_VARIANT.MOTOR,
    dashLength: 5.35, width: 2.05, intensity: 1.7, pixelFloor: 10,
    ribbon: true, ribbonWidth: 0.58, ribbonLinger: 0.2, ribbonProfile: RIBBON_PROFILE.SHEET,
    coreColor: '#ffcf70', sheathColor: '#a85a18',
  }),
  shield: Object.freeze({ contact: true, surface: true, life: 0.24, haze: 0.35 }),
  hull: Object.freeze({ scorch: true, scorchLife: 3.55, surface: true, sparks: true, sparkScale: 0.6 }),
});

const PRIMER_ARC = Object.freeze({
  family: 'primer',
  variant: 'primer-arc',
  muzzle: Object.freeze({
    surface: true, life: 0.12, width: 0.88, height: 2.9, bore: true, boreLife: 0.18,
    haze: 0.22, lightPeak: 2.4, lightDistance: 13,
    coreColor: '#d8f4ff', accentColor: '#1f8fd0', lightColor: '#e8fbff',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD, boltVariant: BOLT_VARIANT.EMP,
    dashLength: 11.4, width: 1.12, intensity: 1.8, pixelFloor: 12,
    ribbon: true, ribbonWidth: 0.21, ribbonLinger: 0.09, ribbonProfile: RIBBON_PROFILE.FORK,
    coreColor: '#d8f4ff', sheathColor: '#1f8fd0',
  }),
  shield: Object.freeze({ contact: true, surface: false, life: 0.14, haze: 0.3 }),
  hull: Object.freeze({ scorch: true, scorchLife: 0.48, surface: false, sparks: false, sparkScale: 0.25 }),
});

const COOKER_SEAM = Object.freeze({
  family: 'cooker',
  variant: 'cooker-seam',
  muzzle: Object.freeze({
    surface: true, life: 0.2, width: 1.92, height: 0.55, bore: true, boreLife: 0.3,
    haze: 0.4, lightPeak: 2.8, lightDistance: 14,
    coreColor: '#ff7a32', accentColor: '#ffd2a8', lightColor: '#ff9a55',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.BEAM, boltVariant: BOLT_VARIANT.PLASMA,
    dashLength: 2.2, width: 1.65, intensity: 1.9, pixelFloor: 8,
    ribbon: true, ribbonWidth: 0.19, ribbonLinger: 0.16, ribbonProfile: RIBBON_PROFILE.FILAMENT,
    coreColor: '#ff7a32', sheathColor: '#ffd2a8',
  }),
  shield: Object.freeze({ contact: true, surface: true, life: 0.2, haze: 0.25 }),
  hull: Object.freeze({ scorch: true, scorchLife: 3.25, surface: true, sparks: false, sparkScale: 0.35 }),
});

const DRIVER_SLUG = Object.freeze({
  family: 'driver',
  variant: 'driver-slug',
  muzzle: Object.freeze({
    surface: true, life: 0.09, width: 0.66, height: 1.12, bore: true, boreLife: 0.14,
    haze: 0.08, casings: true, lightPeak: 2.0, lightDistance: 11,
    coreColor: '#f4f0e4', accentColor: '#8a8172', lightColor: '#fff6e4',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD, boltVariant: BOLT_VARIANT.RAIL,
    dashLength: 10.8, width: 1.72, intensity: 2.4, pixelFloor: 12,
    ribbon: true, ribbonWidth: 0.36, ribbonLinger: 0.04, ribbonProfile: RIBBON_PROFILE.CORD,
    coreColor: '#f4f0e4', sheathColor: '#8a8172',
  }),
  shield: Object.freeze({ contact: true, surface: true, life: 0.11, haze: 0.16 }),
  hull: Object.freeze({ scorch: true, scorchLife: 4.75, surface: true, sparks: true, sparkScale: 1.1 }),
});

const RECIPES_BY_VARIANT = Object.freeze({
  'pulse-bolt': PULSE,
  'thermal-bolt': THERMAL,
  autocannon: AUTOCANNON,
  flak: FLAK,
  railgun: RAIL,
  'siege-lance': SIEGE,
  disruptor: EMP,
  'concussion-slug': CONCUSSION,
  missile: MISSILE,
  torpedo: TORPEDO,
  'continuous-beam': BEAM,
  'vector-mine': MINE,
  filament: FILAMENT,
  'field-ring': FIELD_RING,
  'filament-latch': FILAMENT_LATCH,
  'well-collar': WELL_COLLAR,
  wedge: WEDGE,
  'sticky-charge': STICKY_CHARGE,
  'primer-arc': PRIMER_ARC,
  'cooker-seam': COOKER_SEAM,
  'driver-slug': DRIVER_SLUG,
});

export function resolveWeaponRecipe(weaponId, weaponData = null) {
  const presentation = resolveWeaponPresentationFamily(weaponId, weaponData);
  return RECIPES_BY_VARIANT[presentation.variant] || AUTOCANNON;
}

const projectileMeshSkipVerdicts = new WeakMap();

export function projectileSkipsVisualFactoryMesh(entityOrWeaponId, weaponData = null) {
  if (entityOrWeaponId && typeof entityOrWeaponId === 'object') {
    if (entityOrWeaponId.type && entityOrWeaponId.type !== 'projectile') return false;
    const data = entityOrWeaponId.data || weaponData || null;
    // The verdict is spawn-static: key the memo on the mutable-scope record so a
    // repointed data recomputes while per-feed calls on the same body reuse it.
    const key = data || entityOrWeaponId;
    if (key && typeof key === 'object') {
      const hit = projectileMeshSkipVerdicts.get(key);
      if (hit !== undefined) return hit;
      const recipe = resolveWeaponRecipe(data && data.weaponId, data);
      const verdict = recipe.flight.mode === FLIGHT_MODE.ENERGY_CARD;
      projectileMeshSkipVerdicts.set(key, verdict);
      return verdict;
    }
    return resolveWeaponRecipe(data && data.weaponId, data).flight.mode === FLIGHT_MODE.ENERGY_CARD;
  }
  return resolveWeaponRecipe(entityOrWeaponId, weaponData).flight.mode === FLIGHT_MODE.ENERGY_CARD;
}

export function recipeUsesRibbonWake(recipe) {
  return !!(recipe && recipe.flight && recipe.flight.ribbon);
}

export function recipeUsesSweptMuzzle(recipe) {
  return !!(recipe && recipe.muzzle && recipe.muzzle.surface);
}

export function listWeaponRecipes() {
  return RECIPES_BY_VARIANT;
}

export function flightColorsForEntity(recipe, entity, out = null) {
  const flight = recipe.flight;
  const target = out || {};
  if (entity && entity.team === 1 && flight.enemyCoreColor) {
    target.core = flight.enemyCoreColor;
    target.sheath = flight.enemySheathColor || flight.sheathColor;
    return target;
  }
  target.core = flight.coreColor;
  target.sheath = flight.sheathColor;
  return target;
}
