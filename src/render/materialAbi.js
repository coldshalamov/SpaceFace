// Canonical shader-affecting material roles. Variation belongs in uniforms,
// instance colors, palettes, and masks — not extra program identities.

export const MATERIAL_ABI_VERSION = 1;

export const MATERIAL_ABI_ROLE = Object.freeze({
  OPAQUE_HULL: 'opaque_hull',
  PAINTED_METAL: 'painted_metal',
  BARE_MECHANICAL: 'bare_mechanical',
  GLASS: 'glass',
  EMISSIVE_DRIVE: 'emissive_drive',
  DECAL_DAMAGE: 'decal_damage',
  TERRAIN_PLACE: 'terrain_place',
  TRANSPARENT_VFX: 'transparent_vfx',
  SHADOW_DEPTH: 'shadow_depth',
});

const LIBRARY_TO_ABI = Object.freeze({
  bodyPrimary: MATERIAL_ABI_ROLE.OPAQUE_HULL,
  bodySecondary: MATERIAL_ABI_ROLE.PAINTED_METAL,
  trim: MATERIAL_ABI_ROLE.PAINTED_METAL,
  hazard: MATERIAL_ABI_ROLE.PAINTED_METAL,
  glass: MATERIAL_ABI_ROLE.GLASS,
  emissiveSignal: MATERIAL_ABI_ROLE.EMISSIVE_DRIVE,
  groundContact: MATERIAL_ABI_ROLE.TERRAIN_PLACE,
  decalDark: MATERIAL_ABI_ROLE.DECAL_DAMAGE,
  decalLight: MATERIAL_ABI_ROLE.DECAL_DAMAGE,
  reward: MATERIAL_ABI_ROLE.PAINTED_METAL,
});

const AUTHORED_TO_ABI = Object.freeze({
  hull: MATERIAL_ABI_ROLE.OPAQUE_HULL,
  accent: MATERIAL_ABI_ROLE.PAINTED_METAL,
  mechanical: MATERIAL_ABI_ROLE.BARE_MECHANICAL,
  glass: MATERIAL_ABI_ROLE.GLASS,
  drive: MATERIAL_ABI_ROLE.EMISSIVE_DRIVE,
  signal: MATERIAL_ABI_ROLE.EMISSIVE_DRIVE,
  geology: MATERIAL_ABI_ROLE.TERRAIN_PLACE,
  docking: MATERIAL_ABI_ROLE.BARE_MECHANICAL,
});

export function materialAbiRoleFromLibrary(role) {
  return LIBRARY_TO_ABI[role] || MATERIAL_ABI_ROLE.OPAQUE_HULL;
}

export function materialAbiRoleFromAuthored(role) {
  return AUTHORED_TO_ABI[role] || MATERIAL_ABI_ROLE.OPAQUE_HULL;
}

export function materialProgramFamilyKey(role, options = {}) {
  const abi = MATERIAL_ABI_ROLE[String(role || '').toUpperCase()] || role || MATERIAL_ABI_ROLE.OPAQUE_HULL;
  const maps = options.maps || 'standard';
  const shadow = options.shadow === true ? 'shadow' : 'lit';
  return `abi${MATERIAL_ABI_VERSION}|${abi}|${maps}|${shadow}`;
}
