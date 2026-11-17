import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BATCH_SPECS = Object.freeze([
  Object.freeze({ materialName: 'Spindle_Black_Clamp', batchName: 'Spindle_Clamp_Batch' }),
  Object.freeze({ materialName: 'Spindle_Ledger_Brass', batchName: 'Spindle_Seal_Tag_Batch' }),
  Object.freeze({ materialName: 'HandoffBeacon_Dark_Mast', batchName: 'HandoffBeacon_Mast_Batch' }),
]);

const RELATIVE = new THREE.Matrix4();
const ROOT_INVERSE = new THREE.Matrix4();

function isOpaqueStaticMesh(mesh, materialName) {
  if (!mesh || !mesh.isMesh || !mesh.geometry || !mesh.material || Array.isArray(mesh.material)) return false;
  const material = mesh.material;
  if (materialName && material.name !== materialName) return false;
  return material.transparent !== true
    && material.opacity === 1
    && material.depthWrite !== false
    && !mesh.isSkinnedMesh
    && !Object.hasOwn(mesh, 'onBeforeRender');
}

// Packaged GLBs arrive with whatever buffer layout the exporter chose — interleaved attributes,
// normalized integer uvs, Uint16 vs Uint32 indices — and mergeGeometries refuses to weld mixed
// array types. Rebuild every stream as a plain Float32 BufferAttribute (and every index as
// Uint32) so a batch can never fail on representation alone. Values are read through getX/Y/Z/W,
// which already de-normalize, so normalized uvs keep their real coordinates.
function flattenAttributeForMerge(attribute) {
  const itemSize = attribute.itemSize;
  const count = attribute.count;
  const array = new Float32Array(count * itemSize);
  for (let i = 0; i < count; i += 1) {
    array[i * itemSize] = attribute.getX(i);
    if (itemSize > 1) array[i * itemSize + 1] = attribute.getY(i);
    if (itemSize > 2) array[i * itemSize + 2] = attribute.getZ(i);
    if (itemSize > 3) array[i * itemSize + 3] = attribute.getW(i);
  }
  return new THREE.BufferAttribute(array, itemSize);
}

function normalizeGeometryForMerge(geometry) {
  for (const name of Object.keys(geometry.attributes)) {
    geometry.setAttribute(name, flattenAttributeForMerge(geometry.getAttribute(name)));
  }
  if (geometry.index) {
    const index = geometry.index;
    const array = new Uint32Array(index.count);
    for (let i = 0; i < index.count; i += 1) array[i] = index.getX(i);
    geometry.setIndex(new THREE.BufferAttribute(array, 1));
  }
  return geometry;
}

// Representation is not the only way a pack can disagree: one primitive in a material group can
// carry a TANGENT (or a second UV set, or COLOR) while its sibling does not — `place_asteroid_graffiti`,
// `place_container_rack`, and `place_transponder_gate` all ship `Material_Emissive_Warm` as one
// tangent-set primitive plus two without. mergeGeometries refuses that with "same number of
// attributes" and returns null, which used to throw out of the packaged-prop build and fail the
// whole authored body closed: the prop drew nothing at all. Fill each group's missing streams with
// their neutral value so the merge succeeds and the body publishes.
const MERGE_ATTRIBUTE_DEFAULTS = Object.freeze({
  // Tangent w is the handedness bit; 0 would flip every normal map on the filled primitives.
  tangent: (array, itemSize) => { for (let i = 3; i < array.length; i += itemSize) array[i] = 1; },
  // Vertex colour is a multiplier, so a missing stream is white, never black.
  color: (array) => { for (let i = 0; i < array.length; i += 1) array[i] = 1; },
});

function fillAttribute(geometry, name, itemSize) {
  const count = geometry.getAttribute('position').count;
  const array = new Float32Array(count * itemSize);
  const fill = MERGE_ATTRIBUTE_DEFAULTS[name];
  if (fill) fill(array, itemSize);
  geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
  // A zero normal would shade the filled primitive black; derive the real surface instead.
  if (name === 'normal') geometry.computeVertexNormals();
}

function reconcileMergeAttributes(geometries) {
  const specs = new Map();
  for (const geometry of geometries) {
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const known = specs.get(name);
      // A widened stream keeps the largest itemSize seen; narrower members are padded below.
      if (!known || attribute.itemSize > known) specs.set(name, attribute.itemSize);
    }
  }
  for (const geometry of geometries) {
    for (const [name, itemSize] of specs) {
      const attribute = geometry.getAttribute(name);
      if (!attribute) { fillAttribute(geometry, name, itemSize); continue; }
      if (attribute.itemSize !== itemSize) {
        const count = attribute.count;
        const widened = new Float32Array(count * itemSize);
        for (let i = 0; i < count; i += 1) {
          for (let c = 0; c < attribute.itemSize; c += 1) widened[i * itemSize + c] = attribute.getComponent(i, c);
        }
        geometry.setAttribute(name, new THREE.BufferAttribute(widened, itemSize));
      }
    }
    // The merge also requires every member to agree on indexing; normalizeGeometryForMerge
    // rebuilds the index representation, so only presence can still differ.
  }
  const indexed = geometries[0] && !!geometries[0].index;
  for (const geometry of geometries) {
    if (!!geometry.index === indexed) continue;
    // normalizeGeometryForMerge hands every member a Uint32Array index, so the only way to get
    // here is a geometry built without one. Give it the identity index instead of dropping its
    // neighbours' — dropping an index on an indexed geometry would weld triangles onto vertex 0.
    const count = geometry.getAttribute('position').count;
    const array = new Uint32Array(count);
    for (let i = 0; i < count; i += 1) array[i] = i;
    geometry.setIndex(new THREE.BufferAttribute(array, 1));
  }
  return geometries;
}

function mergeOpaqueMeshes(root, meshes, batchName, { disposeSourceGeometry = true } = {}) {
  if (!root || !Array.isArray(meshes) || meshes.length < 2) return null;
  root.updateMatrixWorld(true);
  ROOT_INVERSE.copy(root.matrixWorld).invert();
  const transformed = [];
  for (const mesh of meshes) {
    RELATIVE.multiplyMatrices(ROOT_INVERSE, mesh.matrixWorld);
    const geometry = normalizeGeometryForMerge(mesh.geometry.clone());
    geometry.applyMatrix4(RELATIVE);
    transformed.push(geometry);
  }
  const reconciled = reconcileMergeAttributes(transformed);
  const geometry = mergeGeometries(reconciled, false);
  for (const transformedGeometry of transformed) transformedGeometry.dispose();
  if (!geometry) throw new Error(`scenario prop batch failed for ${batchName}`);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = meshes[0].material;
  const merged = new THREE.Mesh(geometry, material);
  merged.name = batchName;
  merged.castShadow = meshes.some((mesh) => mesh.castShadow);
  merged.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
  merged.renderOrder = meshes[0].renderOrder;
  merged.userData.scenarioStaticBatch = true;
  merged.userData.sourcePartNames = meshes.map((mesh) => mesh.name);

  for (const mesh of meshes) {
    if (mesh.parent) mesh.parent.remove(mesh);
    if (disposeSourceGeometry && mesh.geometry
      && !(mesh.geometry.userData && mesh.geometry.userData.spacefaceSharedAsset)) {
      mesh.geometry.dispose();
    }
  }
  root.add(merged);
  return merged;
}

function batchMeshes(root, spec) {
  const meshes = [];
  root.traverse((object) => {
    if (isOpaqueStaticMesh(object, spec.materialName)) meshes.push(object);
  });
  return mergeOpaqueMeshes(root, meshes, spec.batchName);
}

export function batchScenarioPropOpaqueMeshes(root) {
  if (!root || root.userData && root.userData.scenarioOpaqueBatchesApplied) return root;
  for (const spec of BATCH_SPECS) batchMeshes(root, spec);
  root.userData.scenarioOpaqueBatchesApplied = true;
  return root;
}

/**
 * Merge opaque packaged-GLB leaves that already share a material. Source geometry stays owned by
 * the authored record — never dispose it.
 */
export function batchPackagedPropOpaqueMeshes(root) {
  const it = batchPackagedPropOpaqueMeshesSteps(root);
  for (;;) { const step = it.next(); if (step.done) return step.value; }
}

// Stepped twin: the group collect walks pre-order DFS (children pushed reversed so
// pops visit in child order — identical visit sequence to traverse()) and each
// material group's merge is one slice. A suspended run still merges groups in the
// same order; the applied flag only sets after the last merge.
export function* batchPackagedPropOpaqueMeshesSteps(root) {
  if (!root || root.userData && root.userData.scenarioPackagedOpaqueBatchesApplied) return root;
  const groups = new Map();
  const stack = [root];
  let visited = 0;
  while (stack.length > 0) {
    const object = stack.pop();
    if ((++visited % 512) === 0) yield;
    if (isOpaqueStaticMesh(object, null)) {
      const material = object.material;
      const list = groups.get(material);
      if (list) list.push(object);
      else groups.set(material, [object]);
    }
    const children = object.children;
    if (children) for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
  let index = 0;
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const name = meshes[0].material && meshes[0].material.name
      ? `${meshes[0].material.name}_Packaged_Batch`
      : `Packaged_Opaque_Batch_${index}`;
    mergeOpaqueMeshes(root, meshes, name, { disposeSourceGeometry: false });
    yield;
    index += 1;
  }
  root.userData.scenarioPackagedOpaqueBatchesApplied = true;
  return root;
}
