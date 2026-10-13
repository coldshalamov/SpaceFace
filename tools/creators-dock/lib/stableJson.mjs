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
  let proto = Object.getPrototypeOf(value);
  const chain = new Set();
  while (proto && proto !== Object.prototype && typeof proto === 'object' && !chain.has(proto)) {
    chain.add(proto);
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor' || key === 'toJSON' || Object.prototype.hasOwnProperty.call(out, key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      if (!descriptor) continue;
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        if (typeof descriptor.value === 'function') continue;
        writeData(out, key, detachData(descriptor.value, seen));
      } else if (typeof descriptor.get === 'function' && key !== 'grid') {
        // Grid getters are copied by the walk below. Reading every inherited
        // getter would count a function-prototype grid that must stay unread.
        try {
          const read = descriptor.get.call(value);
          if (read && typeof read === 'object') writeData(out, key, detachData(read, seen));
        } catch (error) {
          // An inherited getter refused. Leave that key off the detach.
        }
      }
    }
    proto = Object.getPrototypeOf(proto);
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

function captureLive(value, seen = new Set(), records = []) {
  if (!value || typeof value !== 'object' || seen.has(value) || boxedPrimitive(value)) return records;
  seen.add(value);
  if (Array.isArray(value)) {
    const items = [];
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        items.push(descriptor.value);
        captureLive(descriptor.value, seen, records);
      } else {
        items.push(undefined);
      }
    }
    records.push({ kind: 'array', object: value, length: value.length, items });
    return records;
  }
  const entries = [];
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'toJSON') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    entries.push({
      key,
      value: descriptor.value,
      enumerable: descriptor.enumerable !== false,
    });
    captureLive(descriptor.value, seen, records);
  }
  records.push({ kind: 'object', object: value, entries });
  return records;
}

function writeLive(object, key, value, enumerable) {
  try {
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: enumerable !== false,
      writable: true,
      value,
    });
    return true;
  } catch (error) {
    try {
      object[key] = value;
    } catch (assignError) {
      return false;
    }
  }
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return !!descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') && descriptor.value === value;
}

function restoreLive(records) {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (record.kind === 'array') {
      const array = record.object;
      for (let index = 0; index < record.items.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(array, String(index));
        const current = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
          ? descriptor.value
          : undefined;
        if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') && current === record.items[index]) continue;
        writeLive(array, String(index), record.items[index], true);
      }
      if (array.length !== record.length) {
        try {
          array.length = record.length;
        } catch (error) {
          // A sealed length cannot be shrunk. The caller must not treat that as success.
        }
      }
      continue;
    }
    for (const entry of record.entries) {
      const descriptor = Object.getOwnPropertyDescriptor(record.object, entry.key);
      const current = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ? descriptor.value
        : undefined;
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') && current === entry.value) continue;
      writeLive(record.object, entry.key, entry.value, entry.enumerable);
    }
  }
}

function rememberArray(array, entries, seen) {
  if (!Array.isArray(array) || seen.has(array)) return;
  seen.add(array);
  const items = [];
  for (let i = 0; i < array.length; i += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(array, String(i));
    items.push(descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined);
  }
  entries.push({ array, items, length: array.length });
  for (const item of items) {
    if (item && typeof item === 'object') walkInheritedArrays(item, seen, entries);
  }
}

function walkInheritedArrays(value, seen, entries) {
  if (!value || typeof value !== 'object' || seen.has(value) || boxedPrimitive(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        walkInheritedArrays(descriptor.value, seen, entries);
      }
    }
    return;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'toJSON') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    walkInheritedArrays(descriptor.value, seen, entries);
  }
  let proto = Object.getPrototypeOf(value);
  const chain = new Set();
  while (proto && proto !== Object.prototype && typeof proto === 'object' && !chain.has(proto)) {
    chain.add(proto);
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor' || key === 'toJSON' || key === 'grid') continue;
      if (Object.prototype.hasOwnProperty.call(value, key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      if (!descriptor) continue;
      let read;
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        if (typeof descriptor.value === 'function') continue;
        read = descriptor.value;
      } else if (typeof descriptor.get === 'function') {
        try {
          read = descriptor.get.call(value);
        } catch (error) {
          continue;
        }
      } else {
        continue;
      }
      if (Array.isArray(read)) rememberArray(read, entries, seen);
      else if (read && typeof read === 'object') walkInheritedArrays(read, seen, entries);
    }
    proto = Object.getPrototypeOf(proto);
  }
}

export function snapshotInheritedArrays(root) {
  const entries = [];
  walkInheritedArrays(root, new Set(), entries);
  return entries;
}

export function restoreInheritedArrays(entries) {
  if (!entries) return;
  for (const entry of entries) {
    const array = entry.array;
    if (!Array.isArray(array)) continue;
    for (let i = 0; i < entry.items.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(array, String(i));
      const current = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ? descriptor.value
        : undefined;
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') && current === entry.items[i]) continue;
      writeLive(array, String(i), entry.items[i], true);
    }
    if (array.length !== entry.length) {
      try {
        array.length = entry.length;
      } catch (error) {
        // A sealed length keeps the pushed null. Callers must not store that array.
      }
    }
  }
}

const protectedStack = [];
let definePropertyBase = null;

function protectedHas(obj) {
  for (let i = protectedStack.length - 1; i >= 0; i -= 1) {
    if (protectedStack[i].has(obj)) return true;
  }
  return false;
}

export function protectLiveObjects(objects) {
  const set = objects instanceof Set ? objects : new Set(objects || []);
  if (protectedStack.length === 0) {
    definePropertyBase = Object.defineProperty;
    Object.defineProperty = function shieldedDefine(obj, prop, desc) {
      // Sealing null onto a live field cannot be repaired. Replacing the scene
      // grid itself still goes through so the history layer can put the original grid back.
      if (desc && Object.prototype.hasOwnProperty.call(desc, 'value') && desc.value === null
        && desc.configurable === false && prop !== 'grid' && protectedHas(obj)) {
        return obj;
      }
      return definePropertyBase.call(Object, obj, prop, desc);
    };
  }
  protectedStack.push(set);
  return set;
}

export function unprotectLiveObjects() {
  protectedStack.pop();
  if (protectedStack.length === 0 && definePropertyBase) {
    Object.defineProperty = definePropertyBase;
    definePropertyBase = null;
  }
}

function addLiveObject(set, value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  set.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        addLiveObject(set, descriptor.value, seen);
      }
    }
    return;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'toJSON') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    addLiveObject(set, descriptor.value, seen);
  }
}

export function liveObjectsIn(values) {
  const set = new Set();
  for (const value of values) addLiveObject(set, value);
  return set;
}

function probeToJSON(value, seen = new Set()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return;
  if (boxedPrimitive(value)) return;
  seen.add(value);
  const toJSON = readToJSON(value);
  if (typeof toJSON === 'function') {
    const records = captureLive(value);
    const arrays = snapshotInheritedArrays(value);
    const detached = detachData(value);
    try {
      toJSON.call(detached);
    } finally {
      // The detach must not keep the live actor. Put the caller's fields back
      // even when toJSON reached that actor through the outer objects array.
      restoreLive(records);
      restoreInheritedArrays(arrays);
    }
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
