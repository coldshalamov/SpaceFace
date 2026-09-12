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
    if (object.isMesh || object.isSkinnedMesh || object.isInstancedMesh
      || object.isPoints || object.isLine || object.isSprite) {
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
  const list = Array.isArray(subjects) ? subjects : [];
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
    if (!list[i]) continue;
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

/**
 * Three's shadowMap.render skips object.visible === false, and InstancedMesh at count 0 is kept
 * hidden until publication. Color compile() still visits those objects; the depth pass does not.
 * Force a drawable pose for admission, then restore.
 */
function drawableRangeCount(geometry) {
  if (!geometry) return 3;
  const index = geometry.index;
  if (index && Number(index.count) > 0) return Number(index.count);
  const position = geometry.attributes && geometry.attributes.position;
  if (position && Number(position.count) > 0) return Number(position.count);
  if (typeof geometry.getAttribute === 'function') {
    const attr = geometry.getAttribute('position');
    if (attr && Number(attr.count) > 0) return Number(attr.count);
  }
  return 3;
}

export function revealSubjectForCompile(subject) {
  if (!subject) return () => {};
  const objectState = [];
  const seen = new Set();
  const drawRangeGeometries = new Set();
  const visit = (object) => {
    if (!object || seen.has(object)) return;
    seen.add(object);
    const entry = {
      object,
      visible: object.visible,
      frustumCulled: object.frustumCulled,
    };
    if (object.isInstancedMesh === true) entry.count = object.count;
    const geometry = object.geometry;
    if (geometry && geometry.drawRange && !drawRangeGeometries.has(geometry)) {
      drawRangeGeometries.add(geometry);
      entry.drawRange = geometry.drawRange;
      entry.drawRangeStart = geometry.drawRange.start;
      entry.drawRangeCount = geometry.drawRange.count;
      if (!(Number(geometry.drawRange.count) > 0)) {
        geometry.drawRange.start = 0;
        geometry.drawRange.count = drawableRangeCount(geometry);
      }
    }
    objectState.push(entry);
    object.visible = true;
    if ('frustumCulled' in object) object.frustumCulled = false;
    if (object.isInstancedMesh === true && !(Number(object.count) > 0)) object.count = 1;
  };
  visit(subject);
  if (typeof subject.traverse === 'function') subject.traverse(visit);
  return () => {
    for (const entry of objectState) {
      entry.object.visible = entry.visible;
      if ('frustumCulled' in entry.object) entry.object.frustumCulled = entry.frustumCulled;
      if (entry.count !== undefined) entry.object.count = entry.count;
      if (entry.drawRange) {
        entry.drawRange.start = entry.drawRangeStart;
        entry.drawRange.count = entry.drawRangeCount;
      }
    }
  };
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
