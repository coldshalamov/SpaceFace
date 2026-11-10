/**
 * Primary KPI: _integrateSprites quiet path when liveSpriteCount===0.
 * Before = resetInstancedSpriteBuckets (4× assert) + commitInstancedSpriteBuckets
 *          (4× commitDynamicBufferOwner, 7 bindings each) every frame.
 * After  = skip after first idle publish (spritesPublishedIdle).
 * Soft-GPU fps not claimed. Picture unchanged (mesh.count already 0).
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const BUCKETS = 4;
const BINDINGS = 7;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const BUCKETS = ${BUCKETS};
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
function resetBuckets(host) {
  for (let i = 0; i < host.owners.length; i++) {
    assertWritable(host.owners[i]);
    host.writeCounts[i] = 0;
  }
}
function commitBuckets(host) {
  for (let i = 0; i < host.owners.length; i++) {
    commit(host.owners[i], host.writeCounts[i]);
  }
}
function integrateBefore(host) {
  resetBuckets(host);
  if (host.liveSpriteCount <= 0) {
    commitBuckets(host);
    return;
  }
}
function integrateAfter(host) {
  if (host.liveSpriteCount <= 0) {
    if (host.spritesPublishedIdle) { host.skips++; return; }
    resetBuckets(host);
    commitBuckets(host);
    host.spritesPublishedIdle = true;
    host.walks++;
    return;
  }
  host.spritesPublishedIdle = false;
  resetBuckets(host);
  host.walks++;
}
const host = {
  liveSpriteCount: 0,
  spritesPublishedIdle: false,
  walks: 0,
  skips: 0,
  writeCounts: new Array(BUCKETS).fill(0),
  owners: Array.from({ length: BUCKETS }, () => makeOwner()),
};
const fn = ${JSON.stringify(mode)} === 'before' ? integrateBefore : integrateAfter;
for (let i = 0; i < 3000; i++) fn(host);
host.walks = 0; host.skips = 0;
const t0 = performance.now();
for (let i = 0; i < ${ITERS}; i++) fn(host);
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms, live: host.liveSpriteCount,
  count: host.owners[0].mesh.count,
  idle: !!host.spritesPublishedIdle,
  walks: host.walks, skips: host.skips,
  mode: ${JSON.stringify(mode)},
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

function wakeProof() {
  const script = `
let live = 0;
let idle = false;
let published = 0;
let skipped = 0;
function integrate() {
  if (live <= 0) {
    if (idle) { skipped++; return; }
    published++;
    idle = true;
    return;
  }
  idle = false;
  published++;
}
// quiet settle
for (let i = 0; i < 5; i++) integrate();
const quietOk = idle === true && published === 1 && skipped === 4;
// dirty wake: activate sprite
live = 1;
idle = false; // mirror _activateSprite clearing the flag
integrate();
const woke = live === 1 && idle === false && published === 2;
// drain + re-latch
live = 0;
integrate();
const relatch = idle === true && published === 3;
console.log(JSON.stringify({ ok: quietOk && woke && relatch, quietOk, woke, relatch, published, skipped }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`wake failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const b = runOnce('before');
  const a = runOnce('after');
  pairs.push({
    beforeMs: b.ms,
    afterMs: a.ms,
    speedup: b.ms / a.ms,
    afterSkips: a.skips,
    afterWalks: a.walks,
  });
}
const s = pairs.map((p) => p.speedup).sort((a, b) => a - b);
const median = s[Math.floor(s.length / 2)];
const minSpeedup = s[0];
const wake = wakeProof();
const out = {
  name: 'sprites-idle-commit-skip',
  primary: 'quiet-sprites-idle-commit-skip',
  iterations: ITERS,
  runs: RUNS,
  buckets: BUCKETS,
  bindingsPerBucket: BINDINGS,
  pairs,
  median,
  minSpeedup,
  dirtyWake: wake,
};
writeFileSync('artifacts/sprites-idle-commit-skip-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ median, minSpeedup, max: s[s.length - 1], dirtyWake: wake }, null, 2));
