// After the first playable frame, compiling a whole authored root in one
// display callback is the remaining 100ms+ hitch class. Walk the exact
// meshes and yield to the next present between them so each unique program
// can land on its own beat. Opening/loading still compiles the whole batch.

export function collectCompileSubjects(root) {
  if (!root) return [];
  if (typeof root.traverse !== 'function') return [root];
  const subjects = [];
  root.traverse((object) => {
    if (!object) return;
    if (object.isMesh || object.isSkinnedMesh || object.isPoints || object.isLine) {
      subjects.push(object);
    }
  });
  return subjects.length ? subjects : [root];
}

export const COMPILE_PRESENT_SLICE_MS = 4;

export async function compileSubjectsAcrossPresents(subjects, compileOne, yieldFn, options = {}) {
  if (typeof compileOne !== 'function') {
    throw new TypeError('compileSubjectsAcrossPresents requires compileOne()');
  }
  const list = Array.isArray(subjects) ? subjects.filter(Boolean) : [];
  const budgetMs = Number.isFinite(Number(options.budgetMs))
    ? Math.max(0, Number(options.budgetMs))
    : COMPILE_PRESENT_SLICE_MS;
  const now = typeof options.now === 'function'
    ? options.now
    : () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now());
  const results = [];
  let sliceStarted = now();
  for (let i = 0; i < list.length; i++) {
    results.push(await compileOne(list[i]));
    const spent = now() - sliceStarted;
    if (i < list.length - 1 && typeof yieldFn === 'function' && spent >= budgetMs) {
      await yieldFn();
      sliceStarted = now();
    }
  }
  return results;
}

export function shouldSliceCompileAcrossPresents(options = {}) {
  if (options.mode === 'loading') return false;
  if (options.forceWholeBatch === true) return false;
  return options.firstPlayable === true && options.mode === 'flight';
}

/** Wait until the current display callback has presented, then resume on a later turn. */
export function yieldAfterPresent() {
  return new Promise((resolve) => {
    armCallbackAfterPresent(resolve);
  });
}

/** Arm work after the displayed frame so a 100ms+ job cannot nest inside present. */
export function armCallbackAfterPresent(callback) {
  if (typeof callback !== 'function') return;
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    setTimeout(callback, 0);
  };
  const raf = typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : null;
  if (raf) raf(fire);
  // Headless / background documents can stall rAF forever. A short timeout unsticks
  // admission without putting the job on the present callback.
  setTimeout(fire, raf ? 48 : 0);
}
