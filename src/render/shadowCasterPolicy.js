import * as THREE from 'three';
import { configureRealtimeCanopyMaterials } from './canopyMaterialPolicy.js';

const POLICY_STATE = '__spacefaceShadowCasterPolicyV1';

// Key-light shadow ortho is ±300 around the player (renderer._ensureKeyLightShadows). That is
// the on-screen neighborhood plus a short runway. Casters farther away cannot throw a readable
// directional shadow into the picture; they keep lighting and contact shadows.
export const SHADOW_CAST_RADIUS = 280;
export const SHADOW_CAST_RADIUS_SQ = SHADOW_CAST_RADIUS * SHADOW_CAST_RADIUS;
// Cast-band hysteresis: a hull skimming the policy radius used to flip castBand every frame,
// and each flip costs a full root.traverse plus a shadow-map re-render. Inside the deadband the
// previous band stands — casters enter at radius-10 and exit at radius+10.
export const SHADOW_CAST_HYSTERESIS_WU = 10;
export const SHADOW_ORTHO_EXTENT = 300;
// Old map was 1024 over ±700 (0.73 px/WU); 512 over ±300 was 0.85 px/WU. At ~1 WU/texel that
// still read as crawling miscolored clumps on hulls (owner report 2026-09-21). The opt-in
// pass ran 1024 over ±300 (1.71 px/WU); the discrete-tier default (assessment packet B3) now
// runs 2048 over ±300 — 3.4 px/WU, texel-snapped on the shadow camera lattice so it holds
// still under a smooth pan.
export const SHADOW_MAP_SIZE = 2048;
export const SHADOW_TEXEL_WORLD_SIZE = (SHADOW_ORTHO_EXTENT * 2) / SHADOW_MAP_SIZE;

export function shadowTexelWorldSize(
  extent = SHADOW_ORTHO_EXTENT,
  mapSize = SHADOW_MAP_SIZE,
) {
  const half = Number(extent);
  const size = Number(mapSize);
  if (!Number.isFinite(half) || half <= 0 || !Number.isFinite(size) || size <= 0) {
    return SHADOW_TEXEL_WORLD_SIZE;
  }
  return (half * 2) / size;
}

function normalizeLodLevel(level) {
  return level === 'lod0' || level === 'lod1' || level === 'lod2' ? level : null;
}

function policyState(root) {
  const userData = root.userData || (root.userData = {});
  let state = userData[POLICY_STATE];
  if (!state) {
    state = { dirty: true, lodLevel: null, castBand: null, pose: null };
    userData[POLICY_STATE] = state;
  }
  return state;
}

/**
 * The last cast band syncShadowCasterPolicy actually applied to this root (0/1), or null when
 * the policy has never run. Read-only: does not create the policy record on a fresh root.
 */
export function shadowCasterBand(root) {
  const state = root && root.userData ? root.userData[POLICY_STATE] : null;
  return state ? state.castBand : null;
}

/** True when noteRealtimeShadowCasterPose has recorded a cast-band pose on this root. */
export function shadowCasterHasPose(root) {
  const state = root && root.userData ? root.userData[POLICY_STATE] : null;
  return !!(state && state.pose);
}

// Quiet syncEntityViews: parked cast-band roots re-entered noteRealtimeShadowCasterPose
// every closure tick for a sub-texel compare that returned false (held in-function
// bit-identical early-out ~0.87×). Call-site skip when root TRS / visibility /
// cast-band policy did not change this frame. Soft-GPU fps not claimed.
let SHADOW_CASTER_POSE_QUIET_SKIP = true;
export function setShadowCasterPoseQuietSkipForBench(enabled) {
  SHADOW_CASTER_POSE_QUIET_SKIP = enabled !== false;
  return SHADOW_CASTER_POSE_QUIET_SKIP;
}
export function getShadowCasterPoseQuietSkipForBench() {
  return SHADOW_CASTER_POSE_QUIET_SKIP !== false;
}

export function shouldNoteRealtimeShadowCasterPose(root, {
  poseApplied = false,
  visibilityChanged = false,
  policyRefreshed = false,
} = {}) {
  if (SHADOW_CASTER_POSE_QUIET_SKIP === false) return true;
  if (poseApplied || visibilityChanged || policyRefreshed) return true;
  const band = shadowCasterBand(root);
  if (band !== 1) return true; // keep cheap band-0 clear / first-enter path
  return !shadowCasterHasPose(root);
}

/**
 * Whether a root should contribute realtime directional shadow-map casters.
 * Player always casts. LOD1/LOD2 are screen-small — contact shadow is enough.
 * LOD0 casts only inside the local shadow ortho.
 */
export function allowRealtimeShadowCast({
  isPlayer = false,
  lodLevel = 'lod0',
  distanceSq = 0,
  axisDistance = null,
  castRadius = SHADOW_CAST_RADIUS,
  castBand = null,
} = {}) {
  if (isPlayer) return true;
  const level = normalizeLodLevel(lodLevel) || 'lod0';
  if (level === 'lod1' || level === 'lod2') return false;
  const radius = Number(castRadius);
  const limit = Number.isFinite(radius) && radius > 0 ? radius : SHADOW_CAST_RADIUS;
  // Hysteresis on the distance clause only: a root holding castBand 1 keeps casting out to
  // limit+10, a root holding 0 stays out until limit-10, and an unpolicied root (castBand null)
  // evaluates against the plain radius exactly as before.
  const band = castBand === 0 || castBand === 1 ? castBand : null;
  const threshold = band === 1
    ? limit + SHADOW_CAST_HYSTERESIS_WU
    : band === 0
      ? limit - SHADOW_CAST_HYSTERESIS_WU
      : limit;
  const axis = Number(axisDistance);
  if (axisDistance != null && Number.isFinite(axis)) return axis <= threshold;
  return Number.isFinite(distanceSq) && distanceSq <= threshold * threshold;
}

/** Squared XZ distance between a mesh local pose and the player local pose. */
export function shadowCastDistanceSq(meshPos, playerLocalX, playerLocalZ) {
  if (!meshPos) return Infinity;
  const dx = meshPos.x - playerLocalX;
  const dz = meshPos.z - playerLocalZ;
  return dx * dx + dz * dz;
}

/** Chebyshev XZ distance — matches the square key-light ortho, not a circle. */
export function shadowCastAxisDistance(meshPos, playerLocalX, playerLocalZ) {
  if (!meshPos) return Infinity;
  return Math.max(
    Math.abs(meshPos.x - playerLocalX),
    Math.abs(meshPos.z - playerLocalZ),
  );
}

/** True when the root's policy record is marked for a refresh (mesh/material set changed). */
export function shadowCasterPolicyDirty(root) {
  const state = root && root.userData ? root.userData[POLICY_STATE] : null;
  return !!(state && state.dirty);
}

/** Mark a changed hierarchy/material set for one shadow-policy refresh at its current LOD. */
export function invalidateShadowCasterPolicy(root) {
  if (!root || typeof root.traverse !== 'function') return false;
  const state = policyState(root);
  state.dirty = true;
  // The generation lets a caller distinguish its own bookkeeping invalidate from a
  // genuine hierarchy/material change landing while it holds the root's policy.
  state.dirtySeq = (state.dirtySeq || 0) + 1;
  return true;
}

/** Monotonic invalidation generation — 0 when the root has never been dirtied. */
export function shadowCasterPolicyDirtySeq(root) {
  const state = root && root.userData ? root.userData[POLICY_STATE] : null;
  return (state && state.dirtySeq) || 0;
}

function writeCasterPose(target, root) {
  const position = root.position;
  const quaternion = root.quaternion;
  const scale = root.scale;
  target.x = Number(position?.x) || 0;
  target.y = Number(position?.y) || 0;
  target.z = Number(position?.z) || 0;
  target.qx = Number(quaternion?.x) || 0;
  target.qy = Number(quaternion?.y) || 0;
  target.qz = Number(quaternion?.z) || 0;
  target.qw = Number.isFinite(Number(quaternion?.w)) ? Number(quaternion.w) : 1;
  target.sx = Number.isFinite(Number(scale?.x)) ? Number(scale.x) : 1;
  target.sy = Number.isFinite(Number(scale?.y)) ? Number(scale.y) : 1;
  target.sz = Number.isFinite(Number(scale?.z)) ? Number(scale.z) : 1;
  target.visible = root.visible !== false;
}

/**
 * Returns true once a realtime caster root has moved far enough to change at least one texel in
 * the directional shadow map. Sub-texel deltas accumulate against the last reported pose.
 */
export function noteRealtimeShadowCasterPose(root, options = {}) {
  if (!root) return false;
  const state = policyState(root);
  if (state.castBand !== 1) {
    state.pose = null;
    return false;
  }
  const texel = shadowTexelWorldSize(options.extent, options.mapSize);
  const radiusValue = Number(options.visualRadius);
  const radius = Number.isFinite(radiusValue) && radiusValue > 0 ? radiusValue : 1;
  const previous = state.pose;
  if (!previous) {
    state.pose = {};
    writeCasterPose(state.pose, root);
    return true;
  }

  const position = root.position;
  const quaternion = root.quaternion;
  const scale = root.scale;
  const x = Number(position?.x) || 0;
  const y = Number(position?.y) || 0;
  const z = Number(position?.z) || 0;
  const qx = Number(quaternion?.x) || 0;
  const qy = Number(quaternion?.y) || 0;
  const qz = Number(quaternion?.z) || 0;
  const qw = Number.isFinite(Number(quaternion?.w)) ? Number(quaternion.w) : 1;
  const sx = Number.isFinite(Number(scale?.x)) ? Number(scale.x) : 1;
  const sy = Number.isFinite(Number(scale?.y)) ? Number(scale.y) : 1;
  const sz = Number.isFinite(Number(scale?.z)) ? Number(scale.z) : 1;
  const linearMotion = Math.max(
    Math.abs(x - previous.x),
    Math.abs(y - previous.y),
    Math.abs(z - previous.z),
  );
  const scaleMotion = radius * Math.max(
    Math.abs(sx - previous.sx),
    Math.abs(sy - previous.sy),
    Math.abs(sz - previous.sz),
  );
  const dot = Math.min(1, Math.abs(
    qx * previous.qx + qy * previous.qy + qz * previous.qz + qw * previous.qw
  ));
  const angularMotion = radius * (2 * Math.acos(dot));
  const visibilityChanged = (root.visible !== false) !== previous.visible;
  if (!visibilityChanged
      && linearMotion < texel
      && scaleMotion < texel
      && angularMotion < texel) return false;

  writeCasterPose(previous, root);
  return true;
}

/**
 * Apply the realtime canopy and shadow policy only when the visible LOD, cast band, or hierarchy
 * changed. Returns true when the scene graph was traversed.
 *
 * @param {object} root
 * @param {string|null} lodLevel
 * @param {{ allowCast?: boolean }} [options] allowCast defaults true (legacy mount behavior).
 */
export function syncShadowCasterPolicy(root, lodLevel = null, options = null) {
  if (!root || typeof root.traverse !== 'function') return false;
  const state = policyState(root);
  const nextLodLevel = normalizeLodLevel(lodLevel);
  const allowCast = !options || options.allowCast !== false;
  const nextCastBand = allowCast ? 1 : 0;
  if (!state.dirty && state.lodLevel === nextLodLevel && state.castBand === nextCastBand) {
    return false;
  }

  // Sum the receiveShadow flips this traverse writes so callers can debit an
  // incremental receiver tally instead of paying a whole-scene recount for what
  // is almost always a cast-only change (withholds/band flips write castShadow
  // only, so the delta is 0).
  let receiverDelta = 0;
  const noteReceiver = (object, next) => {
    if ((object.receiveShadow === true) !== next) receiverDelta += next ? 1 : -1;
    object.receiveShadow = next;
  };
  configureRealtimeCanopyMaterials(root);
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (!object.visible) {
      object.castShadow = false;
      noteReceiver(object, false);
      return;
    }
    if (object.userData && object.userData.spacefaceNoShadow) {
      object.castShadow = false;
      noteReceiver(object, false);
      return;
    }
    if (object.userData && object.userData.sharedContactShadow) {
      object.castShadow = false;
      return;
    }
    if (object.userData && object.userData.authoredReadableFallbackLayer === true) {
      // The procedural fallback layer is excluded from every depth-staging
      // collector, so its depth variant can never link — casting it would mint
      // the program inside a presented frame (the cold link the arm exists to
      // prevent). Receiving stays live so the fallback reads normally.
      object.castShadow = false;
      return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const opaqueReceiver = materials.some((material) => (
      material
      && !material.transparent
      && material.depthWrite !== false
      && (material.opacity == null || material.opacity >= 1)
      && material.blending === THREE.NormalBlending
    ));
    // Far / low-LOD roots keep receiveShadow so entering the local box looks correct immediately,
    // but they do not enter the directional shadow-map caster set.
    object.castShadow = allowCast && opaqueReceiver;
    noteReceiver(object, opaqueReceiver);
  });

  if (options && options.out && typeof options.out === 'object') {
    options.out.receiverDelta = receiverDelta;
  }
  if (state.castBand !== nextCastBand) state.pose = null;
  state.dirty = false;
  state.lodLevel = nextLodLevel;
  state.castBand = nextCastBand;
  return true;
}
