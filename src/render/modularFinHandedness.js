import { Euler, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import { isPackageGeometryDetached, rehydrateDetachedGeometries, retainPackageGeometryCpu } from './packageCpuDetach.js';

// These parts have a root at Z=0 and extend toward +Z. Stabilators are bilateral.
const ONE_SIDED = /\/fins\/fin_(wedge|radiator_grid|swept_smuggler|crystalline|delta)\.glb$/;
const REFLECTION = new Matrix4().makeScale(1, 1, -1);
const mirroredGeometries = new WeakMap();

export function oneSidedFinRecord(record) {
  return ONE_SIDED.test('/' + String(record?.url || ''));
}

// Complete the shared derivative before stepped composition can yield to another
// residency pass. Later ships use the cached derivative, even if its donor retires.
export async function prepareMirroredFinGeometries(geometries) {
  const missing = [...new Set(geometries)].filter(source => !mirroredGeometries.has(source));
  if (!missing.length) return;
  const release = retainPackageGeometryCpu(missing);
  try {
    const refill = await rehydrateDetachedGeometries(missing);
    if (refill.errors.length || missing.some(isPackageGeometryDetached)) {
      throw new Error(`Modular fin CPU refill failed: ${JSON.stringify(refill.errors)}`);
    }
    for (const source of missing) mirroredFinGeometry(source);
  } finally {
    release();
  }
}

export function handedFinPlacement(record, placement) {
  if (!oneSidedFinRecord(record)) return placement;
  const outward = new Vector3(0, 0, 1);
  if (placement.quaternion) outward.applyQuaternion(placement.quaternion);
  else if (placement.rotation) outward.applyEuler(new Euler().fromArray(placement.rotation));
  // An authored mount may already turn a fin outboard. Never reflect it twice.
  return outward.z * (placement.position?.[2] || 0) < -1e-6
    ? { ...placement, mirrorFinZ: true } : placement;
}

export function reflectFinMatrix(matrix) {
  return new Matrix4().multiplyMatrices(REFLECTION, matrix).multiply(REFLECTION);
}

export function mirroredFinGeometry(source) {
  let geometry = mirroredGeometries.get(source);
  if (geometry) return geometry;
  if (isPackageGeometryDetached(source)) {
    throw new Error('Modular fin CPU attributes must be refilled before reflection');
  }
  const vertexCount = source.getAttribute('position')?.count;
  for (const attribute of Object.values(source.attributes)) {
    const array = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
    const stride = attribute.isInterleavedBufferAttribute ? attribute.data.stride : attribute.itemSize;
    if (!vertexCount || attribute.count !== vertexCount || array.length < vertexCount * stride) {
      throw new Error('Modular fin CPU attribute payload is incomplete');
    }
  }
  if (Object.keys(source.morphAttributes || {}).length || source.hasAttribute('skinIndex')) {
    throw new Error('Modular fin reflection requires rigid geometry');
  }
  geometry = source.clone();
  // Decode normalized attributes before reflection; preserve UVs and vertex sharing.
  for (const name of ['position', 'normal', 'tangent']) {
    const attribute = source.getAttribute(name);
    if (!attribute) continue;
    const values = new Float32Array(attribute.count * attribute.itemSize);
    for (let i = 0; i < attribute.count; i++) {
      for (let c = 0; c < attribute.itemSize; c++) {
        const sign = c === 2 || (name === 'tangent' && c === 3) ? -1 : 1;
        values[i * attribute.itemSize + c] = attribute.getComponent(i, c) * sign;
      }
    }
    geometry.setAttribute(name, new Float32BufferAttribute(values, attribute.itemSize));
  }
  const indices = source.index
    ? Array.from(source.index.array)
    : Array.from({ length: source.getAttribute('position').count }, (_, i) => i);
  for (let i = 0; i < indices.length; i += 3) {
    [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    ...geometry.userData,
    spacefaceSharedAsset: true,
    spacefaceBatchKey: `${source.userData?.spacefaceBatchKey || source.uuid}|fin-port`,
  };
  mirroredGeometries.set(source, geometry);
  // Package/source residency outlives its live instances. Dispose the derived shared
  // resource with that source, never when one ship releases its instance.
  const dispose = () => {
    source.removeEventListener('dispose', dispose);
    mirroredGeometries.delete(source);
    geometry.dispose();
  };
  source.addEventListener('dispose', dispose);
  return geometry;
}

export function mirroredFinNode(source) {
  const object = source.clone(false);
  reflectFinMatrix(source.matrix).decompose(object.position, object.quaternion, object.scale);
  object.updateMatrix();
  if (source.geometry) object.geometry = mirroredFinGeometry(source.geometry);
  return object;
}

export function mirroredFinPrimitive(source) {
  return { ...source, key: `${source.key}|fin-port`,
    geometry: mirroredFinGeometry(source.geometry), matrix: reflectFinMatrix(source.matrix) };
}
