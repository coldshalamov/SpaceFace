// A handful of shared material roles. New hulls bind a texture on an existing
// family — they must not mint a new shader program identity.

import {
  MATERIAL_ABI_ROLE,
  normalizeMaterialAbi,
} from './materialAbi.js';

export const SHARED_MATERIAL_ROLE = Object.freeze({
  HULL: 'hull',
  CANOPY: 'canopy',
  PLUME: 'plume',
  GLASS: 'glass',
  STATION: 'station',
  ROCK: 'rock',
});

const ROLE_TO_ABI = Object.freeze({
  [SHARED_MATERIAL_ROLE.HULL]: MATERIAL_ABI_ROLE.OPAQUE_HULL,
  [SHARED_MATERIAL_ROLE.CANOPY]: MATERIAL_ABI_ROLE.GLASS,
  [SHARED_MATERIAL_ROLE.PLUME]: MATERIAL_ABI_ROLE.EMISSIVE_DRIVE,
  [SHARED_MATERIAL_ROLE.GLASS]: MATERIAL_ABI_ROLE.GLASS,
  [SHARED_MATERIAL_ROLE.STATION]: MATERIAL_ABI_ROLE.OPAQUE_HULL,
  [SHARED_MATERIAL_ROLE.ROCK]: MATERIAL_ABI_ROLE.TERRAIN_PLACE,
});

export function sharedMaterialAbiRole(role) {
  return ROLE_TO_ABI[role] || MATERIAL_ABI_ROLE.OPAQUE_HULL;
}

/**
 * Stamp ABI metadata only. Do not write spacefaceBatchKey / spacefaceSharedRole —
 * those collapse unlike hulls into one BatchedMesh. Do not set customProgramCacheKey
 * here; Three appends that string and would create extra variants.
 */
export function stampSharedMaterialRole(material, role) {
  if (!material) return material;
  const sharedRole = SHARED_MATERIAL_ROLE[String(role || '').toUpperCase()] || role;
  const stamped = normalizeMaterialAbi(material, sharedRole, {
    abiRole: sharedMaterialAbiRole(sharedRole),
  });
  if (!stamped.userData) stamped.userData = {};
  stamped.userData.spacefaceSharedMaterialRole = sharedRole;
  return stamped;
}
