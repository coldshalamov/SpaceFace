// Pure XZ scene model for Creator's Dock.
// No Node builtins, no physics step. The lab is the only simulator.

import { GLYPH_PHASES, GLYPHS, KERN } from './glyphs.mjs';
import { actorStroke, fieldStroke, markerStroke, OBJECTIVE_REACH } from './inspector.mjs';
import {
  captureAccessorTrees,   captureLive, detachData, liveObjectsIn, protectLiveObjects,
  readAccessor, restoreInheritedArrays, restoreLive, restoreOwnShadows, sameJson, snapshotInheritedArrays,
  sortValue, unprotectLiveObjects,
} from './stableJson.mjs';

export const PROJECT_SCHEMA = 'spaceface.creatorsDock.v1';
export const REQUEST_SCHEMA = 'spaceface.creatorsDockRequest.v1';
export const RESPONSE_SCHEMA = 'spaceface.creatorsDockResponse.v1';
export const EXPORT_SCHEMA = 'spaceface.creatorsDockExport.v1';

export const ID_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

const ACTOR_KEYS = [
  'id', 'kind', 'role', 'profile', 'x', 'y', 'z', 'heading', 'velX', 'velY', 'velZ',
  'angularVelocity', 'team', 'factionId', 'isPlayer', 'persistent',
  'overrides', 'loadout', 'groupId', 'label',
];
const TRIGGER_KEYS = ['id', 'kind', 'shape', 'x', 'z', 'radius', 'assertion', 'label', 'groupId', 'labOnly'];
const OBJECTIVE_KEYS = [
  'id', 'kind', 'x', 'z', 'radius', 'metric', 'signal', 'op', 'value', 'label', 'groupId', 'labOnly',
];
const FIELD_KEYS = [
  'id', 'kind', 'fieldKind', 'gameplay', 'x', 'z', 'radius', 'label', 'groupId',
  'place', 'force', 'note',
];
const ROUTE_KEYS = ['id', 'kind', 'from', 'to', 'label', 'gameplay', 'groupId'];
const ATTACHMENT_KEYS = ['id', 'kind', 'defId', 'ownerAlias', 'targetAlias', 'restLength', 'label', 'groupId'];

export const OBJECT_KEY_SETS = Object.freeze({
  actor: ACTOR_KEYS,
  trigger: TRIGGER_KEYS,
  objective: OBJECTIVE_KEYS,
  field: FIELD_KEYS,
  route: ROUTE_KEYS,
  attachment: ATTACHMENT_KEYS,
});

const CLONE_REJECT = Symbol('clone-reject');

function isDataDescriptor(descriptor) {
  return !!descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value');
}

function ownDataEntries(object) {
  const entries = [];
  for (const key of Object.getOwnPropertyNames(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!isDataDescriptor(descriptor)) continue;
    entries.push([key, descriptor.value]);
  }
  return entries;
}

function arrayDataAt(array, index) {
  const descriptor = Object.getOwnPropertyDescriptor(array, String(index));
  if (!descriptor) return { kind: 'hole' };
  if (!isDataDescriptor(descriptor)) return { kind: 'getter' };
  return { kind: 'data', value: descriptor.value };
}

function readToJSON(value) {
  let current = value;
  const chain = new Set();
  while (current && typeof current === 'object' && !chain.has(current)) {
    chain.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, 'toJSON');
    if (descriptor) {
      if (isDataDescriptor(descriptor)) return descriptor.value;
      // A prototype getter must not run against the live receiver.
      if (current !== value) return undefined;
      if (typeof descriptor.get === 'function') return descriptor.get.call(value);
    }
    if (current === Object.prototype) break;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

function writeData(object, key, value) {
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function snapshot(value, seen = new Map()) {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const out = [];
    seen.set(value, out);
    for (let i = 0; i < value.length; i += 1) {
      const slot = arrayDataAt(value, i);
      if (slot.kind === 'data') out[i] = snapshot(slot.value, seen);
      else out.length = i + 1;
    }
    return out;
  }
  const out = {};
  seen.set(value, out);
  for (const [key, child] of ownDataEntries(value)) writeData(out, key, snapshot(child, seen));
  return out;
}

function containsForbiddenNull(value, seen = new Set()) {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const slot = arrayDataAt(value, i);
      if (slot.kind !== 'data' || containsForbiddenNull(slot.value, seen)) return true;
    }
    return false;
  }
  for (const [key, child] of ownDataEntries(value)) {
    if (key === 'isPlayer') continue;
    if (containsForbiddenNull(child, seen)) return true;
  }
  return false;
}

function nullWasIntroduced(original, key, next) {
  if (next !== null || key === 'isPlayer') return false;
  if (!original || typeof original !== 'object') return true;
  if (!Object.prototype.hasOwnProperty.call(original, key)) return true;
  return original[key] != null;
}

function accessorHidData(original, produced) {
  if (!original || typeof original !== 'object' || !produced || typeof produced !== 'object') return false;
  if (Array.isArray(original) || Array.isArray(produced)) return false;
  for (const [key, prev] of ownDataEntries(original)) {
    if (key === 'isPlayer' || prev == null) continue;
    const descriptor = Object.getOwnPropertyDescriptor(produced, key);
    if (descriptor && !isDataDescriptor(descriptor)) return true;
  }
  return false;
}

function introducedNull(original, produced) {
  if (produced === null) return original != null;
  if (!produced || typeof produced !== 'object' || !original || typeof original !== 'object') return false;
  if (produced === original) return false;
  if (Array.isArray(produced)) {
    if (!Array.isArray(original)) return containsForbiddenNull(produced);
    for (let i = 0; i < produced.length; i += 1) {
      const slot = arrayDataAt(produced, i);
      if (slot.kind !== 'data') return true;
      const next = slot.value;
      if (nullWasIntroduced(original, i, next)) return true;
      if (next && typeof next === 'object') {
        const prev = original[i];
        if (prev && typeof prev === 'object') {
          if (introducedNull(prev, next)) return true;
        } else if (containsForbiddenNull(next)) return true;
      }
    }
    return false;
  }
  for (const [key, next] of ownDataEntries(produced)) {
    if (nullWasIntroduced(original, key, next)) return true;
    const prev = original[key];
    if (Array.isArray(next) && !Array.isArray(prev) && containsForbiddenNull(next)) return true;
    if (next && typeof next === 'object') {
      if (prev && typeof prev === 'object') {
        if (introducedNull(prev, next)) return true;
      } else if (containsForbiddenNull(next)) return true;
    }
  }
  return false;
}

function inheritedDataValue(object, key) {
  if (!object || (typeof object !== 'object' && typeof object !== 'function')) return undefined;
  if (Object.prototype.hasOwnProperty.call(object, key)) return undefined;
  let current = Object.getPrototypeOf(object);
  const seen = new Set();
  while (current && (typeof current === 'object' || typeof current === 'function') && !seen.has(current)) {
    seen.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) {
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) return descriptor.value;
      return undefined;
    }
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

function captureFields(object) {
  const toJSON = Object.prototype.hasOwnProperty.call(object, 'toJSON')
    ? Object.getOwnPropertyDescriptor(object, 'toJSON')
    : null;
  if (Array.isArray(object)) {
    const descriptors = [];
    for (let i = 0; i < object.length; i += 1) {
      descriptors[i] = Object.getOwnPropertyDescriptor(object, String(i)) || null;
    }
    return { kind: 'array', object, length: object.length, descriptors, toJSON };
  }
  const entries = ownDataEntries(object);
  const keys = entries.map(([key]) => key);
  const values = new Map(entries);
  const inheritedGrid = inheritedDataValue(object, 'grid');
  return {
    kind: 'object',
    object,
    keys,
    values,
    toJSON,
    inheritedGrid,
    hasInheritedGrid: inheritedGrid !== undefined,
  };
}

function captureTree(value, seen, records) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  records.push(captureFields(value));
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const slot = arrayDataAt(value, i);
      if (slot.kind === 'data') captureTree(slot.value, seen, records);
    }
    return;
  }
  for (const [, child] of ownDataEntries(value)) captureTree(child, seen, records);
}

function redefine(object, key, descriptor) {
  try {
    Object.defineProperty(object, key, descriptor);
    return;
  } catch (error) {
    // A non-configurable property cannot be redefined. A writable one can still be assigned.
  }
  const current = Object.getOwnPropertyDescriptor(object, key);
  if (!current || !Object.prototype.hasOwnProperty.call(current, 'value') || current.writable === false) return;
  try {
    object[key] = descriptor.value;
  } catch (error) {
    // Non-writable in practice. The history layer must not return this null.
  }
}

function restoreRecord(record) {
  const object = record.object;
  if (record.kind === 'array') {
    try {
      object.length = 0;
    } catch (error) {
      // length can be non-writable after a hostile toJSON
    }
    for (let i = 0; i < record.length; i += 1) {
      const descriptor = record.descriptors[i];
      if (descriptor) redefine(object, String(i), descriptor);
    }
    try {
      object.length = record.length;
    } catch (error) {
      // length can be non-writable after a hostile toJSON
    }
  } else {
    for (const key of Object.getOwnPropertyNames(object)) {
      if (key === 'toJSON' || record.values.has(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        let removed = false;
        try {
          delete object[key];
          removed = !Object.prototype.hasOwnProperty.call(object, key);
        } catch (error) {
          removed = false;
        }
        if (!removed && key === 'grid' && record.hasInheritedGrid && descriptor.writable !== false) {
          try {
            object[key] = record.inheritedGrid;
          } catch (error) {
            // The own null stays until the history layer swaps the live scene.
          }
        }
      }
    }
    for (const key of record.keys) {
      redefine(object, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: record.values.get(key),
      });
    }
  }
  try {
    if (record.toJSON) Object.defineProperty(object, 'toJSON', record.toJSON);
    else if (Object.prototype.hasOwnProperty.call(object, 'toJSON')) delete object.toJSON;
  } catch (error) {
    // non-configurable toJSON stays; the clone is still rejected
  }
}

function restoreTree(records) {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    try {
      restoreRecord(records[i]);
    } catch (error) {
      // One record must not prevent the rest from being put back, and must not escape clone.
    }
  }
}

function gridAccessorState(value) {
  if (!value || typeof value !== 'object') return null;
  const descriptor = Object.getOwnPropertyDescriptor(value, 'grid');
  if (!descriptor || typeof descriptor.get !== 'function') return null;
  let current;
  try {
    current = descriptor.get.call(value);
  } catch (error) {
    current = undefined;
  }
  return { descriptor, value: current };
}

function snapshotGridFields(grid) {
  if (!grid || typeof grid !== 'object') return null;
  const fields = new Map();
  for (const key of Object.getOwnPropertyNames(grid)) {
    const descriptor = Object.getOwnPropertyDescriptor(grid, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    const field = descriptor.value;
    fields.set(key, {
      enumerable: descriptor.enumerable !== false,
      value: field,
      items: Array.isArray(field) ? field.slice() : null,
    });
  }
  return fields;
}

function writeGridField(object, key, value, enumerable) {
  try {
    Object.defineProperty(object, key, {
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
  return !!descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') && descriptor.value === value;
}

function restoreGridFields(grid, fields) {
  if (!fields || !grid || typeof grid !== 'object') return;
  for (const [key, saved] of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(grid, key);
    const same = descriptor
      && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      && descriptor.value === saved.value;
    if (!same) writeGridField(grid, key, saved.value, saved.enumerable);
    if (saved.items && Array.isArray(saved.value)) {
      for (let i = 0; i < saved.items.length; i += 1) {
        if (saved.value[i] !== saved.items[i]) writeGridField(saved.value, String(i), saved.items[i], true);
      }
      if (saved.value.length !== saved.items.length) {
        try {
          saved.value.length = saved.items.length;
        } catch (error) {
          // A non-writable length keeps the pushed null; the clone must not store it.
        }
      }
    }
  }
  for (const key of [...Object.getOwnPropertyNames(grid)]) {
    if (fields.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(grid, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    try {
      delete grid[key];
    } catch (error) {
      // A non-configurable extra field stays until the clone is rejected.
    }
  }
}

function gridFieldsStillNull(grid, fields) {
  if (!grid || typeof grid !== 'object' || !fields) return false;
  for (const [key, saved] of fields) {
    if (saved.value == null) continue;
    const descriptor = Object.getOwnPropertyDescriptor(grid, key);
    const current = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : undefined;
    if (current === null) return true;
    if (saved.items && Array.isArray(current) && !saved.items.includes(null) && current.includes(null)) return true;
  }
  const size = fields.get('size');
  if ((!size || size.value != null) && grid.size === null) return true;
  const pad = fields.get('pad');
  const padWasClean = !pad || !pad.items || !pad.items.includes(null);
  if (padWasClean && Array.isArray(grid.pad) && grid.pad.includes(null)) return true;
  return false;
}

function readGridValue(value) {
  try {
    return value.grid;
  } catch (error) {
    return undefined;
  }
}

function restoreGridAccessor(value, saved) {
  if (!saved || saved.value == null) return;
  if (readGridValue(value) === saved.value) return;
  try {
    value.grid = saved.value;
  } catch (error) {
    // The setter refused the previous value. Fall through to a data property.
  }
  if (readGridValue(value) === saved.value) return;
  try {
    Object.defineProperty(value, 'grid', {
      configurable: true,
      enumerable: saved.descriptor.enumerable !== false,
      writable: true,
      value: saved.value,
    });
  } catch (error) {
    // A non-configurable getter stays. The clone carries the pre-call value instead.
  }
}

function copyGetterGrid(source, out) {
  if (!out || typeof out !== 'object' || Array.isArray(out)) return;
  if (Object.prototype.hasOwnProperty.call(out, 'grid') && out.grid != null) return;
  let current = source;
  const seen = new Set();
  while (current && current !== Object.prototype && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, 'grid');
    if (descriptor) {
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        if (descriptor.value && typeof descriptor.value === 'object') writeData(out, 'grid', detachData(descriptor.value));
        return;
      }
      if (typeof descriptor.get === 'function') {
        let read;
        try {
          read = descriptor.get.call(source);
        } catch (error) {
          return;
        }
        if (read && typeof read === 'object') writeData(out, 'grid', detachData(read));
      }
      return;
    }
    current = Object.getPrototypeOf(current);
  }
}

function dataFields(object) {
  const fields = [];
  if (!object || typeof object !== 'object') return fields;
  for (const [key, field] of ownDataEntries(object)) {
    if (key === 'toJSON' || typeof field === 'function') continue;
    fields.push([key, field]);
  }
  return fields;
}

function wipedObject(original, produced) {
  if (!original || typeof original !== 'object' || Array.isArray(original)) return false;
  if (!produced || typeof produced !== 'object' || Array.isArray(produced) || produced === original) return false;
  if (!dataFields(original).length) return false;
  return dataFields(produced).length === 0;
}

function materialize(value, key, seen, readGrid = true, readIndexGetters = false) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return value;
  if (type === 'number') return Number.isFinite(value) ? value : null;
  if (type === 'bigint') throw new TypeError('Do not know how to serialize a BigInt');
  if (type !== 'object') return undefined;
  if (seen.has(value)) throw new TypeError('Converting circular structure to JSON');
  const before = snapshot(value);
  const toJSON = readToJSON(value);
  let carriedGrid;
  if (typeof toJSON === 'function') {
    seen.add(value);
    const gridAccessor = readGrid ? gridAccessorState(value) : null;
    const gridFields = gridAccessor ? snapshotGridFields(gridAccessor.value) : null;
    const callerRecords = captureLive(value);
    const inheritedArrays = snapshotInheritedArrays(value);
    const accessorRecords = [];
    captureAccessorTrees(value, new Set(), accessorRecords, true, false, inheritedArrays);
    if (gridAccessor && gridAccessor.value && typeof gridAccessor.value === 'object') {
      captureLive(gridAccessor.value, new Set(), callerRecords);
      inheritedArrays.push(...snapshotInheritedArrays(gridAccessor.value));
      captureAccessorTrees(gridAccessor.value, new Set(), accessorRecords, true, true, inheritedArrays);
    }
    // toJSON runs on a detached tree so a non-configurable write cannot stick to the live scene.
    const detached = detachData(value);
    const live = liveObjectsIn([value, gridAccessor && gridAccessor.value]);
    for (const entry of inheritedArrays) {
      if (entry && entry.array) live.add(entry.array);
    }
    for (const record of accessorRecords) {
      if (record && record.object) live.add(record.object);
    }
    protectLiveObjects(live);
    let produced;
    try {
      produced = toJSON.call(detached, key);
    } finally {
      unprotectLiveObjects();
      restoreLive(accessorRecords);
      restoreLive(callerRecords);
      restoreInheritedArrays(inheritedArrays);
      restoreOwnShadows(accessorRecords);
    }
    restoreGridAccessor(value, gridAccessor);
    if (gridFields) restoreGridFields(gridAccessor.value, gridFields);
    if (gridFields && gridFieldsStillNull(gridAccessor.value, gridFields)) return CLONE_REJECT;
    if (produced === null) return CLONE_REJECT;
    if (produced === detached) {
      const detachedGrid = gridAccessor ? detached.grid : gridFields && detached.grid;
      if (accessorHidData(before, produced) || introducedNull(before, produced)
        || (gridFields && gridFieldsStillNull(detachedGrid, gridFields))) {
        return CLONE_REJECT;
      }
      // Other return-this writes stay on the detach. Store the live pre-call data.
    } else if (produced === undefined) {
      return undefined;
    } else if (produced && typeof produced === 'object') {
      if (accessorHidData(before, produced) || introducedNull(before, produced)) return CLONE_REJECT;
      // {} must not erase a world that still has credits and the rest of its fields.
      if (!wipedObject(value, produced)) {
        const nested = materialize(produced, key, seen, readGrid);
        if (readGrid && nested && typeof nested === 'object' && !Array.isArray(nested) && nested.grid == null) {
          copyGetterGrid(value, nested);
        }
        return nested;
      }
    } else if (produced !== value) {
      return materialize(produced, key, seen, readGrid);
    }
    if (gridAccessor && gridAccessor.value != null) carriedGrid = gridAccessor.value;
  } else if (value instanceof String || value instanceof Number || value instanceof Boolean) {
    return materialize(value.valueOf(), key, seen, readGrid);
  } else {
    seen.add(value);
  }
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < value.length; i += 1) {
      const slot = arrayDataAt(value, i);
      let source;
      if (slot.kind === 'data') source = slot.value;
      else if (readIndexGetters && slot.kind === 'getter') {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || typeof descriptor.get !== 'function') return CLONE_REJECT;
        try {
          source = descriptor.get.call(value);
        } catch (error) {
          return CLONE_REJECT;
        }
      } else {
        return CLONE_REJECT;
      }
      const item = materialize(source, String(i), seen, false);
      if (item === CLONE_REJECT || item === undefined) return CLONE_REJECT;
      out.push(item);
    }
    return out;
  }
  const out = {};
  for (const [childKey, childValue] of ownDataEntries(value)) {
    const child = materialize(childValue, childKey, seen, readGrid, childKey === 'objects');
    if (child === CLONE_REJECT) return CLONE_REJECT;
    if (child !== undefined) writeData(out, childKey, child);
  }
  if (carriedGrid !== undefined && !Object.prototype.hasOwnProperty.call(out, 'grid')) {
    const child = materialize(carriedGrid, 'grid', seen, readGrid);
    if (child === CLONE_REJECT) return CLONE_REJECT;
    if (child !== undefined) writeData(out, 'grid', child);
  }
  if (readGrid) {
    copyGetterGrid(value, out);
    copyAccessors(value, out);
    copyInheritedFields(value, out);
  }
  return out;
}

function copyAccessors(source, out, nested = false) {
  if (!source || typeof source !== 'object' || !out || typeof out !== 'object' || Array.isArray(out)) return;
  for (const key of Object.getOwnPropertyNames(source)) {
    if (key === 'toJSON' || Object.prototype.hasOwnProperty.call(out, key)) continue;
    if (!nested && (key === 'objects' || key === 'grid')) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor || typeof descriptor.get !== 'function') continue;
    const hasSetter = typeof descriptor.set === 'function';
    if (!hasSetter && !nested && (key === 'objects' || key === 'grid')) continue;
    try {
      const read = hasSetter ? descriptor.get.call(source) : readAccessor(source, descriptor);
      if (!hasSetter && !(read && typeof read === 'object')) continue;
      const child = detachData(read, new Map(), true, true, true);
      if (child !== undefined) writeData(out, key, child);
    } catch (error) {
      // A getter refused. The stored scene omits that key.
    }
  }
}

function copyInheritedFields(source, out) {
  if (!source || typeof source !== 'object' || !out || typeof out !== 'object' || Array.isArray(out)) return;
  let proto = Object.getPrototypeOf(source);
  const chain = new Set();
  while (proto && proto !== Object.prototype && typeof proto === 'object' && !chain.has(proto)) {
    chain.add(proto);
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor' || key === 'toJSON' || Object.prototype.hasOwnProperty.call(out, key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      if (!descriptor) continue;
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        if (typeof descriptor.value === 'function') continue;
        const child = detachData(descriptor.value);
        if (child !== undefined) writeData(out, key, child);
      } else if (typeof descriptor.get === 'function' && key !== 'grid') {
        try {
          const read = descriptor.get.call(source);
          if (read && typeof read === 'object') writeData(out, key, detachData(read));
        } catch (error) {
          // An inherited getter refused. The stored scene omits that key.
        }
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
}

export function clone(value) {
  if (value == null) return value;
  const records = [];
  try {
    // A toJSON that returns null, deletes itself then returns null, or places
    // null over another field must not be stored. isPlayer null still clones
    // so the player canon can name that flag. A rejected toJSON must not leave
    // the caller's object mutated.
    captureTree(value, new Set(), records);
    const plain = materialize(value, '', new Set());
    if (plain === CLONE_REJECT || plain === undefined) {
      restoreTree(records);
      return null;
    }
    const text = JSON.stringify(plain);
    if (typeof text !== 'string') {
      restoreTree(records);
      return null;
    }
    return ownDataGrid(JSON.parse(text));
  } catch (error) {
    restoreTree(records);
    return null;
  }
}

function prototypeGridGetter(object) {
  let current = Object.getPrototypeOf(object);
  const seen = new Set();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, 'grid');
    if (!descriptor) {
      current = Object.getPrototypeOf(current);
      continue;
    }
    return !Object.prototype.hasOwnProperty.call(descriptor, 'value') && typeof descriptor.get === 'function';
  }
  return false;
}

function ownDataGrid(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return object;
  if (Object.prototype.hasOwnProperty.call(object, 'grid') || !prototypeGridGetter(object)) return object;
  let host = Object.getPrototypeOf(object);
  const seen = new Set();
  let descriptor;
  while (host && host !== Object.prototype && (typeof host === 'object' || typeof host === 'function') && !seen.has(host)) {
    seen.add(host);
    descriptor = Object.getOwnPropertyDescriptor(host, 'grid');
    if (descriptor) break;
    host = Object.getPrototypeOf(host);
  }
  if (!descriptor || host === Object.prototype || typeof descriptor.get !== 'function') return object;
  let inherited;
  try {
    inherited = descriptor.get.call(object);
  } catch (error) {
    return object;
  }
  if (inherited && typeof inherited === 'object') writeData(object, 'grid', detachData(inherited));
  return object;
}

function cloneScene(project) {
  let next;
  try {
    next = clone(project);
  } catch (error) {
    return null;
  }
  if (!next || typeof next !== 'object' || Array.isArray(next) || !Array.isArray(next.objects)) return null;
  for (const object of next.objects) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) return null;
  }
  return next;
}

function refuseUnstored(project) {
  return { ok: false, project, issues: ['scene could not be cloned'] };
}

function asObjectList(objects) {
  return Array.isArray(objects) ? objects : [];
}

function refuseLiveObjects(project) {
  if (!project || project.objects == null || Array.isArray(project.objects)) return null;
  return { ok: false, project, issues: ['objects must be an array'] };
}

export function sameProject(a, b) {
  return sameJson(a, b);
}

export function emptyProject(meta = {}) {
  return {
    schema: PROJECT_SCHEMA,
    id: meta.id || 'dock.untitled',
    title: meta.title || 'Untitled dock',
    description: meta.description || '',
    composition: meta.composition || 'custom',
    seed: meta.seed ?? 1,
    ticks: meta.ticks ?? 180,
    version: 1,
    evidenceClass: 'focused-fixture',
    runtimeProfile: 'focused-lab',
    standardInvariants: true,
    world: {
      fixtureProfile: 'empty-flight',
      sectorId: 'sector_helios_prime',
      mode: 'flight',
      physicsBackend: 'rapier-dynamic',
      flightBackend: 'v3',
      aiBackend: 'legacy',
      credits: 5000,
      ...(meta.world || {}),
    },
    grid: { size: 10, snap: true, ...(meta.grid || {}) },
    camera: { x: 0, z: 0, zoom: 3.2, ...(meta.camera || {}) },
    objects: [],
    frames: [{
      tick: 0,
      input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, fire: false },
    }],
    inputEvents: [],
    notes: {
      creatorsDock: '1',
      ...(meta.notes || {}),
    },
    fixtureExceptions: [
      'focused-fixture authored in Creator\'s Dock; not production-manifest evidence',
    ],
    observer: { enabled: false },
    traceSignals: [],
  };
}

export function objectById(project, id) {
  return asObjectList(project && project.objects).find((object) => object.id === id) || null;
}

export function actorsOf(project) {
  return asObjectList(project && project.objects).filter((object) => object.kind === 'actor');
}

export function issuesForObject(object) {
  const issues = [];
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    return ['object must be a plain object'];
  }
  if (typeof object.kind !== 'string' || !OBJECT_KEY_SETS[object.kind]) {
    issues.push(`unknown object kind "${object.kind}"`);
    return issues;
  }
  const allowed = new Set(OBJECT_KEY_SETS[object.kind]);
  for (const key of Object.getOwnPropertyNames(object)) {
    if (!allowed.has(key)) issues.push(`unknown field "${key}" on ${object.kind}`);
  }
  if (typeof object.id !== 'string' || !ID_RE.test(object.id)) {
    issues.push('id must match [A-Za-z_][A-Za-z0-9_-]{0,63}');
  }
  return issues;
}

function kindName(object) {
  if (!object || object.kind == null) return '';
  if (typeof object.kind === 'string') return object.kind;
  if (typeof object.kind === 'object') {
    const value = object.kind.valueOf();
    if (typeof value === 'string') return value;
  }
  return '';
}

function isActorKind(object) {
  return kindName(object) === 'actor';
}

function isPlayerActor(object) {
  return isActorKind(object) && object.isPlayer === true;
}

function nonBooleanPlayerIssue(object) {
  if (!isActorKind(object)) return null;
  if (!Object.prototype.hasOwnProperty.call(object, 'isPlayer')) return null;
  if (typeof object.isPlayer === 'boolean') return null;
  return `${object.id ? `${object.id}: ` : ''}isPlayer must be a boolean`;
}

function pushPlayerFlagIssues(issues, objects) {
  for (const object of asObjectList(objects)) {
    const issue = nonBooleanPlayerIssue(object);
    if (issue) issues.push(issue);
  }
}

function countPlayers(objects) {
  let count = 0;
  for (const object of asObjectList(objects)) {
    if (isPlayerActor(object)) count += 1;
  }
  return count;
}

function exactlyOnePlayerIssue(found) {
  return `scene needs exactly one player actor (found ${found})`;
}

function collectNestedPlayerFlags(value, path, issues, seen) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  const playerFlag = Object.getOwnPropertyDescriptor(value, 'isPlayer');
  if (isDataDescriptor(playerFlag) && typeof playerFlag.value !== 'boolean') {
    issues.push(`${path || 'project'}: isPlayer must be a boolean`);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const slot = arrayDataAt(value, index);
      if (slot.kind === 'data') collectNestedPlayerFlags(slot.value, `${path}[${index}]`, issues, seen);
    }
    return;
  }
  for (const [key, child] of ownDataEntries(value)) {
    if (key === 'isPlayer') continue;
    collectNestedPlayerFlags(child, path ? `${path}.${key}` : key, issues, seen);
  }
}

function propertySlot(object, key) {
  if (!object || typeof object !== 'object') return { kind: 'missing' };
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) return { kind: 'missing' };
  if (!isDataDescriptor(descriptor)) return { kind: 'accessor' };
  return { kind: 'data', value: descriptor.value };
}

function sceneObjects(project) {
  const slot = propertySlot(project, 'objects');
  return slot.kind === 'data' && Array.isArray(slot.value) ? slot.value : null;
}

export function playerCanonIssues(project) {
  const issues = [];
  const slot = propertySlot(project, 'objects');
  const objects = sceneObjects(project);
  if (slot.kind === 'data' && slot.value != null && !objects) issues.push('objects must be an array');
  let players = 0;
  for (const object of objects || []) {
    const label = object && object.id ? `${object.id}: ` : '';
    for (const issue of issuesForObject(object)) issues.push(`${label}${issue}`);
    if (isPlayerActor(object)) players += 1;
  }
  // A getter named objects must not run, and it is not evidence of zero players.
  if (slot.kind !== 'accessor' && players !== 1) issues.push(exactlyOnePlayerIssue(players));
  collectNestedPlayerFlags(project, 'project', issues, new Set());
  return issues;
}

export function requireOnePlayer(previous, result) {
  if (!result || result.ok === false) return result;
  const issues = playerCanonIssues(result.project);
  if (issues.length) return { ok: false, project: previous, issues };
  return result;
}

function playersAfterReplace(project, id, object) {
  let count = 0;
  for (const entry of asObjectList(project && project.objects)) {
    const row = entry && entry.id === id ? object : entry;
    if (isPlayerActor(row)) count += 1;
  }
  return count;
}

export function placePlayer(project) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const flags = [];
  pushPlayerFlagIssues(flags, project && project.objects);
  if (flags.length) return { ok: false, project, issues: flags };
  const found = countPlayers(project.objects);
  if (found > 1) return { ok: false, project, issues: [exactlyOnePlayerIssue(found)] };
  const existing = asObjectList(project && project.objects).find((object) => isPlayerActor(object));
  if (existing) {
    const stored = cloneScene(project);
    if (!stored) return refuseUnstored(project);
    const gated = requireOnePlayer(project, { ok: true, project: stored, id: existing.id, issues: [] });
    return gated.ok ? gated : { ok: false, project, issues: gated.issues };
  }
  let id = 'player';
  let n = 1;
  while (objectById(project, id)) {
    n += 1;
    id = `player_${n}`;
  }
  const added = addObject(project, {
    id,
    kind: 'actor',
    role: 'player',
    profile: 'ship.starter',
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    velX: 0,
    velY: 0,
    velZ: 0,
    angularVelocity: 0,
    team: 0,
    isPlayer: true,
    persistent: true,
    label: 'player',
  });
  return added.ok ? { ...added, id } : added;
}

export function setPlayer(project, id) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const target = objectById(project, id);
  if (!target || target.kind !== 'actor') return { ok: false, project, issues: ['the player has to be an actor'] };
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  for (const object of next.objects) {
    if (object.kind === 'actor') object.isPlayer = object.id === id;
  }
  const stored = cloneScene(next);
  if (!stored) return refuseUnstored(project);
  const gated = requireOnePlayer(project, { ok: true, project: stored, id, issues: [] });
  return gated.ok ? gated : { ok: false, project, issues: gated.issues };
}

export function clearPlayerFlag(project, id) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const target = objectById(project, id);
  if (!target || target.kind !== 'actor') return { ok: false, project, issues: ['the player has to be an actor'] };
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  const object = next.objects.find((row) => row && row.id === id);
  if (!object || object.kind !== 'actor') return refuseUnstored(project);
  object.isPlayer = false;
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function addObject(project, object) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const issues = issuesForObject(object);
  if (objectById(project, object && object.id)) issues.push(`duplicate id "${object && object.id}"`);
  pushPlayerFlagIssues(issues, [object]);
  pushPlayerFlagIssues(issues, project.objects);
  const found = countPlayers(project.objects) + (isPlayerActor(object) ? 1 : 0);
  if (found !== 1) issues.push(exactlyOnePlayerIssue(found));
  if (issues.length) return { ok: false, project, issues };
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  const placed = applySnap(object, next.grid);
  if (!placed) return refuseUnstored(project);
  next.objects = [...next.objects, placed];
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function replaceObject(project, id, object) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const issues = issuesForObject(object);
  if (object.id !== id) issues.push('replacement id must match the edited id');
  if (!objectById(project, id)) issues.push(`missing id "${id}"`);
  else {
    pushPlayerFlagIssues(issues, [object]);
    pushPlayerFlagIssues(issues, asObjectList(project.objects).filter((entry) => entry.id !== id));
    const found = playersAfterReplace(project, id, object);
    if (found !== 1) issues.push(exactlyOnePlayerIssue(found));
  }
  if (issues.length) return { ok: false, project, issues };
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  const snapped = applySnap(object, next.grid);
  if (!snapped) return refuseUnstored(project);
  next.objects = next.objects.map((entry) => (entry.id === id ? snapped : entry));
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function deleteObjects(project, ids) {
  const drop = new Set(ids || []);
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  const before = next.objects.length;
  next.objects = next.objects.filter((object) => !drop.has(object.id));
  if (next.objects.length === before) return { ok: false, project, issues: ['nothing deleted'] };
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function cloneObject(project, id, newId) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const source = objectById(project, id);
  if (!source) return { ok: false, project, issues: [`missing id "${id}"`] };
  if (typeof newId !== 'string' || !ID_RE.test(newId)) {
    return { ok: false, project, issues: ['newId is not a safe id'] };
  }
  const flags = [];
  pushPlayerFlagIssues(flags, [source]);
  pushPlayerFlagIssues(flags, project.objects);
  if (flags.length) return { ok: false, project, issues: flags };
  const copy = clone(source);
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) return refuseUnstored(project);
  copy.id = newId;
  copy.groupId = undefined;
  delete copy.groupId;
  if (copy.kind === 'actor') {
    copy.isPlayer = false;
    const step = (project.grid && project.grid.size) || 10;
    copy.x = (Number(copy.x) || 0) + step;
    copy.z = (Number(copy.z) || 0) + step;
    if (copy.label) copy.label = `${copy.label} copy`;
  } else if ('x' in copy) {
    const step = (project.grid && project.grid.size) || 10;
    copy.x = (Number(copy.x) || 0) + step;
    copy.z = (Number(copy.z) || 0) + step;
  }
  return addObject(project, copy);
}

export function expandIds(project, ids) {
  const wanted = new Set(ids || []);
  const objects = asObjectList(project && project.objects);
  const groups = new Set();
  for (const object of objects) {
    if (wanted.has(object.id) && object.groupId) groups.add(object.groupId);
  }
  const out = new Set(wanted);
  for (const object of objects) {
    if (object.groupId && groups.has(object.groupId)) out.add(object.id);
  }
  return [...out];
}

export function nudgeObjects(project, ids, dx, dz) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const move = new Set(expandIds(project, ids));
  if (!move.size) return { ok: false, project, issues: ['nothing to nudge'] };
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  for (const object of next.objects) {
    if (!move.has(object.id)) continue;
    if (!Number.isFinite(object.x) || !Number.isFinite(object.z)) continue;
    object.x = snapCoord(object.x + dx, next.grid);
    object.z = snapCoord(object.z + dz, next.grid);
  }
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function setVelocity(project, id, velX, velZ) {
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  const object = objectById(next, id);
  if (!object || object.kind !== 'actor') {
    return { ok: false, project, issues: [`"${id}" is not an actor`] };
  }
  if (!Number.isFinite(velX) || !Number.isFinite(velZ)) {
    return { ok: false, project, issues: ['velocity must be finite'] };
  }
  object.velX = velX;
  object.velZ = velZ;
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function groupObjects(project, ids, groupId) {
  if (typeof groupId !== 'string' || !ID_RE.test(groupId)) {
    return { ok: false, project, issues: ['groupId is not a safe id'] };
  }
  const wanted = new Set(ids || []);
  if (wanted.size < 2) return { ok: false, project, issues: ['group needs at least two ids'] };
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  let n = 0;
  for (const object of next.objects) {
    if (wanted.has(object.id)) {
      object.groupId = groupId;
      n += 1;
    }
  }
  if (n !== wanted.size) return { ok: false, project, issues: ['group id missing from the scene'] };
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function ungroupObjects(project, ids) {
  const refused = refuseLiveObjects(project);
  if (refused) return refused;
  const wanted = new Set(expandIds(project, ids));
  const next = cloneScene(project);
  if (!next) return refuseUnstored(project);
  for (const object of next.objects) {
    if (wanted.has(object.id)) delete object.groupId;
  }
  return requireOnePlayer(project, { ok: true, project: next, issues: [] });
}

export function snapCoord(n, grid) {
  if (!grid || !grid.snap || !(grid.size > 0)) return round6(n);
  return round6(Math.round(n / grid.size) * grid.size);
}

export function round6(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return x;
  return Math.round(x * 1e6) / 1e6;
}

function applySnap(object, grid) {
  let next;
  try {
    next = clone(object);
  } catch (error) {
    return null;
  }
  if (!next || typeof next !== 'object' || Array.isArray(next)) return null;
  if (Number.isFinite(next.x)) next.x = snapCoord(next.x, grid);
  if (Number.isFinite(next.z)) next.z = snapCoord(next.z, grid);
  return next;
}

export function worldToScreen(x, z, camera, view) {
  const zoom = camera.zoom || 1;
  return {
    sx: view.width / 2 + (x - camera.x) * zoom,
    sy: view.height / 2 - (z - camera.z) * zoom,
  };
}

export function screenToWorld(sx, sy, camera, view) {
  const zoom = camera.zoom || 1;
  return {
    x: camera.x + (sx - view.width / 2) / zoom,
    z: camera.z - (sy - view.height / 2) / zoom,
  };
}

function paintLayer(object) {
  if (!object) return 0;
  if (object.kind === 'actor') return 3;
  if (object.kind === 'route' || object.kind === 'attachment') return 2;
  if (object.kind === 'trigger' || object.kind === 'objective') return 1;
  if (object.kind === 'field') return 0;
  return 1;
}

const PAINTED_STROKE_PX = 0.5;
// Butt-capped dash reach. Far enough for the outer pixel of a 1px stroke
// (alive_bank at 0.521, the diamond centerline at 0.506) and short of the
// empty cap corners around 0.55 and the 0.6 probe that must stay empty.
const STROKE_REACH = 0.53;
const FIELD_DASH = [2, 6];
const MARKER_DASH = [4, 4];
const ROUTE_DASH = [6, 4];
function glyphAdvance(atlas, ch) {
  const glyph = atlas[ch];
  return glyph ? glyph[0] : 6;
}

function labelWidth(atlas, kern, text) {
  let width = 0;
  let prev = '';
  for (const ch of text) {
    width += glyphAdvance(atlas, ch) + (prev && kern[prev + ch] ? kern[prev + ch] : 0);
    prev = ch;
  }
  return width;
}

function labelInk(text, anchorX, anchorY, sx, sy, size, align) {
  const key = size === 12 ? '12' : '11';
  const atlas = GLYPHS[key];
  const kern = KERN[key];
  const px = Math.floor(sx);
  const py = Math.floor(sy);
  const source = String(text);
  let pen = align === 'right' ? anchorX - labelWidth(atlas, kern, source) : anchorX;
  let prev = '';
  for (const ch of source) {
    const glyph = atlas[ch];
    pen += prev && kern[prev + ch] ? kern[prev + ch] : 0;
    if (glyph) {
      const phase = Math.floor((((pen % 1) + 1) % 1) * GLYPH_PHASES) % GLYPH_PHASES;
      const origin = Math.floor(pen);
      const rows = glyph[1][phase];
      for (let r = 0; r < rows.length; r += 1) {
        const dy = rows[r][0];
        const min = rows[r][1];
        const bits = rows[r][2];
        if (Math.round(anchorY + dy) !== py) continue;
        const local = px - (origin + min);
        if (local >= 0 && local < 24 && (bits & (1 << local))) return true;
      }
      pen += glyph[0];
    } else pen += 6;
    prev = ch;
  }
  return false;
}

function dashOffset(along, dash, gap) {
  const period = dash + gap;
  let phase = along - Math.floor(along / period) * period;
  if (phase < 0) phase += period;
  if (phase <= dash) {
    return { alongOff: 0, inset: Math.min(phase, dash - phase), sign: 0 };
  }
  const past = phase - dash;
  const until = period - phase;
  if (past <= until) return { alongOff: past, inset: 0, sign: 1 };
  return { alongOff: until, inset: 0, sign: -1 };
}

function squareSupport(x, y) {
  const scale = Math.hypot(x, y) || 1;
  return 0.5 * (Math.abs(x) + Math.abs(y)) / scale;
}

function dashAccepted(perp, along, dash, gap, tx, ty) {
  const span = dashOffset(along, dash, gap);
  const absPerp = Math.abs(perp);
  if (span.alongOff === 0) return absPerp <= STROKE_REACH;
  const centerline = Math.hypot(span.alongOff, absPerp);
  if (centerline > STROKE_REACH) {
    // A 45-degree butt still paints the centerline 0.55px past the dash.
    // An axis-aligned ring cap at that distance does not: its square is shorter.
    const capReach = squareSupport(tx, ty) * 0.8;
    return absPerp <= 0.02 && span.alongOff <= capReach && span.alongOff <= 0.56;
  }
  const perpOut = Math.max(0, absPerp - PAINTED_STROKE_PX);
  const glen = Math.hypot(span.alongOff, perpOut);
  if (glen <= 1e-9) return true;
  const sp = perp >= 0 ? 1 : -1;
  const nx = -ty;
  const ny = tx;
  const gx = tx * span.sign * span.alongOff + nx * sp * perpOut;
  const gy = ty * span.sign * span.alongOff + ny * sp * perpOut;
  const capSupport = squareSupport(gx, gy);
  // A short dash can leave an empty pixel just inside the 0.53 centerline.
  // Painted short-dash caps in that band stay under this ratio; the empty one does not.
  if (dash <= 2 && centerline > 0.5 && glen > capSupport * 0.684) return false;
  // An outside trigger sample can land inside that same ball after the flat butt
  // has left the pixel. The inner side, a short place dash, and an axis-aligned
  // cap still paint; this outside diagonal does not.
  if (dash > 2 && perp > 0 && centerline > 0.515 && span.alongOff > 0.408
    && squareSupport(tx, ty) > 0.66 && absPerp < 0.34) return false;
  // A diagonal cap pixel reaches farther along the stroke than an axis-aligned one.
  // 0.722 keeps the diamond centerline (ratio 0.716) and drops empty ring caps above it.
  return glen <= capSupport * 0.722;
}

function isPixelCenter(sx, sy) {
  return Math.abs(sx - Math.floor(sx) - 0.5) <= 1e-6 && Math.abs(sy - Math.floor(sy) - 0.5) <= 1e-6;
}

function centerBeyondPaint(support, perp) {
  // A diagonal sample can lie on the stroke while the pixel center does not.
  // The center stays painted out to a fringe that closes as the radius lines
  // up with the pixel diagonal. Past that fringe the pixel is empty, so the
  // sample is not ink. An axis-aligned edge remains inside the fringe.
  if (support < 0.61) return false;
  if (support < 0.67) return perp > 0.89;
  return perp > 0.8 - (support - 0.682) * 4;
}

function bodyReach(dx, dy) {
  const support = squareSupport(dx, dy);
  // A 1px dash paints past the 0.53 centerline on the pixel that contains it.
  // Axis-aligned radii keep that fringe out past 0.8px. The same Euclidean
  // distance on a diagonal is the empty corner beside the stroke, so the reach
  // closes in as the radius lines up with the pixel diagonal.
  if (support <= 0.655) return 0.86;
  if (support >= 0.704) return 0.708;
  const t = (support - 0.655) / (0.704 - 0.655);
  return 0.86 + (0.708 - 0.86) * t;
}

function buttPastLimit(support) {
  // Distance past the geometric butt (half-width 0.5, flat cap). A diagonal
  // radius leaves less of the pixel on the cap, so the allowance shrinks.
  if (support < 0.6) return 0.4;
  if (support < 0.66) return 0.25;
  if (support < 0.7) return 0.2;
  return 0.15;
}

function dashBodyPixel(perp, along, dash, gap, dx, dy, sx, sy) {
  if (!isPixelCenter(sx, sy)) return false;
  const span = dashOffset(along, dash, gap);
  const reach = bodyReach(dx, dy);
  if (perp > reach) return false;
  if (span.alongOff === 0) return true;
  const support = squareSupport(dx, dy);
  const past = Math.hypot(span.alongOff, Math.max(0, perp - 0.5));
  if (past <= buttPastLimit(support)) return true;
  // The butt paints a little past the dash. How far depends on how diagonal
  // the radius is: an axis-aligned fringe stays painted farther out, and a
  // diagonal sample is empty once it leaves the dash.
  if (support <= 0.62 && span.alongOff <= 0.08) return true;
  if (support <= 0.65 && span.alongOff <= 0.312 && perp <= 0.662) return true;
  if (support <= 0.69 && span.alongOff <= 0.23 && perp <= 0.662) return true;
  if (support <= 0.7 && span.alongOff <= 0.05 && perp <= 0.662) return true;
  if (support <= 0.7 && span.alongOff <= 0.14 && perp <= 0.63) return true;
  // A shallow cap, inside half a pixel of the centerline, is still painted
  // on a place dash. The locked empty corners sit farther off that centerline.
  if (support <= 0.71 && span.alongOff <= 0.4 && perp <= 0.4) return true;
  if (support <= 0.707 && span.alongOff <= 0.24 && perp <= 0.51) return true;
  if (support <= 0.708 && span.alongOff <= 0.16 && perp <= 0.58) return true;
  // Painted butts the 0.4 along-limit misses. Each band is the measured
  // footprint of those pixels; the empty corners sit outside every band.
  if (support <= 0.535 && span.alongOff <= 0.414 && perp <= 0.136) return true;
  if (support <= 0.6059 && span.alongOff <= 0.409 && perp <= 0.4682) return true;
  if (support <= 0.6844 && span.alongOff <= 0.4587 && perp <= 0.2694) return true;
  if (support <= 0.6953 && span.alongOff <= 0.383 && perp <= 0.4233) return true;
  // The wide box around (588.5, 270.5) also covered an empty radius-20 butt.
  if (support > 0.7 && support <= 0.7064 && span.alongOff > 0.464 && span.alongOff <= 0.4663 && perp > 0.29 && perp <= 0.3028) return true;
  if (support > 0.701 && support <= 0.7071 && span.alongOff <= 0.4508 && perp <= 0.3787) return true;
  if (support > 0.699 && support <= 0.7059 && span.alongOff <= 0.4893 && perp <= 0.3389) return true;
  if (perp > 0.43 && perp <= 0.444 && span.alongOff <= 0.4928 && support <= 0.7058) return true;
  if (perp > 0.5007 && perp <= 0.5024 && span.alongOff <= 0.4645 && support <= 0.7063) return true;
  if (span.alongOff > 0.424 && span.alongOff <= 0.4285 && support <= 0.7042 && perp <= 0.4946) return true;
  if (support > 0.656 && support <= 0.6647 && span.alongOff <= 0.3809 && perp <= 0.5119) return true;
  if (span.alongOff > 0.5205 && span.alongOff <= 0.5221 && support <= 0.7 && perp <= 0.3) return true;
  // (118.5, 120.5) sits on this butt. A lower along-offset at the same support is empty.
  if (support > 0.7052 && support <= 0.7063 && span.alongOff > 0.614 && span.alongOff <= 0.6172 && perp > 0.35 && perp <= 0.3867) return true;
  if (support <= 0.6903 && span.alongOff <= 0.2533 && perp <= 0.6248) return true;
  if (perp > 0.43 && perp <= 0.4573 && span.alongOff <= 0.5253 && support <= 0.6919) return true;
  if (perp > 0.528 && perp <= 0.5361 && span.alongOff <= 0.4538 && support <= 0.6658) return true;
  if (support > 0.67 && support <= 0.6967 && span.alongOff <= 0.2956 && perp <= 0.6085) return true;
  return false;
}

const CONIC_WEIGHT = Math.SQRT1_2;
const CONIC_T_MAX = 0x3FFFFFFF;
const RING_FLATTEN_TOLERANCE = 0.5;
const ringModelCache = new Map();

function conicAt(conic, t) {
  const u = 1 - t;
  const w0 = u * u;
  const w1 = 2 * conic.w * t * u;
  const w2 = t * t;
  const denom = w0 + w1 + w2;
  return {
    x: (w0 * conic.p0.x + w1 * conic.p1.x + w2 * conic.p2.x) / denom,
    y: (w0 * conic.p0.y + w1 * conic.p1.y + w2 * conic.p2.y) / denom,
  };
}

function conicTooCurvy(start, mid, end) {
  const dx = Math.abs(mid.x - (start.x + end.x) * 0.5);
  const dy = Math.abs(mid.y - (start.y + end.y) * 0.5);
  return Math.max(dx, dy) > RING_FLATTEN_TOLERANCE;
}

function measureConic(conic, mint, start, maxt, end, depth, segs, acc) {
  const halft = (mint + maxt) >> 1;
  const mid = conicAt(conic, halft / CONIC_T_MAX);
  if (depth < 8 && ((maxt - mint) >> 10) && conicTooCurvy(start, mid, end)) {
    measureConic(conic, mint, start, halft, mid, depth + 1, segs, acc);
    measureConic(conic, halft, mid, maxt, end, depth + 1, segs, acc);
    return;
  }
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  segs.push({
    t0: mint / CONIC_T_MAX,
    t1: maxt / CONIC_T_MAX,
    d0: acc.distance,
    d1: acc.distance + chord,
  });
  acc.distance += chord;
}

function ringModel(radius) {
  const cached = ringModelCache.get(radius);
  if (cached) return cached;
  const right = Math.PI / 2;
  const conics = [];
  const segs = [];
  const acc = { distance: 0 };
  for (let quad = 0; quad < 4; quad += 1) {
    const a0 = quad * right;
    const a1 = a0 + right;
    const conic = {
      p0: { x: radius * Math.cos(a0), y: radius * Math.sin(a0) },
      p1: { x: radius * (Math.cos(a0) - Math.sin(a0)), y: radius * (Math.sin(a0) + Math.cos(a0)) },
      p2: { x: radius * Math.cos(a1), y: radius * Math.sin(a1) },
      w: CONIC_WEIGHT,
    };
    const before = segs.length;
    measureConic(conic, 0, conic.p0, CONIC_T_MAX, conic.p2, 0, segs, acc);
    for (let i = before; i < segs.length; i += 1) segs[i].quad = quad;
    conics.push(conic);
  }
  const model = { conics, segs };
  ringModelCache.set(radius, model);
  return model;
}

function conicAngle(point, quad) {
  let angle = Math.atan2(point.y, point.x);
  if (angle < 0) angle += Math.PI * 2;
  if (quad === 3 && angle < Math.PI) angle += Math.PI * 2;
  return angle;
}

function ringMeasuredAlong(radius, angle) {
  const model = ringModel(radius);
  const quad = Math.min(3, Math.max(0, Math.floor(angle / (Math.PI / 2))));
  const conic = model.conics[quad];
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (conicAngle(conicAt(conic, mid), quad) < angle) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  let seg = null;
  for (let i = 0; i < model.segs.length; i += 1) {
    const candidate = model.segs[i];
    if (candidate.quad === quad && t <= candidate.t1) {
      seg = candidate;
      break;
    }
  }
  if (!seg) seg = model.segs[model.segs.length - 1];
  const span = seg.t1 - seg.t0;
  return span ? seg.d0 + (seg.d1 - seg.d0) * ((t - seg.t0) / span) : seg.d0;
}

function angleAtAlong(radius, along) {
  const circ = ringMeasuredAlong(radius, Math.PI * 2);
  let target = along % circ;
  if (target < 0) target += circ;
  let lo = 0;
  let hi = Math.PI * 2;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (ringMeasuredAlong(radius, mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function outerButtEnd(dx, dy, radius, along, dash, gap) {
  const span = dashOffset(along, dash, gap);
  if (!(span.alongOff > 0) || span.sign === 0) return null;
  const circ = ringMeasuredAlong(radius, Math.PI * 2);
  let butt = span.sign > 0 ? along - span.alongOff : along + span.alongOff;
  butt = ((butt % circ) + circ) % circ;
  const angle = angleAtAlong(radius, butt);
  const ox = (radius + PAINTED_STROKE_PX) * Math.cos(angle);
  const oy = (radius + PAINTED_STROKE_PX) * Math.sin(angle);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let lo = radius - PAINTED_STROKE_PX;
  let hi = radius + PAINTED_STROKE_PX;
  for (const [u, min, max] of [[ux, dx - 0.5, dx + 0.5], [uy, dy - 0.5, dy + 0.5]]) {
    if (Math.abs(u) < 1e-9) {
      if (0 < min || 0 > max) { lo = 1; hi = 0; break; }
      continue;
    }
    let t0 = min / u;
    let t1 = max / u;
    if (t0 > t1) [t0, t1] = [t1, t0];
    lo = Math.max(lo, t0);
    hi = Math.min(hi, t1);
  }
  return {
    span,
    dist: Math.hypot(ox - dx, oy - dy),
    inside: Math.abs(ox - dx) <= 0.5 && Math.abs(oy - dy) <= 0.5,
    lx: ox - dx,
    ly: oy - dy,
    chord: hi > lo ? hi - lo : 0,
  };
}

function outerButtPixel(dx, dy, radius, along, dash, gap, signed) {
  // The flat cap is the radial segment from half a pixel inside the centerline
  // to half a pixel outside it. A pixel paints when that segment still crosses
  // the square at the dash phase.
  if (!(signed > 0) || dash < 4) return false;
  const perp = signed;
  const support = squareSupport(dx, dy);
  const span = dashOffset(along, dash, gap);
  const nearCenter = span.alongOff > 0.1 && span.alongOff <= 0.18
    && perp > 0.55 && perp <= 0.62 && support > 0.7 && support <= 0.708;
  const outerFringe = span.alongOff > 0.34 && span.alongOff <= 0.37
    && perp > 0.5 && perp <= 0.53 && support > 0.69 && support <= 0.706;
  // Just outside the half-width, the outer end is still in the pixel.
  const outerNear = span.alongOff > 0.1 && span.alongOff <= 0.16
    && perp > 0.65 && perp <= 0.72 && support > 0.68 && support <= 0.70;
  // Farther out, the same end is still inside. The empty square beside it
  // sits at a lower perpendicular (the place pixel at perp 0.675).
  const fartherOuter = span.alongOff > 0.2 && span.alongOff <= 0.23
    && perp > 0.69 && perp <= 0.73 && support > 0.66 && support < 0.68;
  // The cap covers a center a few hundredths outside the half-width when the
  // butt chord is still about a quarter pixel. A shorter chord there is empty.
  const outerLip = span.alongOff > 0.46 && span.alongOff < 0.49
    && perp > 0.5 && perp < 0.52 && support > 0.695 && support < 0.705;
  // Outer part of the stroke, more than half a pixel past a diagonal butt.
  const outerHalf = perp > 0.35 && perp < PAINTED_STROKE_PX
    && span.alongOff > PAINTED_STROKE_PX && support > 0.7;
  // The pixel holds the outer endpoint and at least half of the cap.
  const halfCap = perp < PAINTED_STROKE_PX;
  if (!nearCenter && !outerFringe && !outerNear && !fartherOuter && !outerLip && !outerHalf && !halfCap) return false;
  const end = outerButtEnd(dx, dy, radius, along, dash, gap);
  if (!end) return false;
  if (outerHalf && end.chord >= 0.15) return true;
  if (halfCap && end.inside && end.chord >= PAINTED_STROKE_PX) return true;
  if (outerNear && end.inside && end.dist < 0.24) return true;
  if (fartherOuter && end.inside && end.dist < 0.32) return true;
  if (outerLip && end.inside && end.chord >= 0.24 && end.chord < 0.28 && end.dist > 0.46 && end.dist < 0.5) return true;
  if (!end.inside || (!nearCenter && !outerFringe)) return false;
  // The nearest empty outer end on these rings sits 0.207px from its center.
  if (nearCenter && end.dist > 0.19) return false;
  return true;
}

function shortPlaceCap(dx, dy, radius, along, dash, gap, signed) {
  // A short place dash still paints inside the ring where the cap crosses
  // more than half the pixel, just past the butt, on a diagonal radius.
  // The empty short-dash sample beside it is closer to the butt phase.
  if (!(dash <= 2) || !(signed < 0)) return false;
  const span = dashOffset(along, dash, gap);
  const perp = -signed;
  if (!(span.alongOff > 0.415 && span.alongOff < 0.44)) return false;
  if (!(perp > 0.15 && perp < 0.2)) return false;
  if (!(squareSupport(dx, dy) > 0.703)) return false;
  const end = outerButtEnd(dx, dy, radius, along, dash, gap);
  return !!end && end.chord >= 0.55 && end.chord < 0.6;
}

function pixelHoldsShortCap(dx, dy, radius, along, dash, gap, signed, sx, sy) {
  // The cap rule is defined on a point inside the pixel. A click on the
  // painted center uses that same rule: the center selects when the pixel
  // already contains a point the cap accepts.
  if (!isPixelCenter(sx, sy) || !(dash <= 2) || !(signed < 0)) return false;
  const span = dashOffset(along, dash, gap);
  const perp = -signed;
  if (!(span.alongOff > 0.2 && span.alongOff < 0.9 && perp < 0.7 && squareSupport(dx, dy) > 0.65)) return false;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const steps = [0.15, 0.35, 0.5, 0.65, 0.85];
  for (let i = 0; i < steps.length; i += 1) {
    for (let j = 0; j < steps.length; j += 1) {
      const pdx = dx + (x0 + steps[i]) - sx;
      const pdy = dy + (y0 + steps[j]) - sy;
      const distance = Math.hypot(pdx, pdy);
      const ps = distance - radius;
      if (!(ps < 0)) continue;
      let angle = Math.atan2(pdy, pdx);
      if (angle < 0) angle += Math.PI * 2;
      if (shortPlaceCap(pdx, pdy, radius, ringMeasuredAlong(radius, angle), dash, gap, ps)) return true;
    }
  }
  return false;
}

function ringOnInk(dx, dy, radius, pattern, sx, sy) {
  const distance = Math.hypot(dx, dy);
  if (!(radius > 0)) return distance <= 1e-6;
  const signed = distance - radius;
  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle += Math.PI * 2;
  const along = ringMeasuredAlong(radius, angle);
  const tx = -Math.sin(angle);
  const ty = Math.cos(angle);
  if (dashAccepted(signed, along, pattern[0], pattern[1], tx, ty)) {
    // A sample in an empty pixel must not select that pixel. The center is in
    // the gap, or it sits past the painted diagonal fringe. An axis-aligned
    // edge of a painted pixel still selects.
    if (!isPixelCenter(sx, sy)) {
      const cx = Math.floor(sx) + 0.5;
      const cy = Math.floor(sy) + 0.5;
      const cdx = dx + cx - sx;
      const cdy = dy + cy - sy;
      let cangle = Math.atan2(cdy, cdx);
      if (cangle < 0) cangle += Math.PI * 2;
      const centerSpan = dashOffset(ringMeasuredAlong(radius, cangle), pattern[0], pattern[1]);
      const sampleSpan = dashOffset(along, pattern[0], pattern[1]);
      const centerHit = ringOnInk(cdx, cdy, radius, pattern, cx, cy);
      if (!centerHit && (sampleSpan.alongOff > 0 || centerSpan.alongOff > 0)
        && !shortPlaceCap(dx, dy, radius, along, pattern[0], pattern[1], signed)) return false;
      if (!centerHit && sampleSpan.alongOff === 0 && centerSpan.alongOff === 0
        && centerBeyondPaint(squareSupport(cdx, cdy), Math.abs(Math.hypot(cdx, cdy) - radius))) return false;
    }
    return true;
  }
  if (isPixelCenter(sx, sy) && outerButtPixel(dx, dy, radius, along, pattern[0], pattern[1], signed)) return true;
  if (dashBodyPixel(Math.abs(signed), along, pattern[0], pattern[1], dx, dy, sx, sy)) return true;
  return pixelHoldsShortCap(dx, dy, radius, along, pattern[0], pattern[1], signed, sx, sy);
}

function objectiveHit(dx, dy) {
  const reach = OBJECTIVE_REACH;
  const edge = reach * Math.SQRT2;
  const verts = [[0, -reach], [reach, 0], [0, reach], [-reach, 0]];
  let onStroke = false;
  for (let i = 0; i < verts.length; i += 1) {
    const ax = verts[i][0];
    const ay = verts[i][1];
    const bx = verts[(i + 1) % verts.length][0];
    const by = verts[(i + 1) % verts.length][1];
    const ex = bx - ax;
    const ey = by - ay;
    const len2 = ex * ex + ey * ey;
    let t = ((dx - ax) * ex + (dy - ay) * ey) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const len = Math.hypot(ex, ey);
    const tx = ex / len;
    const ty = ey / len;
    const closestX = ax + ex * t;
    const closestY = ay + ey * t;
    const perp = Math.hypot(dx - closestX, dy - closestY);
    if (dashAccepted(perp, (i + t) * edge, MARKER_DASH[0], MARKER_DASH[1], tx, ty)) onStroke = true;
  }
  if (onStroke) return { inside: true, onStroke: true };
  return null;
}

function strokeSegment(sx, sy, x0, y0, x1, y1) {
  const ex = x1 - x0;
  const ey = y1 - y0;
  const len2 = ex * ex + ey * ey;
  if (!(len2 > 0)) return false;
  const t = ((sx - x0) * ex + (sy - y0) * ey) / len2;
  if (t < -1e-6 || t > 1 + 1e-6) return false;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(sx - (x0 + ex * clamped), sy - (y0 + ey * clamped)) <= PAINTED_STROKE_PX + 1e-6;
}

function arrowHeadContains(sx, sy, x0, y0, x1, y1) {
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const ax = x1;
  const ay = y1;
  const bx = x1 - 8 * Math.cos(angle - 0.4);
  const by = y1 - 8 * Math.sin(angle - 0.4);
  const cx = x1 - 8 * Math.cos(angle + 0.4);
  const cy = y1 - 8 * Math.sin(angle + 0.4);
  const c1 = (bx - ax) * (sy - ay) - (by - ay) * (sx - ax);
  const c2 = (cx - bx) * (sy - by) - (cy - by) * (sx - bx);
  const c3 = (ax - cx) * (sy - cy) - (ay - cy) * (sx - cx);
  return (c1 <= 1e-6 && c2 <= 1e-6 && c3 <= 1e-6) || (c1 >= -1e-6 && c2 >= -1e-6 && c3 >= -1e-6);
}

function actorInk(object, sx, sy, ox, oy, radius) {
  const distance = Math.hypot(sx - ox, sy - oy);
  if (radius > 0 && distance <= radius + STROKE_REACH) return true;
  const heading = object.heading || 0;
  const nose = Math.max(18, radius) + 16;
  if (strokeSegment(sx, sy, ox, oy, ox + Math.cos(heading) * nose, oy - Math.sin(heading) * nose)) return true;
  const caption = object.label || object.id;
  if (typeof caption === 'string' && caption && labelInk(caption, ox + 8, oy - Math.max(18, radius) - 6, sx, sy, 12)) return true;
  const vx = object.velX || 0;
  const vz = object.velZ || 0;
  if (!(vx || vz)) return false;
  const x1 = ox + vx * 2;
  const y1 = oy - vz * 2;
  if (strokeSegment(sx, sy, ox, oy, x1, y1)) return true;
  return arrowHeadContains(sx, sy, ox, oy, x1, y1);
}

function routeHasInk(along, length, perp, tx, ty) {
  if (!(length > 0) || along < -1e-6 || along > length + 1e-6) return false;
  const dash = ROUTE_DASH[0];
  const gap = ROUTE_DASH[1];
  const period = dash + gap;
  const cycles = Math.round(length / period);
  if (cycles > 0 && Math.abs(length - cycles * period) <= 1e-4 && along >= length - 1e-4) return false;
  return dashAccepted(perp, Math.min(Math.max(along, 0), length), dash, gap, tx, ty);
}

function linkOnInk(object, sx, sy, camera, view, project) {
  const from = objectById(project, object.from || object.ownerAlias);
  const to = objectById(project, object.to || object.targetAlias);
  if (!from || !to || !Number.isFinite(from.x) || !Number.isFinite(from.z)) return false;
  if (!Number.isFinite(to.x) || !Number.isFinite(to.z)) return false;
  const a = worldToScreen(from.x, from.z, camera, view);
  const b = worldToScreen(to.x, to.z, camera, view);
  const ex = b.sx - a.sx;
  const ey = b.sy - a.sy;
  const len = Math.hypot(ex, ey);
  if (len > 0) {
    const t = ((sx - a.sx) * ex + (sy - a.sy) * ey) / (len * len);
    if (t >= -1e-6 && t <= 1 + 1e-6) {
      const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.sx + ex * clamped;
      const py = a.sy + ey * clamped;
      const tx = ex / len;
      const ty = ey / len;
      const signed = (sx - px) * -ty + (sy - py) * tx;
      if (object.kind !== 'route') {
        if (Math.abs(signed) <= STROKE_REACH) return true;
      } else if (routeHasInk(clamped * len, len, signed, tx, ty)) return true;
    }
  }
  const label = object.label || object.kind;
  if (typeof label !== 'string' || !label) return false;
  return labelInk(label, (a.sx + b.sx) / 2, (a.sy + b.sy) / 2, sx, sy);
}

function markerMark(object, zoom) {
  const radius = object && typeof object.radius === 'number' && Number.isFinite(object.radius) ? object.radius : 0;
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return Math.max(12, radius * scale);
}

function fieldLabel(object, sx, sy, ox, oy) {
  const text = object.fieldKind === 'place' ? 'PLACE' : 'FIELD';
  return labelInk(text, ox - 18, oy, sx, sy, 11);
}

function markerLabel(object, sx, sy, ox, oy, zoom) {
  const label = object.label || object.id;
  if (typeof label !== 'string' || !label) return false;
  const mark = markerMark(object, zoom);
  if (object.kind === 'trigger') return labelInk(label, ox - mark - 8, oy, sx, sy, 11, 'right');
  if (object.kind === 'objective') return labelInk(label, ox + 12, oy + mark + 14, sx, sy, 11, 'left');
  return false;
}

function hitDisc(object, sx, sy, camera, view, zoom, draw, project) {
  if (object && (object.kind === 'route' || object.kind === 'attachment')) {
    if (!linkOnInk(object, sx, sy, camera, view, project)) return null;
    return { inside: true, onStroke: true };
  }
  if (!object || !Number.isFinite(object.x) || !Number.isFinite(object.z)) return null;
  const { sx: ox, sy: oy } = worldToScreen(object.x, object.z, camera, view);
  const dx = sx - ox;
  const dy = sy - oy;
  if (object.kind === 'objective') {
    const shape = objectiveHit(dx, dy);
    if (shape) return shape;
    if (markerLabel(object, sx, sy, ox, oy, zoom)) return { inside: true, onStroke: true };
    return null;
  }
  const overrideRadius = object.overrides && object.overrides.radius;
  const usesCollider = object.kind === 'actor'
    || (typeof overrideRadius === 'number' && Number.isFinite(overrideRadius));
  const radius = usesCollider
    ? actorStroke(object, zoom, draw)
    : object.kind === 'field'
      ? fieldStroke(object, zoom)
      : markerStroke(object, zoom);
  const distance = Math.hypot(dx, dy);
  if (usesCollider) {
    if (distance <= radius + 1e-6) return { inside: true, onStroke: false };
    if (object.kind === 'actor' && actorInk(object, sx, sy, ox, oy, radius)) {
      return { inside: true, onStroke: true };
    }
    return null;
  }
  const ring = object.kind === 'field' || object.kind === 'trigger';
  if (ring) {
    const pattern = object.kind === 'field' ? FIELD_DASH : MARKER_DASH;
    if (ringOnInk(dx, dy, radius, pattern, sx, sy)) {
      return { inside: true, onStroke: true, strokeDist: Math.abs(distance - radius) };
    }
    if (object.kind === 'trigger' && markerLabel(object, sx, sy, ox, oy, zoom)) {
      return { inside: true, onStroke: true };
    }
    if (object.kind === 'field' && fieldLabel(object, sx, sy, ox, oy)) {
      return { inside: true, onStroke: true };
    }
    return null;
  }
  if (distance > radius + 1e-6) return null;
  return { inside: true, onStroke: false };
}

export function hitTest(project, sx, sy, camera, view, draw) {
  const zoom = camera && Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  const objects = asObjectList(project && project.objects).map((object, index) => ({ object, index }));
  objects.sort((a, b) => {
    const layer = paintLayer(b.object) - paintLayer(a.object);
    if (layer !== 0) return layer;
    return b.index - a.index;
  });
  const hits = [];
  for (const entry of objects) {
    const disc = hitDisc(entry.object, sx, sy, camera, view, zoom, draw, project);
    if (disc) hits.push({ id: entry.object.id, kind: entry.object.kind, ...disc });
  }
  const actor = hits.find((hit) => hit.kind === 'actor');
  if (actor) return actor.id;
  const stroke = hits.find((hit) => hit.onStroke);
  if (stroke) {
    // A fringe hit on a longer ring must not cover a dash whose centerline is under the pointer.
    let chosen = stroke;
    if (Number.isFinite(stroke.strokeDist) && stroke.strokeDist > STROKE_REACH) {
      const core = hits.find((hit) => hit.onStroke && Number.isFinite(hit.strokeDist) && hit.strokeDist <= STROKE_REACH);
      if (core) chosen = core;
    }
    return chosen.id;
  }
  const objective = hits.find((hit) => hit.kind === 'objective');
  if (objective) return objective.id;
  return hits.length ? hits[0].id : null;
}

export function setCamera(project, camera) {
  const next = cloneScene(project);
  if (!next) return project;
  next.camera = { ...(next.camera || {}), ...camera };
  if (playerCanonIssues(next).length) return project;
  return next;
}

export function projectIssues(project) {
  const issues = [];
  if (!project || project.schema !== PROJECT_SCHEMA) {
    issues.push(`schema must be ${PROJECT_SCHEMA}`);
    return issues;
  }
  if (typeof project.id !== 'string' || !/^[a-z][a-z0-9_.:-]*$/i.test(project.id)) {
    issues.push('project id must match the lab id pattern');
  }
  if (!Number.isFinite(project.seed)) issues.push('seed must be a finite number');
  if (!Number.isInteger(project.ticks) || project.ticks < 1) issues.push('ticks must be a positive integer');
  const ids = new Set();
  for (const object of asObjectList(project && project.objects)) {
    if (object && ids.has(object.id)) issues.push(`duplicate id "${object.id}"`);
    if (object && object.id) ids.add(object.id);
  }
  issues.push(...playerCanonIssues(project));
  return issues;
}

export function sortedClone(value) {
  let stored;
  try {
    stored = clone(value);
  } catch (error) {
    return value;
  }
  if (stored == null || typeof stored !== 'object' || Array.isArray(stored)) return value;
  if (playerCanonIssues(stored).length) return value;
  return sortValue(stored);
}

export function savedProjectText(project) {
  const stored = cloneScene(project);
  if (!stored) return { ok: false, issues: ['scene could not be cloned'], text: null };
  const issues = playerCanonIssues(stored);
  if (issues.length) return { ok: false, issues, text: null };
  return { ok: true, issues: [], text: JSON.stringify(stored, null, 2) };
}

export function saveRequestBody(project) {
  const download = savedProjectText(project);
  if (!download.ok) return { ok: false, issues: download.issues, body: null };
  try {
    return { ok: true, issues: [], body: JSON.stringify({ project: JSON.parse(download.text) }) };
  } catch (error) {
    return { ok: false, issues: ['scene could not be saved'], body: null };
  }
}

export function postRequestBody(body) {
  const download = saveRequestBody(body && body.project);
  if (!download.ok) return { ok: false, issues: download.issues, body: null };
  try {
    const parsed = JSON.parse(download.body);
    const envelope = {};
    if (body && typeof body === 'object') {
      for (const key of Object.keys(body)) {
        if (key === 'project') continue;
        envelope[key] = body[key];
      }
    }
    envelope.project = parsed.project;
    return { ok: true, issues: [], body: JSON.stringify(envelope) };
  } catch (error) {
    return { ok: false, issues: ['scene could not be cloned'], body: null };
  }
}

export function formatReport(value) {
  const issues = [];
  if (value && Array.isArray(value.issues)) {
    for (const issue of value.issues) {
      try {
        issues.push(String(issue));
      } catch (error) {
        issues.push('issue');
      }
    }
  }
  try {
    const copy = value && typeof value === 'object' ? detachData(value, new Map(), false) : value;
    const toJSON = value && typeof value === 'object' ? readToJSON(value) : undefined;
    let payload = copy;
    if (typeof toJSON === 'function') {
      const produced = toJSON.call(copy);
      if (produced !== undefined) {
        payload = produced && typeof produced === 'object' ? detachData(produced, new Map(), false) : produced;
      }
    }
    return JSON.stringify(sortValue(payload), null, 2);
  } catch (error) {
    let detail = 'scene could not be cloned';
    if (!issues.length) {
      try {
        detail = String(error && error.message);
      } catch (inner) {
        detail = 'scene could not be cloned';
      }
    }
    return JSON.stringify({ ok: false, issues: issues.length ? issues : [detail] }, null, 2);
  }
}

export function copyScene(project) {
  try {
    return structuredClone(project);
  } catch (error) {
    return null;
  }
}
