import { clone, emptyProject, placePlayer, playerCanonIssues, requireOnePlayer, sameProject } from './scene.mjs';
import {
  definePropertyBase, detachData, liveObjectsIn, protectLiveObjects, readAccessor,
  snapshotInheritedArrays, unprotectLiveObjects,
} from './stableJson.mjs';

const CAP = 100;

function canHostGrid(value) {
  return !!value && (typeof value === 'object' || typeof value === 'function');
}

function gridReadsThroughAccessor(project) {
  if (!canHostGrid(project)) return false;
  let current = project;
  const seen = new Set();
  while (canHostGrid(current) && !seen.has(current)) {
    seen.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, 'grid');
    if (descriptor) {
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) return false;
      return typeof descriptor.get === 'function';
    }
    current = Object.getPrototypeOf(current);
  }
  return false;
}

function inheritedGridGetter(project) {
  if (!project || typeof project !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(project, 'grid')) return false;
  return gridReadsThroughAccessor(project);
}

let activeShields = null;
let activeAccessors = null;
let activeSetters = null;
let activeArrays = null;

function dataGrid(scene) {
  if (!canHostGrid(scene)) return null;
  const descriptor = Object.getOwnPropertyDescriptor(scene, 'grid');
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
  return descriptor;
}

function inheritedDataGrid(scene) {
  if (!canHostGrid(scene) || Object.prototype.hasOwnProperty.call(scene, 'grid')) return null;
  let current = Object.getPrototypeOf(scene);
  const seen = new Set();
  while (canHostGrid(current) && !seen.has(current)) {
    seen.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, 'grid');
    if (!descriptor) {
      current = Object.getPrototypeOf(current);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      return { value: descriptor.value, enumerable: descriptor.enumerable !== false };
    }
    return null;
  }
  return null;
}

function shapeOf(grid) {
  if (!grid || typeof grid !== 'object') return null;
  const fields = new Map();
  for (const key of Object.getOwnPropertyNames(grid)) {
    const descriptor = Object.getOwnPropertyDescriptor(grid, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    const value = descriptor.value;
    fields.set(key, {
      enumerable: descriptor.enumerable !== false,
      value,
      items: Array.isArray(value) ? value.slice() : null,
    });
  }
  return { fields };
}

function shieldScenes(scenes) {
  const shields = [];
  const seen = new Set();
  for (const scene of scenes) {
    if (!canHostGrid(scene) || seen.has(scene)) continue;
    seen.add(scene);
    const ownNames = new Set(Object.getOwnPropertyNames(scene));
    const descriptor = dataGrid(scene);
    if (descriptor) {
      shields.push({
        scene,
        descriptor,
        shape: shapeOf(descriptor.value),
        stuck: false,
        inherited: false,
        ownNames,
      });
      continue;
    }
    const inherited = inheritedDataGrid(scene);
    shields.push({
      scene,
      descriptor: inherited ? { value: inherited.value, enumerable: inherited.enumerable !== false } : null,
      shape: inherited ? shapeOf(inherited.value) : null,
      stuck: false,
      inherited: !!inherited,
      ownNames,
    });
  }
  return shields;
}

function gridValuePoisoned(value, seen = new Set()) {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return true;
      if (gridValuePoisoned(descriptor.value, seen)) return true;
    }
    return false;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    if (gridValuePoisoned(descriptor.value, seen)) return true;
  }
  return false;
}

function gridShapeDirty(grid, shape) {
  if (!shape) return false;
  if (!grid || typeof grid !== 'object') return true;
  for (const [key, saved] of shape.fields) {
    const descriptor = Object.getOwnPropertyDescriptor(grid, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return true;
    if (descriptor.value !== saved.value) return true;
    if (saved.items) {
      if (!Array.isArray(descriptor.value) || descriptor.value.length !== saved.items.length) return true;
      for (let i = 0; i < saved.items.length; i += 1) {
        if (descriptor.value[i] !== saved.items[i]) return true;
      }
    }
  }
  for (const key of Object.getOwnPropertyNames(grid)) {
    if (shape.fields.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(grid, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    return true;
  }
  return false;
}

function writeField(object, key, value, enumerable) {
  try {
    const define = definePropertyBase || Object.defineProperty;
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
  return !!descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') && descriptor.value === value;
}

function writeGridFields(grid, shape) {
  if (!shape || !grid || typeof grid !== 'object') return false;
  let ok = true;
  for (const [key, saved] of shape.fields) {
    if (!writeField(grid, key, saved.value, saved.enumerable)) ok = false;
    if (saved.items && Array.isArray(saved.value)) {
      for (let i = 0; i < saved.items.length; i += 1) {
        if (saved.value[i] !== saved.items[i] && !writeField(saved.value, String(i), saved.items[i], true)) ok = false;
      }
      if (saved.value.length !== saved.items.length) {
        try {
          saved.value.length = saved.items.length;
        } catch (error) {
          ok = false;
        }
      }
    }
  }
  for (const key of [...Object.getOwnPropertyNames(grid)]) {
    if (shape.fields.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(grid, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    try {
      delete grid[key];
    } catch (error) {
      ok = false;
    }
  }
  return ok && !gridShapeDirty(grid, shape);
}

function restoreDataGrid(scene, descriptor, shape) {
  const current = Object.getOwnPropertyDescriptor(scene, 'grid');
  const same = current
    && Object.prototype.hasOwnProperty.call(current, 'value')
    && current.value === descriptor.value;
  if (same) {
    if (!gridShapeDirty(current.value, shape)) return false;
    return writeGridFields(current.value, shape) ? true : 'stuck';
  }
  if (!writeField(scene, 'grid', descriptor.value, descriptor.enumerable !== false)) {
    const now = Object.getOwnPropertyDescriptor(scene, 'grid');
    if (now && Object.prototype.hasOwnProperty.call(now, 'value') && now.writable !== false) {
      try {
        scene.grid = descriptor.value;
      } catch (error) {
        // Strict assignment can still refuse. Fall through to stuck when the null remains.
      }
    }
    const after = Object.getOwnPropertyDescriptor(scene, 'grid');
    if (after && Object.prototype.hasOwnProperty.call(after, 'value') && after.value === descriptor.value) {
      if (descriptor.value && gridShapeDirty(descriptor.value, shape) && !writeGridFields(descriptor.value, shape)) {
        return 'stuck';
      }
      return true;
    }
    if (after && Object.prototype.hasOwnProperty.call(after, 'value') && gridValuePoisoned(after.value)) return 'stuck';
    return true;
  }
  if (descriptor.value && gridShapeDirty(descriptor.value, shape) && !writeGridFields(descriptor.value, shape)) {
    return 'stuck';
  }
  return true;
}

function restoreInheritedGrid(shield) {
  const current = Object.getOwnPropertyDescriptor(shield.scene, 'grid');
  if (!current) return false;
  if (Object.prototype.hasOwnProperty.call(current, 'value') && current.value === shield.descriptor.value
    && !Object.prototype.hasOwnProperty.call(shield.scene, 'grid')) {
    return false;
  }
  try {
    delete shield.scene.grid;
  } catch (error) {
    // A non-configurable own grid cannot be deleted. Assign it when it is writable.
  }
  if (!Object.prototype.hasOwnProperty.call(shield.scene, 'grid')) return true;
  const afterDelete = Object.getOwnPropertyDescriptor(shield.scene, 'grid');
  if (afterDelete && Object.prototype.hasOwnProperty.call(afterDelete, 'value') && afterDelete.writable !== false) {
    try {
      shield.scene.grid = shield.descriptor.value;
    } catch (error) {
      // Strict assignment refused the inherited grid.
    }
  }
  const after = Object.getOwnPropertyDescriptor(shield.scene, 'grid');
  if (after && Object.prototype.hasOwnProperty.call(after, 'value') && after.value === shield.descriptor.value) {
    return Object.prototype.hasOwnProperty.call(shield.scene, 'grid') ? 'stuck' : true;
  }
  if (after && Object.prototype.hasOwnProperty.call(after, 'value') && after.value === null) return 'stuck';
  return 'stuck';
}

function extraKeysRemain(shield) {
  let remain = false;
  for (const key of Object.getOwnPropertyNames(shield.scene)) {
    if (shield.ownNames.has(key)) continue;
    try {
      delete shield.scene[key];
    } catch (error) {
      // non-configurable extra key
    }
    if (Object.prototype.hasOwnProperty.call(shield.scene, key)) remain = true;
  }
  return remain;
}

function restoreShieldList(shields) {
  let mutated = false;
  if (!shields) return { mutated };
  for (const shield of shields) {
    const extra = extraKeysRemain(shield);
    shield.extra = extra;
    let status = false;
    if (shield.inherited && shield.descriptor) status = restoreInheritedGrid(shield);
    else if (shield.descriptor && !shield.inherited) status = restoreDataGrid(shield.scene, shield.descriptor, shield.shape);
    if (extra) status = 'stuck';
    if (status === false) continue;
    mutated = true;
    shield.stuck = status === 'stuck';
  }
  return { mutated };
}

function safeGrid(shield) {
  const grid = shield.descriptor.value;
  if (!grid || typeof grid !== 'object') return grid;
  return detachData(grid);
}

function sceneBearingGrid(scene, grid, ownNames) {
  const out = {};
  const names = ownNames || Object.getOwnPropertyNames(scene);
  for (const key of names) {
    if (key === 'grid' || key === 'toJSON') continue;
    const descriptor = Object.getOwnPropertyDescriptor(scene, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    const raw = descriptor.value;
    writeField(out, key, raw && typeof raw === 'object' ? detachData(raw) : raw, descriptor.enumerable);
  }
  if (grid !== undefined) writeField(out, 'grid', grid, true);
  return out;
}

function remapHistory(history, map) {
  if (!history || !map.size) return history;
  const swap = (scene) => (map.has(scene) ? map.get(scene) : scene);
  const present = swap(history.present);
  const past = Array.isArray(history.past) ? history.past.map(swap) : history.past;
  const future = Array.isArray(history.future) ? history.future.map(swap) : history.future;
  if (present === history.present
    && Array.isArray(past) && past.every((scene, index) => scene === history.past[index])
    && Array.isArray(future) && future.every((scene, index) => scene === history.future[index])) {
    return history;
  }
  return { past, present, future };
}

function replacementMap(shields) {
  const map = new Map();
  for (const shield of shields) {
    if (!shield.stuck || map.has(shield.scene)) continue;
    const now = Object.getOwnPropertyDescriptor(shield.scene, 'grid');
    const value = now && Object.prototype.hasOwnProperty.call(now, 'value') ? now.value : undefined;
    const stillBad = (value !== undefined && gridValuePoisoned(value))
      || (!!value && typeof value === 'object' && gridShapeDirty(value, shield.shape));
    if (!stillBad && !shield.extra) {
      shield.stuck = false;
      continue;
    }
    const grid = shield.descriptor ? safeGrid(shield) : undefined;
    map.set(shield.scene, sceneBearingGrid(shield.scene, grid, shield.ownNames));
  }
  return map;
}

function applySceneMap(history, map) {
  if (!history || !map.size) return history;
  const swap = (scene) => (map.has(scene) ? map.get(scene) : scene);
  if (map.has(history.present)) history.present = map.get(history.present);
  if (Array.isArray(history.past)) {
    for (let i = 0; i < history.past.length; i += 1) history.past[i] = swap(history.past[i]);
  }
  if (Array.isArray(history.future)) {
    for (let i = 0; i < history.future.length; i += 1) history.future[i] = swap(history.future[i]);
  }
  return history;
}

function publish(value) {
  if (activeAccessors) restoreAccessors(activeAccessors);
  const settersStuck = restoreSetters(activeSetters);
  const arraysStuck = restoreArrays(activeArrays);
  if (activeShields) restoreShieldList(activeShields);
  const map = activeShields ? replacementMap(activeShields) : new Map();
  const failed = settersStuck || arraysStuck || !!(value && value.ok === false);
  if (!failed && map.size && value && typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'history')) applySceneMap(value.history, map);
    else if (Object.prototype.hasOwnProperty.call(value, 'present')) applySceneMap(value, map);
  }
  return refusePoisoned(value, settersStuck || arraysStuck);
}

function refusePoisoned(value, refused) {
  if (!refused || !value || typeof value !== 'object' || value.ok !== true) return value;
  return { ok: false, history: value.history, issues: ['scene could not be cloned'] };
}

function treeHasToJSON(value, seen = new Set()) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return false;
  if (typeof value === 'function') return false;
  seen.add(value);
  let current = value;
  const protos = new Set();
  while (canHostGrid(current) && !protos.has(current)) {
    protos.add(current);
    if (Object.getOwnPropertyDescriptor(current, 'toJSON')) return true;
    current = Object.getPrototypeOf(current);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
      if (treeHasToJSON(descriptor.value, seen)) return true;
    }
    return false;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'toJSON') return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (treeHasToJSON(descriptor.value, seen)) return true;
  }
  return false;
}

function scenesNeedAccessors(scenes) {
  for (const scene of scenes) {
    if (treeHasToJSON(scene)) return true;
  }
  return false;
}

function runShielded(scenes, fn) {
  const previousShields = activeShields;
  const previousAccessors = activeAccessors;
  const previousSetters = activeSetters;
  const previousArrays = activeArrays;
  activeShields = shieldScenes(scenes);
  activeAccessors = scenesNeedAccessors(scenes) ? snapshotAccessors(scenes) : [];
  activeSetters = snapshotSetters(scenes);
  activeArrays = snapshotArrays(scenes);
  const protectedLive = liveObjectsIn(scenes);
  for (const entry of activeAccessors) {
    if (entry.value && typeof entry.value === 'object') {
      for (const object of liveObjectsIn([entry.value])) protectedLive.add(object);
    }
  }
  for (const entry of activeArrays) {
    if (Array.isArray(entry.array)) protectedLive.add(entry.array);
  }
  protectLiveObjects(protectedLive);
  try {
    return publish(fn());
  } finally {
    unprotectLiveObjects();
    activeShields = previousShields;
    activeAccessors = previousAccessors;
    activeSetters = previousSetters;
    activeArrays = previousArrays;
  }
}

function snapshotSetters(scenes) {
  const entries = [];
  const seen = new Set();
  for (const scene of scenes) collectSetters(scene, entries, seen);
  for (const entry of activeAccessors || []) {
    if (entry.value && typeof entry.value === 'object') collectSetters(entry.value, entries, seen);
  }
  return entries;
}

function collectSetters(value, entries, seen) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
      collectSetters(descriptor.value, entries, seen);
    }
    return;
  }
  let current = value;
  const chain = new Set();
  while (current && current !== Object.prototype && typeof current === 'object' && !chain.has(current)) {
    chain.add(current);
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key === 'constructor' || key === 'toJSON') continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor) continue;
      if (typeof descriptor.get === 'function' && typeof descriptor.set === 'function') {
        let read;
        try {
          read = descriptor.get.call(value);
        } catch (error) {
          continue;
        }
        entries.push({ object: value, key, value: read });
        if (read && typeof read === 'object') collectSetters(read, entries, seen);
        continue;
      }
      if (typeof descriptor.get === 'function') {
        if (key === 'objects' || key === 'grid') continue;
        const read = readAccessor(value, descriptor);
        if (read && typeof read === 'object') collectSetters(read, entries, seen);
        continue;
      }
      if (current !== value) continue;
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value') || typeof descriptor.value === 'function') continue;
      if (descriptor.value && typeof descriptor.value === 'object') collectSetters(descriptor.value, entries, seen);
    }
    current = Object.getPrototypeOf(current);
  }
}

function restoreSetters(entries) {
  if (!entries) return false;
  let stuck = false;
  for (const entry of entries) {
    let current;
    try {
      current = entry.object[entry.key];
    } catch (error) {
      stuck = true;
      continue;
    }
    if (Object.is(current, entry.value)) continue;
    try {
      entry.object[entry.key] = entry.value;
    } catch (error) {
      stuck = true;
      continue;
    }
    let after;
    try {
      after = entry.object[entry.key];
    } catch (error) {
      stuck = true;
      continue;
    }
    if (!Object.is(after, entry.value)) stuck = true;
  }
  return stuck;
}

function arraySlot(array, index) {
  const descriptor = Object.getOwnPropertyDescriptor(array, String(index));
  if (!descriptor) return { kind: 'missing' };
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) return { kind: 'accessor' };
  return { kind: 'data', value: descriptor.value };
}

function snapshotArrays(scenes) {
  const entries = [];
  const seen = new Set();
  for (const scene of scenes) collectArrays(scene, entries, seen);
  for (const scene of scenes) {
    for (const extra of snapshotInheritedArrays(scene)) {
      if (entries.some((entry) => entry.array === extra.array)) continue;
      entries.push({
        array: extra.array,
        length: extra.length,
        items: extra.items.map((value) => ({ kind: 'data', value })),
      });
    }
  }
  for (const entry of activeAccessors || []) {
    if (!entry.value || typeof entry.value !== 'object') continue;
    for (const extra of snapshotInheritedArrays(entry.value)) {
      if (entries.some((row) => row.array === extra.array)) continue;
      entries.push({
        array: extra.array,
        length: extra.length,
        items: extra.items.map((value) => ({ kind: 'data', value })),
      });
    }
  }
  return entries;
}

function collectArrays(value, entries, seen) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    const items = [];
    for (let i = 0; i < value.length; i += 1) {
      const slot = arraySlot(value, i);
      items.push(slot.kind === 'data' ? { kind: 'data', value: slot.value } : { kind: slot.kind });
    }
    entries.push({ array: value, items, length: value.length });
    for (const item of items) {
      if (item.kind === 'data') collectArrays(item.value, entries, seen);
    }
    return;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'toJSON') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if (typeof descriptor.get === 'function' && typeof descriptor.set !== 'function') {
      if (key === 'objects' || key === 'grid') continue;
      const read = readAccessor(value, descriptor);
      if (read && typeof read === 'object') collectArrays(read, entries, seen);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    collectArrays(descriptor.value, entries, seen);
  }
}

function slotMatches(array, index, saved) {
  const slot = arraySlot(array, index);
  if (saved.kind !== 'data') return slot.kind === saved.kind;
  return slot.kind === 'data' && slot.value === saved.value;
}

function restoreArrays(entries) {
  if (!entries) return false;
  let stuck = false;
  for (const entry of entries) {
    const array = entry.array;
    if (!Array.isArray(array)) {
      stuck = true;
      continue;
    }
    let dirty = array.length !== entry.length;
    if (!dirty) {
      for (let i = 0; i < entry.length; i += 1) {
        if (!slotMatches(array, i, entry.items[i])) {
          dirty = true;
          break;
        }
      }
    }
    if (!dirty) continue;
    for (let i = 0; i < entry.items.length; i += 1) {
      const saved = entry.items[i];
      if (saved.kind !== 'data' || slotMatches(array, i, saved)) continue;
      if (!writeField(array, String(i), saved.value, true)) stuck = true;
    }
    if (array.length !== entry.length) {
      try {
        array.length = entry.length;
      } catch (error) {
        stuck = true;
      }
    }
    if (array.length !== entry.length) stuck = true;
    for (let i = 0; i < entry.length; i += 1) {
      if (!slotMatches(array, i, entry.items[i])) stuck = true;
    }
  }
  return stuck;
}

function readAccessorGrid(scene) {
  try {
    return scene.grid;
  } catch (error) {
    return undefined;
  }
}

function findGridAccessor(scene) {
  let current = scene;
  const seen = new Set();
  while (canHostGrid(current) && !seen.has(current)) {
    seen.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, 'grid');
    if (descriptor) {
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
      if (typeof descriptor.get === 'function') return descriptor;
      return null;
    }
    current = Object.getPrototypeOf(current);
  }
  return null;
}

function snapshotAccessors(scenes) {
  const entries = [];
  const seen = new Set();
  for (const scene of scenes) {
    if (!canHostGrid(scene) || seen.has(scene)) continue;
    seen.add(scene);
    const descriptor = findGridAccessor(scene);
    if (!descriptor) continue;
    let value;
    try {
      value = descriptor.get.call(scene);
    } catch (error) {
      continue;
    }
    entries.push({
      scene,
      descriptor,
      value,
      shape: value && typeof value === 'object' ? shapeOf(value) : null,
    });
  }
  return entries;
}

function setterGridValue(project) {
  const descriptor = findGridAccessor(project);
  if (!descriptor || typeof descriptor.set !== 'function') return undefined;
  try {
    return descriptor.get.call(project);
  } catch (error) {
    return undefined;
  }
}

function fieldStillNull(grid, shape) {
  if (!shape || !grid || typeof grid !== 'object') return false;
  for (const [key, saved] of shape.fields) {
    if (saved.value == null) continue;
    const descriptor = Object.getOwnPropertyDescriptor(grid, key);
    const current = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : undefined;
    if (current === null) return true;
    if (saved.items && Array.isArray(current) && !saved.items.includes(null) && current.includes(null)) return true;
  }
  return false;
}

function restoreAccessors(entries) {
  let stuck = false;
  if (!entries) return { stuck };
  for (const entry of entries) {
    if (entry.shape && entry.value && typeof entry.value === 'object' && gridShapeDirty(entry.value, entry.shape)) {
      if (!writeGridFields(entry.value, entry.shape)) stuck = true;
    }
    // A non-writable field on the getter's object cannot be hidden by swapping
    // in a clean grid. Leave the getter in place and refuse the travel.
    if (entry.shape && fieldStillNull(entry.value, entry.shape)) {
      stuck = true;
      continue;
    }
    if (readAccessorGrid(entry.scene) === entry.value) continue;
    try {
      entry.scene.grid = entry.value;
    } catch (error) {
      // The setter refused the pre-call value.
    }
    if (readAccessorGrid(entry.scene) === entry.value) continue;
    try {
      Object.defineProperty(entry.scene, 'grid', {
        configurable: true,
        enumerable: entry.descriptor.enumerable !== false,
        writable: true,
        value: entry.value,
      });
    } catch (error) {
      // A non-configurable accessor stays until the strip is refused.
    }
    if (readAccessorGrid(entry.scene) !== entry.value) stuck = true;
  }
  return { stuck };
}

function guardedClone(project, protect) {
  const shields = activeShields || shieldScenes(protect);
  const accessors = activeAccessors != null
    ? activeAccessors
    : (treeHasToJSON(project) ? snapshotAccessors(protect) : []);
  restoreAccessors(accessors);
  let stored = null;
  try {
    stored = clone(project);
  } catch (error) {
    stored = null;
  }
  // A toJSON that only mutates its receiver must not abort parking the pre-call scene.
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) stored = detachData(project);
  const accessorResult = restoreAccessors(accessors);
  const settersStuck = restoreSetters(activeSetters);
  const arraysStuck = restoreArrays(activeArrays);
  const { mutated } = restoreShieldList(shields);
  return { stored, mutated: mutated || accessorResult.stuck || settersStuck || arraysStuck };
}

function parkedCopy(project) {
  const copied = detachData(project);
  if (copied && typeof copied === 'object' && !Array.isArray(copied)) return copied;
  return null;
}

function withoutGridAccessor(project, protect = []) {
  if (!gridReadsThroughAccessor(project)) return parkedCopy(project);
  const carried = setterGridValue(project);
  const cloned = guardedClone(project, protect);
  let stored = cloned.stored;
  // A toJSON that nulls another scene's grid is not a successful strip.
  if (cloned.mutated) return null;
  if (stored && typeof stored === 'object' && !Array.isArray(stored) && gridReadsThroughAccessor(stored)) {
    const bare = Object.create(null);
    for (const key of Object.getOwnPropertyNames(stored)) {
      const descriptor = Object.getOwnPropertyDescriptor(stored, key);
      if (descriptor) Object.defineProperty(bare, key, descriptor);
    }
    if (!gridReadsThroughAccessor(bare)) stored = bare;
  }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored) || gridReadsThroughAccessor(stored)) return null;
  // A setter's pre-call value is the grid the strip clone must keep. A getter
  // with no setter is left unread so a counting getter stays at zero reads.
  if (carried != null && stored.grid == null && !writeField(stored, 'grid', carried, true)) return null;
  return stored;
}

function historyScenes(history) {
  return [history.present, ...history.past, ...history.future];
}

function stripScenes(scenes, protect = []) {
  const out = [];
  for (const scene of scenes) {
    const stripped = withoutGridAccessor(scene, protect);
    if (!stripped) return null;
    out.push(stripped);
  }
  return out;
}

function stackHidesGrid(history) {
  return history.past.some((scene) => gridReadsThroughAccessor(scene))
    || history.future.some((scene) => gridReadsThroughAccessor(scene));
}

function storedPresent(present) {
  let stored = null;
  try {
    stored = clone(present);
  } catch (error) {
    stored = null;
  }
  if (stored == null || typeof stored !== 'object' || Array.isArray(stored)) {
    return { ok: false, present: null, issues: ['scene could not be cloned'] };
  }
  const issues = playerCanonIssues(stored);
  if (issues.length) return { ok: false, present: null, issues };
  return { ok: true, present: stored, issues: [] };
}

export function createHistory(present) {
  const stored = storedPresent(present);
  if (!stored.ok) return { past: [], present: null, future: [], issues: stored.issues };
  return { past: [], present: stored.present, future: [] };
}

function historyOrShielded(history) {
  if (!inheritedGridGetter(history.present)) return history;
  const present = withoutGridAccessor(history.present, historyScenes(history));
  if (!present || gridReadsThroughAccessor(present)) return history;
  return { past: history.past, present, future: history.future };
}

function commitBody(history, next) {
  const stored = storedPresent(next);
  if (!stored.ok) return historyOrShielded(history);
  let unchanged = false;
  try {
    unchanged = sameProject(history.present, stored.present);
  } catch (error) {
    return historyOrShielded(history);
  }
  // A grid getter is skipped by clone and sameProject, so the scene looks unchanged
  // while present.grid still reads null. Keep the cloned data instead of that accessor.
  const protect = historyScenes(history);
  if (unchanged && !gridReadsThroughAccessor(history.present) && !stackHidesGrid(history)) return history;
  if (unchanged) {
    const past = stripScenes(history.past, protect);
    const future = stripScenes(history.future, protect);
    if (!past || !future) return historyOrShielded(history);
    return { past, present: stored.present, future };
  }
  const prior = withoutGridAccessor(history.present, protect);
  const older = stripScenes(history.past, protect);
  if (!prior || !older) return historyOrShielded(history);
  return { past: older.concat([prior]).slice(-CAP), present: stored.present, future: [] };
}

export function commit(history, next) {
  const scenes = historyScenes(history);
  scenes.push(next);
  return runShielded(scenes, () => commitBody(history, next));
}

export function openDockHistory(project) {
  const stored = storedPresent(project);
  if (!stored.ok) return { ok: false, history: null, issues: stored.issues };
  return { ok: true, history: { past: [], present: stored.present, future: [] }, issues: [] };
}

export function loadExampleHistory(project) {
  const opened = openDockHistory(project);
  if (!opened.ok || !opened.history || opened.history.present == null) {
    return {
      ok: false,
      history: null,
      issues: opened.issues && opened.issues.length ? opened.issues : ['example could not be opened'],
    };
  }
  return { ok: true, history: opened.history, issues: [] };
}

function undo(history) {
  if (!history.past.length) return history;
  const protect = historyScenes(history);
  const past = stripScenes(history.past.slice(0, -1), protect);
  const present = history.past[history.past.length - 1];
  const leaving = withoutGridAccessor(history.present, protect);
  const future = stripScenes(history.future, protect);
  if (!past || !leaving || !future) return null;
  return { past, present, future: [leaving, ...future] };
}

function redo(history) {
  if (!history.future.length) return history;
  const protect = historyScenes(history);
  const [present, ...futureTail] = history.future;
  const leaving = withoutGridAccessor(history.present, protect);
  const past = stripScenes(history.past, protect);
  const future = stripScenes(futureTail, protect);
  if (!leaving || !past || !future) return null;
  return { past: past.concat([leaving]), present, future };
}

export function newDockHistory(meta = {}) {
  const placed = placePlayer(emptyProject({
    id: 'dock.untitled',
    title: 'Untitled dock',
    seed: 1,
    ...meta,
  }));
  return createHistory(placed.project);
}

function restoreHistoryBody(history, direction) {
  const stepped = direction === 'redo' ? redo(history) : undo(history);
  if (!stepped) return { ok: false, history, issues: ['scene could not be cloned'] };
  if (stepped === history) {
    const same = requireOnePlayer(history.present, { ok: true, project: history.present, issues: [] });
    if (!same.ok) return { ok: false, history, issues: same.issues };
    return { ok: true, history, issues: [] };
  }
  const present = withoutGridAccessor(stepped.present, [
    history.present,
    ...history.past,
    ...history.future,
    stepped.present,
    ...stepped.past,
    ...stepped.future,
  ]);
  if (!present) return { ok: false, history, issues: ['scene could not be cloned'] };
  const next = present === stepped.present ? stepped : { ...stepped, present };
  const gate = requireOnePlayer(history.present, { ok: true, project: next.present, issues: [] });
  if (!gate.ok) return { ok: false, history, issues: gate.issues };
  return { ok: true, history: next, issues: [] };
}

export function restoreHistory(history, direction) {
  return runShielded(historyScenes(history), () => restoreHistoryBody(history, direction));
}
