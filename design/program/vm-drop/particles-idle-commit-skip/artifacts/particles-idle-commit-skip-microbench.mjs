/**
 * Primary KPI: _integrateParticles quiet path when liveCount===0.
 * Before = assertWritable + commitDynamicBufferOwner(0) every frame (7 bindings).
 * After  = skip after first idle publish (particlesPublishedIdle).
 * Soft-GPU fps not claimed. Picture unchanged (mesh.count already 0).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const BINDINGS = 7;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const BINDINGS = ${BINDINGS};
function makeOwner() {
  return {
    invalid: false,
    disposed: false,
    mesh: { count: 0 },
    capacity: 256,
    touched: false,
    logicalGeneration: 0,
    diagnostics: { activeCount: 0, pendingGeneration: 0 },
    bindings: Array.from({ length: BINDINGS }, () => ({
      pending: { start: 0, end: 0, capacity: 256, logicalComponents: 0 },
      touchedSinceCommit: false,
    })),
  };
}
function assertWritable(owner) {
  if (!owner || owner.invalid || owner.disposed) return;
  // lifecycle assert stand-in
  owner._asserts = (owner._asserts || 0) + 1;
}
function commit(owner, activeCount) {
  assertWritable(owner);
  owner.mesh.count = activeCount;
  owner.diagnostics.activeCount = activeCount;
  if (owner.touched) owner.logicalGeneration++;
  for (let index = 0; index < owner.bindings.length; index++) {
    const binding = owner.bindings[index];
    const componentLimit = Math.min(binding.pending.capacity, activeCount * 1);
    if (binding.pending.start >= componentLimit) {
      binding.pending.start = 0;
      binding.pending.end = 0;
      binding.pending.logicalComponents = 0;
    } else if (binding.pending.end > componentLimit) {
      binding.pending.end = componentLimit;
    }
    if (binding.touchedSinceCommit) {
      binding.touchedSinceCommit = false;
      owner.diagnostics.pendingGeneration = owner.logicalGeneration;
    }
  }
  owner.touched = false;
}
function integrateBefore(host) {
  assertWritable(host.owner);
  if (host.liveCount <= 0) {
    host.pDrawMax = 0;
    commit(host.owner, 0);
    return;
  }
}
function integrateAfter(host) {
  if (host.liveCount <= 0) {
    host.pDrawMax = 0;
    if (host.particlesPublishedIdle) return;
    assertWritable(host.owner);
    commit(host.owner, 0);
    host.particlesPublishedIdle = true;
    return;
  }
  host.particlesPublishedIdle = false;
}
const host = { liveCount: 0, pDrawMax: 0, particlesPublishedIdle: false, owner: makeOwner() };
const fn = ${JSON.stringify(mode)} === 'before' ? integrateBefore : integrateAfter;
// Warm: after path publishes idle once so steady-state is the skip
for (let i = 0; i < 3000; i++) fn(host);
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(host);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, live: host.liveCount, count: host.owner.mesh.count,
  idle: !!host.particlesPublishedIdle, mode: ${JSON.stringify(mode)},
}));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status !== 0) throw new Error(`child failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const before = runOnce('before');
  const after = runOnce('after');
  if (before.live !== 0 || after.live !== 0) throw new Error('live checksum fail');
  if (before.count !== 0 || after.count !== 0) throw new Error('count checksum fail');
  pairs.push({
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / after.ms).toFixed(3),
  });
}
pairs.sort((a, b) => a.speedup - b.speedup);
const speeds = pairs.map((p) => p.speedup);
const result = {
  label: 'particles-idle-commit-skip',
  primary: 'quiet-particles-idle-commit-skip',
  iters: ITERS,
  bindings: BINDINGS,
  pairs,
  medianSpeedup: speeds[Math.floor(RUNS / 2)],
  minSpeedup: speeds[0],
  maxSpeedup: speeds[RUNS - 1],
  note: 'Picture unchanged: mesh.count already 0 after first idle commit.',
};
console.log(JSON.stringify(result, null, 2));
writeFileSync(
  new URL('./particles-idle-commit-skip-microbench.json', import.meta.url),
  JSON.stringify(result, null, 2),
);
