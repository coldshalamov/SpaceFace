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

function normalizeLodLevel(level) {
  return level === 'lod0' || level === 'lod1' || level === 'lod2' ? level : null;
}

function policyState(root) {
  const userData = root.userData || (root.userData = {});
  let state = userData[POLICY_STATE];
  if (!state) {
    state = { dirty: true, lodLevel: null, castBand: null };
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
  castRadius = SHADOW_CAST_RADIUS,
} = {}) {
  if (isPlayer) return true;
  const level = normalizeLodLevel(lodLevel) || 'lod0';
  if (level === 'lod1' || level === 'lod2') return false;
  const radius = Number(castRadius);
  const limit = Number.isFinite(radius) && radius > 0 ? radius : SHADOW_CAST_RADIUS;
  return Number.isFinite(distanceSq) && distanceSq <= limit * limit;
}

/** Squared XZ distance between a mesh local pose and the player local pose. */
export function shadowCastDistanceSq(meshPos, playerLocalX, playerLocalZ) {
  if (!meshPos) return Infinity;
  const dx = meshPos.x - playerLocalX;
  const dz = meshPos.z - playerLocalZ;
  return dx * dx + dz * dz;
}

/** Mark a changed hierarchy/material set for one shadow-policy refresh at its current LOD. */
export function invalidateShadowCasterPolicy(root) {
  if (!root || typeof root.traverse !== 'function') return false;
  policyState(root).dirty = true;
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

  state.dirty = false;
  state.lodLevel = nextLodLevel;
  state.castBand = nextCastBand;
  return true;
}
