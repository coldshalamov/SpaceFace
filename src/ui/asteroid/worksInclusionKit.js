// PQ-131.10 — runtime binding for the accepted Asteroid Works Inclusion Kit.
//
// The standing Works loader owns every geometry, material, and texture in the combined kit.
// Per-cell instances below only borrow those resources; removing an instance must never dispose
// anything from the standing group.
import * as THREE from 'three';
import { hash32 } from '../../core/rng.js';

const FAMILY_VARIANTS = {
  silver: ['SF_INCL_SILVER_WIRE_V1', 'SF_INCL_SILVER_SHEET_V1'],
  gold: ['SF_INCL_GOLD_LEAF_V1', 'SF_INCL_GOLD_RIBBON_V1'],
  iron: ['SF_INCL_IRON_CHIP_RIDGE_V1', 'SF_INCL_IRON_SPECULAR_V1'],
  nickel: ['SF_INCL_NICKEL_CUBIC_V1', 'SF_INCL_NICKEL_DENDRITE_V1'],
  exotic: [
    'SF_INCL_EXOTIC_OCTAHEDRAL_CAGE_V1',
    'SF_INCL_EXOTIC_PRISMATIC_TRUSS_V1',
    'SF_INCL_EXOTIC_HOPPER_CUBE_V1',
  ],
  ice: ['SF_INCL_ICE_SHEEN_PLATE_V1', 'SF_INCL_ICE_FRACTURE_VEIN_V1'],
  gas: [
    'SF_INCL_GAS_FISSURE_RADIAL_V1',
    'SF_INCL_GAS_FISSURE_BRANCH_V1',
    'SF_INCL_GAS_FISSURE_SHEAR_V1',
  ],
  scar: ['SF_INCL_VENTED_SCAR_V1'],
  lock: ['SF_INCL_MK_LOCK_PLATE_V1'],
};

for (const family of Object.keys(FAMILY_VARIANTS)) Object.freeze(FAMILY_VARIANTS[family]);

export const WORKS_INCLUSION_VARIANTS_BY_FAMILY = Object.freeze(FAMILY_VARIANTS);
export const WORKS_INCLUSION_VARIANTS = Object.freeze(
  Object.values(WORKS_INCLUSION_VARIANTS_BY_FAMILY).flat(),
);

const VARIANT_FAMILY = Object.freeze(Object.fromEntries(
  Object.entries(WORKS_INCLUSION_VARIANTS_BY_FAMILY)
    .flatMap(([family, variants]) => variants.map((variant) => [variant, family])),
));

export const WORKS_INCLUSION_COMMODITY_FAMILY = Object.freeze({
  cmdty_ore_iron: 'iron',
  cmdty_ore_copper: 'iron',
  cmdty_ore_bronzium: 'nickel',
  cmdty_ore_silverium: 'silver',
  cmdty_ore_platinium: 'silver',
  cmdty_ore_goldium: 'gold',
  cmdty_gem_diamond: 'ice',
  cmdty_ore_einsteinium: 'exotic',
  cmdty_gem_emerald: 'exotic',
  cmdty_gem_ruby: 'exotic',
  cmdty_exotic_amazonite: 'exotic',
});

export function worksInclusionFamilyForCommodity(commodityId) {
  return WORKS_INCLUSION_COMMODITY_FAMILY[commodityId] || null;
}

export function selectWorksInclusionVariant({ family, col, row, salt = 'works-inclusion' } = {}) {
  const variants = WORKS_INCLUSION_VARIANTS_BY_FAMILY[family];
  if (!variants) throw new Error(`[worksInclusionKit] unknown inclusion family "${family}"`);
  if (!Number.isInteger(col) || !Number.isInteger(row)) {
    throw new Error('[worksInclusionKit] deterministic selection requires integer col and row');
  }
  return variants[hash32(family, col, row, salt) % variants.length];
}

const MESH_NAME = /^LOD([012])_(SF_INCL_[A-Z0-9_]+_V1)$/;
const ORIGIN_EPSILON_SQ = 1e-10;

function describeMesh(mesh) {
  return mesh && mesh.name ? `"${mesh.name}"` : '<unnamed mesh>';
}

/**
 * Bind the loader's flattened 18x3 standing group into a fail-closed catalog.
 * The returned rows retain source meshes rather than cloning or owning GPU resources.
 */
export function createWorksInclusionCatalog(group) {
  if (!group || typeof group.traverse !== 'function') {
    throw new Error('[worksInclusionKit] catalog requires a loaded standing Object3D group');
  }

  const rows = Object.fromEntries(WORKS_INCLUSION_VARIANTS.map((variant) => [variant, [null, null, null]]));
  group.traverse((obj) => {
    const name = String(obj && obj.name || '');
    if (!name.includes('SF_INCL_')) return;
    const match = MESH_NAME.exec(name);
    if (!match) throw new Error(`[worksInclusionKit] malformed inclusion node name "${name}"`);
    if (!obj.isMesh) throw new Error(`[worksInclusionKit] inclusion node "${name}" is not a mesh`);
    const lod = Number(match[1]);
    const variant = match[2];
    const row = rows[variant];
    if (!row) throw new Error(`[worksInclusionKit] unknown accepted variant "${variant}"`);
    if (row[lod]) {
      throw new Error(`[worksInclusionKit] duplicate LOD${lod} mesh for "${variant}"`);
    }
    if (!obj.geometry || !obj.material) {
      throw new Error(`[worksInclusionKit] ${describeMesh(obj)} is missing shared geometry or material`);
    }
    row[lod] = obj;
  });

  const variants = {};
  for (const variant of WORKS_INCLUSION_VARIANTS) {
    const lods = rows[variant];
    for (let lod = 0; lod <= 2; lod++) {
      if (!lods[lod]) throw new Error(`[worksInclusionKit] missing LOD${lod} mesh for "${variant}"`);
    }
    const origin = lods[0].position.clone();
    for (let lod = 1; lod <= 2; lod++) {
      if (lods[lod].position.distanceToSquared(origin) > ORIGIN_EPSILON_SQ) {
        throw new Error(`[worksInclusionKit] LOD origins diverge for "${variant}"`);
      }
    }
    variants[variant] = Object.freeze({
      variant,
      family: VARIANT_FAMILY[variant],
      origin,
      lods: Object.freeze(lods.slice()),
    });
  }

  return Object.freeze({
    sourceGroup: group,
    variants: Object.freeze(variants),
    variantCount: WORKS_INCLUSION_VARIANTS.length,
  });
}

function copyMeshPresentation(source, target) {
  target.name = source.name;
  target.position.copy(source.position);
  target.quaternion.copy(source.quaternion);
  target.scale.copy(source.scale);
  target.castShadow = source.castShadow;
  target.receiveShadow = source.receiveShadow;
  target.renderOrder = source.renderOrder;
  target.frustumCulled = source.frustumCulled;
  target.layers.mask = source.layers.mask;
  target.userData = {
    ...(source.userData || {}),
    worksInclusionShared: true,
    worksInclusionOwnsGpuResources: false,
  };
}

export function setWorksInclusionRegister(instance, register) {
  if (register !== 'work' && register !== 'site') {
    throw new Error(`[worksInclusionKit] register must be "work" or "site", got "${register}"`);
  }
  const meshes = instance && instance.userData && instance.userData.worksInclusionLodMeshes;
  if (!Array.isArray(meshes) || meshes.length !== 3) {
    throw new Error('[worksInclusionKit] register switching requires a bound inclusion instance');
  }
  const wantedLod = register === 'site' ? 1 : 0;
  for (let lod = 0; lod <= 2; lod++) meshes[lod].visible = lod === wantedLod;
  instance.userData.worksInclusionRegister = register;
  return instance;
}

/** Create one centered per-cell instance while sharing every loader-owned GPU resource. */
export function createWorksInclusionInstance(catalog, variant, register = 'work') {
  const row = catalog && catalog.variants && catalog.variants[variant];
  if (!row) throw new Error(`[worksInclusionKit] catalog has no variant "${variant}"`);

  const root = new THREE.Group();
  root.name = `works_inclusion_${variant}`;
  const lodMeshes = [];
  for (let lod = 0; lod <= 2; lod++) {
    const source = row.lods[lod];
    const mesh = new THREE.Mesh(source.geometry, source.material);
    copyMeshPresentation(source, mesh);
    mesh.position.sub(row.origin);
    mesh.userData.worksInclusionLod = lod;
    lodMeshes.push(mesh);
    root.add(mesh);
  }
  root.userData = {
    worksInclusionVariant: variant,
    worksInclusionFamily: row.family,
    worksInclusionLodMeshes: lodMeshes,
    worksInclusionShared: true,
    worksInclusionOwnsGpuResources: false,
  };
  return setWorksInclusionRegister(root, register);
}

/** Detach a clone without disposing the standing loader's shared geometry/material/texture set. */
export function releaseWorksInclusionInstance(instance) {
  if (!instance || !instance.userData || !instance.userData.worksInclusionShared) return false;
  if (instance.userData.worksInclusionReleased) return false;
  if (instance.parent) instance.parent.remove(instance);
  instance.clear();
  instance.userData.worksInclusionLodMeshes = [];
  instance.userData.worksInclusionReleased = true;
  return true;
}
