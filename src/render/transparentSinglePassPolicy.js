import * as THREE from 'three';

/**
 * Three.js normally submits transparent DoubleSide materials twice so back faces can be blended
 * before front faces. Top-down canopy shells and surface decals do not need that sorting pass:
 * both faces remain enabled, while a single draw submission preserves the authored geometry,
 * material, tint, and alpha. Additive surfaces are also order-independent by definition.
 */
export function configureTransparentSinglePassSurfaces(root) {
  if (!root || typeof root.traverse !== 'function') return 0;
  let changed = 0;
  root.traverse((object) => {
    if (!object || !object.isMesh) return;
    const tags = object.userData && object.userData.spacefaceTags || {};
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!shouldUseTransparentSinglePass(material, tags) || material.forceSinglePass === true) continue;
      material.forceSinglePass = true;
      changed += 1;
    }
  });
  return changed;
}

export function shouldUseTransparentSinglePass(material, tags = {}) {
  if (!material || material.transparent !== true) return false;
  if (material.side !== THREE.DoubleSide || material.depthWrite !== false) return false;
  if (tags.canopy || tags.decal) return true;
  return material.blending === THREE.AdditiveBlending;
}
