// Combat-feel bench catalog. Pure data + pure helpers: importable by Node (no GPU) and by the
// browser harness. Every scenario names a real WEAPONS row and the authored target state the
// deterministic event input will feed to the production presentation owners.
//
// Boundary: this is a presentation bench, not the simulation. It does not mount weapons.js,
// combat damage, tumbleStates.js, physicsAuthority.js, or renderer.js. The harness supplies the
// production-shaped receipts those owners would emit (fire / hit / tumble status) and then lets
// the real WeaponVfxPresenter, ShipMicroMotion, ShipPitchPresentation and shield presentation
// draw the answer. See scripts/combat-feel/README.md.
import { WEAPONS } from '../../src/data/weapons.js';
import { resolveHitstunLaw } from '../../src/combat/impulseKernel.js';

export const CATALOG_VERSION = 1;
export const DEFAULT_SEED = 17;
export const DEFAULT_VIEW = 'normal';
export const STEP_SECONDS = 1 / 60;

// The fixed gameplay-camera arena. Positions are world XZ; +X is the Kestrel's bow and the
// Wasp faces back down -X. The socket offset is the authored SOCKET_Weapon_Front local X from
// assets/ships/release/render-packages/kestrel/render-package.json (12.62 WU). The harness also
// reads the live socket from the authored mesh; this constant is the Node-test fixture.
export const FIXED_ARENA = Object.freeze({
  ownerX: -36,
  targetX: 36,
  ownerRot: 0,
  targetRot: Math.PI,
  ownerRadius: 14,
  targetRadius: 14,
  targetHullHalfExtentWu: 10.81,
  ownerMass: 18,
  targetMass: 16,
  ownerCruise: 105,
  targetCruise: 105,
  ownerNoseOffsetWu: 12.62,
  camera: Object.freeze({
    fov: 50,
    tiltDeg: 60,
    azimuthDeg: 18,
    distanceWu: Object.freeze({ close: 62, normal: 76, wide: 118 }),
  }),
});

export const VIEWS = Object.freeze(['close', 'normal', 'wide']);

export const ALL_EVIDENCE = Object.freeze([
  'muzzle', 'travel', 'contact', 'reaction', 'debris', 'cooling', 'light', 'aftermath',
]);
export const HULL_EVIDENCE = ALL_EVIDENCE;
export const SHIELD_EVIDENCE = Object.freeze([
  'muzzle', 'travel', 'contact', 'reaction', 'debris', 'light',
]);

const WEAPON_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));

export const SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'pulse-hull',
    label: 'Pulse bolt / hull contact',
    note: 'Starter pulse into the Wasp hull: muzzle, bolt travel, hull spall and scorch, '
      + 'directional flinch, contact light, then a settled cooling frame.',
    weaponIds: Object.freeze(['wpn_pulse_laser_s']),
    target: Object.freeze({ shield: 0, hullFraction: 0.82, hullMax: 150 }),
    shots: Object.freeze([
      Object.freeze({ fireAt: 0.20, contact: 'hull' }),
    ]),
    tumble: null,
    // A damaged hull vents through the settle, not only for the first second. The live low-hull
    // owner is periodic; the bench supplies the same cadence while its sim is unmounted.
    venting: Object.freeze({ fromContactS: 0.70, everyS: 0.20, count: 3, repeats: 16 }),
    durationSeconds: 4.2,
    requiredEvidence: HULL_EVIDENCE,
  }),
  Object.freeze({
    id: 'concussion-tumble',
    label: 'Concussion slug / concussive tumble',
    note: 'The authored momentum payload: heavy hull flinch, production hitstun law entry spin, '
      + 'multi-axis tumble body language, breach venting and a long settle.',
    weaponIds: Object.freeze(['wpn_concussion_cannon_m']),
    target: Object.freeze({ shield: 0, hullFraction: 0.34, hullMax: 150 }),
    shots: Object.freeze([
      Object.freeze({ fireAt: 0.25, contact: 'hull' }),
    ]),
    tumble: Object.freeze({ shove: true, source: 'weapon' }),
    venting: Object.freeze({ fromContactS: 0.55, everyS: 0.18, count: 4, repeats: 18 }),
    durationSeconds: 5.0,
    requiredEvidence: HULL_EVIDENCE,
  }),
  Object.freeze({
    id: 'railgun-stagger',
    label: 'Railgun / heavy stagger',
    note: 'A fast spinal slug: short travel, hard contact, deep plate yield and a slower settle '
      + 'than the pulse. No forced tumble (the production hitstun law stays under its floor).',
    weaponIds: Object.freeze(['wpn_railgun_m']),
    target: Object.freeze({ shield: 0, hullFraction: 0.52, hullMax: 150 }),
    shots: Object.freeze([
      Object.freeze({ fireAt: 0.20, contact: 'hull' }),
    ]),
    tumble: null,
    venting: Object.freeze({ fromContactS: 0.65, everyS: 0.22, count: 3, repeats: 12 }),
    durationSeconds: 4.0,
    requiredEvidence: HULL_EVIDENCE,
  }),
  Object.freeze({
    id: 'shield-contact',
    label: 'Pulse bolt / shield contact',
    note: 'The same bolt stopped by the Wasp shield: production shield contact, shell flash, '
      + 'shield shard burst and a reduced hull shiver. No hull breach.',
    weaponIds: Object.freeze(['wpn_pulse_laser_s']),
    target: Object.freeze({ shield: 110, hullFraction: 0.90, hullMax: 150 }),
    shots: Object.freeze([
      Object.freeze({ fireAt: 0.20, contact: 'shield' }),
    ]),
    tumble: null,
    venting: null,
    durationSeconds: 2.8,
    requiredEvidence: SHIELD_EVIDENCE,
  }),
  Object.freeze({
    id: 'shield-break',
    label: 'Pulse burst / shield break then hull',
    note: 'Two authored shots: the first collapses the Wasp shield with the production shard '
      + 'burst; the second reaches the hull for flinch, spall, scorch and cooling.',
    weaponIds: Object.freeze(['wpn_pulse_laser_s']),
    target: Object.freeze({ shield: 22, hullFraction: 0.56, hullMax: 150 }),
    shots: Object.freeze([
      Object.freeze({ fireAt: 0.20, contact: 'shield' }),
      Object.freeze({ fireAt: 1.35, contact: 'hull' }),
    ]),
    tumble: null,
    venting: Object.freeze({ fromContactS: 0.65, everyS: 0.20, count: 3, repeats: 16 }),
    durationSeconds: 4.8,
    requiredEvidence: HULL_EVIDENCE,
  }),
  Object.freeze({
    id: 'beam-cut',
    label: 'Combat beam / sustained cut',
    note: 'The production PersistentCombatBeamPool holds a two-layer beam on the hull, with '
      + 'coalesced contact receipts, repeated scorch/light, release cooling and aftermath.',
    weaponIds: Object.freeze(['wpn_beam_laser_m']),
    target: Object.freeze({ shield: 0, hullFraction: 0.38, hullMax: 150 }),
    shots: Object.freeze([
      Object.freeze({ fireAt: 0.20, contact: 'hull', releaseAfterSeconds: 1.2 }),
    ]),
    tumble: null,
    venting: Object.freeze({ fromContactS: 1.70, everyS: 0.22, count: 3, repeats: 8 }),
    durationSeconds: 4.6,
    requiredEvidence: HULL_EVIDENCE,
  }),
]);

export const REQUIRED_SCENARIOS = Object.freeze([
  'pulse-hull', 'concussion-tumble', 'shield-break', 'beam-cut',
]);

export function scenarioById(id) {
  return SCENARIOS.find((scenario) => scenario.id === id) || null;
}

export function weaponById(id) {
  return WEAPON_BY_ID.get(id) || null;
}

export function validateCatalog() {
  const errors = [];
  const seen = new Set();
  for (const scenario of SCENARIOS) {
    if (seen.has(scenario.id)) errors.push(`duplicate scenario id: ${scenario.id}`);
    seen.add(scenario.id);
    if (!scenario.label) errors.push(`${scenario.id}: missing label`);
    if (!(scenario.durationSeconds > 0)) errors.push(`${scenario.id}: duration must be positive`);
    if (!Array.isArray(scenario.shots) || !scenario.shots.length) {
      errors.push(`${scenario.id}: at least one shot is required`);
    } else {
      for (const shot of scenario.shots) {
        if (!(shot.fireAt >= 0)) errors.push(`${scenario.id}: shot fireAt must be nonnegative`);
        if (shot.contact !== 'hull' && shot.contact !== 'shield') {
          errors.push(`${scenario.id}: shot contact must be hull or shield`);
        }
      }
    }
    if (!Array.isArray(scenario.weaponIds) || !scenario.weaponIds.length) {
      errors.push(`${scenario.id}: at least one weapon id is required`);
    } else {
      for (const weaponId of scenario.weaponIds) {
        const weapon = weaponById(weaponId);
        if (!weapon) errors.push(`${scenario.id}: unknown weapon ${weaponId}`);
        else if (weapon.continuous !== true && !(weapon.projSpeed > 0)) {
          errors.push(`${scenario.id}: ${weaponId} has no finite projectile speed`);
        }
      }
    }
    for (const evidence of scenario.requiredEvidence) {
      if (!ALL_EVIDENCE.includes(evidence)) {
        errors.push(`${scenario.id}: unknown evidence ${evidence}`);
      }
    }
    if (scenario.tumble && scenario.tumble.shove !== true) {
      errors.push(`${scenario.id}: tumble scenarios must name the shove-class receipt`);
    }
  }
  for (const id of REQUIRED_SCENARIOS) {
    if (!seen.has(id)) errors.push(`required scenario missing: ${id}`);
  }
  return errors;
}

/** The weapon row for a shot. A scenario may fire one weapon repeatedly; index is explicit. */
export function weaponForShot(scenario, shotIndex = 0) {
  const weaponIds = scenario && scenario.weaponIds ? scenario.weaponIds : [];
  const weaponId = weaponIds[Math.min(shotIndex, weaponIds.length - 1)];
  return weaponById(weaponId);
}

/**
 * Production hitstun-law read for the scenario's primary hull contact. Pure: the caller supplies
 * the same masses/cruise the sim would read. `shove` is true only for momentum-payload weapons,
 * matching `isShoveClassHitstunSource` in impulseKernel.
 */
export function resolveScenarioTumbleLaw(scenario, {
  attackerMass = FIXED_ARENA.ownerMass,
  victimMass = FIXED_ARENA.targetMass,
  victimCruise = FIXED_ARENA.targetCruise,
} = {}) {
  if (!scenario || !scenario.tumble) return null;
  const weapon = weaponForShot(scenario, scenario.shots.length - 1);
  if (!weapon) return null;
  const deltaV = (Number(weapon.impulsePerHit) || 0) / Math.max(1, victimMass);
  return resolveHitstunLaw({
    deltaV,
    victimCruise,
    attackerMass,
    victimMass,
    shove: scenario.tumble.shove === true,
  });
}

export function scenarioSummary(scenario) {
  return {
    id: scenario.id,
    label: scenario.label,
    note: scenario.note,
    weaponIds: scenario.weaponIds.slice(),
    shots: scenario.shots.map((shot) => ({ ...shot })),
    target: { ...scenario.target },
    tumble: scenario.tumble ? { ...scenario.tumble } : null,
    venting: scenario.venting ? { ...scenario.venting } : null,
    durationSeconds: scenario.durationSeconds,
    requiredEvidence: scenario.requiredEvidence.slice(),
  };
}

export function catalogSummary(seed = DEFAULT_SEED) {
  const errors = validateCatalog();
  return {
    version: CATALOG_VERSION,
    seed,
    stepSeconds: STEP_SECONDS,
    arena: {
      ownerX: FIXED_ARENA.ownerX,
      targetX: FIXED_ARENA.targetX,
      ownerRadius: FIXED_ARENA.ownerRadius,
      targetRadius: FIXED_ARENA.targetRadius,
      ownerMass: FIXED_ARENA.ownerMass,
      targetMass: FIXED_ARENA.targetMass,
      ownerCruise: FIXED_ARENA.ownerCruise,
      targetCruise: FIXED_ARENA.targetCruise,
      camera: {
        fov: FIXED_ARENA.camera.fov,
        tiltDeg: FIXED_ARENA.camera.tiltDeg,
        azimuthDeg: FIXED_ARENA.camera.azimuthDeg,
        distanceWu: { ...FIXED_ARENA.camera.distanceWu },
      },
    },
    views: VIEWS.slice(),
    requiredEvidence: ALL_EVIDENCE.slice(),
    requiredScenarios: REQUIRED_SCENARIOS.slice(),
    scenarios: SCENARIOS.map(scenarioSummary),
    errors,
  };
}
