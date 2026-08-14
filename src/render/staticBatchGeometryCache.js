// Cache merged static-batch geometries so the second same-class ship does not re-clone,
// transform, and merge every plate. Each consumer still clones the cached buffer so entity
// dispose cannot steal another ship's GPU resource.

const DEFAULT_LIMIT = 48;
const cache = new Map();

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

export function takeCachedStaticBatchGeometry(key) {
  if (!key) return null;
  const cached = cache.get(key);
  if (!cached || typeof cached.clone !== 'function') return null;
  return cached.clone();
}

export function rememberStaticBatchGeometry(key, geometry, limit = DEFAULT_LIMIT) {
  if (!key || !geometry) return geometry;
  if (cache.has(key)) return geometry;
  if (cache.size >= limit) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, geometry);
  return geometry;
}

export function clearStaticBatchGeometryCacheForTests() {
  cache.clear();
}

export function staticBatchGeometryCacheSize() {
  return cache.size;
}
