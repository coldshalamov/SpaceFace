import { clone, emptyProject, placePlayer, playerCanonIssues, requireOnePlayer, sameProject } from './scene.mjs';

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

function dataGrid(scene) {
  if (!canHostGrid(scene)) return null;
  const descriptor = Object.getOwnPropertyDescriptor(scene, 'grid');
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
  return descriptor;
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
    const descriptor = dataGrid(scene);
    if (!descriptor) continue;
    shields.push({
      scene,
      descriptor,
      shape: shapeOf(descriptor.value),
      stuck: false,
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

function restoreShieldList(shields) {
  let mutated = false;
  if (!shields) return { mutated };
  for (const shield of shields) {
    const status = restoreDataGrid(shield.scene, shield.descriptor, shield.shape);
    if (status === false) continue;
    mutated = true;
    shield.stuck = status === 'stuck';
  }
  return { mutated };
}

function safeGrid(shield) {
  const grid = shield.descriptor.value;
  if (!grid || typeof grid !== 'object' || !shield.shape || !gridShapeDirty(grid, shield.shape)) return grid;
  const copy = {};
  for (const [key, saved] of shield.shape.fields) {
    writeField(copy, key, saved.items ? saved.items.slice() : saved.value, saved.enumerable);
  }
  return copy;
}

function sceneBearingGrid(scene, grid) {
  const out = {};
  for (const key of Object.getOwnPropertyNames(scene)) {
    if (key === 'grid' || key === 'toJSON') continue;
    const descriptor = Object.getOwnPropertyDescriptor(scene, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    writeField(out, key, descriptor.value, descriptor.enumerable);
  }
  writeField(out, 'grid', grid, true);
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
    if (!stillBad) {
      shield.stuck = false;
      continue;
    }
    map.set(shield.scene, sceneBearingGrid(shield.scene, safeGrid(shield)));
  }
  return map;
}

function publish(value) {
  if (!activeShields) return value;
  restoreShieldList(activeShields);
  const map = replacementMap(activeShields);
  if (!map.size || !value || typeof value !== 'object') return value;
  if (Object.prototype.hasOwnProperty.call(value, 'history')) {
    const history = remapHistory(value.history, map);
    if (history === value.history) return value;
    return { ...value, history };
  }
  if (Object.prototype.hasOwnProperty.call(value, 'present')) return remapHistory(value, map);
  return value;
}

function runShielded(scenes, fn) {
  const previous = activeShields;
  activeShields = shieldScenes(scenes);
  try {
    return publish(fn());
  } finally {
    activeShields = previous;
  }
}

function projectHasToJSON(value) {
  let current = value;
  const seen = new Set();
  while (canHostGrid(current) && !seen.has(current)) {
    seen.add(current);
    if (Object.getOwnPropertyDescriptor(current, 'toJSON')) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
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

function restoreAccessors(entries) {
  let stuck = false;
  for (const entry of entries) {
    if (entry.shape && entry.value && typeof entry.value === 'object' && gridShapeDirty(entry.value, entry.shape)) {
      if (!writeGridFields(entry.value, entry.shape)) stuck = true;
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
  const accessors = projectHasToJSON(project) ? snapshotAccessors(protect) : [];
  let stored = null;
  try {
    stored = clone(project);
  } catch (error) {
    stored = null;
  }
  const accessorResult = restoreAccessors(accessors);
  const { mutated } = restoreShieldList(shields);
  return { stored, mutated: mutated || accessorResult.stuck };
}

function withoutGridAccessor(project, protect = []) {
  if (!gridReadsThroughAccessor(project)) return project;
  const carried = setterGridValue(project);
  const { stored, mutated } = guardedClone(project, protect);
  // A toJSON that nulls another scene's grid is not a successful strip.
  if (mutated) return null;
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
