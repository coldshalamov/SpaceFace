import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BATCH_SPECS = Object.freeze([
  Object.freeze({ materialName: 'Spindle_Black_Clamp', batchName: 'Spindle_Clamp_Batch' }),
  Object.freeze({ materialName: 'Spindle_Ledger_Brass', batchName: 'Spindle_Seal_Tag_Batch' }),
  Object.freeze({ materialName: 'HandoffBeacon_Dark_Mast', batchName: 'HandoffBeacon_Mast_Batch' }),
]);

function isOpaqueStaticMesh(mesh, materialName) {
  if (!mesh || !mesh.isMesh || !mesh.geometry || !mesh.material || Array.isArray(mesh.material)) return false;
  const material = mesh.material;
  return material.name === materialName
    && material.transparent !== true
    && material.opacity === 1
    && material.depthWrite !== false
    && !mesh.isSkinnedMesh
    && !Object.hasOwn(mesh, 'onBeforeRender');
}

function batchMeshes(root, spec) {
  const meshes = [];
  root.traverse((object) => {
    if (isOpaqueStaticMesh(object, spec.materialName)) meshes.push(object);
  });
  if (meshes.length < 2) return null;

  root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const relative = new THREE.Matrix4();
  const transformed = [];
  for (const mesh of meshes) {
    relative.multiplyMatrices(rootInverse, mesh.matrixWorld);
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(relative);
    transformed.push(geometry);
  }
  const geometry = mergeGeometries(transformed, false);
  for (const transformedGeometry of transformed) transformedGeometry.dispose();
  if (!geometry) throw new Error(`scenario prop batch failed for ${spec.materialName}`);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = meshes[0].material;
  const merged = new THREE.Mesh(geometry, material);
  merged.name = spec.batchName;
  merged.castShadow = meshes.some((mesh) => mesh.castShadow);
  merged.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
  merged.renderOrder = meshes[0].renderOrder;
  merged.userData.scenarioStaticBatch = true;
  merged.userData.sourcePartNames = meshes.map((mesh) => mesh.name);

  for (const mesh of meshes) {
    if (mesh.parent) mesh.parent.remove(mesh);
    mesh.geometry.dispose();
  }
  root.add(merged);
  return merged;
}

export function batchScenarioPropOpaqueMeshes(root) {
  if (!root || root.userData && root.userData.scenarioOpaqueBatchesApplied) return root;
  for (const spec of BATCH_SPECS) batchMeshes(root, spec);
  root.userData.scenarioOpaqueBatchesApplied = true;
  return root;
}
