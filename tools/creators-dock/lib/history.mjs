import { clone, emptyProject, placePlayer, playerCanonIssues, requireOnePlayer, sameProject } from './scene.mjs';

const CAP = 100;

function gridReadsThroughAccessor(project) {
  if (!project || typeof project !== 'object') return false;
  let current = project;
  const seen = new Set();
  while (current && typeof current === 'object' && !seen.has(current)) {
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

function withoutGridAccessor(project) {
  if (!gridReadsThroughAccessor(project)) return project;
  const stored = clone(project);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored) || gridReadsThroughAccessor(stored)) return null;
  return stored;
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

export function commit(history, next) {
  const stored = storedPresent(next);
  if (!stored.ok) return history;
  let unchanged = false;
  try {
    unchanged = sameProject(history.present, stored.present);
  } catch (error) {
    return history;
  }
  // A grid getter is skipped by clone and sameProject, so the scene looks unchanged
  // while present.grid still reads null. Keep the cloned data instead of that accessor.
  if (unchanged && !gridReadsThroughAccessor(history.present)) return history;
  if (unchanged) {
    return { past: history.past, present: stored.present, future: history.future };
  }
  const prior = withoutGridAccessor(history.present);
  const past = (prior ? history.past.concat([prior]) : history.past).slice(-CAP);
  return { past, present: stored.present, future: [] };
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
  const past = history.past.slice(0, -1);
  const present = history.past[history.past.length - 1];
  const leaving = withoutGridAccessor(history.present);
  if (!leaving) return null;
  return { past, present, future: [leaving, ...history.future] };
}

function redo(history) {
  if (!history.future.length) return history;
  const [present, ...future] = history.future;
  const leaving = withoutGridAccessor(history.present);
  if (!leaving) return null;
  return { past: history.past.concat([leaving]), present, future };
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
  const present = withoutGridAccessor(stepped.present);
  if (!present) return { ok: false, history, issues: ['scene could not be cloned'] };
  const next = present === stepped.present ? stepped : { ...stepped, present };
  const gate = requireOnePlayer(history.present, { ok: true, project: next.present, issues: [] });
  if (!gate.ok) return { ok: false, history, issues: gate.issues };
  return { ok: true, history: next, issues: [] };
}
