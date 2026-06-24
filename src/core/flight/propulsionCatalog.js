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
    mainAccel: 48,
    reverseAccel: 25,
    strafeAccel: 19,
    yawAccel: 12,
    yawBrake: 18,
    maxYawRate: 3.1,
    boostAccelMult: 2.15,
    solverSpeedLimit: INF,
    precisionSpeed: 125,
    combatSpeed: 210,
    assist: {
      neutralBrakeFraction: 0.42,
      lateralKillFraction: 0.30,
      commandedAxisDamping: 0.08,
      stopHorizonS: 2.6,
      driftStopHorizonS: 7.5,
      deadSpeed: 0.18,
      deadInput: 0.025,
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
    mainAccel: 38,
    reverseAccel: 22,
    strafeAccel: 15,
    yawAccel: 8.8,
    yawBrake: 14,
    maxYawRate: 2.45,
    boostAccelMult: 2.05,
    solverSpeedLimit: INF,
    precisionSpeed: 115,
    combatSpeed: 195,
    assist: {
      neutralBrakeFraction: 0.40,
      lateralKillFraction: 0.27,
      commandedAxisDamping: 0.07,
      stopHorizonS: 3.0,
      driftStopHorizonS: 8.5,
      deadSpeed: 0.20,
      deadInput: 0.025,
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
    mainAccel: 23,
    reverseAccel: 15,
    strafeAccel: 8,
    yawAccel: 4.3,
    yawBrake: 7.0,
    maxYawRate: 1.38,
    boostAccelMult: 1.85,
    solverSpeedLimit: INF,
    precisionSpeed: 92,
    combatSpeed: 170,
    assist: {
      neutralBrakeFraction: 0.36,
      lateralKillFraction: 0.22,
      commandedAxisDamping: 0.05,
      stopHorizonS: 4.0,
      driftStopHorizonS: 10.0,
      deadSpeed: 0.24,
      deadInput: 0.025,
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
    maxSpeed: 168,
    boostMaxSpeed: 245,
    maxAccel: 105,
    maxBrakeAccel: 125,
    responseHz: 4.8,
    yawAccel: 18,
    yawBrake: 24,
    maxYawRate: 3.6,
    solverSpeedLimit: 275,
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
    maxSpeed: 150,
    boostMaxSpeed: 215,
    maxAccel: 78,
    maxBrakeAccel: 92,
    responseHz: 4.1,
    yawAccel: 12,
    yawBrake: 18,
    maxYawRate: 2.8,
    solverSpeedLimit: 240,
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
    rcsForwardAccel: 12,
    rcsReverseAccel: 9,
    rcsStrafeAccel: 7,
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
    precisionSpeed: 78,
    combatSpeed: 260,
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
    mainAccel: 70,
    reverseAccel: 12,
    strafeAccel: 5.5,
    yawAccel: 3.6,
    yawBrake: 5.0,
    maxYawRate: 1.0,
    spoolUpS: 2.8,
    spoolDownS: 1.6,
    ignitionFloor: 0.18,
    boostAccelMult: 1.55,
    solverSpeedLimit: INF,
    precisionSpeed: 85,
    combatSpeed: 320,
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
    fieldAccel: 9.5,
    trimAccel: 2.5,
    yawAccel: 5.2,
    yawBrake: 8.0,
    maxYawRate: 1.6,
    deploymentS: 2.5,
    collapseS: 0.9,
    solverSpeedLimit: INF,
    precisionSpeed: 50,
    combatSpeed: 95,
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

  if (authored && typeof authored === 'object') {
    const base = authored.id && PROPULSION_PROFILES[authored.id]
      ? PROPULSION_PROFILES[authored.id]
      : inferProfile(entity);
    return normalizeProfile({ ...base, ...authored, resources: { ...(base.resources || {}), ...(authored.resources || {}) }, assist: { ...(base.assist || {}), ...(authored.assist || {}) } });
  }

  const driveId =
    (entity && entity.driveId) ||
    (derived && derived.driveId) ||
    (entity && entity.data && entity.data.driveId) ||
    null;

  if (driveId && PROPULSION_PROFILES[driveId]) return PROPULSION_PROFILES[driveId];

  // A setting hook is useful for a controlled migration / flight laboratory, but
  // it must never silently rewrite NPCs or saves in production.
  const labOverride = state && state.settings && state.settings.gameplay && state.settings.gameplay.flightLabDrive;
  if (labOverride && PROPULSION_PROFILES[labOverride] && entity && entity.id === state.playerId) {
    return PROPULSION_PROFILES[labOverride];
  }

  return inferProfile(entity);
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

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
