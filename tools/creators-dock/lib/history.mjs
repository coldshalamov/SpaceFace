import { clone, emptyProject, placePlayer, requireOnePlayer, sameProject } from './scene.mjs';

const CAP = 100;

export function createHistory(present) {
  return { past: [], present: clone(present), future: [] };
}

export function commit(history, next) {
  const present = clone(next);
  if (sameProject(history.present, present)) return history;
  const past = history.past.concat([history.present]).slice(-CAP);
  return { past, present, future: [] };
}

export function undo(history) {
  if (!history.past.length) return history;
  const past = history.past.slice(0, -1);
  const present = history.past[history.past.length - 1];
  return { past, present, future: [history.present, ...history.future] };
}

export function redo(history) {
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
  if (stepped === history) return { ok: true, history, issues: [] };
  const gate = requireOnePlayer(history.present, { ok: true, project: stepped.present, issues: [] });
  if (!gate.ok) return { ok: false, history, issues: gate.issues };
  return { ok: true, history: stepped, issues: [] };
}
