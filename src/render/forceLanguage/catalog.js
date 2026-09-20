import { FIELD_LIFECYCLES } from './effectLifecycle.js';
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

/**
 * Authored material per STRUCTURAL MEMBER, shared by every field recipe so a family's hardware and
 * its working surface cannot drift apart. These are art-direction constants, not physics:
 *   flex — how much of the family's sustained deformation this member receives (0 = rigid hardware)
 *   ribs — machined rib count across the strip; 0 is a smooth membrane. Filtered in the shader,
 *          so this buys readable internal structure, never high-frequency noise.
 *   heat — 0 = cool machined structure, 1 = hot working surface. Separates the built object from
 *          the force it is carrying by material rather than by brightness.
 * The neutral member ("plain") reproduces the pre-2026-09-20 surface exactly; weapon-source
 * descriptors never reach this table and are unaffected.
 */
export const SURFACE_MATERIALS = freeze({
  plain: { flex: 1, ribs: 0, heat: 1 },
  truth: { flex: 0, ribs: 0, heat: 0.70 }, // the authoritative footprint line: measured, not lit
  frame: { flex: 0.18, ribs: 9, heat: 0.44 }, // collars, crowns, aperture throats
  spar: { flex: 0.34, ribs: 7, heat: 0.52 }, // splayed structural ribs and end caps
  membrane: { flex: 1.22, ribs: 5, heat: 1 }, // the surface that actually carries the force
  filament: { flex: 1.40, ribs: 0, heat: 1 }, // thin inner threads
  plate: { flex: 0.90, ribs: 5, heat: 0.62 }, // Seed's machined force plates
  edge: { flex: 0.55, ribs: 0, heat: 1 }, // hot working and warning edges
});

export const FORCE_FAMILIES = freeze({
  kinetic: { name: 'Machined impulse', silhouette: 'fractured axial wedges', motion: 'ballistic; abrupt ignition, fast cooling', material: 'hot cut metal, brass, soot', never: 'orbiting magic, soft source spheres' },
  propulsion: { name: 'Driven plasma', silhouette: 'open throat, separated swept sheets', motion: 'continuous nozzle-to-wake convection', material: 'white-hot folds, blue cooling edges, dark channels', never: 'isotropic bulbs; flight-history attached to current heading' },
  metric: { name: 'Metric stress', silhouette: 'folded caustics around empty space', motion: 'inward curvature / outward pressure / directional transport', material: 'cool tension folds; warm compression crests', never: 'identical dotted circles; suction on a Seed' },
  coherent: { name: 'Coherent energy', silhouette: 'collimated blade and split aperture', motion: 'phase-aligned axial packets', material: 'clean cyan ceramic-white edge; narrow afterimage', never: 'brass shells or combustion smoke for a laser' },
  induction: { name: 'Induced current', silhouette: 'forked conductors and interrupted circuit paths', motion: 'branch, bridge, extinguish', material: 'blue-violet charge with brief white junctions', never: 'a gravity spiral recolored purple' },
  reactive: { name: 'Reactive matter', silhouette: 'lobed sheets, wet bridges, deposited residue', motion: 'advect, adhere, spread, consume', material: 'opaque chemical body; emissive reaction boundary', never: 'a translucent neon shock ring standing in for goo' },
});

export const FIELD_SIGNATURES = freeze({
  seed: { lifecycle: FIELD_LIFECYCLES.seed, family: 'metric', name: 'Seed / frame lock', shape: 'articulated lock crown', motion: 'cast open → close opposing jaws → reciprocating lock strokes → fold and erode', mode: 'constraint', color: 0x54e5ed, accent: 0xffc36c, surfaces: 16 },
  well: { lifecycle: FIELD_LIFECYCLES.well, family: 'metric', name: 'Well', shape: 'five unequal inward scythes around an empty throat', motion: 'unfurl from the source → continuously turning inward folds → wind down into the throat', mode: 'inward', color: 0x58bdff, accent: 0xb9a2ff, surfaces: 19 },
  repulsor: { lifecycle: FIELD_LIFECYCLES.repulsor, family: 'metric', name: 'Repulsor', shape: 'nested broken pressure shells and splayed ribs', motion: 'open pressure bowls → repeated outward crests → shells crack, lift and cool; never implosion', mode: 'outward', color: 0xffb766, accent: 0xffe1a4, surfaces: 23 },
  cone: { lifecycle: FIELD_LIFECYCLES.cone, family: 'metric', name: 'Cone', shape: 'diverging banks with bowed transverse fronts', motion: 'grow from the aperture → forward transport within the real sector → source-to-tip peel', mode: 'forward', color: 0x54e5ed, accent: 0xb7f5ff, surfaces: 14 },
  sheet: { lifecycle: FIELD_LIFECYCLES.sheet, family: 'metric', name: 'Skim', shape: 'parallel intake banks and inward-facing scoops', motion: 'extend parallel banks → repeated intake strokes toward the centerline → banks fold and dissolve', mode: 'collect', color: 0x79f0c8, accent: 0xd9ffe0, surfaces: 18 },
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
  missile: { family: 'propulsion', source: 'staged-launch', beat: 'eject → ignite → accelerate' },
  torpedo: { family: 'propulsion', source: 'heavy-launch', beat: 'heavy eject → delayed ignition' },
  'continuous-beam': { family: 'coherent', source: 'latched-aperture', beat: 'latched aperture and continuous contact' },
  'vector-mine': { family: 'metric', source: 'shaped-deploy', beat: 'deploy → arm → shaped impulse' },
});

export function weaponSignature(variant) {
  return Object.hasOwn(WEAPON_SIGNATURES, variant) ? WEAPON_SIGNATURES[variant] : null;
}
