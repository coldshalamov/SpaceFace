// Shared immutable static batches have a cache owner and explicit object/temporary borrowers.
const DEFAULT_LIMIT = 48;
const cache = new Map();
const records = new WeakMap();
const objectLeases = new WeakMap();

export function staticBatchGeometryCacheKey(bucket) {
  if (!bucket) return '';
  const urls = [...(bucket.urls || [])].sort().join('\n');
  const parts = (bucket.entries || []).map((entry) => {
    const elements = entry && entry.partMatrix && entry.partMatrix.elements;
    const name = entry && entry.primitive && entry.primitive.name || '';
    return `${name}:${elements ? Array.from(elements).join(',') : ''}`;
  }).join(';');
  const tags = bucket.tags || {};
  return `${urls}|${tags.lod || 'always'}|${tags.damageRole || ''}|${parts}`;
}
function finish(record) {
  if (!record || record.residentCount !== 0 || record.refs !== 0 || record.disposed) return;
  record.disposed = true;
  try { record.geometry.dispose?.(); } catch { /* continue releasing other borrowers */ }
}
function retire(record) {
  if (!record) return;
  record.residentCount--;
  finish(record);
}
export function takeCachedStaticBatchGeometry(key) {
  const record = key && cache.get(key);
  return record && !record.disposed ? record.geometry : null;
}
export function rememberStaticBatchGeometry(key, geometry, limit = DEFAULT_LIMIT) {
  if (!key || !geometry) return geometry;
  const existing = cache.get(key);
  if (existing) {
    // Concurrent builds can finish the same key. The losing geometry was never published.
    if (existing.geometry !== geometry && !records.has(geometry)) {
      try { geometry.dispose?.(); } catch { /* the resident winner remains valid */ }
    }
    return existing.geometry;
  }
  let record = records.get(geometry);
  if (record?.disposed) throw new Error('Cannot cache a disposed static batch geometry');
  if (!record) {
    record = { geometry, refs: 0, residentCount: 0, disposed: false };
    records.set(geometry, record);
  }
  // Claim the new cache key before evicting an older key that may alias this same geometry.
  record.residentCount++;
  while (cache.size >= Math.max(1, limit)) {
    const oldest = cache.keys().next().value;
    const old = cache.get(oldest);
    cache.delete(oldest);
    retire(old);
  }
  (geometry.userData || (geometry.userData = {})).spacefaceSharedAsset = true;
  cache.set(key, record);
  return geometry;
}
export function retainStaticBatchGeometry(geometry) {
  const record = geometry && records.get(geometry);
  if (!record || record.disposed) return null;
  record.refs++;
  let released = false;
  return () => {
    if (released) return false;
    released = true;
    record.refs--;
    finish(record);
    return true;
  };
}
export function retainStaticBatchGeometryForObject(object) {
  if (!object || objectLeases.has(object)) return false;
  const release = retainStaticBatchGeometry(object.geometry);
  if (!release) return false;
  objectLeases.set(object, release);
  return true;
}
export function releaseStaticBatchGeometryForObject(object) {
  const release = object && objectLeases.get(object);
  if (!release) return false;
  objectLeases.delete(object);
  release();
  return true;
}
export function isManagedStaticBatchGeometry(geometry) {
  return !!geometry && records.has(geometry);
}
export function retainStaticBatchGeometryTree(root) {
  root?.traverse?.(retainStaticBatchGeometryForObject);
}
export function releaseStaticBatchGeometryTree(root) {
  root?.traverse?.(releaseStaticBatchGeometryForObject);
}
export function clearStaticBatchGeometryCacheForTests() {
  for (const record of cache.values()) retire(record);
  cache.clear();
}
export function staticBatchGeometryCacheSize() {
  return cache.size;
}
