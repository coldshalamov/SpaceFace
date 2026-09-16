/**
 * Force language = WHAT acts. causalVfxGrammar = HOW the contact happened.
 * Neither owns simulation. Do not infer a force from a color, or turn unknown effects into wells.
 * Geometry, motion and phase are the primary channels; color is redundant reinforcement.
 */
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};

export const FORCE_FAMILIES = freeze({
  kinetic: { name: 'Machined impulse', silhouette: 'fractured axial wedges', motion: 'ballistic; abrupt ignition, fast cooling', material: 'hot cut metal, brass, soot', never: 'orbiting magic, soft source spheres' },
  propulsion: { name: 'Driven plasma', silhouette: 'open throat, separated swept sheets', motion: 'continuous nozzle-to-wake convection', material: 'white-hot folds, blue cooling edges, dark channels', never: 'isotropic bulbs; flight-history attached to current heading' },
  metric: { name: 'Metric stress', silhouette: 'folded caustics around empty space', motion: 'inward curvature / outward pressure / directional transport', material: 'cool tension folds; warm compression crests', never: 'identical dotted circles; suction on a Seed' },
  coherent: { name: 'Coherent energy', silhouette: 'collimated blade and split aperture', motion: 'phase-aligned axial packets', material: 'clean cyan ceramic-white edge; narrow afterimage', never: 'brass shells or combustion smoke for a laser' },
  induction: { name: 'Induced current', silhouette: 'forked conductors and interrupted circuit paths', motion: 'branch, bridge, extinguish', material: 'blue-violet charge with brief white junctions', never: 'a gravity spiral recolored purple' },
  reactive: { name: 'Reactive matter', silhouette: 'lobed sheets, wet bridges, deposited residue', motion: 'advect, adhere, spread, consume', material: 'opaque chemical body; emissive reaction boundary', never: 'a translucent neon shock ring standing in for goo' },
});

export const FIELD_SIGNATURES = freeze({
  seed: { family: 'metric', name: 'Seed / frame lock', shape: 'articulated lock crown', motion: 'travel → close opposing jaws → hold → erode', mode: 'constraint', color: 0x54e5ed, accent: 0xffc36c, surfaces: 16 },
  well: { family: 'metric', name: 'Well', shape: 'five unequal inward scythes around an empty throat', motion: 'inward only when engaged; parked caustics otherwise', mode: 'inward', color: 0x58bdff, accent: 0xb9a2ff, surfaces: 19 },
  repulsor: { family: 'metric', name: 'Repulsor', shape: 'nested broken pressure shells and splayed ribs', motion: 'outward crests; never inward', mode: 'outward', color: 0xffb766, accent: 0xffe1a4, surfaces: 23 },
  cone: { family: 'metric', name: 'Cone', shape: 'diverging banks with bowed transverse fronts', motion: 'forward transport within the real sector', mode: 'forward', color: 0x54e5ed, accent: 0xb7f5ff, surfaces: 14 },
  sheet: { family: 'metric', name: 'Skim', shape: 'parallel intake banks and inward-facing scoops', motion: 'toward centerline; long rectangular footprint', mode: 'collect', color: 0x79f0c8, accent: 0xd9ffe0, surfaces: 18 },
});

export function fieldSignature(kind) {
  return Object.hasOwn(FIELD_SIGNATURES, kind) ? FIELD_SIGNATURES[kind] : null;
}

/** Classification of existing production recipes, NOT replacement projectile tuning. */
export const WEAPON_SIGNATURES = freeze({
  'pulse-bolt': { family: 'coherent', source: 'split-aperture', beat: 'short aperture bloom, collimated packet' },
  'thermal-bolt': { family: 'propulsion', source: 'thermal-lobes', beat: 'dense hot extrusion and cooling trail' },
  autocannon: { family: 'kinetic', source: 'machined-burst', beat: 'axial blast; asymmetric vents; brass recoil' },
  flak: { family: 'kinetic', source: 'machined-burst', beat: 'wide fractured blast; delayed hard fragments' },
  railgun: { family: 'kinetic', source: 'rail-shear', beat: 'thin axial cut and opposed rail vents' },
  'siege-lance': { family: 'coherent', source: 'split-aperture', beat: 'sustained narrow aperture, long axial burn' },
  disruptor: { family: 'induction', source: 'circuit-fork', beat: 'branching discharge, segmented aftermath' },
  'concussion-slug': { family: 'kinetic', source: 'machined-burst', beat: 'short hard source kick, heavy pressure contact' },
  missile: { family: 'propulsion', source: 'existing-launch', beat: 'eject → ignite → accelerate' },
  torpedo: { family: 'propulsion', source: 'existing-launch', beat: 'heavy eject → delayed ignition' },
  'continuous-beam': { family: 'coherent', source: 'existing-beam', beat: 'latched aperture and continuous contact' },
  'vector-mine': { family: 'metric', source: 'existing-deployment', beat: 'deploy → arm → shaped impulse' },
});

export function weaponSignature(variant) {
  return Object.hasOwn(WEAPON_SIGNATURES, variant) ? WEAPON_SIGNATURES[variant] : null;
}
