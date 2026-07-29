import * as THREE from 'three';
import { configureRealtimeCanopyMaterials } from './canopyMaterialPolicy.js';

const POLICY_STATE = '__spacefaceShadowCasterPolicyV1';

function normalizeLodLevel(level) {
  return level === 'lod0' || level === 'lod1' || level === 'lod2' ? level : null;
}

function policyState(root) {
  const userData = root.userData || (root.userData = {});
  let state = userData[POLICY_STATE];
  if (!state) {
    state = { dirty: true, lodLevel: null };
    userData[POLICY_STATE] = state;
  }
  return state;
}

/** Mark a changed hierarchy/material set for one shadow-policy refresh at its current LOD. */
export function invalidateShadowCasterPolicy(root) {
  if (!root || typeof root.traverse !== 'function') return false;
  policyState(root).dirty = true;
  return true;
}

/**
 * Apply the realtime canopy and shadow policy only when the visible LOD or object hierarchy changed.
 * Returns true when the scene graph was traversed.
 */
export function syncShadowCasterPolicy(root, lodLevel = null) {
  if (!root || typeof root.traverse !== 'function') return false;
  const state = policyState(root);
  const nextLodLevel = normalizeLodLevel(lodLevel);
  if (!state.dirty && state.lodLevel === nextLodLevel) return false;

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
    const casts = materials.some((material) => (
      material
      && !material.transparent
      && material.depthWrite !== false
      && (material.opacity == null || material.opacity >= 1)
      && material.blending === THREE.NormalBlending
    ));
    object.castShadow = casts;
    // Opaque hulls receive the same real-time shadows they cast. Transparent shields/plumes do
    // neither, avoiding self-shadow flicker while preserving contact-shadow grounding.
    object.receiveShadow = casts;
  });

  state.dirty = false;
  state.lodLevel = nextLodLevel;
  return true;
}
