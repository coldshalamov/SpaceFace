// Budgeted frame tasks.
//
// A frame has two kinds of work. The first kind must happen every presented frame or the picture
// is wrong: read the newest poses, move the camera, draw. The second kind only has to be *recent*:
// HUD readouts, the minimap, label placement, residency service, activity classification, ambient
// effect logic. Doing the second kind in full on every frame is what put the main thread at
// 70 ms a frame in a round-6 Swarm fight (measured 2026-11-21 at 1920x1080), and at low frame
// rates a plain "at most N times a second" throttle saves nothing, because every frame is already
// further apart than the interval, so every frame still pays for everything.
//
// This scheduler gives each recurring job a wanted rate and gives the whole group a time budget
// per frame. Each call to run() executes the most overdue jobs until the budget is spent and
// leaves the rest for the next frame, so the group's cost per frame is bounded whatever the frame
// rate is. A job that has waited too long runs anyway (one such job per frame), so nothing starves.
//
// Rules for a job: it must tolerate being called late and with any elapsed time (it receives the
// seconds since its own last run), and anything that must track the picture frame-for-frame does
// not belong here.

const registries = new Map();

function defaultNow() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

/**
 * @param {object} [options]
 * @param {string} [options.name] diagnostic name; schedulers with a name are listed by frameTaskStats().
 * @param {() => number} [options.now] millisecond clock (tests inject one).
 * @param {number} [options.budgetMs] default budget for run() when none is passed.
 */
export function createFrameTaskScheduler(options = {}) {
  const now = typeof options.now === 'function' ? options.now : defaultNow;
  const defaultBudgetMs = Number.isFinite(options.budgetMs) && options.budgetMs > 0 ? options.budgetMs : 2;
  const tasks = [];
  const byName = new Map();
  const due = [];
  let runs = 0;
  let lastRunCostMs = 0;
  let maxRunCostMs = 0;
  let overBudgetRuns = 0;

  /**
   * @param {string} name
   * @param {(elapsedSeconds: number, nowMs: number) => void} fn
   * @param {object} [spec]
   * @param {number} [spec.hz] wanted runs per second (default 10).
   * @param {number} [spec.priority] higher runs first among jobs that are equally overdue.
   * @param {number} [spec.maxLateMs] a job later than this runs even when the budget is spent
   *   (default four intervals, at least 250 ms).
   */
  function register(name, fn, spec = {}) {
    if (typeof name !== 'string' || !name) throw new TypeError('frame task needs a name');
    if (typeof fn !== 'function') throw new TypeError(`frame task ${name} needs a function`);
    if (byName.has(name)) unregister(name);
    const hz = Number.isFinite(spec.hz) && spec.hz > 0 ? spec.hz : 10;
    const intervalMs = 1000 / hz;
    const maxLateMs = Number.isFinite(spec.maxLateMs) && spec.maxLateMs >= 0
      ? spec.maxLateMs
      : Math.max(250, intervalMs * 4);
    const t = now();
    const task = {
      name,
      fn,
      intervalMs,
      maxLateMs,
      priority: Number.isFinite(spec.priority) ? spec.priority : 0,
      // Stagger first runs so jobs registered together do not all come due on the same frame.
      // lastRunAt is the schedule anchor (it advances by whole intervals so a 10 Hz job really
      // runs 10 times a second at any frame rate); lastActualAt is when the job last really ran.
      lastRunAt: t - intervalMs * ((tasks.length * 0.61803398875) % 1),
      lastActualAt: t,
      requested: true,
      runs: 0,
      errors: 0,
      lastMs: 0,
      emaMs: 0,
      maxMs: 0,
      maxLateSeenMs: 0,
      deferred: 0,
      lateness: 0,
    };
    tasks.push(task);
    byName.set(name, task);
    return {
      name,
      /** Ask for a run at the next frame regardless of the interval (a value just changed). */
      request() { task.requested = true; },
      unregister() { unregister(name); },
    };
  }

  function unregister(name) {
    const task = byName.get(name);
    if (!task) return false;
    byName.delete(name);
    const index = tasks.indexOf(task);
    if (index >= 0) tasks.splice(index, 1);
    return true;
  }

  function request(name) {
    const task = byName.get(name);
    if (task) task.requested = true;
    return !!task;
  }

  function execute(task, startedAt) {
    const elapsedSeconds = Math.max(0, (startedAt - task.lastActualAt) / 1000);
    const lateMs = Math.max(0, startedAt - task.lastRunAt - task.intervalMs);
    if (lateMs > task.maxLateSeenMs) task.maxLateSeenMs = lateMs;
    // Keep the phase while the job is on time; re-anchor to now once it is a whole interval late
    // or was asked for early, so a stall is never repaid with a burst of catch-up runs.
    const onSchedule = !task.requested && lateMs < task.intervalMs;
    task.lastRunAt = onSchedule ? task.lastRunAt + task.intervalMs : startedAt;
    task.lastActualAt = startedAt;
    task.requested = false;
    try {
      task.fn(elapsedSeconds, startedAt);
    } catch (_) {
      task.errors++;
    }
    const cost = Math.max(0, now() - startedAt);
    task.runs++;
    task.lastMs = cost;
    task.emaMs = task.runs === 1 ? cost : task.emaMs + (cost - task.emaMs) * 0.1;
    if (cost > task.maxMs) task.maxMs = cost;
    return cost;
  }

  /**
   * Run due jobs, most overdue first, until budgetMs is spent. At least one due job always runs.
   * Returns the milliseconds spent.
   */
  function run(budgetMs = defaultBudgetMs) {
    const budget = Number.isFinite(budgetMs) && budgetMs >= 0 ? budgetMs : defaultBudgetMs;
    const startedAt = now();
    due.length = 0;
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const waited = startedAt - task.lastRunAt;
      if (!task.requested && waited < task.intervalMs) continue;
      // Lateness in intervals: a 30 Hz job two intervals late outranks a 4 Hz job one interval late.
      task.lateness = task.requested ? Infinity : waited / task.intervalMs;
      due.push(task);
    }
    if (!due.length) { lastRunCostMs = 0; return 0; }
    due.sort((a, b) => (b.lateness - a.lateness) || (b.priority - a.priority));
    let spent = 0;
    let ranOverBudget = false;
    for (let i = 0; i < due.length; i++) {
      const task = due[i];
      const t = now();
      spent = t - startedAt;
      if (i > 0 && spent >= budget) {
        // Budget spent. A starving job still runs, one per frame, so the worst case stays bounded.
        const starving = (t - task.lastRunAt - task.intervalMs) >= task.maxLateMs;
        if (!starving || ranOverBudget) { task.deferred++; continue; }
        ranOverBudget = true;
      }
      execute(task, t);
    }
    spent = Math.max(0, now() - startedAt);
    runs++;
    lastRunCostMs = spent;
    if (spent > maxRunCostMs) maxRunCostMs = spent;
    if (spent > budget * 1.5 + 0.5) overBudgetRuns++;
    return spent;
  }

  function stats() {
    return {
      runs,
      lastRunCostMs,
      maxRunCostMs,
      overBudgetRuns,
      tasks: tasks.map((task) => ({
        name: task.name,
        hz: +(1000 / task.intervalMs).toFixed(2),
        runs: task.runs,
        emaMs: +task.emaMs.toFixed(3),
        maxMs: +task.maxMs.toFixed(3),
        maxLateMs: Math.round(task.maxLateSeenMs),
        deferred: task.deferred,
        errors: task.errors,
      })),
    };
  }

  function resetStats() {
    runs = 0; lastRunCostMs = 0; maxRunCostMs = 0; overBudgetRuns = 0;
    for (const task of tasks) {
      task.runs = 0; task.errors = 0; task.lastMs = 0; task.emaMs = 0; task.maxMs = 0;
      task.maxLateSeenMs = 0; task.deferred = 0;
    }
  }

  const scheduler = Object.freeze({ register, unregister, request, run, stats, resetStats });
  if (typeof options.name === 'string' && options.name) registries.set(options.name, scheduler);
  return scheduler;
}

/** Stats of every named scheduler, for probes: { [name]: stats }. */
export function frameTaskStats() {
  const out = {};
  for (const [name, scheduler] of registries) out[name] = scheduler.stats();
  return out;
}

if (typeof globalThis !== 'undefined' && !globalThis.__SF_FRAME_TASKS__) {
  try { globalThis.__SF_FRAME_TASKS__ = frameTaskStats; } catch (_) { /* frozen global: diagnostics only */ }
}
