import * as THREE from 'three';
import { motionNodeNameFor } from '../contracts/motionBank.js';

export const READY_BODY_LIMITS = Object.freeze({ templates: 32, nodes: 256, materials: 128, geometryBytes: 64 * 1024 * 1024 });

function ownedMaterialClone(material) {
  const clone = material.clone();
  clone.onBeforeCompile = material.onBeforeCompile;
  clone.customProgramCacheKey = material.customProgramCacheKey;
  // These clones own disposal; authored roles, shader/look metadata and texture references stay.
  for (const key of ['spacefaceSharedAsset', 'spacefaceSharedMaterial', 'spacefaceSharedFallback', 'borrowedGeometryMaterial']) delete clone.userData[key];
  return clone;
}

// A blueprint is captured only AFTER the owner's normal GPU admission. It shares geometry under
// the asset registry's leases and owns private baseline materials; live bodies clone those materials.
// No graph retains the warm exemplar, its native entity, controllers or render-package instance.
export function createReadyPackagedBodyCache({ residency, limits = READY_BODY_LIMITS } = {}) {
  const entries = new Map(); let bytes = 0; let generation = 0; let closed = false;
  const retire = (key, reason = 'ready-body-evicted') => {
    const entry = entries.get(key); if (!entry) return false;
    entries.delete(key); bytes -= entry.bytes;
    entry.offStale?.();
    for (const material of entry.materials) material.dispose();
    residency?.releaseOwner(entry.owner, reason);
    return true;
  };
  const capture = (key, root, { record, fitRadius, motionBank = null, gpuAdmitted = false,
    admissionGeneration } = {}) => {
    if (closed || admissionGeneration !== generation || !gpuAdmitted || !residency || !root
      || !(fitRadius > 0) || !record?.residency?.key || record.renderPackage?.released || record.renderPackage?.evicted) return false;
    if (entries.has(key)) return true;
    const nodes = [], materials = new Map(), geometries = new Set();
    let geometryBytes = 0;
    const restByName = new Map((motionBank?.bank?.bindings || []).map(binding => [
      binding.node || motionNodeNameFor(binding.id), binding.restPose]));
    const walk = (source, parent = -1) => {
      if (nodes.length >= limits.nodes || source.isSkinnedMesh || source.isInstancedMesh
        || !(source.isMesh || source.isGroup || source.type === 'Object3D')
        || source.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender
        || source.onAfterRender !== THREE.Object3D.prototype.onAfterRender) throw new Error('unsupported-ready-body');
      const userData = { ...source.userData };
      delete userData.renderPackageInstance;
      for (const key of ['spacefaceSharedAsset', 'borrowedGeometryMaterial', 'sharedContactShadow', 'sharedShieldGeo']) delete userData[key];
      // Authored node metadata is plain GLTF data. A live owner/callback in it is not a template.
      const data = JSON.parse(JSON.stringify(userData));
      const index = nodes.length;
      const mats = source.isMesh ? (Array.isArray(source.material) ? source.material : [source.material]) : [];
      for (const material of mats) if (!materials.has(material)) {
        if (materials.size >= limits.materials) throw new Error('oversize-ready-body');
        const clone = ownedMaterialClone(material);
        materials.set(material, clone);
      }
      const geometry = source.geometry;
      if (geometry && !geometries.has(geometry)) {
        geometries.add(geometry);
        const attributes = [...Object.values(geometry.attributes || {}),
          ...Object.values(geometry.morphAttributes || {}).flat(), geometry.index].filter(Boolean);
        const buffers = new Set();
        for (const attr of attributes) {
          const data = attr.isInterleavedBufferAttribute ? attr.data : attr;
          if (buffers.has(data)) continue; buffers.add(data);
          const array = data.array;
          geometryBytes += Math.max(array?.byteLength || 0,
            (data.count || 0) * (data.stride || data.itemSize || 1) * (array?.BYTES_PER_ELEMENT || 4));
        }
        if (geometryBytes > limits.geometryBytes) throw new Error('oversize-ready-body');
      }
      const rest = restByName.get(source.name);
      const position = rest ? new THREE.Vector3().fromArray(rest.translation) : source.position.clone();
      const quaternion = rest ? new THREE.Quaternion().fromArray(rest.rotation) : source.quaternion.clone();
      nodes.push({ parent, mesh: source.isMesh === true, group: source.isGroup === true,
        name: source.name, geometry, materials: mats.map(mat => materials.get(mat)),
        multiMaterial: Array.isArray(source.material), data,
        position, quaternion, scale: source.scale.clone(),
        matrix: rest ? new THREE.Matrix4().compose(position, quaternion, source.scale) : source.matrix.clone(),
        matrixAutoUpdate: rest ? true : source.matrixAutoUpdate,
        visible: source.visible, layers: source.layers.mask, renderOrder: source.renderOrder,
        castShadow: source.castShadow, receiveShadow: source.receiveShadow, frustumCulled: source.frustumCulled,
        morphTargetDictionary: source.morphTargetDictionary ? { ...source.morphTargetDictionary } : undefined,
        morphTargetInfluences: source.morphTargetInfluences?.slice(),
      });
      for (const child of source.children) walk(child, index);
    };
    try { walk(root); } catch {
      for (const material of materials.values()) material.dispose();
      return false; // unsupported/oversize bodies keep the existing paced authored route
    }
    const owner = {};
    if (!residency.retain(record.residency.key, owner, { role: 'ready-packaged-template' })) {
      for (const material of materials.values()) material.dispose(); return false;
    }
    while (entries.size >= limits.templates || bytes + geometryBytes > limits.geometryBytes) retire(entries.keys().next().value);
    // The record owns these buffers; destroying an exemplar or live copy must not dispose them.
    for (const geometry of geometries) {
      geometry.userData = geometry.userData || {}; geometry.userData.spacefaceSharedAsset = true;
    }
    const entry = { nodes, materials: [...materials.values()], bytes: geometryBytes, owner,
      assetKey: record.residency.key, record, fitRadius, motionBank, offStale: null };
    entries.set(key, entry); bytes += geometryBytes;
    entry.offStale = record.renderPackage?.onStale?.(() => {
      if (entries.get(key) === entry) retire(key, 'ready-body-source-stale');
    });
    return true;
  };
  const acquire = (key, { fitRadius, patchMaterial } = {}) => {
    const entry = entries.get(key);
    if (closed || !entry || !(fitRadius > 0) || entry.record.renderPackage?.released || entry.record.renderPackage?.evicted) return null;
    const owner = {};
    if (!residency.retain(entry.assetKey, owner, { role: 'ready-packaged-instance' })) { retire(key); return null; }
    const materials = new Map(); let released = false;
    const release = () => {
      if (released) return false; released = true;
      residency.releaseOwner(owner, 'ready-packaged-instance-released'); return true;
    };
    try {
      const objects = entry.nodes.map((node) => {
        const mats = node.materials.map(material => {
          let clone = materials.get(material);
          if (!clone) {
            clone = ownedMaterialClone(material);
            patchMaterial?.(clone); materials.set(material, clone);
          }
          return clone;
        });
        const object = node.mesh ? new THREE.Mesh(node.geometry, node.multiMaterial ? mats : mats[0])
          : node.group ? new THREE.Group() : new THREE.Object3D();
        object.name = node.name; object.userData = JSON.parse(JSON.stringify(node.data));
        object.position.copy(node.position); object.quaternion.copy(node.quaternion); object.scale.copy(node.scale);
        object.matrix.copy(node.matrix); object.matrixAutoUpdate = node.matrixAutoUpdate;
        object.visible = node.visible; object.layers.mask = node.layers; object.renderOrder = node.renderOrder;
        object.castShadow = node.castShadow; object.receiveShadow = node.receiveShadow; object.frustumCulled = node.frustumCulled;
        if (node.morphTargetDictionary) object.morphTargetDictionary = { ...node.morphTargetDictionary };
        if (node.morphTargetInfluences) object.morphTargetInfluences = node.morphTargetInfluences.slice();
        return object;
      });
      for (let i = 1; i < objects.length; i++) objects[entry.nodes[i].parent].add(objects[i]);
      const root = objects[0], factor = fitRadius / entry.fitRadius;
      root.position.multiplyScalar(factor); root.scale.multiplyScalar(factor); root.updateMatrix();
      entries.delete(key); entries.set(key, entry); // bounded LRU, no wall-clock or per-frame maintenance
      return { root, record: entry.record, motionBank: entry.motionBank, materials: [...materials.values()], release };
    } catch (error) {
      for (const material of materials.values()) material.dispose(); release(); throw error;
    }
  };
  return { capture, acquire, get generation() { return generation; }, clear(reason = 'ready-body-cache-cleared') {
    generation++;
    if (reason === 'renderer-destroyed') closed = true;
    for (const key of [...entries.keys()]) retire(key, reason);
  }, diagnostics: () => ({ templates: entries.size, geometryBytes: bytes }) };
}
