// Per-hull player feel envelopes for the assisted governor.
//
// Hitch and Drifter share drive_reaction_m. The propulsion kernel commands acceleration
// (force = a * mass), so hull mass cancels and an empty-fit Hitch is identical to an empty-fit
// Drifter. These envelopes are the player-only shaping seam (§21A.5): they do not change
// combatSpeed / maxSpeed, and they are not applied to NPCs or to an active drawn-route follow.

const IDENTITY = Object.freeze({
  id: 'identity',
  identity: true,
  translation: 1,
  strafe: 1,
  yawAccel: 1,
  yawBrake: 1,
  yawRate: 1,
  lateralKill: 1,
  stopHorizon: 1,
  governor: 1,
  brakeHorizon: 1,
  neutralBrake: 1,
});

const TRANSLATION_KEYS = Object.freeze([
  'mainAccel',
  'reverseAccel',
  'brakeAccel',
  'maxAccel',
  'maxBrakeAccel',
  'rcsForwardAccel',
  'rcsReverseAccel',
  'fieldAccel',
  'trimAccel',
]);

const STRAFE_KEYS = Object.freeze([
  'strafeAccel',
  'brakeStrafeAccel',
  'rcsStrafeAccel',
]);

const YAW_ACCEL_KEYS = Object.freeze(['yawAccel', 'angularAccel']);
const YAW_BRAKE_KEYS = Object.freeze(['yawBrake', 'angularBrake']);

const ASSIST_HORIZON_KEYS = Object.freeze([
  'stopHorizonS',
  'driftStopHorizonS',
]);

const ENVELOPE_CACHE = new WeakMap();

// Additional multipliers on top of the catalog's player translation feel (1.15).
// Combat / precision / solver speed ceilings are never scaled.
export const PLAYER_FEEL_ENVELOPES = Object.freeze({
  // Teaching hull: answers immediately, still carries like a small hauler-adjacent scout.
  ship_kestrel: freezeEnv({
    id: 'hitch',
    translation: 1.55,
    strafe: 1.22,
    yawAccel: 1.18,
    yawBrake: 1.42,
    yawRate: 1.08,
    lateralKill: 1.18,
    stopHorizon: 0.72,
    governor: 0.66,
    brakeHorizon: 0.70,
    neutralBrake: 1.12,
  }),
  // Nervous and eager. Higher yaw brake than rate so it snaps onto a heading without spinning faster.
  ship_wasp: freezeEnv({
    id: 'wasp',
    translation: 1.92,
    strafe: 1.68,
    yawAccel: 1.34,
    yawBrake: 1.58,
    yawRate: 1.16,
    lateralKill: 1.72,
    stopHorizon: 0.60,
    governor: 0.52,
    brakeHorizon: 0.58,
    neutralBrake: 1.18,
  }),
  // Same drive as Hitch; planted and capable, not a second Hitch.
  ship_drifter: freezeEnv({
    id: 'drifter',
    translation: 1.08,
    strafe: 0.90,
    yawAccel: 0.82,
    yawBrake: 0.96,
    yawRate: 0.88,
    lateralKill: 0.86,
    stopHorizon: 1.14,
    governor: 1.10,
    brakeHorizon: 1.12,
    neutralBrake: 0.94,
  }),
  // Immediate acknowledgement; trajectory still takes time. Do not buy crispness by deleting inertia.
  ship_atlas: freezeEnv({
    id: 'atlas',
    translation: 1.22,
    strafe: 0.78,
    yawAccel: 0.74,
    yawBrake: 1.04,
    yawRate: 0.82,
    lateralKill: 0.78,
    stopHorizon: 1.16,
    governor: 1.18,
    brakeHorizon: 1.10,
    neutralBrake: 0.90,
  }),
});

const CLASS_FALLBACK = Object.freeze({
  scout: PLAYER_FEEL_ENVELOPES.ship_kestrel,
  fighter: PLAYER_FEEL_ENVELOPES.ship_wasp,
  interceptor: PLAYER_FEEL_ENVELOPES.ship_wasp,
  miner: freezeEnv({
    id: 'miner',
    translation: 1.05,
    strafe: 0.86,
    yawAccel: 0.80,
    yawBrake: 0.94,
    yawRate: 0.84,
    lateralKill: 0.88,
    stopHorizon: 1.10,
    governor: 1.08,
    brakeHorizon: 1.08,
    neutralBrake: 0.96,
  }),
  hauler: PLAYER_FEEL_ENVELOPES.ship_atlas,
  capital: freezeEnv({
    id: 'capital',
    translation: 1.10,
    strafe: 0.70,
    yawAccel: 0.66,
    yawBrake: 0.98,
    yawRate: 0.74,
    lateralKill: 0.72,
    stopHorizon: 1.22,
    governor: 1.24,
    brakeHorizon: 1.16,
    neutralBrake: 0.86,
  }),
});

export function hullIdFromEntity(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const data = entity.data;
  const derived = data && data.derived;
  const id = (data && data.defId)
    || (derived && (derived.shipId || derived.defId))
    || entity.defId
    || null;
  return id == null ? null : String(id);
}

export function resolveFeelEnvelope(hullId, flightClass = null) {
  if (hullId && PLAYER_FEEL_ENVELOPES[hullId]) return PLAYER_FEEL_ENVELOPES[hullId];
  const cls = String(flightClass || '').toLowerCase();
  if (cls && CLASS_FALLBACK[cls]) return CLASS_FALLBACK[cls];
  return IDENTITY;
}

/**
 * Return a cached, non-mutating scaled copy of a propulsion or legacy flight profile.
 * Identity envelopes return the input object.
 */
export function applyFeelEnvelope(profile, hullId, flightClass = null) {
  if (!profile || typeof profile !== 'object') return profile;
  const env = resolveFeelEnvelope(hullId, flightClass);
  if (!env || env.identity) return profile;
  let byEnv = ENVELOPE_CACHE.get(profile);
  if (!byEnv) {
    byEnv = Object.create(null);
    ENVELOPE_CACHE.set(profile, byEnv);
  }
  const cached = byEnv[env.id];
  if (cached) return cached;
  const felt = freezeScaled(scaleProfile(profile, env));
  byEnv[env.id] = felt;
  return felt;
}

export function pathFollowBlocksFeel(input) {
  return !!(input && input.autoTargetPath && input.autoTargetPath.active);
}

function scaleProfile(profile, env) {
  const next = { ...profile };
  scaleKeys(next, TRANSLATION_KEYS, env.translation);
  scaleKeys(next, STRAFE_KEYS, env.strafe);
  scaleKeys(next, YAW_ACCEL_KEYS, env.yawAccel);
  scaleKeys(next, YAW_BRAKE_KEYS, env.yawBrake);
  if (Number.isFinite(next.maxYawRate)) next.maxYawRate *= env.yawRate;
  if (Number.isFinite(next.responseHz)) next.responseHz *= env.translation;
  if (Number.isFinite(next.assistStrength)) next.assistStrength *= env.lateralKill;
  if (Number.isFinite(next.reverseBrake)) next.reverseBrake *= env.translation;
  if (profile.assist && typeof profile.assist === 'object') {
    const assist = { ...profile.assist };
    scaleKeys(assist, ASSIST_HORIZON_KEYS, env.stopHorizon);
    if (Number.isFinite(assist.governorResponseS)) assist.governorResponseS *= env.governor;
    if (Number.isFinite(assist.pilotBrakeHorizonS)) assist.pilotBrakeHorizonS *= env.brakeHorizon;
    if (Number.isFinite(assist.lateralKillFraction)) {
      assist.lateralKillFraction = clamp(assist.lateralKillFraction * env.lateralKill, 0, 0.85);
    }
    if (Number.isFinite(assist.neutralBrakeFraction)) {
      assist.neutralBrakeFraction = clamp(assist.neutralBrakeFraction * env.neutralBrake, 0, 0.85);
    }
    next.assist = assist;
  }
  return next;
}

function scaleKeys(target, keys, scale) {
  if (!(scale > 0) || scale === 1) return;
  for (const key of keys) {
    if (Number.isFinite(target[key])) target[key] *= scale;
  }
}

function freezeEnv(env) {
  return Object.freeze({
    identity: false,
    translation: 1,
    strafe: 1,
    yawAccel: 1,
    yawBrake: 1,
    yawRate: 1,
    lateralKill: 1,
    stopHorizon: 1,
    governor: 1,
    brakeHorizon: 1,
    neutralBrake: 1,
    ...env,
  });
}

function freezeScaled(profile) {
  if (profile.assist && typeof profile.assist === 'object') Object.freeze(profile.assist);
  return Object.freeze(profile);
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}
