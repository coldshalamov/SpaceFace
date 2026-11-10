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

function materialClass(material) {
  if (!material) return 'standard';
  if (material.isMeshPhysicalMaterial) return 'physical';
  if (material.isMeshStandardMaterial) return 'standard';
  if (material.isMeshBasicMaterial) return 'basic';
  if (material.isMeshPhongMaterial) return 'phong';
  return String(material.type || 'material').toLowerCase();
}

/**
 * Return only properties that change Three's shader program. Palette values, roughness values,
 * emissive intensity, and texture identities deliberately stay out of this key so live material
 * creation can reuse one program family across authored color variants.
 */
export function materialAbiShaderFeatures(material) {
  if (!material) return 'standard|opaque|no-transmission|no-vertex-colors|no-alpha|no-map';
  const maps = [
    material.map && 'map',
    material.normalMap && 'normal',
    material.roughnessMap && 'roughness',
    material.metalnessMap && 'metalness',
    material.emissiveMap && 'emissive',
    material.aoMap && 'ao',
    material.alphaMap && 'alpha-map',
    material.bumpMap && 'bump',
    material.displacementMap && 'displacement',
    material.lightMap && 'light',
    material.envMap && 'env',
  ].filter(Boolean).join(',') || 'no-map';
  const transparent = material.transparent === true || Number(material.opacity) < 1
    ? 'transparent' : 'opaque';
  const transmission = Number(material.transmission) > 0 ? 'transmission' : 'no-transmission';
  const vertexColors = material.vertexColors === true ? 'vertex-colors' : 'no-vertex-colors';
  const alpha = Number(material.alphaTest) > 0 ? `alpha-test:${Number(material.alphaTest)}` : 'no-alpha';
  return `${materialClass(material)}|${transparent}|${transmission}|${vertexColors}|${alpha}|${maps}`;
}

export function materialProgramFamilyKey(role, options = {}) {
  const abi = MATERIAL_ABI_ROLE[String(role || '').toUpperCase()] || role || MATERIAL_ABI_ROLE.OPAQUE_HULL;
  const maps = options.maps || 'standard';
  const shadow = options.shadow === true ? 'shadow' : 'lit';
  const features = options.features || 'standard|opaque|no-transmission|no-vertex-colors|no-alpha';
  return `abi${MATERIAL_ABI_VERSION}|${abi}|${maps}|${shadow}|${features}`;
}

/** Stamp the canonical ABI on materials created by the live material library. */
export function normalizeMaterialAbi(material, role, options = {}) {
  if (!material) return material;
  if (!material.userData) material.userData = {};
  const abi = options.abiRole || materialAbiRoleFromLibrary(role);
  const features = materialAbiShaderFeatures(material);
  const maps = material.map ? 'mapped' : 'unmapped';
  const family = materialProgramFamilyKey(abi, {
    maps,
    shadow: options.shadow === true,
    features,
  });
  material.userData.spacefaceMaterialAbi = abi;
  material.userData.spacefaceProgramFamily = family;
  material.userData.spacefaceMaterialAbiVersion = MATERIAL_ABI_VERSION;
  // Do not mutate customProgramCacheKey here. Three appends that key to its built-in material
  // parameters; stamping a role identity therefore creates a new program variant instead of
  // collapsing one. The ABI is metadata until a shared define/uniform path owns the shader key.
  return material;
}
