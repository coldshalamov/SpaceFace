/**
 * Primary KPI: quiet combat prePhysics status+subsystem residual.
 * Before = statuses.advance Object.keys×2 + due[] + applyPending full subsystem walk.
 * After  = empty-status early-out + dueScratch + pendingSubsystemTransitionCount skip.
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const ROOT = process.cwd();

function runOnce(mode, iters = 50000, n = 48, subs = 6) {
  const script = `
function sortedIds(runtime) {
  let cached = runtime._sfSortedSubsystemIds;
  if (cached) return cached;
  cached = Object.keys(runtime.subsystems).sort();
  runtime._sfSortedSubsystemIds = cached;
  return cached;
}
function hasActive(statuses) {
  if (!statuses) return false;
  for (const _ in statuses) return true;
  return false;
}
function advanceBefore(runtime, tick) {
  let changed = runtime.statusModifiersDirty === true;
  if (changed) delete runtime.statusModifiersDirty;
  for (const statusId of Object.keys(runtime.statuses || {}).sort()) {
    const active = runtime.statuses[statusId];
    if (active.expiresTick > tick) continue;
    delete runtime.statuses[statusId];
    changed = true;
  }
  const due = [];
  while (runtime.pendingStatuses.length && runtime.pendingStatuses[0].applyTick <= tick)
    due.push(runtime.pendingStatuses.shift());
  for (const p of due) {
    runtime.statuses[p.id] = { expiresTick: tick + 10 };
    changed = true;
  }
  for (const statusId of Object.keys(runtime.statuses || {}).sort()) {
    void runtime.statuses[statusId];
  }
  return changed;
}
function advanceAfter(runtime, tick, dueScratch) {
  const statuses = runtime.statuses;
  const pending = runtime.pendingStatuses;
  let changed = runtime.statusModifiersDirty === true;
  if (!changed && pending.length === 0 && !hasActive(statuses)) return false;
  if (changed) delete runtime.statusModifiersDirty;
  if (hasActive(statuses)) {
    for (const statusId of Object.keys(statuses).sort()) {
      const active = statuses[statusId];
      if (active.expiresTick > tick) continue;
      delete statuses[statusId];
      changed = true;
    }
  }
  const due = dueScratch; due.length = 0;
  while (pending.length && pending[0].applyTick <= tick) due.push(pending.shift());
  for (let i = 0; i < due.length; i++) {
    statuses[due[i].id] = { expiresTick: tick + 10 };
    changed = true;
  }
  if (hasActive(statuses)) {
    for (const statusId of Object.keys(statuses).sort()) void statuses[statusId];
  }
  return changed;
}
function applyBefore(runtime, tick) {
  let changed = false;
  for (const id of sortedIds(runtime)) {
    const subsystem = runtime.subsystems[id];
    const pending = subsystem.pendingTransition;
    if (!pending || pending.atTick > tick) continue;
    subsystem.pendingTransition = null;
    changed = true;
  }
  if (!changed && runtime.statusModifiersDirty === true) delete runtime.statusModifiersDirty;
  return changed;
}
function applyAfter(runtime, tick) {
  const hasPending = (runtime.pendingSubsystemTransitionCount | 0) > 0;
  const dirty = runtime.statusModifiersDirty === true;
  if (!hasPending && !dirty) return false;
  let changed = false;
  if (hasPending) {
    for (const id of sortedIds(runtime)) {
      const subsystem = runtime.subsystems[id];
      const pending = subsystem.pendingTransition;
      if (!pending || pending.atTick > tick) continue;
      subsystem.pendingTransition = null;
      if (runtime.pendingSubsystemTransitionCount > 0) runtime.pendingSubsystemTransitionCount--;
      changed = true;
    }
  }
  if (!changed && dirty) delete runtime.statusModifiersDirty;
  return changed;
}

const runtimes = [];
for (let i = 0; i < ${n}; i++) {
  const subsystems = {};
  for (let s = 0; s < ${subs}; s++) {
    subsystems['sub_'+s] = { pendingTransition: null, destroyed: false, health: 100 };
  }
  runtimes.push({
    statuses: {},
    pendingStatuses: [],
    statusModifiersDirty: false,
    pendingSubsystemTransitionCount: 0,
    subsystems,
    _sfSortedSubsystemIds: Object.keys(subsystems).sort(),
  });
}
const mode = ${JSON.stringify(mode)};
const dueScratch = [];
for (let w = 0; w < 300; w++) {
  for (const r of runtimes) {
    if (mode === 'before') { applyBefore(r, w); advanceBefore(r, w); }
    else { applyAfter(r, w); advanceAfter(r, w, dueScratch); }
  }
}
const t0 = performance.now();
for (let i = 0; i < ${iters}; i++) {
  for (const r of runtimes) {
    if (mode === 'before') { applyBefore(r, i); advanceBefore(r, i); }
    else { applyAfter(r, i); advanceAfter(r, i, dueScratch); }
  }
}
process.stdout.write(JSON.stringify({ ms: performance.now() - t0 }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', cwd: ROOT, timeout: 180000,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'fail');
  return JSON.parse(r.stdout);
}

const pairs = [];
for (let i = 0; i < 9; i++) {
  const before = runOnce('before');
  const after = runOnce('after');
  pairs.push({
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / Math.max(after.ms, 1e-9)).toFixed(3),
  });
}
const xs = pairs.map((p) => p.speedup).sort((a, b) => a - b);
const out = {
  primary: 'quiet-48-combatant-status-subsystem-prephysics',
  secondary: {
    statusAdvanceEmpty: 'see combat-status-advance-quiet-skip-microbench.json',
    subsystemPendingSkip: 'see combat-subsystem-pending-quiet-skip-microbench.json',
  },
  iters: 50000,
  combatants: 48,
  subsystemsPer: 6,
  pairs,
  medianSpeedup: +xs[Math.floor(xs.length / 2)].toFixed(3),
  minSpeedup: +xs[0].toFixed(3),
  maxSpeedup: +xs[xs.length - 1].toFixed(3),
};
writeFileSync('artifacts/combat-status-subsystem-quiet-skip-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
