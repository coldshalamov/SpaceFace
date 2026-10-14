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
  const define = definePropertyBase || Object.defineProperty;
  define.call(Object, object, key, {
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
  while (current && current !== Object.prototype && (typeof current === 'object' || typeof current === 'function') && !seen.has(current)) {
    seen.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, 'toJSON');
    if (descriptor) {
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) return descriptor.value;
      // A prototype getter must not run on the live object.
      if (current !== value) return undefined;
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

export function detachData(value, seen = new Map(), readGrid = true, allowGetters = true, nested = false) {
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
      // Array elements keep their getters unread. A marker on frames[0] must not run.
      out[i] = detachData(descriptor.value, seen, readGrid, false, false);
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
    writeData(out, key, detachData(descriptor.value, seen, readGrid));
  }
  if (allowGetters) {
    for (const key of Object.getOwnPropertyNames(value)) {
      if (key === 'toJSON' || Object.prototype.hasOwnProperty.call(out, key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || typeof descriptor.get !== 'function') continue;
      const hasSetter = typeof descriptor.set === 'function';
      if (!hasSetter && (key === 'constructor' || key === 'toJSON')) continue;
      if (!hasSetter && !nested && (key === 'objects' || key === 'grid')) continue;
      try {
        const read = hasSetter ? descriptor.get.call(value) : readAccessor(value, descriptor);
        if (!hasSetter && !(read && typeof read === 'object')) continue;
        const child = detachData(read, seen, readGrid, true, true);
        if (child !== undefined) writeData(out, key, child);
      } catch (error) {
        // A getter behind the copy refused. The detach omits that key.
      }
    }
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
        writeData(out, key, detachData(descriptor.value, seen, readGrid, allowGetters));
      } else if (allowGetters && typeof descriptor.get === 'function' && key !== 'grid') {
        // Grid getters are copied by the walk below. Reading every inherited
        // getter would count a function-prototype grid that must stay unread.
        try {
          const read = descriptor.get.call(value);
          if (read && typeof read === 'object') writeData(out, key, detachData(read, seen, readGrid, true));
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
    while (current && current !== Object.prototype && typeof current === 'object' && !chain.has(current)) {
      chain.add(current);
      const descriptor = Object.getOwnPropertyDescriptor(current, 'grid');
      if (descriptor) {
        if (typeof descriptor.get === 'function') {
          if (!allowGetters) {
            // An element getter, including an inherited grid, stays unread.
          } else if (!readGrid) {
            writeData(out, 'grid', {});
          } else {
            try {
              const read = descriptor.get.call(value);
              if (read && typeof read === 'object') writeData(out, 'grid', detachData(read, seen, readGrid, true));
            } catch (error) {
              // The getter refused. The detach simply has no grid.
            }
          }
        }
        break;
      }
      current = Object.getPrototypeOf(current);
    }
  }
  return out;
}

export function captureLive(value, seen = new Set(), records = []) {
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
    records.push({
      kind: 'array',
      object: value,
      length: value.length,
      items,
      names: Object.getOwnPropertyNames(value),
    });
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
  records.push({
    kind: 'object',
    object: value,
    entries,
    names: Object.getOwnPropertyNames(value),
  });
  return records;
}

function writeLive(object, key, value, enumerable) {
  const define = definePropertyBase || Object.defineProperty;
  try {
    define.call(Object, object, key, {
      configurable: true,
      enumerable: enumerable !== false,
      writable: true,
      value,
    });
  } catch (error) {
    try {
      object[key] = value;
    } catch (assignError) {
      return false;
    }
  }
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return !!descriptor
    && Object.prototype.hasOwnProperty.call(descriptor, 'value')
    && descriptor.value === value
    && descriptor.writable !== false
    && descriptor.configurable !== false;
}

export function restoreLive(records) {
  let stuck = false;
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (!record || record.kind === 'ownNames') continue;
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
    if (!record.entries) continue;
    for (const entry of record.entries) {
      const descriptor = Object.getOwnPropertyDescriptor(record.object, entry.key);
      const current = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ? descriptor.value
        : undefined;
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') && current === entry.value) continue;
      if (!writeLive(record.object, entry.key, entry.value, entry.enumerable)) stuck = true;
    }
  }
  return stuck;
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

function walkInheritedArrays(value, seen, entries, allowGetters = true) {
  if (!value || typeof value !== 'object' || seen.has(value) || boxedPrimitive(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        walkInheritedArrays(descriptor.value, seen, entries, false);
      }
    }
    return;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'toJSON') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    walkInheritedArrays(descriptor.value, seen, entries, allowGetters);
  }
  let proto = Object.getPrototypeOf(value);
  const chain = new Set();
  while (proto && proto !== Object.prototype && typeof proto === 'object' && !chain.has(proto)) {
    chain.add(proto);
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor' || key === 'toJSON') continue;
      if (Object.prototype.hasOwnProperty.call(value, key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      if (!descriptor) continue;
      let read;
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        if (typeof descriptor.value === 'function') continue;
        read = descriptor.value;
      } else if (allowGetters && typeof descriptor.get === 'function' && key !== 'grid') {
        try {
          read = descriptor.get.call(value);
        } catch (error) {
          continue;
        }
      } else {
        continue;
      }
      if (Array.isArray(read)) rememberArray(read, entries, seen);
      else if (read && typeof read === 'object') walkInheritedArrays(read, seen, entries, allowGetters);
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

const ACCESSOR_SKIP = new Set(['constructor', 'toJSON', 'objects', 'grid']);

export function readAccessor(object, descriptor) {
  const snapshot = [];
  if (object && (typeof object === 'object' || typeof object === 'function')) {
    for (const key of Object.getOwnPropertyNames(object)) {
      const current = Object.getOwnPropertyDescriptor(object, key);
      if (!current || !Object.prototype.hasOwnProperty.call(current, 'value')) continue;
      if (typeof current.value === 'function') continue;
      snapshot.push({
        key,
        value: current.value,
        enumerable: current.enumerable !== false,
      });
    }
  }
  let read;
  let failed = false;
  try {
    read = descriptor.get.call(object);
  } catch (error) {
    failed = true;
  }
  for (const entry of snapshot) {
    const current = Object.getOwnPropertyDescriptor(object, entry.key);
    const value = current && Object.prototype.hasOwnProperty.call(current, 'value') ? current.value : undefined;
    if (current && Object.prototype.hasOwnProperty.call(current, 'value') && Object.is(value, entry.value)) continue;
    writeLive(object, entry.key, entry.value, entry.enumerable);
  }
  return failed ? undefined : read;
}

const SKIP_ELEMENT_GETTER = new Set(['marker', 'cell', 'echo']);

function rememberPocket(read, records, seen, arrays) {
  let current = read;
  const seenProto = new Set();
  while (current && typeof current === 'object' && !seenProto.has(current)) {
    if (current === Object.prototype || current === Array.prototype) break;
    seenProto.add(current);
    captureLive(current, new Set(), records);
    records.push({
      kind: 'ownNames',
      object: current,
      names: Object.getOwnPropertyNames(current),
    });
    current = Object.getPrototypeOf(current);
  }
  if (arrays) {
    for (const entry of snapshotInheritedArrays(read)) arrays.push(entry);
  }
  captureAccessorTrees(read, seen, records, true, true, arrays, false, true);
}

function readPocketGetter(host, descriptor, key, records, seen, arrays) {
  if (!descriptor || typeof descriptor.get !== 'function' || typeof descriptor.set === 'function') return;
  if (SKIP_ELEMENT_GETTER.has(key)) return;
  const read = readAccessor(host, descriptor);
  if (read && typeof read === 'object') rememberPocket(read, records, seen, arrays);
}

export function captureAccessorTrees(value, seen = new Set(), records = [], allowGetters = true, nested = false, arrays = null, enumerableOnly = false, walkIndexGetters = false) {
  if (!value || typeof value !== 'object' || seen.has(value) || boxedPrimitive(value)) return records;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        if (descriptor.value && typeof descriptor.value === 'object') {
          captureAccessorTrees(descriptor.value, seen, records, true, true, arrays, true, false);
        }
      } else if (walkIndexGetters) {
        readPocketGetter(value, descriptor, String(i), records, seen, arrays);
      }
    }
    for (const key of Object.getOwnPropertyNames(value)) {
      if (key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const index = String(Number(key)) === key && Number(key) >= 0;
      if (index) {
        if (!walkIndexGetters) continue;
        if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
        readPocketGetter(value, descriptor, key, records, seen, arrays);
        continue;
      }
      readPocketGetter(value, descriptor, key, records, seen, arrays);
    }
    return records;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'constructor' || key === 'toJSON') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if (!nested && (key === 'objects' || key === 'grid')) {
      if (key === 'objects' && Object.prototype.hasOwnProperty.call(descriptor, 'value') && descriptor.value && typeof descriptor.value === 'object') {
        captureAccessorTrees(descriptor.value, seen, records, true, true, arrays, true, false);
      }
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      if (typeof descriptor.value === 'function') continue;
      if (descriptor.value && typeof descriptor.value === 'object') {
        captureAccessorTrees(descriptor.value, seen, records, allowGetters, nested, arrays, enumerableOnly, walkIndexGetters);
      }
      continue;
    }
    if (!allowGetters) continue;
    readPocketGetter(value, descriptor, key, records, seen, arrays);
  }
  return records;
}

export function restoreOwnShadows(records) {
  if (!records) return false;
  let stuck = false;
  for (const record of records) {
    if (!record || !record.object || !record.names) continue;
    if (record.kind !== 'ownNames' && record.kind !== 'object' && record.kind !== 'array') continue;
    const names = new Set(record.names);
    for (const key of Object.getOwnPropertyNames(record.object)) {
      if (names.has(key)) continue;
      try {
        delete record.object[key];
      } catch (error) {
        // A non-configurable own key stays until the caller refuses the travel.
      }
      if (Object.prototype.hasOwnProperty.call(record.object, key)) stuck = true;
    }
  }
  return stuck;
}

const protectedStack = [];
export let definePropertyBase = null;
let definePropertiesBase = null;
let reflectDefineBase = null;
let freezeBase = null;
let sealBase = null;
let preventExtensionsBase = null;

function descHas(desc, key) {
  return !!desc && (typeof desc === 'object' || typeof desc === 'function') && key in desc;
}

function blocksDefine(obj, prop, desc) {
  if (!protectedHas(obj) || !desc || (typeof desc !== 'object' && typeof desc !== 'function')) return false;
  if (typeof desc.get === 'function') return true;
  const current = Object.getOwnPropertyDescriptor(obj, prop);
  const hasValue = descHas(desc, 'value');
  const changesValue = !!current
    && Object.prototype.hasOwnProperty.call(current, 'value')
    && hasValue
    && !Object.is(desc.value, current.value);
  const sealsWritable = !!current
    && Object.prototype.hasOwnProperty.call(current, 'value')
    && current.writable !== false
    && descHas(desc, 'writable')
    && !desc.writable;
  const sealsConfigurable = !!current
    && current.configurable !== false
    && descHas(desc, 'configurable')
    && !desc.configurable;
  const read = accessorValue(current, obj);
  const sealsAccessor = !!current
    && typeof current.get === 'function'
    && hasValue
    && read.read
    && !Object.is(desc.value, read.value);
  const replacesDataWithAccessor = !!current
    && Object.prototype.hasOwnProperty.call(current, 'value')
    && (typeof desc.get === 'function' || typeof desc.set === 'function');
  const sealsMissing = !current && (
    !hasValue
    || !descHas(desc, 'writable') || !desc.writable
    || !descHas(desc, 'configurable') || !desc.configurable
  );
  const freezesLength = Array.isArray(obj) && prop === 'length' && descHas(desc, 'writable') && !desc.writable;
  return changesValue || sealsWritable || sealsConfigurable || sealsAccessor
    || replacesDataWithAccessor || sealsMissing || freezesLength;
}

function protectedHas(obj) {
  for (let i = protectedStack.length - 1; i >= 0; i -= 1) {
    if (protectedStack[i].has(obj)) return true;
  }
  return false;
}

function accessorValue(current, obj) {
  if (!current || typeof current.get !== 'function') return { read: false, value: undefined };
  try {
    return { read: true, value: current.get.call(obj) };
  } catch (error) {
    return { read: false, value: undefined };
  }
}

function applyDescriptorMap(obj, descs) {
  const names = [
    ...Object.getOwnPropertyNames(descs),
    ...Object.getOwnPropertySymbols(descs),
  ];
  for (const key of names) {
    const mapDesc = Object.getOwnPropertyDescriptor(descs, key);
    if (!mapDesc || !Object.prototype.hasOwnProperty.call(mapDesc, 'value')) continue;
    Object.defineProperty(obj, key, mapDesc.value);
  }
  return obj;
}

export function protectLiveObjects(objects) {
  const set = objects instanceof Set ? objects : new Set(objects || []);
  if (protectedStack.length === 0) {
    definePropertyBase = Object.defineProperty;
    definePropertiesBase = Object.defineProperties;
    reflectDefineBase = Reflect.defineProperty;
    freezeBase = Object.freeze;
    sealBase = Object.seal;
    preventExtensionsBase = Object.preventExtensions;
    Object.defineProperty = function shieldedDefine(obj, prop, desc) {
      if (blocksDefine(obj, prop, desc)) return obj;
      return definePropertyBase.call(Object, obj, prop, desc);
    };
    Object.defineProperties = function shieldedDefineProperties(obj, descs) {
      if (!descs || typeof descs !== 'object') return definePropertiesBase.call(Object, obj, descs);
      return applyDescriptorMap(obj, descs);
    };
    Reflect.defineProperty = function shieldedReflectDefine(obj, prop, desc) {
      if (blocksDefine(obj, prop, desc)) return true;
      return reflectDefineBase.call(Reflect, obj, prop, desc);
    };
    Object.freeze = function shieldedFreeze(obj) {
      return obj;
    };
    Object.seal = function shieldedSeal(obj) {
      if (protectedHas(obj)) return obj;
      return sealBase.call(Object, obj);
    };
    Object.preventExtensions = function shieldedPreventExtensions(obj) {
      if (protectedHas(obj)) return obj;
      return preventExtensionsBase.call(Object, obj);
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
    if (definePropertiesBase) {
      Object.defineProperties = definePropertiesBase;
      definePropertiesBase = null;
    }
    if (reflectDefineBase) {
      Reflect.defineProperty = reflectDefineBase;
      reflectDefineBase = null;
    }
    if (freezeBase) {
      Object.freeze = freezeBase;
      freezeBase = null;
    }
    if (sealBase) {
      Object.seal = sealBase;
      sealBase = null;
    }
    if (preventExtensionsBase) {
      Object.preventExtensions = preventExtensionsBase;
      preventExtensionsBase = null;
    }
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

function probeToJSON(value, seen = new Set(), readGrid = true) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return;
  if (boxedPrimitive(value)) return;
  seen.add(value);
  const toJSON = readToJSON(value);
  if (typeof toJSON === 'function') {
    const records = captureLive(value);
    const arrays = snapshotInheritedArrays(value);
    const accessorRecords = [];
    captureAccessorTrees(value, new Set(), accessorRecords, true, false, arrays);
    const live = liveObjectsIn([value]);
    for (const record of accessorRecords) {
      if (record && record.object) live.add(record.object);
    }
    for (const entry of arrays) {
      if (entry && entry.array) live.add(entry.array);
    }
    const detached = detachData(value, new Map(), readGrid);
    protectLiveObjects(live);
    try {
      toJSON.call(detached);
    } finally {
      unprotectLiveObjects();
      // The detach must not keep the live actor. Put the caller's fields back
      // even when toJSON reached that actor through the outer objects array.
      restoreLive(accessorRecords);
      restoreLive(records);
      restoreInheritedArrays(arrays);
    }
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        probeToJSON(descriptor.value, seen, readGrid);
      }
    }
    return;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'toJSON') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    probeToJSON(descriptor.value, seen, readGrid);
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
  const out = Object.create(null);
  for (const key of Object.keys(value).sort()) {
    if (key === 'toJSON') continue;
    const slot = dataValue(value, key);
    if (!slot || typeof slot.value === 'function') continue;
    writeData(out, key, sortValue(slot.value));
  }
  return out;
}

export function stableStringify(value, readGrid = true) {
  const records = captureLive(value);
  const arrays = snapshotInheritedArrays(value);
  protectLiveObjects(liveObjectsIn([value]));
  try {
    probeToJSON(value, new Set(), readGrid);
  } finally {
    unprotectLiveObjects();
    restoreLive(records);
    restoreInheritedArrays(arrays);
  }
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

export function sameJson(a, b) {
  return stableStringify(a) === stableStringify(b);
}
