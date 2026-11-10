/** Non-authoritative progress receipts. No timers, asset imports, GameState writes, or bus writes.
 * Listeners are scoped by renderer/render identity at the presenter; faults never break loading.
 */
const listeners = new Set();
let serial = 0;
export function observeBootWork(listener) {
  if (typeof listener !== 'function') throw new TypeError('Expected a progress observer');
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function reportBootWork(owner, receipt) {
  if (!listeners.size) return;
  for (const listener of listeners) {
    try { listener({ ...receipt, owner }); } catch { /* display is never a readiness gate */ }
  }
}
export function beginBootWork(owner, kind, total) {
  const key = ++serial;
  const count = Math.max(0, Math.floor(Number(total) || 0));
  let completed = 0;
  const send = (status) => reportBootWork(owner, { key, kind, total: count, completed, status });
  send('started');
  return {
    update(value, success = true) {
      if (!success) { send('failed'); return; }
      completed = Math.max(completed, Math.min(count, Math.floor(Number(value) || 0)));
      send(completed === count ? 'complete' : 'progress');
    },
  };
}

/** Map REAL sub-work into the current coarse stage. Denominators can grow; the model, not the
 * readiness code, absorbs that uncertainty. Reserve 18% of the phase for late-discovered work.
 */
export function createBootWorkAccumulator(stage) {
  const base = Number(stage.progress) || 0;
  const end = Number(stage.ceiling) || ({
    'authored-library': .50, 'authored-visuals': .78,
    'render-pipelines': .90, 'gpu-resources': .94,
  }[stage.id] ?? base);
  const jobs = new Map();
  const milestones = new Set();
  let high = base;
  return {
    accept(receipt) {
      if (!receipt || receipt.status === 'failed' || receipt.outcome === 'timeout'
          || receipt.outcome === 'error' || receipt.step === 'lane') return null;
      if (receipt.kind === 'cook-step') {
        if (receipt.outcome !== 'resolved') return null;
        milestones.add(receipt.step);
      } else {
        if (!Number.isFinite(receipt.total) || receipt.total <= 0 || !Number.isFinite(receipt.completed)) return null;
        // A bounded table; overwrite updates of the same pass rather than accumulate every event.
        if (jobs.size >= 128 && !jobs.has(receipt.key)) return null;
        jobs.set(receipt.key, { total: receipt.total, completed: Math.min(receipt.total, receipt.completed) });
      }
      let total = 0, completed = 0;
      for (const job of jobs.values()) { total += job.total; completed += job.completed; }
      const workFraction = total ? completed / total : 0;
      // Cook steps have no promised total. Treat them as evidence, never "all work complete".
      const stepFraction = milestones.size / (milestones.size + 5);
      const fraction = Math.max(workFraction * .82, stepFraction * .82);
      high = Math.max(high, base + Math.max(0, end - base) * fraction);
      return { progress: high, completed, total, milestones: milestones.size };
    },
  };
}
