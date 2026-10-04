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

export function collectUniqueCompileSubjects(root, keyFor) {
  const subjects = collectCompileSubjects(root);
  if (typeof keyFor !== 'function') return subjects;
  const seen = new Set();
  const unique = [];
  for (const subject of subjects) {
    const key = keyFor(subject);
    if (key === null || key === undefined || key === '') {
      unique.push(subject);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(subject);
  }
  return unique;
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

export function shouldSliceFlightAdmission({ mode, firstPlayable, urgent, rootCount } = {}) {
  return shouldSliceCompileAcrossPresents({
    mode,
    firstPlayable,
    forceWholeBatch: urgent === true && rootCount === 1,
  });
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
    // Authored-fallback layers stay hidden for the object's whole live life — live play never
    // unhides them. Revealing one for a touch/depth pass would upload buffers (e.g. a wreck's
    // merged proc shell) that no presented frame can ever draw.
    if (object.userData && object.userData.authoredReadableFallbackLayer === true) return;
    // Sprites are drawables too (isDrawable in openingGpuAdmission includes isSprite):
    // a torn-down sprite whose shared quad reference was nulled reaches the same
    // WebGLGeometries.get geometry.id read in projectObject, so it takes the same
    // hide-for-compile path as a null-geometry mesh.
    const requiresGeometry = object.isMesh === true || object.isSkinnedMesh === true
      || object.isInstancedMesh === true || object.isPoints === true || object.isLine === true
      || object.isSprite === true;
    if (requiresGeometry && 'geometry' in object && object.geometry == null) {
      objectState.push({ object, visible: object.visible, frustumCulled: object.frustumCulled });
      object.visible = false;
      return;
    }
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

/**
 * revealSubjectForCompile covers the subject and its descendants only. A subject parked under a
 * hidden holder — an inactive pool root, an unselected LOD level, a count-0 instanced cohort —
 * is still skipped by render()'s ancestor walk, so its "touch" draws nothing and the program
 * links inside the first presented scene pass anyway. This reveal additionally unhides every
 * ancestor up to the scene root for the duration of the compile/touch, then restores all of it.
 * Under the loading shell the momentary reveal is never presented.
 */
export function revealSubjectWithAncestors(subject) {
  if (!subject) return () => {};
  const ancestors = [];
  for (let p = subject.parent; p; p = p.parent) {
    // Authored-fallback holders obey the same rule as revealSubjectForCompile's own visit:
    // never-live layers stay hidden. A subject parked under one cannot draw anyway.
    if (p.userData && p.userData.authoredReadableFallbackLayer === true) continue;
    ancestors.push({ object: p, visible: p.visible });
    p.visible = true;
  }
  let restoreSubject = () => {};
  try {
    restoreSubject = revealSubjectForCompile(subject);
  } catch (error) {
    for (const entry of ancestors) entry.object.visible = entry.visible;
    throw error;
  }
  return () => {
    restoreSubject();
    for (const entry of ancestors) entry.object.visible = entry.visible;
  };
}

/** Wait until the current display callback has presented, then resume on a later turn. */
export function yieldAfterPresent() {
  return new Promise((resolve) => {
    armCallbackAfterPresent(resolve);
  });
}

/**
 * Dispatch admission work off the frame's critical path. A setTimeout(0) queued from a display
 * callback lands the job at timer priority on that frame's compositor beat — it raced the
 * present and was the largest named hitch owner (externalScheduling). After present, prefer
 * scheduler.yield() so the resume does not stack on the compositor beat; postTask(background)
 * is the next-best and setTimeout remains the headless/legacy fallback.
 * (vm-drop shader-admission-slice, PERF backlog #27)
 */
export function postTaskAtBackgroundPriority(callback) {
  const sched = typeof globalThis.scheduler === 'object' && globalThis.scheduler
    ? globalThis.scheduler
    : null;
  const yieldFn = sched && typeof sched.yield === 'function'
    ? () => sched.yield()
    : null;
  const postTask = sched && typeof sched.postTask === 'function'
    ? sched.postTask.bind(sched)
    : null;
  if (yieldFn) {
    Promise.resolve(yieldFn()).then(callback, () => { callback(); });
    return;
  }
  if (postTask) postTask(callback, { priority: 'background' });
  else setTimeout(callback, 0);
}

/**
 * Background-priority dispatch with a starvation bound. A continuously-busy main thread can
 * starve best-effort tasks for whole seconds — measured as queued compiles piling up and
 * contacts never admitting — so if no idle slot opens within boundMs the callback runs as a
 * timer task instead. The resume is still a separate task after the display callback it armed
 * in; it can never nest inside a present.
 */
export function postTaskAtBackgroundPriorityBounded(callback, boundMs = 48) {
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    callback();
  };
  postTaskAtBackgroundPriority(fire);
  setTimeout(fire, Math.max(0, Number(boundMs) || 0));
}

/**
 * Arm work after the displayed frame so a 100ms+ job cannot nest inside present.
 * `idleBoundMs` > 0 bounds how long the post-present dispatch may wait for an idle slot —
 * use it for lanes whose starvation would otherwise stall the admission queue.
 */
export function armCallbackAfterPresent(callback, { idleBoundMs = 0 } = {}) {
  if (typeof callback !== 'function') return;
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    if (idleBoundMs > 0) postTaskAtBackgroundPriorityBounded(callback, idleBoundMs);
    else postTaskAtBackgroundPriority(callback);
  };
  const raf = typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : null;
  if (raf) raf(fire);
  // Headless / background documents can stall rAF forever. A short timeout unsticks
  // admission without putting the job on the present callback.
  setTimeout(fire, raf ? 48 : 0);
}
