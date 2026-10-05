// Incremental shadow-receiver count.
//
// The default path used to scene.traverse() on every mesh build/evict/swap just to decide
// whether the directional map should stay on. Streaming-heavy flight paid that O(scene) walk
// on the same frames that already built meshes. The tally is exact when callers report
// add/remove; recount() is the dirty fallback.

export function countShadowReceivers(root, out = null) {
  if (!root) return 0;
  let receivers = 0;
  let nodes = 1;
  if (root.receiveShadow === true) receivers += 1;
  const children = root.children;
  if (children && children.length && typeof root.traverse === 'function') {
    // traverse visits root itself, so the node count restarts at 0 here.
    nodes = 0;
    root.traverse((object) => {
      nodes += 1;
      if (object && object !== root && object.receiveShadow === true) receivers += 1;
    });
  }
  if (out) out.nodes = nodes;
  return receivers;
}

const tallyNow = () => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
);
const RECOUNT_SLICE_MS = 4;
const RECOUNT_NODES_PER_SLICE = 512;

/** Iterative pre-order twin of the recount traverse — same receiver test, yields
 * every `nodesPerSlice` visited nodes so resolve() can pace the fallback walk
 * across presented beats instead of paying one atomic O(scene) pass. */
function* recountShadowReceiversSteps(scene, nodesPerSlice = RECOUNT_NODES_PER_SLICE) {
  let receivers = 0;
  if (!scene) return receivers;
  const every = Math.max(1, Math.floor(Number(nodesPerSlice) || 1));
  const stack = [scene];
  let sinceYield = 0;
  while (stack.length > 0) {
    const object = stack.pop();
    if (!object) continue;
    if ((++sinceYield % every) === 0) yield;
    if (object.receiveShadow === true) receivers += 1;
    const children = object.children;
    if (children) for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
  return receivers;
}

export function createShadowReceiverTally() {
  let count = 0;
  let dirty = true;
  // A dirty mark bumps the sequence: a stepped recount minted on an older seq
  // discards its walk instead of stamping a count measured across a mutation.
  let dirtySeq = 0;
  let pendingRecount = null;

  return {
    get count() { return count; },
    get dirty() { return dirty; },
    markDirty() {
      dirty = true;
      dirtySeq += 1;
    },
    noteAdded(root) {
      count += countShadowReceivers(root);
      if (count < 0) count = 0;
    },
    noteRemoved(root) {
      count -= countShadowReceivers(root);
      if (count < 0) count = 0;
    },
    // Exact net receiver change a single policy traverse already measured —
    // keeps count current without the dirty fallback's whole-scene recount.
    noteDelta(delta) {
      if (!Number.isFinite(delta) || delta === 0) return;
      count += delta;
      if (count < 0) count = 0;
    },
    recount(scene) {
      pendingRecount = null;
      const it = recountShadowReceiversSteps(scene);
      for (;;) {
        const step = it.next();
        if (step.done) {
          count = Math.max(0, step.value | 0);
          break;
        }
      }
      dirty = false;
      return count;
    },
    resolve(scene, options = {}) {
      if (options.force === true) return this.recount(scene);
      if (!dirty) return count;
      // Dirty: pace the stepped recount inside this call's bounded slice and
      // keep serving the last count until a clean walk settles.
      const start = tallyNow();
      while (dirty) {
        if (!pendingRecount) {
          if (!scene || typeof scene.traverse !== 'function') return count;
          pendingRecount = { iter: recountShadowReceiversSteps(scene), seq: dirtySeq };
        }
        const step = pendingRecount.iter.next();
        if (step.done) {
          if (pendingRecount.seq === dirtySeq) {
            count = Math.max(0, step.value | 0);
            pendingRecount = null;
            dirty = false;
            return count;
          }
          // Mutations landed mid-walk — re-mint on the fresh seq while the
          // slice has budget left; otherwise park for the next resolve beat.
          pendingRecount = null;
          if (tallyNow() - start >= RECOUNT_SLICE_MS) return count;
          continue;
        }
        if (tallyNow() - start >= RECOUNT_SLICE_MS) return count;
      }
      return count;
    },
  };
}

/** LOD/policy flag rewrites must dirty the tally so add/remove cannot drain it to zero. */
export function noteShadowPolicyChanged(tally, changed) {
  if (!tally || typeof tally.markDirty !== 'function') return false;
  // A policy traverse that measured its own receiver delta settles the tally
  // exactly — no dirty mark, no recount. Boolean results keep the old contract.
  if (changed && typeof changed === 'object') {
    const delta = changed.receiverDelta;
    if (Number.isFinite(delta)) {
      if (delta !== 0) {
        if (typeof tally.noteDelta === 'function') {
          tally.noteDelta(delta);
        } else {
          tally.markDirty();
        }
      }
      return true;
    }
    return false;
  }
  if (changed !== true) return false;
  tally.markDirty();
  return true;
}
