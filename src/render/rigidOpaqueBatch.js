// Retained BatchedMesh admission for repeated rigid opaque authored leaves.
//
// The bounded default player cohort and explicit diagnostic cohorts share this admission path.
// Callers select the exact sources, provide a pipeline/residency preparation callback,
// and accept the batch only after that callback resolves. Until then the authored
// leaves remain visible and continue to use their ordinary material path. Once active, direct
// submission is suppressed with the source layer mask while the source Object3Ds remain visible
// and mesh-backed for clearance, picking, ownership masks, and other semantic readers.

import * as THREE from 'three';
import {
  OPAQUE_BATCH_MAX_INDICES,
  OPAQUE_BATCH_MAX_INSTANCES,
  OPAQUE_BATCH_MAX_VERTS,
} from './opaqueMaterialBatch.js';
import {
  isRigidOpaqueBatchMotionSafe,
  planRigidOpaqueBatchGroups,
  rigidOpaqueMaterialProgramKey,
} from './rigidOpaqueBatchPolicy.js';
import { stampOpeningSubmissionPackage } from './openingSubmissionPlan.js';

const EMPTY_ARRAY = Object.freeze([]);
// A streamed world can add one authored root per frame while the player crosses a sector. Keep
// the already admitted cohort alive through that burst; additions remain on their direct path until
// this many consecutive syncs observe the same root set, at which point one bounded full rebuild
// can fold them in. Removals are handled immediately without rebuilding surviving instances.
export const RETAINED_BATCH_MEMBERSHIP_QUIET_FRAMES = 8;
const _sceneInverse = new THREE.Matrix4();
const _localMatrix = new THREE.Matrix4();
const _sourceColor = new THREE.Color(1, 1, 1);

// Material.version changes for shader recompilation, not ordinary live uniforms. A retained
// clone otherwise keeps cold emission/finish values after its real owner has changed them.
// Snapshot at admission; compare primitive values without allocation on the live sync path.
const MATERIAL_SCALARS = Object.freeze([
  'opacity', 'alphaTest', 'roughness', 'metalness', 'emissiveIntensity', 'envMapIntensity',
  'aoMapIntensity', 'lightMapIntensity', 'bumpScale', 'normalMapType', 'displacementScale',
  'displacementBias', 'reflectivity', 'refractionRatio', 'shininess', 'clearcoat',
  'clearcoatRoughness', 'ior', 'iridescence', 'iridescenceIOR', 'sheen', 'sheenRoughness',
  'transmission', 'thickness', 'attenuationDistance', 'anisotropy', 'anisotropyRotation',
  'dispersion', 'specularIntensity', 'vertexColors', 'flatShading', 'fog', 'toneMapped',
  'dithering', 'alphaHash', 'alphaToCoverage', 'premultipliedAlpha', 'forceSinglePass',
  'wireframe', 'transparent', 'side', 'depthTest', 'depthWrite', 'colorWrite',
]);
const MATERIAL_VECTORS = Object.freeze([
  'emissive', 'specular', 'specularColor', 'normalScale', 'clearcoatNormalScale',
  'sheenColor', 'attenuationColor',
]);
const MATERIAL_TEXTURES = Object.freeze([
  'map', 'lightMap', 'aoMap', 'bumpMap', 'normalMap', 'displacementMap', 'emissiveMap',
  'metalnessMap', 'roughnessMap', 'alphaMap', 'envMap', 'anisotropyMap', 'clearcoatMap',
  'clearcoatNormalMap', 'clearcoatRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap',
  'sheenColorMap', 'sheenRoughnessMap', 'specularMap', 'specularColorMap',
  'specularIntensityMap', 'transmissionMap', 'thicknessMap', 'gradientMap', 'matcap',
]);
const COMPONENTS = Object.freeze(['r', 'g', 'b', 'x', 'y', 'z', 'w']);
const SOURCE_PACKAGE_KEYS = Object.freeze([
  'flightRenderPackage', 'renderPackage', 'spacefaceRenderPackage', 'openingSubmissionPackage',
]);
const RIGID_OPAQUE_BATCH_PRODUCER = 'rigid-opaque-batch';

function captureUniformComponents(object) {
  return COMPONENTS.map(key => object?.[key]);
}

function uniformComponentsStable(values, object) {
  for (let i = 0; i < COMPONENTS.length; i++) {
    if (!Object.is(values[i], object?.[COMPONENTS[i]])) return false;
  }
  return true;
}

function captureMaterialUniforms(material) {
  const data = material.userData || {};
  return {
    scalars: MATERIAL_SCALARS.map(key => material[key]),
    vectors: MATERIAL_VECTORS.map(key => captureUniformComponents(material[key])),
    iridescenceRange: material.iridescenceThicknessRange?.slice() || null,
    textures: MATERIAL_TEXTURES.map(key => {
      const texture = material[key];
      return { texture, repeat: captureUniformComponents(texture?.repeat),
        offset: captureUniformComponents(texture?.offset), center: captureUniformComponents(texture?.center),
        rotation: texture?.rotation };
    }),
    pigmentColor: data.spacefaceIllustratedPigment?.color,
    pigmentStrength: data.spacefaceIllustratedPigment?.strength,
    layoutKind: data.spacefaceHullLayout?.kind,
    layoutStrength: data.spacefaceHullLayout?.strength,
    layoutAccent: data.spacefaceHullLayout?.accent,
    layoutCenter: data.spacefaceHullLayout?.center?.slice() || null,
    layoutSize: data.spacefaceHullLayout?.size?.slice() || null,
  };
}

function uniformArrayStable(previous, current) {
  if (!previous) return current == null;
  if (!current || previous.length !== current.length) return false;
  for (let i = 0; i < previous.length; i++) if (!Object.is(previous[i], current[i])) return false;
  return true;
}

function materialUniformsStable(previous, material) {
  for (let i = 0; i < MATERIAL_SCALARS.length; i++) {
    if (!Object.is(previous.scalars[i], material[MATERIAL_SCALARS[i]])) return false;
  }
  for (let i = 0; i < MATERIAL_VECTORS.length; i++) {
    if (!uniformComponentsStable(previous.vectors[i], material[MATERIAL_VECTORS[i]])) return false;
  }
  if (!uniformArrayStable(previous.iridescenceRange, material.iridescenceThicknessRange)) return false;
  for (let i = 0; i < MATERIAL_TEXTURES.length; i++) {
    const record = previous.textures[i], texture = material[MATERIAL_TEXTURES[i]];
    if (record.texture !== texture || !Object.is(record.rotation, texture?.rotation)
      || !uniformComponentsStable(record.repeat, texture?.repeat)
      || !uniformComponentsStable(record.offset, texture?.offset)
      || !uniformComponentsStable(record.center, texture?.center)) return false;
  }
  const data = material.userData || EMPTY_ARRAY;
  const pigment = data.spacefaceIllustratedPigment, layout = data.spacefaceHullLayout;
  return Object.is(previous.pigmentColor, pigment?.color)
    && Object.is(previous.pigmentStrength, pigment?.strength)
    && Object.is(previous.layoutKind, layout?.kind)
    && Object.is(previous.layoutStrength, layout?.strength)
    && Object.is(previous.layoutAccent, layout?.accent)
    && uniformArrayStable(previous.layoutCenter, layout?.center)
    && uniformArrayStable(previous.layoutSize, layout?.size);
}

function defaultHookSafe(source) {
  return !!source
    && source.onBeforeRender === THREE.Object3D.prototype.onBeforeRender
    && source.onAfterRender === THREE.Object3D.prototype.onAfterRender
    && source.frustumCulled !== false;
}
function geometryCounts(geometry) {
  const position = geometry && geometry.getAttribute && geometry.getAttribute('position');
  if (!position || !Number.isFinite(position.count)) return null;
  const vertices = Math.max(0, position.count | 0);
  const index = geometry.index;
  const indices = index ? Math.max(0, index.count | 0) : vertices;
  if (vertices <= 0 || vertices > OPAQUE_BATCH_MAX_VERTS || indices > OPAQUE_BATCH_MAX_INDICES) return null;
  return { vertices, indices };
}

function geometryWithinBatchLimits(geometry) {
  const position = geometry && geometry.getAttribute && geometry.getAttribute('position');
  if (!position || !Number.isFinite(position.count)) return false;
  const vertices = position.count | 0;
  const index = geometry.index;
  const indices = index ? index.count | 0 : vertices;
  return vertices > 0 && vertices <= OPAQUE_BATCH_MAX_VERTS
    && indices >= 0 && indices <= OPAQUE_BATCH_MAX_INDICES;
}

function copyMaterialForBatch(source) {
  if (!source) return null;
  let material = source;
  if (typeof source.clone === 'function') {
    material = source.clone();
    // Material.clone() does not promise to copy own-property shader patches. Keep the exact
    // authored Look hook and cache-key identity on the retained program.
    material.onBeforeCompile = source.onBeforeCompile;
    material.customProgramCacheKey = source.customProgramCacheKey;
  }
  if (material && material.color && typeof material.color.setRGB === 'function'
      && source.vertexColors === true) {
    // With USE_COLOR enabled, the shader multiplies the per-instance color texture into the
    // source vertex colors. The shared batch material must not multiply every instance by the
    // first leaf's material albedo. For vertexColors=false the fragment shader does not consume
    // the batching color varying; that source albedo remains in the shared material and is keyed
    // above instead.
    material.color.setRGB(1, 1, 1);
  }
  return material;
}

function colorFromMaterial(material, target = _sourceColor) {
  if (material && material.color && typeof target.copy === 'function') {
    target.copy(material.color);
    return target;
  }
  target.setRGB(1, 1, 1);
  return target;
}

function colorChanged(previous, color) {
  return !previous
    || previous[0] !== color.r
    || previous[1] !== color.g
    || previous[2] !== color.b;
}

function colorSnapshot(color) {
  return [color.r, color.g, color.b];
}

function makeGeometrySnapshot(geometry) {
  const attributes = geometry && geometry.attributes ? geometry.attributes : null;
  const rows = [];
  if (attributes) {
    for (const name of Object.keys(attributes).sort()) {
      const attr = attributes[name];
      rows.push({
        name,
        attr,
        version: attr && attr.version,
        count: attr && attr.count,
        itemSize: attr && attr.itemSize,
        normalized: attr && attr.normalized,
      });
    }
  }
  const index = geometry && geometry.index;
  const drawRange = geometry && geometry.drawRange;
  return {
    geometry,
    attributes,
    version: geometry && geometry.version,
    rows,
    index,
    indexVersion: index && index.version,
    indexCount: index && index.count,
    drawStart: drawRange && drawRange.start,
    drawCount: drawRange && drawRange.count,
  };
}

function geometrySnapshotStable(snapshot, geometry) {
  if (!snapshot || snapshot.geometry !== geometry) return false;
  if (snapshot.version !== geometry?.version) return false;
  const index = geometry && geometry.index;
  if (snapshot.index !== index
      || snapshot.indexVersion !== (index && index.version)
      || snapshot.indexCount !== (index && index.count)) return false;
  const drawRange = geometry && geometry.drawRange;
  if (snapshot.drawStart !== (drawRange && drawRange.start)
      || snapshot.drawCount !== (drawRange && drawRange.count)) return false;
  const attributes = geometry && geometry.attributes;
  if (!attributes || attributes !== snapshot.attributes) return false;
  let attributeCount = 0;
  for (const _name in attributes) attributeCount += 1;
  if (attributeCount !== snapshot.rows.length) return false;
  for (const row of snapshot.rows) {
    const attr = attributes[row.name];
    if (!attr || attr !== row.attr
        || attr.version !== row.version
        || attr.count !== row.count
        || attr.itemSize !== row.itemSize
        || attr.normalized !== row.normalized) return false;
  }
  return true;
}

function relevantTagSnapshot(source) {
  const tags = source && source.userData && source.userData.spacefaceTags;
  return {
    damageRole: tags && tags.damageRole,
    motionGroup: tags && tags.motionGroup,
    canopy: !!(tags && tags.canopy),
    decal: !!(tags && tags.decal),
    plume: !!(tags && tags.plume),
    navLight: !!(tags && tags.navLight),
    fan: !!(tags && tags.fan),
  };
}

function currentTagsStable(snapshot, source) {
  const tags = source && source.userData && source.userData.spacefaceTags;
  return !!snapshot
    && snapshot.damageRole === (tags && tags.damageRole)
    && snapshot.motionGroup === (tags && tags.motionGroup)
    && snapshot.canopy === !!(tags && tags.canopy)
    && snapshot.decal === !!(tags && tags.decal)
    && snapshot.plume === !!(tags && tags.plume)
    && snapshot.navLight === !!(tags && tags.navLight)
    && snapshot.fan === !!(tags && tags.fan);
}

function ancestorVisibleAndAttached(source, scene) {
  let node = source;
  let visible = true;
  while (node) {
    if (node.visible === false) visible = false;
    if (node === scene) return visible;
    node = node.parent;
  }
  return false;
}

function rootContainsSource(root, source) {
  let node = source;
  while (node) {
    if (node === root) return true;
    node = node.parent;
  }
  return false;
}

function rootForSource(source, roots) {
  for (const root of roots || EMPTY_ARRAY) {
    if (rootContainsSource(root, source)) return root;
  }
  return null;
}

function sourcePackageBoundary(source) {
  let boundary = null;
  for (let node = source; node; node = node.parent) {
    const data = node.userData || {};
    for (const key of SOURCE_PACKAGE_KEYS) {
      const packageInfo = data[key];
      if (!packageInfo || typeof packageInfo !== 'object') continue;
      const contentHash = packageInfo.contentHash || packageInfo.hash;
      if (!contentHash) continue;
      const verified = packageInfo.contentHashVerified === true
        || packageInfo.verified === true
        || data.contentHashVerified === true
        || /^[0-9a-f]{64}$/i.test(String(contentHash));
      boundary = { node, key, packageInfo, contentHash: String(contentHash), verified };
      break;
    }
    if (boundary) break;
  }
  if (!boundary || !boundary.verified) return null;

  const path = [];
  for (let node = source; node && node !== boundary.node; node = node.parent) {
    const parent = node.parent;
    const index = parent && parent.children ? parent.children.indexOf(node) : -1;
    if (index < 0) return null;
    path.push({ index, name: String(node.name || ''), type: String(node.type || '') });
  }
  if (source !== boundary.node && path.length === 0) return null;
  path.reverse();
  return {
    contentHash: boundary.contentHash,
    packageKey: boundary.key,
    packageSchema: String(boundary.packageInfo.schema || ''),
    assetId: String(boundary.packageInfo.assetId || boundary.packageInfo.id || ''),
    path,
    leaf: { name: String(source.name || ''), type: String(source.type || '') },
  };
}

function bufferAttributeRecipe(attribute) {
  if (!attribute) return null;
  const buffer = attribute.isInterleavedBufferAttribute ? attribute.data : attribute;
  return {
    itemSize: attribute.itemSize,
    normalized: attribute.normalized === true,
    count: attribute.count,
    version: attribute.version ?? buffer.version ?? 0,
    arrayType: buffer.array && buffer.array.constructor ? buffer.array.constructor.name : '',
    stride: attribute.isInterleavedBufferAttribute ? buffer.stride : null,
    offset: attribute.isInterleavedBufferAttribute ? attribute.offset : null,
  };
}

function geometryRecipe(geometry) {
  const attributes = {};
  for (const name of Object.keys(geometry && geometry.attributes || {}).sort()) {
    attributes[name] = bufferAttributeRecipe(geometry.attributes[name]);
  }
  const index = geometry && geometry.index;
  return {
    type: String(geometry && geometry.type || ''),
    attributes,
    index: bufferAttributeRecipe(index),
    groups: (geometry && geometry.groups || EMPTY_ARRAY).map(({ start, count, materialIndex }) => ({
      start, count, materialIndex,
    })),
    drawRange: geometry && geometry.drawRange
      ? { start: geometry.drawRange.start, count: geometry.drawRange.count }
      : null,
  };
}

function batchOpeningManifest(batch) {
  const instances = [];
  const sourcePackages = new Map();
  for (const entry of batch.entries) {
    const boundary = sourcePackageBoundary(entry.source);
    if (!boundary) return null;
    sourcePackages.set(boundary.contentHash, {
      contentHash: boundary.contentHash,
      packageKey: boundary.packageKey,
      packageSchema: boundary.packageSchema,
      assetId: boundary.assetId,
    });
    instances.push({
      sourcePackageHash: boundary.contentHash,
      sourcePath: boundary.path,
      sourceLeaf: boundary.leaf,
      geometry: geometryRecipe(entry.geometry),
      materialColor: entry.color.slice(),
      renderOrder: entry.renderOrder,
    });
  }
  instances.sort((a, b) => `${a.sourcePackageHash}:${JSON.stringify(a.sourcePath)}`
    .localeCompare(`${b.sourcePackageHash}:${JSON.stringify(b.sourcePath)}`));
  return {
    producer: RIGID_OPAQUE_BATCH_PRODUCER,
    sourcePackages: [...sourcePackages.values()].sort((a, b) => a.contentHash.localeCompare(b.contentHash)),
    instances,
    group: {
      lane: batch.lane,
      materialKey: batch.recipe.materialKey,
      geometryKey: batch.recipe.geometryKey,
      drawSemantics: {
        castShadow: batch.mesh.castShadow === true,
        receiveShadow: batch.mesh.receiveShadow === true,
      },
    },
  };
}

function publishBatchOpeningPackage(batch) {
  const manifest = batchOpeningManifest(batch);
  if (manifest) {
    stampOpeningSubmissionPackage(batch.mesh, manifest, {
      assetId: batch.mesh.name,
      producer: RIGID_OPAQUE_BATCH_PRODUCER,
      replace: true,
    });
  } else if (batch.mesh.userData.openingSubmissionPackage?.producer === RIGID_OPAQUE_BATCH_PRODUCER) {
    delete batch.mesh.userData.openingSubmissionPackage;
  }
}

function matrixChanged(previous, elements) {
  if (!previous || !elements) return true;
  for (let i = 0; i < 16; i++) if (previous[i] !== elements[i]) return true;
  return false;
}

function copyMatrix(previous, elements) {
  if (!previous || !elements) return;
  for (let i = 0; i < 16; i++) previous[i] = elements[i];
}

function rootsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function disposeBatch(batch, scene) {
  if (!batch) return;
  const mesh = batch.mesh;
  if (mesh && mesh.parent === scene) {
    const notes = scene && scene.userData && scene.userData.shadowMeshNotes;
    if (notes && typeof notes.removed === 'function') {
      try { notes.removed(mesh); } catch (_) { /* diagnostics only */ }
    }
    mesh.removeFromParent();
  }
  try { mesh?.dispose?.(); } catch (_) { /* best effort */ }
  if (batch.ownedMaterial && batch.material && typeof batch.material.dispose === 'function') {
    try { batch.material.dispose(); } catch (_) { /* best effort */ }
  }
}

function createBatch(scene, source, lane, capacity) {
  const material = copyMaterialForBatch(source.material);
  if (!material) return null;
  let mesh;
  try {
    mesh = new THREE.BatchedMesh(
      capacity.maxInstances,
      capacity.maxVerts,
      capacity.maxIndices,
      material,
    );
  } catch (_) {
    if (material !== source.material) material.dispose?.();
    return null;
  }
  mesh.name = `SF_RigidOpaqueBatch_${lane}`;
  const laneParts = String(lane).split('|');
  mesh.castShadow = laneParts[0] === 'cast';
  mesh.receiveShadow = laneParts[1] === 'receive';
  mesh.frustumCulled = false;
  mesh.perObjectFrustumCulled = true;
  mesh.sortObjects = false;
  mesh.visible = false;
  mesh.userData.spacefaceRigidOpaqueBatch = true;
  mesh.userData.spacefaceRigidOpaqueBatchLane = lane;
  scene.add(mesh);
  const notes = scene.userData && scene.userData.shadowMeshNotes;
  if (notes && typeof notes.added === 'function') {
    try { notes.added(mesh); } catch (_) { /* diagnostics only */ }
  }
  return {
    mesh,
    material,
    ownedMaterial: material !== source.material,
    lane,
    geometryIds: new Map(),
    entries: [],
    visibleCount: 0,
  };
}

function buildCandidate(scene, plan, options) {
  const capacity = {
    maxInstances: Math.max(1, Math.min(OPAQUE_BATCH_MAX_INSTANCES,
      Math.floor(Number(options.maxInstances) || OPAQUE_BATCH_MAX_INSTANCES))),
    maxVerts: Math.max(1, Math.min(OPAQUE_BATCH_MAX_VERTS,
      Math.floor(Number(options.maxVerts) || OPAQUE_BATCH_MAX_VERTS))),
    maxIndices: Math.max(1, Math.min(OPAQUE_BATCH_MAX_INDICES,
      Math.floor(Number(options.maxIndices) || OPAQUE_BATCH_MAX_INDICES))),
  };
  const batches = [];
  const entries = [];
  const materialUniforms = new Map();
  _sceneInverse.copy(scene.matrixWorld || _sceneInverse.identity()).invert();
  const destroy = () => {
    for (const batch of batches) disposeBatch(batch, scene);
    batches.length = 0;
    entries.length = 0;
  };

  try {
    for (const group of plan.groups) {
      let pendingSources = [];
      let pendingVerts = 0;
      let pendingIndices = 0;
      const flush = () => {
        if (pendingSources.length === 0) return;
        const batchCapacity = {
          maxInstances: pendingSources.length,
          maxVerts: Math.max(1, pendingVerts),
          maxIndices: Math.max(1, pendingIndices),
        };
        const batch = createBatch(scene, pendingSources[0], group.lane, batchCapacity);
        if (!batch) throw new Error('rigid-opaque-batch-create-failed');
        batch.recipe = { materialKey: group.materialKey, geometryKey: group.geometryKey };
        batches.push(batch);
        for (const source of pendingSources) {
          let geometryId = batch.geometryIds.get(source.geometry);
          if (geometryId == null) {
            geometryId = batch.mesh.addGeometry(source.geometry);
            batch.geometryIds.set(source.geometry, geometryId);
          }
          const instanceId = batch.mesh.addInstance(geometryId);
          _localMatrix.multiplyMatrices(_sceneInverse, source.matrixWorld);
          batch.mesh.setMatrixAt(instanceId, _localMatrix);
          const color = colorFromMaterial(source.material);
          if (typeof batch.mesh.setColorAt === 'function') batch.mesh.setColorAt(instanceId, color);
          if (!materialUniforms.has(source.material)) {
            materialUniforms.set(source.material, captureMaterialUniforms(source.material));
          }
          const entry = {
            source,
            root: rootForSource(source, options.roots),
            batch,
            instanceId,
            parent: source.parent,
            originalVisible: source.visible !== false,
            geometry: source.geometry,
            material: source.material,
            materialVisible: source.material ? source.material.visible !== false : false,
            materialVersion: source.material && source.material.version,
            materialUniforms: materialUniforms.get(source.material),
            vertexColors: source.material?.vertexColors === true,
            onBeforeCompile: source.material && source.material.onBeforeCompile,
            customProgramCacheKey: source.material && source.material.customProgramCacheKey,
            materialOnBeforeRender: source.material && source.material.onBeforeRender,
            materialOnAfterRender: source.material && source.material.onAfterRender,
            renderOrder: source.renderOrder,
            layersMask: source.layers && source.layers.mask,
            castShadow: source.castShadow === true,
            receiveShadow: source.receiveShadow === true,
            matrix: new Float64Array(16),
            color: colorSnapshot(color),
            geometrySnapshot: makeGeometrySnapshot(source.geometry),
            tags: relevantTagSnapshot(source),
            visible: true,
            removed: false,
          };
          copyMatrix(entry.matrix, _localMatrix.elements);
          batch.entries.push(entry);
          entries.push(entry);
        }
        publishBatchOpeningPackage(batch);
        pendingSources = [];
        pendingVerts = 0;
        pendingIndices = 0;
      };
      for (const source of group.surfaces) {
        const counts = geometryCounts(source.geometry);
        if (!counts) continue;
        const needsNew = pendingSources.length > 0 && (
          pendingSources.length >= capacity.maxInstances
          || pendingVerts + counts.vertices > capacity.maxVerts
          || pendingIndices + counts.indices > capacity.maxIndices
        );
        if (needsNew) flush();
        pendingSources.push(source);
        pendingVerts += counts.vertices;
        pendingIndices += counts.indices;
      }
      flush();
    }
  } catch (error) {
    destroy();
    throw error;
  }

  return { batches, entries, destroy };
}

function sourceStaticStateStable(entry, hidden = true, hookSafe = defaultHookSafe, noteMutableMaterial = null) {
  const source = entry.source;
  const material = source && source.material;
  const directSuppressed = hidden === true;
  const currentColor = material ? colorFromMaterial(material, _sourceColor) : null;
  const uniformsStable = material === entry.material && materialUniformsStable(entry.materialUniforms, material);
  if (material === entry.material && !uniformsStable && noteMutableMaterial) noteMutableMaterial(material);
  return !!source
    && source.isMesh === true
    && source.parent === entry.parent
    // Keep source visibility and mesh identity canonical while active. The retained path removes
    // the direct draw through the layer mask instead; semantic consumers intentionally continue to
    // traverse this source for roofs, picking, and opaque ownership.
    && source.visible === entry.originalVisible
    && source.geometry === entry.geometry
    && geometrySnapshotStable(entry.geometrySnapshot, source.geometry)
    && material === entry.material
    && (material && material.visible !== false) === entry.materialVisible
    && (material && material.version) === entry.materialVersion
    && uniformsStable
    // Non-vertex-colored materials read their cloned material.color directly in the batch
    // shader. A live color mutation cannot be repaired with setColorAt, so invalidate the
    // retained copy and let the normal admission path rebuild the keyed group.
    && (entry.vertexColors === true || !colorChanged(entry.color, currentColor))
    && (!material || material.onBeforeCompile === entry.onBeforeCompile)
    && (!material || material.customProgramCacheKey === entry.customProgramCacheKey)
    && (!material || material.onBeforeRender === entry.materialOnBeforeRender)
    && (!material || material.onAfterRender === entry.materialOnAfterRender)
    && source.renderOrder === entry.renderOrder
    && source.layers && source.layers.mask === (directSuppressed ? 0 : entry.layersMask)
    && source.castShadow === entry.castShadow
    && source.receiveShadow === entry.receiveShadow
    && source.customDepthMaterial == null
    && source.customDistanceMaterial == null
    && source.morphTargetInfluences == null
    && source.morphTargetDictionary == null
    && hookSafe(source)
    && currentTagsStable(entry.tags, source);
}

function restoreSources(entries) {
  for (const entry of entries || EMPTY_ARRAY) {
    if (!entry || !entry.source) continue;
    entry.source.visible = entry.originalVisible;
    if (entry.source.layers && Number.isFinite(entry.layersMask)) {
      entry.source.layers.mask = entry.layersMask;
    }
  }
}

function releaseCandidate(candidate, scene, restore = true) {
  if (!candidate) return;
  if (restore) restoreSources(candidate.entries);
  candidate.destroy();
}

/**
 * Create a retained rigid opaque batch controller.
 *
 * `prepare` is mandatory for activation. It receives the hidden BatchedMesh objects and must
 * resolve only after the exact material programs and geometry/textures are resident. The
 * controller never suppresses a source before that promise resolves successfully. Active sources
 * retain visibility and mesh identity; their layer mask is cleared only at the atomic commit so
 * semantic readers can still inspect the authored geometry while the retained batch draws it.
 */
export function createRetainedRigidOpaqueBatchController(options = {}) {
  const scene = options.scene || null;
  const prepareDefault = typeof options.prepare === 'function' ? options.prepare : null;
  const getTags = typeof options.getTags === 'function' ? options.getTags : undefined;
  const isTransformOnlySource = typeof options.isTransformOnlySource === 'function'
    ? options.isTransformOnlySource : undefined;
  const isAttestedRigidMotionOwner = typeof options.isAttestedRigidMotionOwner === 'function'
    ? options.isAttestedRigidMotionOwner : undefined;
  const motionOptions = { getTags, isTransformOnlySource, isAttestedRigidMotionOwner };
  // Selection only narrows the admitted cohort. It cannot override the policy's shader,
  // material, motion or geometry guards, and remains binding until the candidate retires.
  const selectSource = typeof options.selectSource === 'function' ? options.selectSource : null;
  // A live heat/pulse owner stays on its direct material after the first observed mutation.
  // Re-admitting its new value every frame would replace one stale picture with a compile storm.
  const mutableMaterials = new WeakSet();
  const noteMutableMaterial = material => { if (material) mutableMaterials.add(material); };
  const renderHookSafe = typeof options.isRenderHookSafe === 'function'
    ? options.isRenderHookSafe
    : defaultHookSafe;
  const isRenderHookSafe = (source) => {
    try {
      return !mutableMaterials.has(source?.material)
        && (!selectSource || selectSource(source) === true)
        && (!isTransformOnlySource || isRigidOpaqueBatchMotionSafe(source,
          (getTags ? getTags(source) : source?.userData?.spacefaceTags) || EMPTY_ARRAY, motionOptions))
        && renderHookSafe(source) === true
        && geometryWithinBatchLimits(source && source.geometry);
    } catch (_) { return false; }
  };
  const maxInstances = options.maxInstances;
  const maxVerts = options.maxVerts;
  const maxIndices = options.maxIndices;
  const assumeUniqueRoots = options.assumeUniqueRoots === true;
  let disposed = false;
  let pending = null;
  let active = null;
  let lastSignature = null;
  let lastRoots = [];
  let lastTopology = null;
  let preparationRetry = null;
  let deferredMembershipRoots = [];
  let deferredMembershipTopology = null;
  let deferredMembershipFrames = 0;
  const ids = new WeakMap();
  let nextId = 1;
  const stats = {
    enabled: true,
    supported: options.supported !== false,
    status: 'idle',
    roots: 0,
    totalMeshes: 0,
    eligibleMeshes: 0,
    directFallbackMeshes: 0,
    groups: 0,
    batches: 0,
    instances: 0,
    potentialDrawReduction: 0,
    hiddenSources: 0,
    visibleInstances: 0,
    matrixUpdates: 0,
    colorUpdates: 0,
    rollbacks: 0,
    activations: 0,
    lastReason: null,
    lastError: null,
  };

  const idFor = (root) => {
    let id = ids.get(root);
    if (!id) {
      id = nextId++;
      ids.set(root, id);
    }
    return id;
  };

  const normalizeRoots = (roots) => {
    if (assumeUniqueRoots && Array.isArray(roots)) {
      let valid = true;
      for (const root of roots) {
        if (!root || typeof root.traverse !== 'function') {
          valid = false;
          break;
        }
      }
      if (valid) return roots;
    }
    const result = [];
    const seen = new Set();
    const list = Array.isArray(roots) ? roots : (roots ? [roots] : EMPTY_ARRAY);
    for (const root of list) {
      if (!root || typeof root.traverse !== 'function' || seen.has(root)) continue;
      seen.add(root);
      result.push(root);
    }
    result.sort((a, b) => idFor(a) - idFor(b));
    return result;
  };

  const signatureFor = (roots) => {
    let signature = '';
    for (const root of roots) signature += `${idFor(root)},`;
    return signature;
  };

  // Admission roots are stable for the normal path. A shallow child identity snapshot catches the
  // common late authored-package mount/reparent without paying a second full subtree traversal on
  // every opt-in probe frame; active sources still perform deep geometry/material validation.
  const captureTopology = (roots) => roots.map((root) => ({
    root,
    children: (root.children || EMPTY_ARRAY).slice(),
  }));
  const topologyMatches = (snapshot, roots) => {
    if (!snapshot || snapshot.length !== roots.length) return false;
    for (let i = 0; i < roots.length; i++) {
      const row = snapshot[i];
      const root = roots[i];
      const children = root.children || EMPTY_ARRAY;
      if (!row || row.root !== root || row.children.length !== children.length) return false;
      for (let j = 0; j < children.length; j++) if (row.children[j] !== children[j]) return false;
    }
    return true;
  };
  const captureEntryTopology = (entries) => {
    const rows = [];
    const seen = new Set();
    for (const entry of entries || EMPTY_ARRAY) {
      const source = entry && entry.source;
      const parent = entry && entry.parent;
      for (const object of [parent, source]) {
        if (!object || seen.has(object)) continue;
        seen.add(object);
        rows.push({ object, children: (object.children || EMPTY_ARRAY).slice() });
      }
    }
    return rows;
  };
  const entryTopologyMatches = (snapshot) => {
    for (const row of snapshot || EMPTY_ARRAY) {
      const children = row.object && row.object.children ? row.object.children : EMPTY_ARRAY;
      if (!row.object || children.length !== row.children.length) return false;
      for (let i = 0; i < children.length; i++) if (children[i] !== row.children[i]) return false;
    }
    return true;
  };

  const rootInList = (roots, target) => {
    for (const root of roots || EMPTY_ARRAY) if (root === target) return true;
    return false;
  };

  const clearDeferredMembership = () => {
    deferredMembershipRoots = [];
    deferredMembershipTopology = null;
    deferredMembershipFrames = 0;
  };

  const noteDeferredMembership = (roots) => {
    const sameRoots = rootsEqual(deferredMembershipRoots, roots);
    const sameTopology = sameRoots && topologyMatches(deferredMembershipTopology, roots);
    if (!sameTopology) {
      deferredMembershipRoots = roots.slice();
      deferredMembershipTopology = captureTopology(roots);
      deferredMembershipFrames = 1;
    } else {
      deferredMembershipFrames += 1;
    }
    return deferredMembershipFrames >= RETAINED_BATCH_MEMBERSHIP_QUIET_FRAMES;
  };

  const refreshDiagnostics = () => {
    stats.batches = active ? active.batches.length : 0;
    stats.instances = active ? active.entries.length : 0;
    stats.hiddenSources = active ? active.entries.length : 0;
    stats.visibleInstances = 0;
    if (active) {
      for (const batch of active.batches) stats.visibleInstances += batch.visibleCount;
    }
    return stats;
  };

  const disposeActive = (reason = 'rollback') => {
    if (!active) return;
    restoreSources(active.entries);
    for (const batch of active.batches) disposeBatch(batch, scene);
    active = null;
    stats.rollbacks += 1;
    stats.status = 'idle';
    stats.lastReason = reason;
    // A source mutation or reparent may have changed the planner's admission set. Force the next
    // sync to walk the roots again instead of treating the old no-op signature as authoritative.
    lastSignature = null;
    lastRoots = [];
    lastTopology = null;
    clearDeferredMembership();
  };

  // Membership changes are normal while authored roots stream in and out of a sector. Remove
  // departed entries in place so their source layers are restored and surviving batches keep their
  // resident geometry. A new root is deliberately handled by the request path as a deferred
  // addition; this helper never admits a source into an existing fixed-capacity BatchedMesh.
  const retainMembershipForRoots = (roots) => {
    if (!active) return true;
    let rootsRemoved = false;
    for (const root of active.roots) {
      if (!rootInList(roots, root)) {
        rootsRemoved = true;
        break;
      }
    }

    let entriesRemoved = false;
    for (const entry of active.entries) {
      // A source reparent under a still-live root is a source-state mutation and must retain its
      // entry so validateAndRefresh can take the existing full rollback path. Only entries whose
      // original owning root actually left the root set are removed incrementally.
      if (rootInList(roots, entry.root)) continue;
      try {
        entry.batch.mesh.deleteInstance(entry.instanceId);
      } catch (_) {
        // A stale/deleted instance cannot be safely retained; the caller will use the existing
        // full rollback path, which restores all remaining source state before rebuilding.
        return false;
      }
      entry.source.visible = entry.originalVisible;
      if (entry.source.layers && Number.isFinite(entry.layersMask)) {
        entry.source.layers.mask = entry.layersMask;
      }
      if (entry.visible) entry.batch.visibleCount = Math.max(0, entry.batch.visibleCount - 1);
      entry.removed = true;
      entriesRemoved = true;
    }

    if (!rootsRemoved && !entriesRemoved) return true;

    if (entriesRemoved) {
      let entryWrite = 0;
      for (const entry of active.entries) {
        if (entry.removed) continue;
        active.entries[entryWrite++] = entry;
      }
      active.entries.length = entryWrite;

      const retainedBatches = [];
      for (const batch of active.batches) {
        let batchEntryWrite = 0;
        for (const entry of batch.entries) {
          if (entry.removed) continue;
          batch.entries[batchEntryWrite++] = entry;
        }
        batch.entries.length = batchEntryWrite;
        if (batch.entries.length === 0) {
          disposeBatch(batch, scene);
        } else {
          publishBatchOpeningPackage(batch);
          batch.mesh.visible = batch.visibleCount > 0;
          retainedBatches.push(batch);
        }
      }
      active.batches = retainedBatches;
    }

    if (rootsRemoved) {
      const retainedRoots = [];
      for (const root of active.roots) {
        if (rootInList(roots, root)) retainedRoots.push(root);
      }
      active.roots = retainedRoots;
    }
    active.topology = captureTopology(active.roots);
    active.entryTopology = captureEntryTopology(active.entries);
    // The previous full plan no longer describes the retained cohort. Keep the active candidate
    // and let refreshDiagnostics expose its surviving batches until a quiet rebuild replans all
    // roots, rather than allowing a stale signature to suppress that rebuild.
    lastSignature = null;
    lastRoots = [];
    lastTopology = null;
    return true;
  };

  const validateAndRefresh = () => {
    if (!active) return false;
    if (!entryTopologyMatches(active.entryTopology)) return false;
    let visibleCount = 0;
    _sceneInverse.copy(scene.matrixWorld || _sceneInverse.identity()).invert();
    for (const entry of active.entries) {
      if (!sourceStaticStateStable(entry, true, isRenderHookSafe, noteMutableMaterial)) return false;
      const source = entry.source;
      _localMatrix.multiplyMatrices(_sceneInverse, source.matrixWorld);
      if (matrixChanged(entry.matrix, _localMatrix.elements)) {
        copyMatrix(entry.matrix, _localMatrix.elements);
        entry.batch.mesh.setMatrixAt(entry.instanceId, _localMatrix);
        stats.matrixUpdates += 1;
      }
      const color = colorFromMaterial(source.material);
      if (colorChanged(entry.color, color)) {
        if (typeof entry.batch.mesh.setColorAt === 'function') {
          entry.batch.mesh.setColorAt(entry.instanceId, color);
        }
        entry.color = colorSnapshot(color);
        stats.colorUpdates += 1;
      }
      const visible = ancestorVisibleAndAttached(source.parent, scene);
      if (visible) visibleCount += 1;
      if (visible !== entry.visible) {
        try { entry.batch.mesh.setVisibleAt(entry.instanceId, visible); }
        catch (_) { return false; }
        entry.batch.visibleCount += visible ? 1 : -1;
        entry.visible = visible;
      }
    }
    // The retained root disables aggregate frustum culling; Three's per-instance culling uses
    // each geometry's local sphere directly, so recomputing the aggregate sphere here would only
    // add an O(instances) CPU pass after every matrix update.
    for (const batch of active.batches) {
      batch.mesh.visible = batch.visibleCount > 0;
    }
    stats.hiddenSources = active.entries.length;
    stats.instances = active.entries.length;
    stats.batches = active.batches.length;
    stats.visibleInstances = visibleCount;
    return true;
  };

  const makePlan = (roots) => planRigidOpaqueBatchGroups(roots, {
    getTags,
    isTransformOnlySource,
    isAttestedRigidMotionOwner,
    isRenderHookSafe,
    materialProgramKey: rigidOpaqueMaterialProgramKey,
    shadowLane: (source) => `${source.castShadow === true ? 'cast' : 'nocast'}|${source.receiveShadow === true ? 'receive' : 'noreceive'}`,
  });

  const request = (roots, requestOptions = {}) => {
    if (disposed || !scene) return refreshDiagnostics();
    if (stats.supported !== true) {
      stats.status = 'disabled';
      stats.lastReason = 'unsupported-batched-mesh-capability';
      return refreshDiagnostics();
    }
    const normalized = normalizeRoots(roots);
    stats.roots = normalized.length;

    if (active) {
      if (!retainMembershipForRoots(normalized)) {
        disposeActive('source-state-changed');
      } else {
        const hasNewRoots = normalized.some((root) => !rootInList(active.roots, root));
        if (hasNewRoots) {
          // Keep the current cohort valid while streamed additions settle. Their direct leaves
          // remain on the authored layer until one quiet window allows a safe full replan.
          if (!noteDeferredMembership(normalized)) {
            if (!topologyMatches(active.topology, active.roots) || !validateAndRefresh()) {
              disposeActive('source-state-changed');
            } else {
              stats.status = 'active';
              return refreshDiagnostics();
            }
          } else {
            clearDeferredMembership();
            disposeActive('membership-quiet-rebuild');
          }
        } else {
          clearDeferredMembership();
          if (!topologyMatches(active.topology, active.roots) || !validateAndRefresh()) {
            disposeActive('source-state-changed');
          } else {
            stats.status = 'active';
            return refreshDiagnostics();
          }
        }
      }
    }
    const signature = signatureFor(normalized);
    if (pending && pending.signature === signature) return pending.promise;
    if (pending) {
      pending.cancelled = true;
      releaseCandidate(pending.candidate, scene, true);
      pending = null;
    }
    if (lastSignature === signature && rootsEqual(lastRoots, normalized)
        && topologyMatches(lastTopology, normalized)) {
      // One real preparation rejection may be transient. Reuse the membership quiet window
      // before retrying, then park a second rejection until the cohort actually changes.
      if (!preparationRetry || preparationRetry.used
          || ++preparationRetry.frames < RETAINED_BATCH_MEMBERSHIP_QUIET_FRAMES) {
        return refreshDiagnostics();
      }
      preparationRetry.used = true;
    } else {
      preparationRetry = null;
    }
    lastSignature = signature;
    lastRoots = normalized.slice();
    lastTopology = captureTopology(normalized);
    const plan = makePlan(normalized);
    stats.totalMeshes = plan.totalMeshes;
    stats.eligibleMeshes = plan.eligibleMeshes;
    stats.directFallbackMeshes = plan.directFallbackMeshes.length;
    stats.groups = plan.groups.length;
    stats.potentialDrawReduction = plan.potentialDrawReduction;
    if (plan.groups.length === 0) {
      stats.status = 'idle';
      stats.lastReason = 'no-eligible-groups';
      return refreshDiagnostics();
    }
    const prepare = typeof requestOptions.prepare === 'function' ? requestOptions.prepare : prepareDefault;
    if (typeof prepare !== 'function') {
      stats.status = 'unprepared';
      stats.lastReason = 'prepare-callback-required';
      return refreshDiagnostics();
    }

    let candidate;
    try {
      candidate = buildCandidate(scene, plan, {
        maxInstances, maxVerts, maxIndices, roots: normalized,
      });
    } catch (error) {
      stats.status = 'failed';
      stats.lastReason = 'candidate-build-failed';
      stats.lastError = String(error && error.message || error);
      return refreshDiagnostics();
    }
    const record = {
      signature,
      roots: normalized.slice(),
      candidate,
      entryTopology: captureEntryTopology(candidate.entries),
      cancelled: false,
      promise: null,
    };
    stats.status = 'preparing';
    stats.lastError = null;
    const activeNow = () => !disposed && pending === record && record.cancelled !== true;
    record.promise = Promise.resolve()
      .then(() => prepare(candidate.batches.map((batch) => batch.mesh), {
        roots: normalized,
        plan,
        isActive: activeNow,
      }))
      .then((result) => {
        const wasActive = activeNow();
        const ready = result === true || result?.ready === true;
        if (!wasActive || !ready || result?.skipped === true
            || result?.ready === false || result?.timedOut === true
            || result?.superseded === true) {
          releaseCandidate(candidate, scene, true);
          if (pending === record) pending = null;
          if (wasActive && (!ready || result?.skipped === true
              || result?.ready === false || result?.timedOut === true
              || result?.superseded === true)) {
            lastSignature = null;
            lastRoots = [];
            lastTopology = null;
          }
          stats.status = 'idle';
          stats.lastReason = !wasActive ? 'preparation-stale' : 'preparation-incomplete';
          return refreshDiagnostics();
        }
        const topologyStable = entryTopologyMatches(record.entryTopology);
        if (!topologyStable
            || !candidate.entries.every((entry) => sourceStaticStateStable(entry, false, isRenderHookSafe, noteMutableMaterial))) {
          releaseCandidate(candidate, scene, true);
          if (pending === record) pending = null;
          lastSignature = null;
          lastRoots = [];
          lastTopology = null;
          stats.status = 'idle';
          stats.lastReason = topologyStable
            ? 'source-state-changed-before-commit'
            : 'source-topology-changed-before-commit';
          return refreshDiagnostics();
        }
        // Preparation is asynchronous while authored rigid pivots may keep moving. Publish the
        // current pose at the same atomic handover that suppresses the direct source draws.
        _sceneInverse.copy(scene.matrixWorld || _sceneInverse.identity()).invert();
        for (const entry of candidate.entries) {
          _localMatrix.multiplyMatrices(_sceneInverse, entry.source.matrixWorld);
          if (matrixChanged(entry.matrix, _localMatrix.elements)) {
            copyMatrix(entry.matrix, _localMatrix.elements);
            entry.batch.mesh.setMatrixAt(entry.instanceId, _localMatrix);
            stats.matrixUpdates += 1;
          }
          // Keep the canonical source visible to clearance/picking/player-truth traversals. The
          // ordinary camera uses layer 0, so mask 0 suppresses its direct draw without removing
          // the mesh from those semantic readers. dispose/rollback restores the authored mask.
          if (entry.source.layers) entry.source.layers.mask = 0;
          const visible = ancestorVisibleAndAttached(entry.source.parent, scene);
          entry.visible = visible;
          try { entry.batch.mesh.setVisibleAt(entry.instanceId, visible); } catch (_) { /* validated next sync */ }
        }
        for (const batch of candidate.batches) {
          let batchVisibleCount = 0;
          for (const entry of batch.entries) if (entry.visible) batchVisibleCount += 1;
          batch.visibleCount = batchVisibleCount;
          batch.mesh.visible = batch.visibleCount > 0;
        }
        active = candidate;
        active.roots = record.roots;
        active.topology = lastTopology;
        active.entryTopology = record.entryTopology;
        pending = null;
        preparationRetry = null;
        stats.status = 'active';
        stats.activations += 1;
        stats.lastReason = 'activated-after-residency';
        return refreshDiagnostics();
      })
      .catch((error) => {
        const wasActive = activeNow();
        releaseCandidate(candidate, scene, true);
        if (!wasActive) return refreshDiagnostics();
        if (pending === record) pending = null;
        preparationRetry ||= { frames: 0, used: false };
        stats.status = 'failed';
        stats.lastReason = 'preparation-failed';
        stats.lastError = String(error && error.message || error);
        return refreshDiagnostics();
      });
    pending = record;
    return record.promise;
  };

  return {
    sync: request,
    request,
    getDiagnostics() {
      return refreshDiagnostics();
    },
    rollback(reason = 'manual-rollback') {
      if (pending) {
        pending.cancelled = true;
        releaseCandidate(pending.candidate, scene, true);
        pending = null;
      }
      disposeActive(reason);
      lastSignature = null;
      lastRoots = [];
      lastTopology = null;
      preparationRetry = null;
      return refreshDiagnostics();
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      if (pending) {
        pending.cancelled = true;
        releaseCandidate(pending.candidate, scene, true);
        pending = null;
      }
      disposeActive('disposed');
      preparationRetry = null;
      stats.enabled = false;
      stats.status = 'disposed';
      return true;
    },
  };
}
