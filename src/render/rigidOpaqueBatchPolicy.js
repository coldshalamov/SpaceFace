// Eligibility for material-keyed rigid opaque BatchedMesh pooling.
//
// Only rigid, single-material, opaque, non-skinned, non-transparent surfaces may enter the
// heterogeneous batch. Canopies, plumes, fans, nav lights, decals, morphs, and damage roles stay
// on their own draws so appearance, sort, and animation stay identical.

export function isRigidOpaqueBatchableSurface(source, tags = {}, options = {}) {
  if (!source || source.isMesh !== true) return false;
  if (source.isInstancedMesh || source.isSkinnedMesh || source.isBatchedMesh) return false;
  if (source.visible === false) return false;
  if (!source.geometry || !source.material || Array.isArray(source.material)) return false;
  if (tags.damageRole) return false;
  if (tags.canopy || tags.decal || tags.plume || tags.navLight || tags.fan) return false;
  const material = source.material;
  if (!material || material.visible === false) return false;
  if (material.transparent === true || material.transmission > 0) return false;
  if (material.opacity < 1) return false;
  if (typeof options.requiresPerShipMesh === 'function' && options.requiresPerShipMesh({ material, tags })) {
    return false;
  }
  if (source.layers && source.layers.mask !== 1) return false;
  if (Number(source.renderOrder) !== 0) return false;
  if (source.customDepthMaterial || source.customDistanceMaterial) return false;
  if (source.morphTargetInfluences != null || source.morphTargetDictionary != null) return false;
  const morph = source.geometry.morphAttributes || {};
  if (Object.keys(morph).length > 0) return false;
  return true;
}

export function countBatchableOpaqueSurfaces(root, options = {}) {
  let total = 0;
  let batchable = 0;
  if (!root || typeof root.traverse !== 'function') {
    return { total, batchable };
  }
  root.traverse((object) => {
    if (!object || object.isMesh !== true) return;
    total += 1;
    const tags = (object.userData && object.userData.spacefaceTags) || {};
    if (isRigidOpaqueBatchableSurface(object, tags, options)) batchable += 1;
  });
  return { total, batchable };
}
