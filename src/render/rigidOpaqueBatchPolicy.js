// Eligibility for material-keyed rigid opaque BatchedMesh pooling.
//
// Only rigid, single-material, opaque, non-skinned, non-transparent surfaces may enter the
// heterogeneous batch. Canopies, plumes, fans, nav lights, decals, morphs, and damage roles stay
// on their own draws so appearance, sort, and animation stay identical.

import { materialBatchProgramKey } from './materialBatchKey.js';
import { ILLUSTRATED_SURFACE_KEY } from './illustratedSurface.js';

// Material program families intentionally ignore per-ship pigment because ordinary material
// admission compiles one shader family for many livery colours. A BatchedMesh cannot carry the
// illustrated shader's pigment/layout uniforms per instance, though, so the retained candidate
// must keep those payloads together. Function identity is the conservative fallback for authored
// hooks whose output contract this planner cannot inspect.
const MATERIAL_HOOK_IDS = new WeakMap();
let nextMaterialHookId = 1;

function functionIdentity(value) {
  if (typeof value !== 'function') return 'none';
  let id = MATERIAL_HOOK_IDS.get(value);
  if (id == null) {
    id = nextMaterialHookId++;
    MATERIAL_HOOK_IDS.set(value, id);
  }
  return String(id);
}

function scalarKey(value) {
  if (value == null) return '-';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '-';
  if (value && typeof value.getHexString === 'function') return `#${value.getHexString()}`;
  return String(value);
}

function arrayKey(value) {
  if (!Array.isArray(value)) return '-';
  return value.map((item) => scalarKey(item)).join(',');
}

function vectorKey(value) {
  if (!value || typeof value !== 'object') return '-';
  if (typeof value.getHexString === 'function') return `#${value.getHexString()}`;
  const parts = [];
  for (const axis of ['x', 'y', 'z', 'w']) {
    if (!(axis in value)) break;
    parts.push(scalarKey(value[axis]));
  }
  return parts.length ? parts.join(',') : '-';
}

function textureKey(texture) {
  if (!texture) return '-';
  // The retained material uses one texture transform for every instance. Keep transform and
  // sampler state in the group key; a shared image alone does not prove equal UV output.
  return [
    texture.uuid || texture.name || 'texture',
    texture.mapping,
    texture.channel,
    texture.colorSpace,
    texture.wrapS,
    texture.wrapT,
    texture.magFilter,
    texture.minFilter,
    texture.anisotropy,
    texture.flipY,
    texture.premultiplyAlpha,
    texture.unpackAlignment,
    vectorKey(texture.repeat),
    vectorKey(texture.offset),
    vectorKey(texture.center),
    scalarKey(texture.rotation),
  ].map(scalarKey).join(':');
}

function materialDefinesKey(defines) {
  if (!defines || typeof defines !== 'object') return '-';
  return Object.keys(defines).sort().map((key) => `${key}:${scalarKey(defines[key])}`).join(',');
}

function materialRetainedStateKey(material) {
  const textureSlots = [
    'map', 'lightMap', 'aoMap', 'bumpMap', 'normalMap', 'displacementMap', 'emissiveMap',
    'metalnessMap', 'roughnessMap', 'alphaMap', 'envMap', 'anisotropyMap', 'clearcoatMap',
    'clearcoatNormalMap', 'clearcoatRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap',
    'sheenColorMap', 'sheenRoughnessMap', 'specularMap', 'specularColorMap',
    'specularIntensityMap', 'transmissionMap', 'thicknessMap', 'gradientMap', 'matcap',
  ];
  const textures = textureSlots.map((slot) => `${slot}:${textureKey(material[slot])}`).join('|');
  const extensions = material.extensions || {};
  // BatchedMesh carries source albedo through its per-instance color texture, but Three's
  // color_fragment only multiplies that varying when USE_COLOR/USE_COLOR_ALPHA is present.
  // Materials with vertexColors=false therefore still read material.color directly. Keep those
  // colors in the group key; otherwise the first leaf's cloned color silently paints every
  // subsequent leaf in the group.
  const materialColor = material.vertexColors === true
    ? '-'
    : scalarKey(material.color);
  return [
    // Program axes and render state not represented by materialBatchProgramKey.
    `flags:${material.vertexColors === true ? 1 : 0}:${material.flatShading === true ? 1 : 0}`
      + `:${material.fog === false ? 0 : 1}:${material.toneMapped === false ? 0 : 1}`
      + `:${material.dithering === true ? 1 : 0}:${material.alphaHash === true ? 1 : 0}`
      + `:${material.alphaToCoverage === true ? 1 : 0}:${material.premultipliedAlpha === true ? 1 : 0}`
      + `:${material.forceSinglePass === true ? 1 : 0}:${material.wireframe === true ? 1 : 0}`
      + `:${material.lights === false ? 0 : 1}:${scalarKey(material.glslVersion)}`
      + `:color:${materialColor}`,
    `alpha:${scalarKey(material.alphaTest)}`,
    `state:${scalarKey(material.depthTest)}:${scalarKey(material.depthWrite)}:${scalarKey(material.colorWrite)}`
      + `:${scalarKey(material.depthFunc)}:${scalarKey(material.blendSrc)}:${scalarKey(material.blendDst)}`
      + `:${scalarKey(material.blendEquation)}:${scalarKey(material.blendSrcAlpha)}:${scalarKey(material.blendDstAlpha)}`
      + `:${scalarKey(material.blendEquationAlpha)}:${vectorKey(material.blendColor)}:${scalarKey(material.blendAlpha)}`
      + `:${scalarKey(material.stencilWrite)}:${scalarKey(material.stencilWriteMask)}`
      + `:${scalarKey(material.stencilFunc)}:${scalarKey(material.stencilRef)}`
      + `:${scalarKey(material.stencilFuncMask)}:${scalarKey(material.stencilFail)}:${scalarKey(material.stencilZFail)}`
      + `:${scalarKey(material.stencilZPass)}:${scalarKey(material.polygonOffset)}:${scalarKey(material.polygonOffsetFactor)}`
      + `:${scalarKey(material.polygonOffsetUnits)}:${scalarKey(material.shadowSide)}`
      + `:${scalarKey(material.precision)}:${scalarKey(material.allowOverride)}`,
    `uniforms:${scalarKey(material.emissiveIntensity)}:${scalarKey(material.aoMapIntensity)}`
      + `:${scalarKey(material.lightMapIntensity)}:${scalarKey(material.bumpScale)}`
      + `:${scalarKey(material.displacementScale)}:${scalarKey(material.displacementBias)}`
      + `:${scalarKey(material.envMapIntensity)}:${scalarKey(material.normalMapType)}`
      + `:${vectorKey(material.normalScale)}`,
    `physical:${scalarKey(material.clearcoat)}:${scalarKey(material.clearcoatRoughness)}`
      + `:${vectorKey(material.clearcoatNormalScale)}:${scalarKey(material.ior)}`
      + `:${scalarKey(material.iridescence)}:${scalarKey(material.iridescenceIOR)}`
      + `:${arrayKey(material.iridescenceThicknessRange)}:${scalarKey(material.sheen)}`
      + `:${vectorKey(material.sheenColor)}:${scalarKey(material.sheenRoughness)}`
      + `:${scalarKey(material.transmission)}:${scalarKey(material.thickness)}`
      + `:${scalarKey(material.attenuationDistance)}:${vectorKey(material.attenuationColor)}`
      + `:${scalarKey(material.anisotropy)}`
      + `:${scalarKey(material.anisotropyRotation)}:${scalarKey(material.dispersion)}`
      + `:${scalarKey(material.specularIntensity)}:${vectorKey(material.specularColor)}`,
    `defines:${materialDefinesKey(material.defines)}`,
    `extensions:${scalarKey(extensions.clipCullDistance)}:${scalarKey(extensions.multiDraw)}`,
    `clipping:${scalarKey(material.clipIntersection)}:${scalarKey(material.clipShadows)}`,
    textures,
  ].join('|');
}

function illustratedMaterialPayloadKey(material) {
  const data = material && material.userData;
  const pigment = data && data.spacefaceIllustratedPigment;
  const layout = data && data.spacefaceHullLayout;
  const layoutCenter = layout && layout.center;
  const layoutSize = layout && layout.size;
  const layoutAccent = layout && layout.accent;
  const env = material && material.envMap;
  const envId = env && (env.uuid || env.name || 'texture');
  return [
    // illustratedSurface reads this role at shader compile time. A retained batch has one
    // material, so a rock and a hull with otherwise identical payloads cannot share it.
    `role:${scalarKey(data && data.spacefaceSharedMaterialRole)}`,
    `pigment:${pigment ? scalarKey(pigment.color) : '-'}:${pigment ? scalarKey(pigment.strength) : '-'}`,
    `layout:${layout ? scalarKey(layout.kind) : '-'}:${layout ? scalarKey(layout.strength) : '-'}`,
    `center:${arrayKey(layoutCenter)}`,
    `size:${arrayKey(layoutSize)}`,
    `accent:${scalarKey(layoutAccent)}`,
    `env:${scalarKey(envId)}:${scalarKey(material && material.envMapIntensity)}`,
  ].join('|');
}

function materialRenderHooksSafe(material) {
  if (!material) return false;
  // BatchedMesh supplies transforms through Three's batching shader chunks. An arbitrary
  // custom shader (including the station's position-only depth prepass) need not consume
  // them at all, even when it has no own render/compile hook. Keep it on its real draw.
  if (material.isShaderMaterial === true || material.isRawShaderMaterial === true) return false;
  // Three's default Material hook is inherited. Any own hook can write camera-dependent uniforms
  // or otherwise require the original material draw, so keep that source on the direct path.
  return !Object.prototype.hasOwnProperty.call(material, 'onBeforeRender')
    && !Object.prototype.hasOwnProperty.call(material, 'onAfterRender');
}

/**
 * Return a stable admission key that preserves the material contract in a retained batch.
 * `null` means the material has an unknown/throwing cache identity and must remain direct.
 */
export function rigidOpaqueMaterialProgramKey(material) {
  if (!material || !materialRenderHooksSafe(material)) return null;
  let customKey = '';
  try {
    if (typeof material.customProgramCacheKey === 'function') {
      customKey = String(material.customProgramCacheKey() || '');
    }
  } catch (_) {
    return null;
  }
  const data = material.userData || {};
  const illustrated = data.spacefaceIllustratedSurface === ILLUSTRATED_SURFACE_KEY
    && typeof material.onBeforeCompile === 'function';
  // The shared illustrated hook has an explicit payload contract below. A different own shader
  // hook may read arbitrary material/userData state, even when two functions happen to share an
  // identity, so it stays direct until a future producer publishes a comparable ABI marker.
  if (!illustrated
      && Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile')) return null;
  // The illustrated hook is compositional: production materials may carry a packed-ORM or
  // roughness-breakup hook underneath it. The payload key covers the uniforms read by the
  // illustrated layer, while the canonical cache key identifies that underlying shader chain.
  // Dropping the latter lets one retained batch compile the first chain for every source and
  // produces per-surface dark/flat regions even though the material payloads match.
  const hookKey = illustrated
    ? `illustrated:${ILLUSTRATED_SURFACE_KEY}|${illustratedMaterialPayloadKey(material)}|cache:${customKey}`
    : `hook:${functionIdentity(material.onBeforeCompile)}|cache:${customKey}`;
  return `${materialBatchProgramKey(material)}|${materialRetainedStateKey(material)}|${hookKey}`;
}

export function canBatchRenderPackageOwner(kind) {
  return kind === 'ship' || kind === 'station' || kind === 'place';
}

const EMPTY_TAGS = Object.freeze({});

function tagsForAdmissionObject(object, options) {
  if (!object) return EMPTY_TAGS;
  if (typeof options.getTags === 'function') {
    return options.getTags(object) || EMPTY_TAGS;
  }
  return (object.userData && object.userData.spacefaceTags) || EMPTY_TAGS;
}

function isDescendantOrSelf(object, ancestor) {
  let current = object;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function hasAnimatedAdmissionMarker(object, source, options, transformOnly) {
  const data = object && object.userData;
  const tags = tagsForAdmissionObject(object, options);
  if (data?.isTurret === true) return true;
  if (data?.animated === true) {
    if (!transformOnly || typeof options.isAttestedRigidMotionOwner !== 'function'
        || options.isAttestedRigidMotionOwner(object, source) !== true) return true;
  }
  if (tags.animated === true || tags.fan || tags.turret || tags.drive) return true;
  if (tags.motionGroup && !transformOnly) return true;

  // Engine and turret owners keep their animated pivot in userData. Only treat that marker as
  // dynamic when this surface is actually below the pivot; static engine siblings remain eligible.
  if (data?.fan && isDescendantOrSelf(source, data.fan)) return true;
  if (data?.turretHead && isDescendantOrSelf(source, data.turretHead)) return true;
  return false;
}

/**
 * Explicit transform-only membership relaxes the MOTION_* marker alone. The retained owner
 * must copy the source's current world matrix before submission; deformation and independently
 * owned fan/turret/drive surfaces still require their authored draw.
 */
export function isRigidOpaqueBatchMotionSafe(source, tags = {}, options = {}) {
  let transformOnly = false;
  if (typeof options.isTransformOnlySource === 'function') {
    try { transformOnly = options.isTransformOnlySource(source) === true; }
    catch (_) { return false; }
  }
  if (tags.motionGroup && !transformOnly) return false;
  if (tags.animated === true || tags.fan || tags.turret || tags.drive) return false;
  let current = source;
  while (current) {
    if (hasAnimatedAdmissionMarker(current, source, options, transformOnly)) return false;
    current = current.parent;
  }
  return hasBatchSafeWorldTransform(source);
}

function hasBatchSafeWorldTransform(source) {
  const matrixWorld = source && source.matrixWorld;
  if (!matrixWorld || typeof matrixWorld.determinant !== 'function') return false;
  const determinant = matrixWorld.determinant();
  // Three flips front-face winding per Mesh matrix. BatchedMesh has one root matrix, so a
  // mirrored or singular source cannot share the ordinary positive-determinant batch contract.
  return Number.isFinite(determinant) && determinant > 0;
}

export function isRigidOpaqueBatchableSurface(source, tags = {}, options = {}) {
  if (!source || source.isMesh !== true) return false;
  if (source.isInstancedMesh || source.isSkinnedMesh || source.isBatchedMesh) return false;
  if (source.visible === false) return false;
  if (!source.geometry || !source.material || Array.isArray(source.material)) return false;
  if (tags.damageRole) return false;
  if (tags.canopy || tags.decal || tags.plume || tags.navLight || tags.fan) return false;
  if (!isRigidOpaqueBatchMotionSafe(source, tags, options)) return false;
  const material = source.material;
  if (!material || material.visible === false) return false;
  if (!materialRenderHooksSafe(material)) return false;
  if (material.transparent === true || material.transmission > 0) return false;
  if (material.opacity < 1) return false;
  if (material.clippingPlanes && material.clippingPlanes.length > 0) return false;
  if (typeof options.requiresPerShipMesh === 'function' && options.requiresPerShipMesh({ material, tags })) {
    return false;
  }
  if (source.layers && source.layers.mask !== 1) return false;
  if (Number(source.renderOrder) !== 0) return false;
  if (source.customDepthMaterial || source.customDistanceMaterial) return false;
  if (source.morphTargetInfluences != null || source.morphTargetDictionary != null) return false;
  const drawRange = source.geometry.drawRange;
  if (drawRange && (drawRange.start !== 0 || drawRange.count !== Infinity)) return false;
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

function rigidOpaqueGeometryAttributeKey(geometry) {
  if (!geometry || !geometry.attributes) return '';
  const names = Object.keys(geometry.attributes).sort();
  const parts = [];
  for (const name of names) {
    const attribute = geometry.getAttribute(name);
    if (!attribute) continue;
    parts.push(`${name}:${attribute.itemSize}:${attribute.normalized ? 1 : 0}`
      + `:${attribute.gpuType || 'default'}:${attribute.array?.constructor?.name || 'array'}`);
  }
  return `${geometry.index ? 'idx' : 'arr'}|${parts.join(',')}`;
}

/**
 * Build an admission-time, opt-in plan for rigid opaque BatchedMesh groups.
 *
 * This is deliberately a planner, not a live renderer path. It never mutates source meshes,
 * hides authored nodes, or changes the default renderer. A caller that has explicitly proved
 * BatchedMesh support can use the groups to copy each source matrix and color into a retained
 * batch, then atomically suppress the sources after pipeline and residency admission. Anything
 * ineligible, single-use, animated, or rejected by the caller's hook predicate remains a direct
 * fallback. `shadowLane` must return the exact cast/no-cast lane the runtime will use; grouping
 * lanes together would change the shadow picture.
 */
export function planRigidOpaqueBatchGroups(roots, options = {}) {
  const rootsList = Array.isArray(roots) ? roots : (roots ? [roots] : []);
  const groupsByKey = new Map();
  const seen = new Set();
  const directFallbackMeshes = [];
  let totalMeshes = 0;
  let eligibleMeshes = 0;

  for (const root of rootsList) {
    if (!root || typeof root.traverse !== 'function') continue;
    root.traverse((object) => {
      if (!object || seen.has(object)) return;
      seen.add(object);
      if (object.isMesh !== true) return;
      totalMeshes += 1;

      const tags = typeof options.getTags === 'function'
        ? (options.getTags(object) || {})
        : ((object.userData && object.userData.spacefaceTags) || {});
      if (!isRigidOpaqueBatchableSurface(object, tags, options)) {
        directFallbackMeshes.push(object);
        return;
      }
      if (typeof options.isRenderHookSafe === 'function'
          && options.isRenderHookSafe(object) !== true) {
        directFallbackMeshes.push(object);
        return;
      }

      const materialKey = typeof options.materialProgramKey === 'function'
        ? options.materialProgramKey(object.material, object)
        : rigidOpaqueMaterialProgramKey(object.material);
      const geometryKey = typeof options.geometryAttributeKey === 'function'
        ? options.geometryAttributeKey(object.geometry, object)
        : rigidOpaqueGeometryAttributeKey(object.geometry);
      if (!materialKey || !geometryKey) {
        directFallbackMeshes.push(object);
        return;
      }

      const laneValue = typeof options.shadowLane === 'function'
        ? options.shadowLane(object)
        : (object.castShadow === true ? 'cast' : 'nocast');
      const lane = laneValue == null ? 'unknown' : String(laneValue);
      const key = `${materialKey}|${geometryKey}|${lane}`;
      let group = groupsByKey.get(key);
      if (!group) {
        group = {
          key,
          materialKey: String(materialKey),
          geometryKey: String(geometryKey),
          lane,
          surfaces: [],
        };
        groupsByKey.set(key, group);
      }
      group.surfaces.push(object);
      eligibleMeshes += 1;
    });
  }

  const minGroupSize = Math.max(2, Math.floor(Number(options.minGroupSize) || 2));
  const groups = [];
  let potentialDrawReduction = 0;
  for (const group of groupsByKey.values()) {
    if (group.surfaces.length < minGroupSize) {
      directFallbackMeshes.push(...group.surfaces);
      continue;
    }
    group.potentialDrawReduction = group.surfaces.length - 1;
    potentialDrawReduction += group.potentialDrawReduction;
    groups.push(group);
  }

  return {
    totalMeshes,
    eligibleMeshes,
    groups,
    directFallbackMeshes,
    potentialDrawReduction,
  };
}
