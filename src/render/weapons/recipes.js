import { resolveWeaponPresentationFamily } from '../vfxProfiles.js';

export const FLIGHT_MODE = Object.freeze({
  ENERGY_CARD: 'energy-card',
  MESH: 'mesh',
  BEAM: 'beam',
  NONE: 'none',
});

export const ATLAS_ROW = Object.freeze({
  PULSE_MUZZLE: 0,
  PULSE_IMPACT_SHIELD: 1,
  PULSE_IMPACT_HULL: 2,
  PLASMA_MUZZLE: 3,
  KINETIC_MUZZLE: 4,
  RAIL_MUZZLE: 5,
  EXPLOSIVE_MUZZLE: 6,
  EMP_MUZZLE: 7,
});

export const BOLT_VARIANT = Object.freeze({
  PULSE: 0,
  PLASMA: 1,
  KINETIC: 2,
  RAIL: 3,
  EMP: 4,
  CONCUSSION: 5,
  FLAK: 6,
});

export const WEAPON_SOCKET_NAME = 'SOCKET_Weapon_Front';

const PULSE = Object.freeze({
  family: 'plasma',
  variant: 'pulse-bolt',
  muzzle: Object.freeze({
    flipbook: true,
    atlasRow: ATLAS_ROW.PULSE_MUZZLE,
    life: 0.11,
    width: 1.55,
    height: 2.6,
    bore: true,
    boreLife: 0.32,
    haze: 0.42,
    lightPeak: 3.1,
    lightDistance: 16,
    coreColor: '#34cfff',
    accentColor: '#5ff0ff',
    lightColor: '#39d0ff',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD,
    boltVariant: BOLT_VARIANT.PULSE,
    dashLength: 10,
    width: 1.7,
    intensity: 2.15,
    pixelFloor: 12,
    ribbon: true,
    ribbonWidth: 0.52,
    ribbonLinger: 0.12,
    coreColor: '#34cfff',
    sheathColor: '#5f80ff',
  }),
  shield: Object.freeze({
    contact: true,
    flipbook: true,
    atlasRow: ATLAS_ROW.PULSE_IMPACT_SHIELD,
    life: 0.16,
    haze: 0.55,
  }),
  hull: Object.freeze({
    scorch: true,
    scorchLife: 4.2,
    flipbook: true,
    atlasRow: ATLAS_ROW.PULSE_IMPACT_HULL,
    sparks: true,
    sparkScale: 0.85,
  }),
});

const THERMAL = Object.freeze({
  family: 'plasma',
  variant: 'thermal-bolt',
  muzzle: Object.freeze({
    flipbook: true,
    atlasRow: ATLAS_ROW.PLASMA_MUZZLE,
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
    coreColor: '#80ffcc',
    sheathColor: '#40ffa0',
    enemyCoreColor: '#ff6040',
    enemySheathColor: '#ff4020',
  }),
  shield: Object.freeze({
    contact: true,
    flipbook: true,
    atlasRow: ATLAS_ROW.PLASMA_MUZZLE,
    life: 0.28,
    haze: 0.8,
  }),
  hull: Object.freeze({
    scorch: true,
    scorchLife: 5.5,
    flipbook: true,
    atlasRow: ATLAS_ROW.PLASMA_MUZZLE,
    sparks: true,
    sparkScale: 1.35,
  }),
});

const AUTOCANNON = Object.freeze({
  family: 'kinetic',
  variant: 'autocannon',
  muzzle: Object.freeze({
    flipbook: true,
    atlasRow: ATLAS_ROW.KINETIC_MUZZLE,
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
    dashLength: 6.4,
    width: 1.15,
    intensity: 1.85,
    pixelFloor: 10,
    ribbon: true,
    ribbonWidth: 0.22,
    ribbonLinger: 0.06,
    coreColor: '#eeddbb',
    sheathColor: '#ffcc88',
  }),
  shield: Object.freeze({
    contact: true,
    flipbook: true,
    atlasRow: ATLAS_ROW.KINETIC_MUZZLE,
    life: 0.12,
    haze: 0.2,
  }),
  hull: Object.freeze({
    scorch: true,
    scorchLife: 5.0,
    flipbook: true,
    atlasRow: ATLAS_ROW.PULSE_IMPACT_HULL,
    sparks: true,
    sparkScale: 1.15,
  }),
});

const FLAK = Object.freeze({
  family: 'kinetic',
  variant: 'flak',
  muzzle: Object.freeze({
    flipbook: true,
    atlasRow: ATLAS_ROW.KINETIC_MUZZLE,
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
    dashLength: 4.4,
    width: 0.72,
    intensity: 1.7,
    pixelFloor: 8,
    ribbon: false,
    ribbonWidth: 0,
    ribbonLinger: 0,
    coreColor: '#fff4d2',
    sheathColor: '#ffcc88',
  }),
  shield: Object.freeze({
    contact: false,
    flipbook: false,
    atlasRow: ATLAS_ROW.KINETIC_MUZZLE,
    life: 0.2,
    haze: 0.4,
  }),
  hull: Object.freeze({
    scorch: false,
    scorchLife: 0,
    flipbook: false,
    atlasRow: ATLAS_ROW.KINETIC_MUZZLE,
    sparks: true,
    sparkScale: 1.6,
  }),
});

const RAIL = Object.freeze({
  family: 'rail',
  variant: 'railgun',
  muzzle: Object.freeze({
    flipbook: true,
    atlasRow: ATLAS_ROW.RAIL_MUZZLE,
    life: 0.09,
    width: 1.1,
    height: 4.6,
    bore: true,
    boreLife: 0.22,
    haze: 0.2,
    lightPeak: 4.0,
    lightDistance: 18,
    coreColor: '#f4fbff',
    accentColor: '#9edcff',
    lightColor: '#d8f0ff',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD,
    boltVariant: BOLT_VARIANT.RAIL,
    dashLength: 18,
    width: 0.85,
    intensity: 3.4,
    pixelFloor: 8,
    ribbon: true,
    ribbonWidth: 0.18,
    ribbonLinger: 0.08,
    coreColor: '#ffffff',
    sheathColor: '#9edcff',
  }),
  shield: Object.freeze({
    contact: true,
    flipbook: true,
    atlasRow: ATLAS_ROW.RAIL_MUZZLE,
    life: 0.12,
    haze: 0.3,
  }),
  hull: Object.freeze({
    scorch: true,
    scorchLife: 3.6,
    flipbook: true,
    atlasRow: ATLAS_ROW.RAIL_MUZZLE,
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
    lightPeak: 5.2,
    lightDistance: 22,
  }),
  flight: Object.freeze({
    ...RAIL.flight,
    dashLength: 26,
    width: 1.35,
    intensity: 3.8,
    ribbonWidth: 0.28,
  }),
  shield: RAIL.shield,
  hull: Object.freeze({ ...RAIL.hull, scorchLife: 6.0, sparkScale: 1.1 }),
});

const EMP = Object.freeze({
  family: 'emp',
  variant: 'disruptor',
  muzzle: Object.freeze({
    flipbook: true,
    atlasRow: ATLAS_ROW.EMP_MUZZLE,
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
    width: 1.35,
    intensity: 2.3,
    pixelFloor: 11,
    ribbon: true,
    ribbonWidth: 0.34,
    ribbonLinger: 0.1,
    coreColor: '#ffffff',
    sheathColor: '#4d7eff',
  }),
  shield: Object.freeze({
    contact: true,
    flipbook: true,
    atlasRow: ATLAS_ROW.EMP_MUZZLE,
    life: 0.22,
    haze: 0.45,
  }),
  hull: Object.freeze({
    scorch: false,
    scorchLife: 0,
    flipbook: true,
    atlasRow: ATLAS_ROW.EMP_MUZZLE,
    sparks: true,
    sparkScale: 1.0,
  }),
});

const CONCUSSION = Object.freeze({
  family: 'concussion',
  variant: 'concussion-slug',
  muzzle: Object.freeze({
    flipbook: true,
    atlasRow: ATLAS_ROW.EXPLOSIVE_MUZZLE,
    life: 0.14,
    width: 1.8,
    height: 1.6,
    bore: true,
    boreLife: 0.18,
    haze: 0.22,
    lightPeak: 3.0,
    lightDistance: 14,
    coreColor: '#fff0d0',
    accentColor: '#c98a4a',
    lightColor: '#ffb35c',
  }),
  flight: Object.freeze({
    mode: FLIGHT_MODE.ENERGY_CARD,
    boltVariant: BOLT_VARIANT.CONCUSSION,
    dashLength: 4.8,
    width: 2.4,
    intensity: 1.15,
    pixelFloor: 14,
    ribbon: false,
    ribbonWidth: 0,
    ribbonLinger: 0,
    coreColor: '#ffe0a8',
    sheathColor: '#c98a4a',
  }),
  shield: Object.freeze({
    contact: true,
    flipbook: true,
    atlasRow: ATLAS_ROW.EXPLOSIVE_MUZZLE,
    life: 0.2,
    haze: 0.5,
  }),
  hull: Object.freeze({
    scorch: true,
    scorchLife: 6.0,
    flipbook: true,
    atlasRow: ATLAS_ROW.EXPLOSIVE_MUZZLE,
    sparks: true,
    sparkScale: 1.5,
  }),
});

const MISSILE = Object.freeze({
  family: 'missile',
  variant: 'missile',
  muzzle: Object.freeze({
    flipbook: true,
    atlasRow: ATLAS_ROW.EXPLOSIVE_MUZZLE,
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
    boltVariant: BOLT_VARIANT.KINETIC,
    dashLength: 0,
    width: 0,
    intensity: 0,
    pixelFloor: 0,
    ribbon: true,
    ribbonWidth: 0.7,
    ribbonLinger: 0.2,
    coreColor: '#fff8df',
    sheathColor: '#ff8844',
  }),
  shield: Object.freeze({
    contact: true,
    flipbook: true,
    atlasRow: ATLAS_ROW.EXPLOSIVE_MUZZLE,
    life: 0.28,
    haze: 0.7,
  }),
  hull: Object.freeze({
    scorch: true,
    scorchLife: 6.5,
    flipbook: true,
    atlasRow: ATLAS_ROW.EXPLOSIVE_MUZZLE,
    sparks: true,
    sparkScale: 1.8,
  }),
});

const TORPEDO = Object.freeze({
  ...MISSILE,
  variant: 'torpedo',
  muzzle: Object.freeze({ ...MISSILE.muzzle, width: 2.4, height: 2.6, lightPeak: 4.2 }),
  flight: Object.freeze({ ...MISSILE.flight, ribbonWidth: 0.95 }),
  hull: Object.freeze({ ...MISSILE.hull, scorchLife: 8.0, sparkScale: 2.2 }),
});

const BEAM = Object.freeze({
  family: 'beam',
  variant: 'continuous-beam',
  muzzle: Object.freeze({
    flipbook: true,
    atlasRow: ATLAS_ROW.PULSE_MUZZLE,
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
    coreColor: '#f4fbff',
    sheathColor: '#56cfff',
  }),
  shield: Object.freeze({
    contact: true,
    flipbook: false,
    atlasRow: ATLAS_ROW.PULSE_IMPACT_SHIELD,
    life: 0.08,
    haze: 0.35,
  }),
  hull: Object.freeze({
    scorch: true,
    scorchLife: 2.4,
    flipbook: false,
    atlasRow: ATLAS_ROW.PULSE_IMPACT_HULL,
    sparks: false,
    sparkScale: 0.4,
  }),
});

const MINE = Object.freeze({
  family: 'mine',
  variant: 'vector-mine',
  muzzle: Object.freeze({
    flipbook: false,
    atlasRow: ATLAS_ROW.KINETIC_MUZZLE,
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
    coreColor: '#cfe8ff',
    sheathColor: '#5aa0ff',
  }),
  shield: Object.freeze({
    contact: false,
    flipbook: true,
    atlasRow: ATLAS_ROW.EMP_MUZZLE,
    life: 0.28,
    haze: 0.9,
  }),
  hull: Object.freeze({
    scorch: false,
    scorchLife: 0,
    flipbook: true,
    atlasRow: ATLAS_ROW.EMP_MUZZLE,
    sparks: true,
    sparkScale: 1.4,
  }),
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
});

export function resolveWeaponRecipe(weaponId, weaponData = null) {
  const presentation = resolveWeaponPresentationFamily(weaponId, weaponData);
  return RECIPES_BY_VARIANT[presentation.variant] || AUTOCANNON;
}

export function projectileSkipsVisualFactoryMesh(entityOrWeaponId, weaponData = null) {
  if (entityOrWeaponId && typeof entityOrWeaponId === 'object') {
    if (entityOrWeaponId.type && entityOrWeaponId.type !== 'projectile') return false;
    const data = entityOrWeaponId.data || weaponData || null;
    const recipe = resolveWeaponRecipe(data && data.weaponId, data);
    return recipe.flight.mode === FLIGHT_MODE.ENERGY_CARD;
  }
  return resolveWeaponRecipe(entityOrWeaponId, weaponData).flight.mode === FLIGHT_MODE.ENERGY_CARD;
}

export function recipeUsesRibbonWake(recipe) {
  return !!(recipe && recipe.flight && recipe.flight.ribbon);
}

export function recipeUsesMuzzleFlipbook(recipe) {
  return !!(recipe && recipe.muzzle && recipe.muzzle.flipbook);
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
