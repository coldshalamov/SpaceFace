import * as THREE from 'three';
import { configureRealtimeCanopyMaterials } from './canopyMaterialPolicy.js';

const POLICY_STATE = '__spacefaceShadowCasterPolicyV1';

// Key-light shadow ortho is ±300 around the player (renderer._ensureKeyLightShadows). That is
// the on-screen neighborhood plus a short runway. Casters farther away cannot throw a readable
// directional shadow into the picture; they keep lighting and contact shadows.
export const SHADOW_CAST_RADIUS = 280;
export const SHADOW_CAST_RADIUS_SQ = SHADOW_CAST_RADIUS * SHADOW_CAST_RADIUS;
export const SHADOW_ORTHO_EXTENT = 300;
// Old map was 1024 over ±700 (0.73 px/WU). 512 over ±300 is 0.85 px/WU — same or better
// nearby density, a quarter of the depth-pass fill on the iGPU.
export const SHADOW_MAP_SIZE = 512;
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
} = {}) {
  if (isPlayer) return true;
  const level = normalizeLodLevel(lodLevel) || 'lod0';
  if (level === 'lod1' || level === 'lod2') return false;
  const radius = Number(castRadius);
  const limit = Number.isFinite(radius) && radius > 0 ? radius : SHADOW_CAST_RADIUS;
  const axis = Number(axisDistance);
  if (axisDistance != null && Number.isFinite(axis)) return axis <= limit;
  return Number.isFinite(distanceSq) && distanceSq <= limit * limit;
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

/** Mark a changed hierarchy/material set for one shadow-policy refresh at its current LOD. */
export function invalidateShadowCasterPolicy(root) {
  if (!root || typeof root.traverse !== 'function') return false;
  policyState(root).dirty = true;
  return true;
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

  configureRealtimeCanopyMaterials(root);
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (!object.visible) {
      object.castShadow = false;
      object.receiveShadow = false;
      return;
    }
    if (object.userData && object.userData.spacefaceNoShadow) {
      object.castShadow = false;
      object.receiveShadow = false;
      return;
    }
    if (object.userData && object.userData.sharedContactShadow) {
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
    object.receiveShadow = opaqueReceiver;
  });

  if (state.castBand !== nextCastBand) state.pose = null;
  state.dirty = false;
  state.lodLevel = nextLodLevel;
  state.castBand = nextCastBand;
  return true;
}
