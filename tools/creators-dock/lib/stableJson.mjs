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

function writeData(object, key, value) {
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function dataValue(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return undefined;
  return { present: true, value: descriptor.value };
}

export function sortValue(value) {
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < value.length; i += 1) {
      const slot = dataValue(value, String(i));
      out.push(slot ? sortValue(slot.value) : null);
    }
    return out;
  }
  if (boxedPrimitive(value)) return sortValue(value.valueOf());
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const slot = dataValue(value, key);
    if (!slot) continue;
    writeData(out, key, sortValue(slot.value));
  }
  return out;
}

export function sameJson(a, b) {
  return stableStringify(a) === stableStringify(b);
}
