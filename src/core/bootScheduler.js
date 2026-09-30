/** Presentation-only cooperative startup scheduling. Does not change fixed-tick simulation. */
const clock = () => globalThis.performance?.now?.() ?? Date.now();

/** Resume in a task AFTER a paint opportunity; a bounded fallback also works in hidden tabs. */
export function yieldForBootPaint({ host = globalThis, boundMs = 50 } = {}) {
  return new Promise((resolve) => {
    let frame = null, task = null, bound = null, settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (frame !== null) host.cancelAnimationFrame?.(frame);
      if (task !== null) host.clearTimeout(task);
      if (bound !== null) host.clearTimeout(bound);
      resolve();
    };
    bound = host.setTimeout(finish, Math.max(1, boundMs));
    if (typeof host.requestAnimationFrame === 'function' && host.document?.hidden !== true) {
      frame = host.requestAnimationFrame(() => {
        frame = null;
        // Resolving inside rAF would run the await continuation BEFORE presentation.
        task = host.setTimeout(finish, 0);
      });
    } else task = host.setTimeout(finish, 0);
  });
}

export function createBootScheduler({ budgetMs = 4, now = clock, yieldToMain = yieldForBootPaint,
  isInputPending = () => globalThis.navigator?.scheduling?.isInputPending?.() === true } = {}) {
  const budget = Math.max(1, Math.min(12, Number(budgetMs) || 4));
  let began = now(), tasks = 0, yields = 0, longestTaskMs = 0;
  const timings = [];
  return {
    measure(name, work) {
      const start = now();
      try { return work(); }
      finally {
        const durationMs = Math.max(0, now() - start);
        longestTaskMs = Math.max(longestTaskMs, durationMs);
        // Bounded diagnostics, outside GameState and never used for simulation decisions.
        if (timings.length < 512) timings.push({ name: String(name), durationMs });
        tasks++;
      }
    },
    checkpoint(force = false) {
      let pending = false;
      try { pending = isInputPending(); } catch { /* optional browser hint */ }
      if (!force && !pending && now() - began < budget) return null;
      yields++;
      return Promise.resolve(yieldToMain()).then(() => { began = now(); });
    },
    snapshot() { return { budgetMs: budget, tasks, yields, longestTaskMs, timings: timings.slice() }; },
  };
}
