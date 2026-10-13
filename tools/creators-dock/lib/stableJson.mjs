// Deterministic JSON for dock projects, exports, and agent responses.
// Key order is sorted. Array order is preserved. No timestamps.

export function stableStringify(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

export function safeStableStringify(value) {
  try {
    return stableStringify(value);
  } catch (error) {
    return stableStringify({ ok: false, issues: ['scene could not be cloned'] });
  }
}

function boxedPrimitive(value) {
  return value instanceof String || value instanceof Number || value instanceof Boolean;
}

export function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  const skipToJSON = boxedPrimitive(value);
  for (const key of Object.keys(value).sort()) {
    if (skipToJSON && key === 'toJSON' && typeof value[key] === 'function') continue;
    out[key] = sortValue(value[key]);
  }
  return out;
}

export function sameJson(a, b) {
  return stableStringify(a) === stableStringify(b);
}
