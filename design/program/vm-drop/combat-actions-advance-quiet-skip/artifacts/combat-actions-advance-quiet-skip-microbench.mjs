/**
 * Primary KPI: quiet combat actions.advance empty path under registry.step / prePhysics.
 * Before = always processRequests (alloc due/future + requests rebind) + Object.keys(active).sort.
 * After  = early-out when requests empty and activeByActor has no keys (for-in O(1)).
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();

function runOnce(mode, iters = 800000) {
  const script = `
function compareEntityKeys(a, b) {
  const an = Number(a), bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return a < b ? -1 : a > b ? 1 : 0;
}
function hasActiveActionKeys(active) {
  if (!active) return false;
  for (const _ in active) return true;
  return false;
}
const state = {
  tick: 0,
  combat: { actions: { requests: [], activeByActor: {}, nextRequestSeq: 1, nextInstanceSeq: 1 } },
};
function processRequestsBefore() {
  const due = [];
  const future = [];
  for (const request of state.combat.actions.requests) {
    if (request.notBeforeTick <= state.tick) due.push(request); else future.push(request);
  }
  state.combat.actions.requests = future;
  due.sort((a, b) => a.seq - b.seq);
}
function advanceBefore() {
  processRequestsBefore();
  const active = state.combat.actions.activeByActor;
  for (const key of Object.keys(active).sort(compareEntityKeys)) {
    if (active[key]) {}
  }
}
function advanceAfter() {
  const requests = state.combat.actions.requests;
  const active = state.combat.actions.activeByActor;
  if ((!requests || requests.length === 0) && !hasActiveActionKeys(active)) return;
  if (requests && requests.length > 0) processRequestsBefore();
  if (!hasActiveActionKeys(active)) return;
  for (const key of Object.keys(active).sort(compareEntityKeys)) {
    if (active[key]) {}
  }
}
const fn = ${JSON.stringify(mode)} === 'before' ? advanceBefore : advanceAfter;
for (let w = 0; w < 5000; w++) fn();
const t0 = performance.now();
for (let i = 0; i < ${iters}; i++) { state.tick = i; fn(); }
process.stdout.write(JSON.stringify({ ms: performance.now() - t0 }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', cwd: ROOT, timeout: 180000,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'fail');
  return JSON.parse(r.stdout);
}

const pairs = [];
for (let i = 0; i < 11; i++) {
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
  label: 'combat-actions-advance-quiet-skip',
  primary: 'quiet-actions-advance-empty-path',
  pairs,
  medianSpeedup: xs[Math.floor(xs.length / 2)],
  minSpeedup: xs[0],
  maxSpeedup: xs[xs.length - 1],
  note: 'Before=processRequests alloc + Object.keys.sort every tick. After=empty early-out. Soft-GPU fps not claimed.',
};
writeFileSync(join(ROOT, 'artifacts/combat-actions-advance-quiet-skip-microbench.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
