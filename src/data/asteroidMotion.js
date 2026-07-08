// src/data/asteroidMotion.js - BP-02 mining fold: data-only asteroid spin/drift profiles.
// The world spawner can consume this table later; this module stays pure and deterministic.

const TAU = Math.PI * 2;

export const SEAM_TRACK_RADIUS = 14;
export const DEFAULT_ASTEROID_MOTION_PROFILE_ID = 'steady';

function fallbackHash32(...args) {
  let h = 0x811c9dc5;
  const str = args.join('|');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function fallbackMulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function freezeRow(row) {
  return Object.freeze({ ...row });
}

function round6(n) {
  return Math.round((Number(n) || 0) * 1e6) / 1e6;
}

function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

export const ASTEROID_MOTION_PROFILE_IDS = Object.freeze([
  'steady',
  'starter_tumble',
  'belt_tumble',
  'drift_shear',
  'slag_roll',
  'frontier_roll',
  'anomaly_wobble',
]);

export const ASTEROID_MOTION_PROFILES = Object.freeze({
  steady: freezeRow({
    id: 'steady',
    label: 'Steady Belt',
    fieldTell: 'barely rotating training rocks',
    minAngularVelocityRadS: 0,
    maxAngularVelocityRadS: 0,
    maxDriftSpeed: 0,
  }),
  starter_tumble: freezeRow({
    id: 'starter_tumble',
    label: 'Starter Tumble',
    fieldTell: 'slow seams for first mining reads',
    minAngularVelocityRadS: 0.004,
    maxAngularVelocityRadS: 0.018,
    maxDriftSpeed: 0.25,
  }),
  belt_tumble: freezeRow({
    id: 'belt_tumble',
    label: 'Belt Tumble',
    fieldTell: 'readable rotating ore faces',
    minAngularVelocityRadS: 0.014,
    maxAngularVelocityRadS: 0.048,
    maxDriftSpeed: 1.4,
  }),
  drift_shear: freezeRow({
    id: 'drift_shear',
    label: 'Drift Shear',
    fieldTell: 'sideways field drift with moderate spin',
    minAngularVelocityRadS: 0.012,
    maxAngularVelocityRadS: 0.040,
    maxDriftSpeed: 2.2,
  }),
  slag_roll: freezeRow({
    id: 'slag_roll',
    label: 'Slag Roll',
    fieldTell: 'hot industrial tumble',
    minAngularVelocityRadS: 0.018,
    maxAngularVelocityRadS: 0.060,
    maxDriftSpeed: 1.2,
  }),
  frontier_roll: freezeRow({
    id: 'frontier_roll',
    label: 'Frontier Roll',
    fieldTell: 'dangerous seams that demand tracking',
    minAngularVelocityRadS: 0.020,
    maxAngularVelocityRadS: 0.072,
    maxDriftSpeed: 2.8,
  }),
  anomaly_wobble: freezeRow({
    id: 'anomaly_wobble',
    label: 'Anomaly Wobble',
    fieldTell: 'unsettled frontier motion',
    minAngularVelocityRadS: 0.018,
    maxAngularVelocityRadS: 0.066,
    maxDriftSpeed: 3.4,
  }),
});

export const FIELD_ASTEROID_MOTION = Object.freeze({
  f_helios_starter: 'starter_tumble',
  f_ceres_1: 'belt_tumble',
  f_ceres_2: 'belt_tumble',
  f_ceres_3: 'belt_tumble',
  f_tethys_1: 'starter_tumble',
  f_vesta_1: 'belt_tumble',
  f_vesta_2: 'slag_roll',
  f_vesta_3: 'slag_roll',
  f_pallas_1: 'drift_shear',
  f_pallas_2: 'drift_shear',
  f_pallas_3: 'frontier_roll',
  f_io_1: 'frontier_roll',
  f_io_2: 'drift_shear',
  f_charon_1: 'frontier_roll',
  f_charon_2: 'slag_roll',
  f_charon_3: 'frontier_roll',
  f_sker_1: 'frontier_roll',
  f_veil_1: 'anomaly_wobble',
  f_ash_1: 'anomaly_wobble',
  f_ash_2: 'anomaly_wobble',
});

export function asteroidMotionProfileById(profileId) {
  return ASTEROID_MOTION_PROFILES[profileId] || null;
}

export function asteroidMotionProfileIdForField(fieldId) {
  const id = FIELD_ASTEROID_MOTION[fieldId];
  return id && ASTEROID_MOTION_PROFILES[id] ? id : DEFAULT_ASTEROID_MOTION_PROFILE_ID;
}

export function asteroidMotionProfileForField(fieldId) {
  return asteroidMotionProfileById(asteroidMotionProfileIdForField(fieldId));
}

export function angularVelocityCapForRadius(radius, profileOrId = DEFAULT_ASTEROID_MOTION_PROFILE_ID) {
  const profile = typeof profileOrId === 'string'
    ? asteroidMotionProfileById(profileOrId)
    : profileOrId;
  const max = Math.max(0, Number(profile && profile.maxAngularVelocityRadS) || 0);
  if (max <= 0) return 0;
  const r = Math.max(1, Number(radius) || 1);
  const radiusScale = clamp(Math.sqrt(12 / r), 0.35, 1.45);
  return round6(max * radiusScale);
}

export function seededAsteroidMotion(seed, asteroidId, fieldId, radius, opts = {}) {
  const profile = asteroidMotionProfileForField(fieldId);
  const hash32 = opts.hash32 || fallbackHash32;
  const mulberry32 = opts.mulberry32 || fallbackMulberry32;

  const spinSeed = hash32(seed == null ? 0 : seed, String(asteroidId || ''), 'spin') >>> 0;
  const driftSeed = hash32(seed == null ? 0 : seed, String(asteroidId || ''), 'drift') >>> 0;
  const spinRng = mulberry32(spinSeed);
  const driftRng = mulberry32(driftSeed);
  const cap = angularVelocityCapForRadius(radius, profile);
  const min = Math.min(cap, Math.max(0, Number(profile.minAngularVelocityRadS) || 0));
  const magnitude = cap <= 0 ? 0 : min + spinRng() * Math.max(0, cap - min);
  const sign = spinRng() < 0.5 ? -1 : 1;

  const driftMax = Math.max(0, Number(profile.maxDriftSpeed) || 0);
  const driftAngle = driftRng() * TAU;
  const driftSpeed = driftMax * driftRng();

  return {
    profileId: profile.id,
    fieldId: String(fieldId || ''),
    asteroidId: String(asteroidId || ''),
    spinSeed,
    driftSeed,
    angVel: round6(magnitude * sign),
    angularVelocityCap: cap,
    drift: {
      x: round6(Math.cos(driftAngle) * driftSpeed),
      z: round6(Math.sin(driftAngle) * driftSpeed),
    },
  };
}

export function integrateAsteroidMotion(ast, motion, dt) {
  const t = Math.max(0, Number(dt) || 0);
  const basePos = (ast && ast.pos) || { x: 0, z: 0 };
  const drift = motion && motion.drift || { x: 0, z: 0 };
  const angVel = Number.isFinite(motion && motion.angVel)
    ? motion.angVel
    : Number(ast && ast.angVel) || 0;
  return {
    ...ast,
    pos: {
      x: round6((Number(basePos.x) || 0) + (Number(drift.x) || 0) * t),
      z: round6((Number(basePos.z) || 0) + (Number(drift.z) || 0) * t),
    },
    rot: round6((Number(ast && ast.rot) || 0) + angVel * t),
    angVel,
  };
}

export function projectSeamWorldPoint(ast, seam) {
  let local = seam && seam.localOffset || null;
  if (!local && seam && Number.isFinite(seam.offset)) {
    const angle = Number.isFinite(seam.angle) ? seam.angle : 0;
    local = { x: Math.cos(angle) * seam.offset, z: Math.sin(angle) * seam.offset };
  }
  local = local || { x: 0, z: 0 };
  const pos = ast && ast.pos || { x: 0, z: 0 };
  const rot = Number(ast && ast.rot) || 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return {
    x: round6((Number(pos.x) || 0) + (Number(local.x) || 0) * c - (Number(local.z) || 0) * s),
    z: round6((Number(pos.z) || 0) + (Number(local.x) || 0) * s + (Number(local.z) || 0) * c),
  };
}

export function distanceSq2D(a, b) {
  const dx = (Number(a && a.x) || 0) - (Number(b && b.x) || 0);
  const dz = (Number(a && a.z) || 0) - (Number(b && b.z) || 0);
  return dx * dx + dz * dz;
}

export function seamYieldAtContact(ast, seams, contact, opts = {}) {
  const hitRadius = Math.max(0, Number(opts.hitRadius) || SEAM_TRACK_RADIUS);
  const hitR2 = hitRadius * hitRadius;
  for (const seam of seams || []) {
    const p = projectSeamWorldPoint(ast, seam);
    if (distanceSq2D(contact, p) <= hitR2) return { onSeam: true, mult: 1 };
  }
  return { onSeam: false, mult: 0.35 };
}
