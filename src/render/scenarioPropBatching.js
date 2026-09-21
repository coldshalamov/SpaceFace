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
  const geometry = mergeGeometries(transformed, false);
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
  if (!root || root.userData && root.userData.scenarioPackagedOpaqueBatchesApplied) return root;
  const groups = new Map();
  root.traverse((object) => {
    if (!isOpaqueStaticMesh(object, null)) return;
    const material = object.material;
    const list = groups.get(material);
    if (list) list.push(object);
    else groups.set(material, [object]);
  });
  let index = 0;
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const name = meshes[0].material && meshes[0].material.name
      ? `${meshes[0].material.name}_Packaged_Batch`
      : `Packaged_Opaque_Batch_${index}`;
    mergeOpaqueMeshes(root, meshes, name, { disposeSourceGeometry: false });
    index += 1;
  }
  root.userData.scenarioPackagedOpaqueBatchesApplied = true;
  return root;
}
