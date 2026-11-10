import * as THREE from 'three';

/**
 * Transparent DoubleSide materials normally receive separate back/front submissions in Three.js.
 * For a planar additive surface the back-face pass cannot contribute visible fragments, so keeping
 * both shader faces while forcing one submission preserves the exact pixels and removes dead work.
 */
export function configurePlanarAdditiveMaterial(material) {
  if (!material || material.transparent !== true) return false;
  if (material.blending !== THREE.AdditiveBlending) return false;
  if (material.side !== THREE.DoubleSide || material.depthWrite !== false) return false;
  if (material.forceSinglePass === true) return false;
  material.forceSinglePass = true;
  return true;
}
