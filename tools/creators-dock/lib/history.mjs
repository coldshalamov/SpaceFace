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

function dataGrid(scene) {
  if (!canHostGrid(scene)) return null;
  const descriptor = Object.getOwnPropertyDescriptor(scene, 'grid');
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
  return descriptor;
}

function restoreDataGrid(scene, descriptor) {
  const current = Object.getOwnPropertyDescriptor(scene, 'grid');
  if (current && Object.prototype.hasOwnProperty.call(current, 'value') && current.value === descriptor.value) {
    return false;
  }
  try {
    Object.defineProperty(scene, 'grid', {
      configurable: true,
      enumerable: descriptor.enumerable !== false,
      writable: true,
      value: descriptor.value,
    });
  } catch (error) {
    return true;
  }
  return true;
}

function guardedClone(project, protect) {
  const saved = [];
  const seen = new Set();
  for (const scene of protect) {
    if (!canHostGrid(scene) || seen.has(scene)) continue;
    seen.add(scene);
    const descriptor = dataGrid(scene);
    if (descriptor) saved.push([scene, descriptor]);
  }
  let stored = null;
  try {
    stored = clone(project);
  } catch (error) {
    stored = null;
  }
  let mutated = false;
  for (const [scene, descriptor] of saved) {
    if (restoreDataGrid(scene, descriptor)) mutated = true;
  }
  return { stored, mutated };
}

function withoutGridAccessor(project, protect = []) {
  if (!gridReadsThroughAccessor(project)) return project;
  const { stored, mutated } = guardedClone(project, protect);
  // A toJSON that nulls another scene's grid is not a successful strip.
  if (mutated) return null;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored) || gridReadsThroughAccessor(stored)) return null;
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

export function commit(history, next) {
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

export function restoreHistory(history, direction) {
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
