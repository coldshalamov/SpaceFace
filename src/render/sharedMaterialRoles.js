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
 * Map an authored GLB leaf onto the handful of shared roles. Paint/tint stays a
 * uniform or texture bind; it must not mint a new program family.
 */
export function sharedMaterialRoleFromAuthored(tags = {}, material = null) {
  if (tags && tags.canopy) return SHARED_MATERIAL_ROLE.CANOPY;
  if (tags && tags.drive === 'plume') return SHARED_MATERIAL_ROLE.PLUME;
  const semantic = String(material?.userData?.spacefaceMaterialRole || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (semantic === 'glass' || semantic === 'canopy_glass' || semantic === 'sensor_lens') {
    return SHARED_MATERIAL_ROLE.GLASS;
  }
  if (semantic === 'geology') return SHARED_MATERIAL_ROLE.ROCK;
  if (semantic === 'station' || semantic === 'docking') return SHARED_MATERIAL_ROLE.STATION;
  const name = String(material && material.name || '').toLowerCase();
  if (/(?:glass|canopy|windscreen)/.test(name)) return SHARED_MATERIAL_ROLE.CANOPY;
  if (/(?:plume|thruster|drive)/.test(name)) return SHARED_MATERIAL_ROLE.PLUME;
  if (/(?:station|dock)/.test(name)) return SHARED_MATERIAL_ROLE.STATION;
  if (/(?:rock|asteroid|geology)/.test(name)) return SHARED_MATERIAL_ROLE.ROCK;
  return SHARED_MATERIAL_ROLE.HULL;
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
