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

// Stepped twin — identical pre-order (children pushed reversed) and predicate.
// Drivers pace between roots already; a station-scale subtree paid its whole
// traverse inside one leg, so this yields every 256 visited nodes and the
// caller awaits its pace fn per yield. The returned subjects are identical.
export function* collectCompileSubjectsSteps(root, sliceEvery = 256) {
  if (!root) return [];
  if (typeof root.traverse !== 'function') return [root];
  const subjects = [];
  const stack = [root];
  let visited = 0;
  while (stack.length) {
    const object = stack.pop();
    if (!object) continue;
    if ((++visited % sliceEvery) === 0) yield;
    if (object.isMesh || object.isSkinnedMesh || object.isInstancedMesh
      || object.isPoints || object.isLine || object.isSprite) {
      subjects.push(object);
    }
    const children = object.children || [];
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
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
  // The shared paced-ledger contract: shouldYield consults the frame's wallet so a
  // spent frame never gets this lane's whole private window on top, and debit posts
  // the spend so sibling slicers in the same frame see it. Post-item check, so
  // min-1 progress is preserved verbatim.
  const shouldYield = typeof options.shouldYield === 'function' ? options.shouldYield : null;
  const debit = typeof options.debit === 'function' ? options.debit : null;
  const results = [];
  let sliceStarted = now();
  let lastDebitAt = sliceStarted;
  for (let i = 0; i < list.length; i++) {
    if (!list[i]) continue;
    results.push(await compileOne(list[i]));
    const spent = now() - sliceStarted;
    if (i < list.length - 1 && typeof yieldFn === 'function'
        && (spent >= budgetMs || (shouldYield && shouldYield()))) {
      if (debit) debit(now() - lastDebitAt);
      await yieldFn();
      sliceStarted = now();
      lastDebitAt = sliceStarted;
    }
  }
  if (debit) debit(now() - lastDebitAt);
  return results;
}

export function shouldSliceCompileAcrossPresents(options = {}) {
  if (options.mode === 'loading') return false;
  if (options.forceWholeBatch === true) return false;
  return options.firstPlayable === true && options.mode === 'flight';
}

export function shouldSliceFlightAdmission({ mode, firstPlayable, urgent, rootCount, serialDriver = false } = {}) {
  return shouldSliceCompileAcrossPresents({
    mode,
    firstPlayable,
    // Urgency controls queue order, not permission to flood a serial GPU command buffer.
    // Keep the KHR overlap fast path, but let the existing per-subject pacer bound a
    // software/serial driver's root before a compositor readback drains all its variants.
    forceWholeBatch: urgent === true && rootCount === 1 && serialDriver !== true,
  });
}

/**
 * Three's shadowMap.render skips object.visible === false, and zero-count instanced drawables
 * stay dormant until publication. Color compile() still visits those objects; a draw does not.
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
  const revealedGeometries = new Set();
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
    if (geometry && !revealedGeometries.has(geometry)) {
      revealedGeometries.add(geometry);
      if (geometry.drawRange) {
        entry.drawRange = geometry.drawRange;
        entry.drawRangeStart = geometry.drawRange.start;
        entry.drawRangeCount = geometry.drawRange.count;
        if (!(Number(geometry.drawRange.count) > 0)) {
          geometry.drawRange.start = 0;
          geometry.drawRange.count = drawableRangeCount(geometry);
        }
      }
      if (geometry.isInstancedBufferGeometry === true) {
        entry.instancedGeometry = geometry;
        entry.instanceCount = geometry.instanceCount;
        if (!(Number(geometry.instanceCount) > 0)) geometry.instanceCount = 1;
      }
    }
    objectState.push(entry);
    object.visible = true;
    if ('frustumCulled' in object) object.frustumCulled = false;
    if (object.isInstancedMesh === true && !(Number(object.count) > 0)) object.count = 1;
  };
  const restore = () => {
    for (const entry of objectState) {
      entry.object.visible = entry.visible;
      if ('frustumCulled' in entry.object) entry.object.frustumCulled = entry.frustumCulled;
      if (entry.count !== undefined) entry.object.count = entry.count;
      if (entry.instancedGeometry) entry.instancedGeometry.instanceCount = entry.instanceCount;
      if (entry.drawRange) {
        entry.drawRange.start = entry.drawRangeStart;
        entry.drawRange.count = entry.drawRangeCount;
      }
    }
  };
  try {
    visit(subject);
    if (typeof subject.traverse === 'function') subject.traverse(visit);
  } catch (err) {
    // A mid-mint throw (a hostile getter under traverse) must not leak the
    // revealed prefix — the caller never receives a restore closure on throw.
    try { restore(); } catch (_) { /* rethrow below */ }
    throw err;
  }
  return restore;
}

/**
 * Stepped twin of revealSubjectForCompile for the whole-scene mint — the boot
 * cook's reveal+restore pays ~2×O(scene) and was the largest unyielded
 * loading span. Identical pre-order (explicit stack; THREE's traverse is the
 * same order, and `seen` dedupes the double-visit the sync version tolerates),
 * identical visit semantics, identical restore contents. Returns
 * { restore, restoreSteps }: `restore` is the same sync closure the sync twin
 * returns; `restoreSteps` paces the restore in the same slices when the caller
 * can drive a generator.
 */
export function* revealSubjectForCompileSteps(subject, sliceEvery = 256) {
  if (!subject) return { restore: () => {}, restoreSteps: null };
  const objectState = [];
  const seen = new Set();
  const revealedGeometries = new Set();
  const every = Math.max(1, Math.floor(Number(sliceEvery) || 1));
  const visit = (object) => {
    if (!object || seen.has(object)) return;
    seen.add(object);
    if (object.userData && object.userData.authoredReadableFallbackLayer === true) return;
    const requiresGeometry = object.isMesh === true || object.isSkinnedMesh === true
      || object.isInstancedMesh === true || object.isPoints === true
      || object.isLine === true || object.isSprite === true;
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
    if (geometry && !revealedGeometries.has(geometry)) {
      revealedGeometries.add(geometry);
      if (geometry.drawRange) {
        entry.drawRange = geometry.drawRange;
        entry.drawRangeStart = geometry.drawRange.start;
        entry.drawRangeCount = geometry.drawRange.count;
        if (!(Number(geometry.drawRange.count) > 0)) {
          geometry.drawRange.start = 0;
          geometry.drawRange.count = drawableRangeCount(geometry);
        }
      }
      if (geometry.isInstancedBufferGeometry === true) {
        entry.instancedGeometry = geometry;
        entry.instanceCount = geometry.instanceCount;
        if (!(Number(geometry.instanceCount) > 0)) geometry.instanceCount = 1;
      }
    }
    objectState.push(entry);
    object.visible = true;
    if ('frustumCulled' in object) object.frustumCulled = false;
    if (object.isInstancedMesh === true && !(Number(object.count) > 0)) object.count = 1;
  };
  const restoreEntry = (entry) => {
    entry.object.visible = entry.visible;
    if ('frustumCulled' in entry.object) entry.object.frustumCulled = entry.frustumCulled;
    if (entry.count !== undefined) entry.object.count = entry.count;
    if (entry.instancedGeometry) entry.instancedGeometry.instanceCount = entry.instanceCount;
    if (entry.drawRange) {
      entry.drawRange.start = entry.drawRangeStart;
      entry.drawRange.count = entry.drawRangeCount;
    }
  };
  const applyRestore = function* () {
    let i = 0;
    try {
      for (; i < objectState.length; i++) {
        if ((i % every) === 0 && i > 0) yield;
        restoreEntry(objectState[i]);
      }
    } finally {
      // A cancelled paced restore must not leave the remaining live pool revealed.
      for (; i < objectState.length; i++) restoreEntry(objectState[i]);
    }
  };
  const restore = () => {
    const it = applyRestore();
    let step = it.next();
    while (!step.done) step = it.next();
  };
  let visited = 0;
  const stack = [subject];
  let complete = false;
  try {
    while (stack.length > 0) {
      const object = stack.pop();
      if ((++visited % every) === 0) yield;
      visit(object);
      const children = object && object.children;
      if (children) for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
    complete = true;
  } finally {
    // Generator return()/throw() can interrupt the reveal at a yield before it hands back
    // the restore closure. Restore its revealed prefix on both cancellation and rejection.
    if (!complete) {
      try { restore(); } catch (_) { /* preserve the original interruption */ }
    }
  }
  return { restore, restoreSteps: applyRestore() };
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
 * callback lands the job at timer priority on that frame's compositor beat. When the browser
 * supports explicit task priorities, admit work at background priority so input and presentation
 * get the next turn. A bare scheduler.yield() inherits priority and boosts the continuation.
 * (vm-drop shader-admission-slice, PERF backlog #27)
 */
// --- Who ran long? -------------------------------------------------------------------------------
// Every background lane (pipeline admission, decode, parts builds, program-binary harvest, queue
// drains) resumes through the dispatchers below, so a long task shows up in a trace as this file's
// `fire` whatever the work was. This ring names the work: each dispatched task is timed from its
// start through the continuations it resumes (three microtask turns), and any task over
// BACKGROUND_TASK_LOG_MS is recorded with a label. The label is the callback's own
// `sfTaskLabel`/name; a harness that sets globalThis.__SF_TASK_TRACE__ = true also gets the
// file:line that armed the task (a stack capture per arm, so it is off in the shipped game).
// Read it with readBackgroundTaskLog() or globalThis.__SF_BG_TASKS__().
export const BACKGROUND_TASK_LOG_MS = 4;
const TASK_LOG_N = 96;
const taskLog = { rows: new Array(TASK_LOG_N), head: 0, total: 0, over4: 0, over50: 0, worstMs: 0 };

function taskNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() : Date.now();
}

function armSiteLabel() {
  if (globalThis.__SF_TASK_TRACE__ !== true) return null;
  const lines = String(new Error().stack || '').split(String.fromCharCode(10));
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (line.indexOf('compilePresentSlice.js') >= 0) continue;
    const m = /\/(src\/[^)\s]+)/.exec(line);
    if (m) return m[1].replace(/\?[^:]*/, '');
  }
  return null;
}

function recordBackgroundTask(label, startedAt) {
  const ms = taskNow() - startedAt;
  taskLog.total++;
  if (ms < BACKGROUND_TASK_LOG_MS) return;
  taskLog.over4++;
  if (ms >= 50) taskLog.over50++;
  if (ms > taskLog.worstMs) taskLog.worstMs = ms;
  taskLog.rows[taskLog.head] = { at: startedAt, ms, label };
  taskLog.head = (taskLog.head + 1) % TASK_LOG_N;
}

function runTimedBackgroundTask(callback, site) {
  const startedAt = taskNow();
  const label = site || (callback && (callback.sfTaskLabel || callback.name)) || 'anonymous';
  try {
    callback();
  } finally {
    // The callback is often a promise resolver: the awaiting code resumes in the microtasks that
    // follow. Close the measurement three turns later so that resumed work is inside it.
    Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve())
      .then(() => recordBackgroundTask(label, startedAt));
  }
}

/** Tasks over BACKGROUND_TASK_LOG_MS, oldest first, plus counters since boot. */
export function readBackgroundTaskLog() {
  const rows = [];
  for (let i = 0; i < TASK_LOG_N; i++) {
    const row = taskLog.rows[(taskLog.head + i) % TASK_LOG_N];
    if (row) rows.push({ at: Math.round(row.at), ms: +row.ms.toFixed(1), label: row.label });
  }
  return { total: taskLog.total, over4: taskLog.over4, over50: taskLog.over50, worstMs: +taskLog.worstMs.toFixed(1), rows };
}
if (typeof globalThis !== 'undefined' && !globalThis.__SF_BG_TASKS__) globalThis.__SF_BG_TASKS__ = readBackgroundTaskLog;

export function postTaskAtBackgroundPriority(callback) {
  const site = armSiteLabel();
  const sched = typeof globalThis.scheduler === 'object' && globalThis.scheduler
    ? globalThis.scheduler
    : null;
  const yieldFn = sched && typeof sched.yield === 'function'
    ? () => sched.yield()
    : null;
  const postTask = sched && typeof sched.postTask === 'function'
    ? sched.postTask.bind(sched)
    : null;
  if (postTask) {
    let started = false;
    const run = () => {
      started = true;
      runTimedBackgroundTask(callback, site);
    };
    const fallback = () => {
      if (!started) setTimeout(run, 0);
    };
    try {
      Promise.resolve(postTask(run, { priority: 'background' })).catch(error => {
        if (started) setTimeout(() => { throw error; }, 0);
        else fallback();
      });
    } catch (error) {
      if (started) throw error;
      fallback();
    }
    return;
  }
  const timed = () => runTimedBackgroundTask(callback, site);
  if (yieldFn) Promise.resolve(yieldFn()).then(timed, timed);
  else setTimeout(timed, 0);
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
  let fallback;
  const site = armSiteLabel();
  let viaTimer = true;
  const fire = () => {
    if (fired) return;
    fired = true;
    clearTimeout(fallback);
    // Through the background dispatcher the task is already being timed; the timer fallback is not.
    if (viaTimer) runTimedBackgroundTask(callback, site);
    else callback();
  };
  fire.sfTaskLabel = site || (callback && (callback.sfTaskLabel || callback.name)) || 'anonymous';
  fallback = setTimeout(fire, Math.max(0, Number(boundMs) || 0));
  postTaskAtBackgroundPriority(() => { viaTimer = false; try { fire(); } finally { viaTimer = true; } });
}

/**
 * Arm work after the displayed frame so a 100ms+ job cannot nest inside present.
 * `idleBoundMs` > 0 bounds how long the post-present dispatch may wait for an idle slot —
 * use it for lanes whose starvation would otherwise stall the admission queue.
 */
export function armCallbackAfterPresent(callback, { idleBoundMs = 0 } = {}) {
  if (typeof callback !== 'function') return;
  let fired = false;
  let frameFallback;
  const fire = () => {
    if (fired) return;
    fired = true;
    clearTimeout(frameFallback);
    if (idleBoundMs > 0) postTaskAtBackgroundPriorityBounded(callback, idleBoundMs);
    else postTaskAtBackgroundPriority(callback);
  };
  const raf = typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : null;
  if (raf) raf(fire);
  // Headless / background documents can stall rAF forever. A short timeout unsticks
  // admission without putting the job on the present callback.
  if (!fired) frameFallback = setTimeout(fire, raf ? 48 : 0);
}
