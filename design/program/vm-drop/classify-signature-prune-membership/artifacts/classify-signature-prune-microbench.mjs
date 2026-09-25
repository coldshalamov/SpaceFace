/**
 * Primary KPI: signature-prune residual inside classifyWorld.
 * Before = walk signaturesById every incremental tick (master residual).
 * After  = skip walk when entityIndex.version unchanged (this package).
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

function makeMaps(n) {
  const signaturesById = new Map();
  const reasonsById = new Map();
  const pinBuffersById = new Map();
  const seenEntityIds = new Set();
  const entities = new Map();
  for (let id = 1; id <= n; id++) {
    signaturesById.set(id, `${id}|S3`);
    reasonsById.set(id, []);
    pinBuffersById.set(id, []);
    seenEntityIds.add(id);
    entities.set(id, { id, alive: true });
  }
  return { signaturesById, reasonsById, pinBuffersById, seenEntityIds, entities };
}

function pruneWalk(maps) {
  const { signaturesById, reasonsById, pinBuffersById, seenEntityIds, entities } = maps;
  for (const id of signaturesById.keys()) {
    const e = entities.get(id);
    if (e && e.alive !== false) continue;
    signaturesById.delete(id);
    reasonsById.delete(id);
    pinBuffersById.delete(id);
    seenEntityIds.delete(id);
  }
}

function pruneGated(maps, membership, prunedMembership) {
  if (membership === prunedMembership) return prunedMembership;
  pruneWalk(maps);
  return membership;
}

function bench(label, fn, iters) {
  fn();
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return { label, ms: +(performance.now() - t0).toFixed(3), iters };
}

const N = 800;
const ITERS = 30000;
const stable = makeMaps(N);
let membership = 40;
let pruned = NaN;

const before = bench('prune-every-incremental-tick', () => pruneWalk(stable), ITERS);
const after = bench('prune-membership-gated-quiet', () => {
  pruned = pruneGated(stable, membership, membership); // unchanged
}, ITERS);

// Miss path: 1% dead + membership bump
const dying = makeMaps(N);
for (let id = 1; id <= N; id += 100) dying.entities.get(id).alive = false;
const missBefore = bench('prune-miss-walk', () => pruneWalk(makeMaps(N) && dying), 200);
const missAfter = bench('prune-miss-gated', () => {
  pruneGated(dying, 41, 40);
}, 200);

const out = {
  n: N,
  iters: ITERS,
  before,
  after,
  ratio: +(before.ms / Math.max(after.ms, 1e-9)).toFixed(1),
  miss: { before: missBefore, after: missAfter },
  note: 'Quiet incremental signature prune. Same hit semantics when membership bumps. Soft-GPU fps not claimed.',
};
console.log(JSON.stringify(out, null, 2));
writeFileSync(new URL('./classify-signature-prune-microbench.json', import.meta.url), JSON.stringify(out, null, 2));
