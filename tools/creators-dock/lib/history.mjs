import { clone, emptyProject, placePlayer, playerCanonIssues, requireOnePlayer, sameProject } from './scene.mjs';

const CAP = 100;

function storedPresent(present) {
  const stored = clone(present);
  const issues = playerCanonIssues(stored);
  if (issues.length) return { ok: false, present: null, issues };
  return { ok: true, present: stored, issues: [] };
}

export function createHistory(present) {
  const stored = storedPresent(present);
  if (!stored.ok) return { past: [], present: null, future: [] };
  return { past: [], present: stored.present, future: [] };
}

export function commit(history, next) {
  const stored = storedPresent(next);
  if (!stored.ok) return history;
  if (sameProject(history.present, stored.present)) return history;
  const past = history.past.concat([history.present]).slice(-CAP);
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
  return { past, present, future: [history.present, ...history.future] };
}

function redo(history) {
  if (!history.future.length) return history;
  const [present, ...future] = history.future;
  return { past: history.past.concat([history.present]), present, future };
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
  const gate = requireOnePlayer(history.present, { ok: true, project: stepped.present, issues: [] });
  if (!gate.ok) return { ok: false, history, issues: gate.issues };
  return { ok: true, history: stepped, issues: [] };
}
