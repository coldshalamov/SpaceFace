// Dispatch a callback in a separate task after the arming one, at background
// priority, with a starvation bound. A rAF/timer callback resolving inline lands
// the awaiting continuation as a microtask inside the frame's own task — the
// presented paint it meant to yield to then pays the resumed work. The render
// layer closes that class with compilePresentSlice's bounded post; this is the
// render-free twin for layers that cannot import render/* (save, ui, boot).
export function postTaskAtBackgroundPriorityBounded(callback, boundMs = 48) {
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    callback();
  };
  const sched = typeof globalThis.scheduler === 'object' && globalThis.scheduler
    ? globalThis.scheduler
    : null;
  const postTask = sched && typeof sched.postTask === 'function'
    ? sched.postTask.bind(sched)
    : null;
  if (postTask) postTask(fire, { priority: 'background' });
  else setTimeout(fire, 0);
  setTimeout(fire, Math.max(0, Number(boundMs) || 0));
}
