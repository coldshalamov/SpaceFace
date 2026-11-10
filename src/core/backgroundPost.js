// Dispatch a callback in a separate task after the arming one, at background
// priority, with a starvation bound. A rAF/timer callback resolving inline lands
// the awaiting continuation as a microtask inside the frame's own task — the
// presented paint it meant to yield to then pays the resumed work. The render
// layer closes that class with compilePresentSlice's bounded post; this is the
// render-free twin for layers that cannot import render/* (save, ui, boot).
export function postTaskAtBackgroundPriorityBounded(callback, boundMs = 48) {
  let fired = false;
  let callbackError;
  let callbackThrew = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    try { callback(); }
    catch (error) { callbackThrew = true; callbackError = error; throw error; }
  };
  const sched = typeof globalThis.scheduler === 'object' && globalThis.scheduler
    ? globalThis.scheduler
    : null;
  const postTask = sched && typeof sched.postTask === 'function'
    ? sched.postTask.bind(sched)
    : null;
  // Arm the starvation bound first: a scheduler implementation may throw before it posts.
  setTimeout(fire, Math.max(0, Number(boundMs) || 0));
  if (postTask) {
    try {
      // A rejected scheduler promise must not become an unhandled rejection. If it rejected
      // because the callback itself threw, surface that callback error as a normal task error.
      Promise.resolve(postTask(fire, { priority: 'background' })).catch((error) => {
        if (callbackThrew && error === callbackError) setTimeout(() => { throw error; }, 0);
      });
    } catch (error) {
      if (callbackThrew && error === callbackError) setTimeout(() => { throw error; }, 0);
      // The bounded timer owns the callback when posting failed synchronously.
    }
  } else setTimeout(fire, 0);
}
