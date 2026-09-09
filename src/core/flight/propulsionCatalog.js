// SpaceFace Flight V3 — propulsion catalog and profile resolution.
//
// This file is additive. It does not replace src/data/ships.js. The integration
// agent should add `driveId` (or a full `propulsion` block) to ship/module data,
// then let this resolver supply backward-compatible defaults while saves migrate.
//
// Coordinate convention: gameplay lies on XZ, +Y is up, +X is ship-forward at yaw 0.

export const PROPULSION_SCHEMA_VERSION = 1;

export const DRIVE_FAMILIES = Object.freeze({
  REACTION: 'reaction',              // force-limited, momentum-conserving thrusters
  GRAVIMETRIC: 'gravimetric',        // target-velocity field drive, hard envelope
  PULSE_PLATE: 'pulse_plate',        // discrete high-impulse Orion-like plate drive
  TORCH: 'torch',                    // high-acceleration axial drive with spool + heat
  SAIL: 'field_sail',                // low-force environmental / magnetic sail
});

const INF = Number.POSITIVE_INFINITY;
const DERIVED_RUNTIME_PROFILE_CACHE = new WeakMap();
const PLAYER_TRANSLATION_PROFILE_CACHE = new WeakMap();

/**
 * Player-only translation feel. The ship reaches its existing speed ceiling sooner and
 * kills speed sooner; yaw and top speed stay on the authored drive. Cached per frozen
 * profile so a flight tick does not allocate.
 */
export const PLAYER_TRANSLATION_RESPONSIVENESS = 1.15;

const TRANSLATION_ACCEL_KEYS = Object.freeze([
  'mainAccel',
  'reverseAccel',
  'strafeAccel',
  'brakeAccel',
  'brakeStrafeAccel',
  'maxAccel',
  'maxBrakeAccel',
  'rcsForwardAccel',
  'rcsReverseAccel',
  'rcsStrafeAccel',
  'fieldAccel',
  'trimAccel',
]);

const ASSIST_HORIZON_KEYS = Object.freeze([
  'stopHorizonS',
  'driftStopHorizonS',
  'governorResponseS',
  'pilotBrakeHorizonS',
]);

const DEFAULT_PILOT_BRAKE_HORIZON_S = 0.72;

/**
 * Canonical drive definitions. Values are gameplay-scale world units, not claims
 * about real-world engine performance. The physics contract is nevertheless real:
 * force changes momentum, mass matters, and a reaction drive has no hidden drag or
 * terminal velocity.
 */
export const PROPULSION_PROFILES = Object.freeze({
  drive_reaction_s: freezeProfile({
    id: 'drive_reaction_s',
    family: DRIVE_FAMILIES.REACTION,
    label: 'Vector Reaction Drive S',
    mainAccel: 124,
    reverseAccel: 96,
    strafeAccel: 86,
    yawAccel: 12,
    yawBrake: 18,
    maxYawRate: 3.1,
    boostAccelMult: 2.15,
    boostSpeedMult: 1.6,
    solverSpeedLimit: INF,
    precisionSpeed: 62,
    combatSpeed: 105,
    travelCeiling: 472.5,
    assist: {
      neutralBrakeFraction: 0.48,
      lateralKillFraction: 0.36,
      commandedAxisDamping: 0.08,
      stopHorizonS: 2.20,
      driftStopHorizonS: 7.5,
      deadSpeed: 0.18,
      deadInput: 0.025,
      governorResponseS: 0.26,
      overspeedBrakeFraction: 0.28,
    },
    resources: {
      energyPerAccel: 0.010,
      heatPerAccel: 0.014,
      boostHeatMult: 1.9,
      coolingPerS: 3.2,
    },
  }),

  drive_reaction_m: freezeProfile({
    id: 'drive_reaction_m',
    family: DRIVE_FAMILIES.REACTION,
    label: 'Vector Reaction Drive M',
    mainAccel: 100,
    reverseAccel: 78,
    strafeAccel: 68,
    yawAccel: 8.8,
    yawBrake: 14,
    maxYawRate: 2.45,
    boostAccelMult: 2.05,
    boostSpeedMult: 1.55,
    solverSpeedLimit: INF,
    precisionSpeed: 57,
    combatSpeed: 95,
    travelCeiling: 438.75,
    assist: {
      neutralBrakeFraction: 0.44,
      lateralKillFraction: 0.32,
      commandedAxisDamping: 0.07,
      stopHorizonS: 2.35,
      driftStopHorizonS: 8.5,
      deadSpeed: 0.20,
      deadInput: 0.025,
      governorResponseS: 0.30,
      overspeedBrakeFraction: 0.24,
    },
    resources: {
      energyPerAccel: 0.009,
      heatPerAccel: 0.012,
      boostHeatMult: 1.8,
      coolingPerS: 3.0,
    },
  }),

  drive_reaction_l: freezeProfile({
    id: 'drive_reaction_l',
    family: DRIVE_FAMILIES.REACTION,
    label: 'Vector Reaction Drive L',
    mainAccel: 60,
    reverseAccel: 40,
    strafeAccel: 28,
    yawAccel: 4.3,
    yawBrake: 7.0,
    maxYawRate: 1.38,
    boostAccelMult: 1.85,
    boostSpeedMult: 1.45,
    solverSpeedLimit: INF,
    precisionSpeed: 45,
    combatSpeed: 85,
    travelCeiling: 382.5,
    assist: {
      neutralBrakeFraction: 0.40,
      lateralKillFraction: 0.27,
      commandedAxisDamping: 0.05,
      stopHorizonS: 3.10,
      driftStopHorizonS: 10.0,
      deadSpeed: 0.24,
      deadInput: 0.025,
      governorResponseS: 0.42,
      overspeedBrakeFraction: 0.16,
    },
    resources: {
      energyPerAccel: 0.008,
      heatPerAccel: 0.010,
      boostHeatMult: 1.7,
      coolingPerS: 2.5,
    },
  }),

  drive_gravimetric_s: freezeProfile({
    id: 'drive_gravimetric_s',
    family: DRIVE_FAMILIES.GRAVIMETRIC,
    label: 'Gravimetric Vector Drive S',
    maxSpeed: 84,
    boostMaxSpeed: 122,
    maxAccel: 160,
    maxBrakeAccel: 190,
    responseHz: 4.8,
    yawAccel: 18,
    yawBrake: 24,
    maxYawRate: 3.6,
    solverSpeedLimit: 275,
    travelCeiling: 252,
    resources: {
      idleEnergyPerS: 0.35,
      energyPerAccel: 0.026,
      heatPerAccel: 0.023,
      coolingPerS: 4.0,
    },
  }),

  drive_gravimetric_m: freezeProfile({
    id: 'drive_gravimetric_m',
    family: DRIVE_FAMILIES.GRAVIMETRIC,
    label: 'Gravimetric Vector Drive M',
    maxSpeed: 75,
    boostMaxSpeed: 108,
    maxAccel: 120,
    maxBrakeAccel: 142,
    responseHz: 4.1,
    yawAccel: 12,
    yawBrake: 18,
    maxYawRate: 2.8,
    solverSpeedLimit: 240,
    travelCeiling: 225,
    resources: {
      idleEnergyPerS: 0.55,
      energyPerAccel: 0.024,
      heatPerAccel: 0.020,
      coolingPerS: 3.6,
    },
  }),

  drive_pulse_plate_m: freezeProfile({
    id: 'drive_pulse_plate_m',
    family: DRIVE_FAMILIES.PULSE_PLATE,
    label: 'Medusa Pulse Plate M',
    rcsForwardAccel: 31,
    rcsReverseAccel: 23,
    rcsStrafeAccel: 18,
    yawAccel: 7.5,
    yawBrake: 9.5,
    maxYawRate: 1.95,
    minChargeS: 0.14,
    maxChargeS: 2.2,
    baseImpulseDv: 32,
    maxImpulseDv: 235,
    chargeCurve: 1.75,
    fireAlignmentRad: 0.10,
    flipBurnLeadS: 0.15,
    pulseCooldownS: 0.34,
    solverSpeedLimit: INF,
    precisionSpeed: 39,
    combatSpeed: 130,
    travelCeiling: 715,
    resources: {
      energyPerChargeS: 2.0,
      heatPerChargeS: 8.5,
      heatPerPulse: 18,
      coolingPerS: 2.2,
    },
  }),

  drive_torch_l: freezeProfile({
    id: 'drive_torch_l',
    family: DRIVE_FAMILIES.TORCH,
    label: 'Open-Cycle Torch Drive L',
    mainAccel: 182,
    reverseAccel: 31,
    strafeAccel: 14,
    yawAccel: 3.6,
    yawBrake: 5.0,
    maxYawRate: 1.0,
    spoolUpS: 2.8,
    spoolDownS: 1.6,
    ignitionFloor: 0.18,
    boostAccelMult: 1.55,
    boostSpeedMult: 1.4,
    solverSpeedLimit: INF,
    precisionSpeed: 42,
    combatSpeed: 160,
    travelCeiling: 1120,
    resources: {
      idleFuelPerS: 0.02,
      fuelPerAccel: 0.018,
      heatPerAccel: 0.035,
      coolingPerS: 1.8,
    },
  }),

  drive_field_sail_m: freezeProfile({
    id: 'drive_field_sail_m',
    family: DRIVE_FAMILIES.SAIL,
    label: 'Magnetoplasma Field Sail M',
    fieldAccel: 25,
    trimAccel: 6.5,
    yawAccel: 5.2,
    yawBrake: 8.0,
    maxYawRate: 1.6,
    deploymentS: 2.5,
    collapseS: 0.9,
    solverSpeedLimit: INF,
    precisionSpeed: 25,
    combatSpeed: 48,
    travelCeiling: 190,
    resources: {
      idleEnergyPerS: 0.08,
      heatPerAccel: 0.004,
      coolingPerS: 2.8,
    },
  }),
});

const ROLE_DEFAULTS = Object.freeze({
  starter: 'drive_reaction_m',
  scout: 'drive_reaction_s',
  fighter: 'drive_reaction_s',
  interceptor: 'drive_reaction_s',
  multirole: 'drive_reaction_m',
  mining: 'drive_reaction_m',
  miner: 'drive_reaction_m',
  freighter: 'drive_reaction_l',
  hauler: 'drive_reaction_l',
  frigate: 'drive_reaction_l',
  capital: 'drive_torch_l',
  cruiser: 'drive_torch_l',
});

/** Resolve an entity's authored propulsion profile without mutating it. */
export function resolvePropulsionProfile(entity, state = null) {
  const derived = entity && entity.data && entity.data.derived;
  const authored =
    (entity && entity.propulsion) ||
    (entity && entity.flightModel && entity.flightModel.propulsion) ||
    (derived && derived.propulsion) ||
    null;

  let profile = null;
  let completeDerivedProfile = false;
  if (authored && typeof authored === 'object') {
    // ships.js publishes a complete, frozen derived profile once per fitting/mass recompute. Reuse
    // it directly: rebuilding three spread objects on every flight tick would turn an upgrade into
    // a steady heap/GC tax. Partial authored profiles still take the merge path below.
    const completeDerived = derived
      && authored === derived.propulsion
      && authored.schemaVersion === PROPULSION_SCHEMA_VERSION
      && PROPULSION_PROFILES[authored.id]
      && Number.isFinite(authored.travelCeiling);
    if (completeDerived) {
      profile = hydrateDerivedRuntimeProfile(authored);
      completeDerivedProfile = true;
    } else {
      const base = authored.id && PROPULSION_PROFILES[authored.id]
        ? PROPULSION_PROFILES[authored.id]
        : inferProfile(entity);
      profile = normalizeProfile({
        ...base,
        ...authored,
        resources: { ...(base.resources || {}), ...(authored.resources || {}) },
        assist: { ...(base.assist || {}), ...(authored.assist || {}) },
      });
    }
  }

  const driveId =
    (entity && entity.driveId) ||
    (derived && derived.driveId) ||
    (entity && entity.data && entity.data.driveId) ||
    null;

  if (!profile && driveId && PROPULSION_PROFILES[driveId]) {
    profile = PROPULSION_PROFILES[driveId];
  }

  // A setting hook is useful for a controlled migration / flight laboratory, but
  // it must never silently rewrite NPCs or saves in production.
  const labOverride = state && state.settings && state.settings.gameplay && state.settings.gameplay.flightLabDrive;
  if ((!profile || completeDerivedProfile)
      && labOverride
      && PROPULSION_PROFILES[labOverride]
      && entity
      && entity.id === state.playerId) {
    profile = PROPULSION_PROFILES[labOverride];
  }

  if (!profile) profile = inferProfile(entity);

  if (isPlayerCraft(entity, state)) {
    profile = withPlayerTranslationFeel(profile);
  }

  // Cruise engagement multipliers (spec2/02 §1): player only.
  if (state && entity && entity.id === state.playerId) {
    const c = state.player && state.player.cruise;
    if (c && c.phase === 'cruising') {
      return {
        ...profile,
        maxSpeed: Number.isFinite(profile.maxSpeed) ? profile.maxSpeed * 4.0 : profile.maxSpeed,
        mainAccel: Number.isFinite(profile.mainAccel) ? profile.mainAccel * 2.5 : profile.mainAccel,
        maxAccel: Number.isFinite(profile.maxAccel) ? profile.maxAccel * 2.5 : profile.maxAccel,
        maxYawRate: Number.isFinite(profile.maxYawRate) ? profile.maxYawRate * 0.25 : profile.maxYawRate,
        yawAccel: Number.isFinite(profile.yawAccel) ? profile.yawAccel * 0.25 : profile.yawAccel,
        yawBrake: Number.isFinite(profile.yawBrake) ? profile.yawBrake * 0.25 : profile.yawBrake,
      };
    }
    if (c && Number.isFinite(c.stumbleT) && c.stumbleT > 0) {
      return {
        ...profile,
        maxYawRate: Number.isFinite(profile.maxYawRate) ? profile.maxYawRate * 0.4 : profile.maxYawRate,
        yawAccel: Number.isFinite(profile.yawAccel) ? profile.yawAccel * 0.4 : profile.yawAccel,
        yawBrake: Number.isFinite(profile.yawBrake) ? profile.yawBrake * 0.4 : profile.yawBrake,
      };
    }
  }
  return profile;
}

/**
 * The hull's governed combat speed — the speed the assisted governor actually holds the ship at
 * (`applySpeedGovernor`'s `baseCap` at full throttle), independent of how far the throttle is open.
 *
 * This is the reference PRESENTATION must key to. `entity.maxSpeed` is the LEGACY derived stat
 * (`src/systems/ships.js`: engine topSpeed x SPEED_SCALE x handling x speedMass); it does not move
 * with this catalog. It reads ~172 for the starter, whose governed cruise is 95, so a camera keyed
 * to it saturates its frame far above the speed the ship actually fights at, and the frame closes
 * exactly where the fight happens (FEEL_CONTRACT B3).
 */
export function resolveGovernedCombatSpeed(entity, state = null, fallback = 0) {
  const profile = resolvePropulsionProfile(entity, state);
  const combat = profile && profile.combatSpeed;
  if (Number.isFinite(combat) && combat > 0) return combat;
  const top = profile && profile.maxSpeed;
  if (Number.isFinite(top) && top > 0) return top;
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

export function getPropulsionProfile(id) {
  return PROPULSION_PROFILES[id] || null;
}

export function normalizeProfile(profile) {
  const family = Object.values(DRIVE_FAMILIES).includes(profile && profile.family)
    ? profile.family
    : DRIVE_FAMILIES.REACTION;
  const out = {
    schemaVersion: PROPULSION_SCHEMA_VERSION,
    id: String((profile && profile.id) || 'drive_custom'),
    label: String((profile && profile.label) || 'Custom Drive'),
    family,
    ...profile,
  };
  if (!Number.isFinite(out.solverSpeedLimit) && out.solverSpeedLimit !== INF) out.solverSpeedLimit = INF;
  return out;
}

function hydrateDerivedRuntimeProfile(profile) {
  let hydrated = DERIVED_RUNTIME_PROFILE_CACHE.get(profile);
  if (hydrated) return hydrated;
  // ships.js keeps its derived descriptor serializable by omitting the unbounded Infinity sentinel.
  // Normalize once per immutable descriptor, then reuse the runtime shape on every flight tick.
  hydrated = Object.freeze(normalizeProfile(profile));
  DERIVED_RUNTIME_PROFILE_CACHE.set(profile, hydrated);
  return hydrated;
}

function inferProfile(entity) {
  const role = String(
    (entity && entity.flightClass) ||
    (entity && entity.data && (entity.data.role || entity.data.flightClass)) ||
    ''
  ).toLowerCase();
  for (const [needle, id] of Object.entries(ROLE_DEFAULTS)) {
    if (role.includes(needle)) return PROPULSION_PROFILES[id];
  }
  const mass = finitePositive(entity && entity.mass, 18);
  if (mass < 24) return PROPULSION_PROFILES.drive_reaction_s;
  if (mass > 85) return PROPULSION_PROFILES.drive_reaction_l;
  return PROPULSION_PROFILES.drive_reaction_m;
}

function freezeProfile(profile) {
  const normalized = normalizeProfile(profile);
  if (normalized.assist) Object.freeze(normalized.assist);
  if (normalized.resources) Object.freeze(normalized.resources);
  return Object.freeze(normalized);
}

function isPlayerCraft(entity, state) {
  if (!entity) return false;
  if (entity.isPlayer === true) return true;
  return !!(state && entity.id === state.playerId);
}

function withPlayerTranslationFeel(profile) {
  if (!profile) return profile;
  let felt = PLAYER_TRANSLATION_PROFILE_CACHE.get(profile);
  if (felt) return felt;
  felt = freezeProfile(applyTranslationResponsiveness(profile));
  PLAYER_TRANSLATION_PROFILE_CACHE.set(profile, felt);
  return felt;
}

/** Scale translation authority and shrink stop horizons by the same factor. */
export function applyTranslationResponsiveness(profile, scale = PLAYER_TRANSLATION_RESPONSIVENESS) {
  if (!profile || !(scale > 0) || scale === 1) return profile;
  const next = { ...profile };
  for (const key of TRANSLATION_ACCEL_KEYS) {
    if (Number.isFinite(next[key])) next[key] *= scale;
  }
  if (Number.isFinite(next.responseHz)) next.responseHz *= scale;
  const assist = { ...(profile.assist || {}) };
  const horizonScale = 1 / scale;
  for (const key of ASSIST_HORIZON_KEYS) {
    if (Number.isFinite(assist[key])) assist[key] *= horizonScale;
  }
  if (!Number.isFinite(assist.pilotBrakeHorizonS)) {
    assist.pilotBrakeHorizonS = DEFAULT_PILOT_BRAKE_HORIZON_S * horizonScale;
  }
  next.assist = assist;
  return next;
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
