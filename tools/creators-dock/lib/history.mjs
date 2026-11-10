import { clone, sameProject } from './scene.mjs';

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
