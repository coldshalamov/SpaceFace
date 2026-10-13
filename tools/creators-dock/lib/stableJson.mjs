// Deterministic JSON for dock projects, exports, and agent responses.
// Key order is sorted. Array order is preserved. No timestamps.

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

function readToJSON(value) {
  let current = value;
  const seen = new Set();
  while (current && (typeof current === 'object' || typeof current === 'function') && !seen.has(current)) {
    seen.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, 'toJSON');
    if (descriptor) {
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) return descriptor.value;
      if (typeof descriptor.get === 'function') {
        try {
          return descriptor.get.call(value);
        } catch (error) {
          return undefined;
        }
      }
      return undefined;
    }
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

export function detachData(value, seen = new Map()) {
  if (value === null || value === undefined) return value;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return value;
  if (type === 'number') return Number.isFinite(value) ? value : null;
  if (type !== 'object') return undefined;
  if (boxedPrimitive(value)) return value.valueOf();
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const out = [];
    seen.set(value, out);
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        out.length = i + 1;
        continue;
      }
      out[i] = detachData(descriptor.value, seen);
    }
    return out;
  }
  const out = {};
  seen.set(value, out);
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'toJSON') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    writeData(out, key, detachData(descriptor.value, seen));
  }
  if (!Object.prototype.hasOwnProperty.call(out, 'grid')) {
    let current = value;
    const chain = new Set();
    while (current && typeof current === 'object' && !chain.has(current)) {
      chain.add(current);
      const descriptor = Object.getOwnPropertyDescriptor(current, 'grid');
      if (descriptor) {
        if (typeof descriptor.get === 'function') {
          try {
            const read = descriptor.get.call(value);
            if (read && typeof read === 'object') writeData(out, 'grid', detachData(read, seen));
          } catch (error) {
            // The getter refused. The detach simply has no grid.
          }
        }
        break;
      }
      current = Object.getPrototypeOf(current);
    }
  }
  return out;
}

function probeToJSON(value, seen = new Set()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return;
  if (boxedPrimitive(value)) return;
  seen.add(value);
  const toJSON = readToJSON(value);
  if (typeof toJSON === 'function') {
    const detached = detachData(value);
    toJSON.call(detached);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        probeToJSON(descriptor.value, seen);
      }
    }
    return;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'toJSON') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    probeToJSON(descriptor.value, seen);
  }
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
    if (key === 'toJSON') continue;
    const slot = dataValue(value, key);
    if (!slot || typeof slot.value === 'function') continue;
    writeData(out, key, sortValue(slot.value));
  }
  return out;
}

export function stableStringify(value) {
  probeToJSON(value);
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

export function sameJson(a, b) {
  return stableStringify(a) === stableStringify(b);
}
