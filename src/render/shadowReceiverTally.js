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
// Under a perpetual markDirty storm a re-minted walk can never stamp — cap the
// supersessions so a measured-but-stale count settles after this many discards
// instead of serving an arbitrarily old count forever.
const RECOUNT_SUPERSEDE_CAP = 4;
// A capped settle leaves dirty set; without a quiet window the next resolve
// would immediately re-mint a whole-scene walk (~5 walks per stale stamp
// forever). Every consumer reads count as a boolean, so re-mint at most once
// per this many resolves while the storm persists — the self-heal is
// unchanged: a pause in the storm lets the next mint stamp cleanly.
const RECOUNT_STORM_QUIET_RESOLVES = 8;

/** Iterative pre-order twin of the recount traverse — same receiver test, yields
 * every `nodesPerSlice` visited nodes so resolve() can pace the fallback walk
 * across presented beats instead of paying one atomic O(scene) pass. */
function* recountShadowReceiversSteps(scene, nodesPerSlice = RECOUNT_NODES_PER_SLICE, notedWalk = null) {
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
    // Notes recorded while this walk was mid-flight get a per-root visit stamp:
    // a noted root measured post-note is already folded into `receivers`, so the
    // stamp only re-adds deltas of roots the walk never visited post-note.
    if (notedWalk) {
      notedWalk.seq += 1;
      if (notedWalk.notes.has(object)) notedWalk.visits.set(object, notedWalk.seq);
    }
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
  let supersededRecounts = 0;
  let recountCooldown = 0;
  // While a stepped recount is mid-walk, root-scoped notes record {delta, seq}
  // here instead of superseding the walk: the stamp re-adds a noted root's
  // delta only when the walk never visited that root post-note (a visited root
  // is already folded into the walk's own measurement). `loose` accumulates
  // positive scene-scoped deltas (receiver gains on nodes the walk can't
  // attribute a root to) — over-counting errs conservative-on, matching the
  // tally's boolean consumers. This converges `dirty` in ONE walk under
  // sustained note storms instead of discarding bounded slices forever.
  const notedWalk = { notes: new Map(), visits: new Map(), loose: 0, seq: 0 };
  const resetNotedWalk = () => {
    notedWalk.seq = 0;
    notedWalk.visits.clear();
    // A re-minted walk re-measures every node post-mutation: notes pending from
    // an earlier walk are now absorbed iff the fresh walk visits the root at
    // all (visit seqs start at 1, so a demoted seq-0 note is unabsorbed only
    // when the root stays unreachable). Loose deltas are dropped for the same
    // reason — a whole fresh walk subsumes them.
    for (const note of notedWalk.notes.values()) note.seq = 0;
    notedWalk.loose = 0;
  };
  const clearNotedWalk = () => {
    notedWalk.seq = 0;
    notedWalk.visits.clear();
    notedWalk.notes.clear();
    notedWalk.loose = 0;
  };

  return {
    get count() { return count; },
    get dirty() { return dirty; },
    get pending() { return pendingRecount !== null; },
    markDirty() {
      dirty = true;
      dirtySeq += 1;
    },
    // A root-scoped note landing mid-walk records {delta, seq} instead of
    // superseding: the walk stamps whether it measured that root post-note.
    noteAdded(root, measured) {
      const delta = Number.isFinite(measured) ? measured : countShadowReceivers(root);
      if (pendingRecount && root) {
        const prev = notedWalk.notes.get(root);
        notedWalk.notes.set(root, { delta: (prev ? prev.delta : 0) + delta, seq: notedWalk.seq });
      }
      count += delta;
      if (count < 0) count = 0;
    },
    noteRemoved(root, measured) {
      const delta = Number.isFinite(measured) ? measured : countShadowReceivers(root);
      // A removed root is unreachable: the pending walk can never measure it,
      // so the removal is absorbed by construction — nothing to record; the
      // note still settles the served count.
      count -= delta;
      if (count < 0) count = 0;
    },
    // Exact net receiver change a single policy traverse already measured —
    // keeps count current without the dirty fallback's whole-scene recount.
    noteDelta(delta) {
      if (!Number.isFinite(delta) || delta === 0) return;
      if (pendingRecount) {
        // Positive scene-scoped deltas fold into the stamp conservatively; a
        // negative one's absorption is unknowable, so it keeps the supersede.
        if (delta > 0) notedWalk.loose += delta;
        else dirtySeq += 1;
      }
      count += delta;
      if (count < 0) count = 0;
    },
    recount(scene) {
      pendingRecount = null;
      supersededRecounts = 0;
      recountCooldown = 0;
      clearNotedWalk();
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
        // Supersede at first detection, not just at completion — a dirty bump
        // mid-walk makes the remaining slices guaranteed-stale work.
        if (pendingRecount && pendingRecount.seq !== dirtySeq
          && supersededRecounts < RECOUNT_SUPERSEDE_CAP) {
          supersededRecounts += 1;
          try { pendingRecount.iter.return(); } catch (_) { /* discard proceeds */ }
          pendingRecount = null;
        }
        if (!pendingRecount) {
          if (!scene || typeof scene.traverse !== 'function') return count;
          if (recountCooldown > 0) { recountCooldown -= 1; return count; }
          resetNotedWalk();
          pendingRecount = { iter: recountShadowReceiversSteps(scene, RECOUNT_NODES_PER_SLICE, notedWalk), seq: dirtySeq };
        }
        const step = pendingRecount.iter.next();
        if (step.done) {
          const seqMatched = pendingRecount.seq === dirtySeq;
          if (seqMatched || supersededRecounts >= RECOUNT_SUPERSEDE_CAP) {
            // Seq-matched, or the dirty storm has superseded enough walks that a
            // measured-but-stale count is the better serve. A capped stale
            // settle keeps dirty set so the next resolve beat re-mints and the
            // count self-heals once the storm pauses.
            let stamped = Math.max(0, step.value | 0);
            for (const [root, note] of notedWalk.notes) {
              const visitSeq = notedWalk.visits.get(root);
              if (visitSeq === undefined || visitSeq <= note.seq) stamped += note.delta;
            }
            stamped += notedWalk.loose;
            count = Math.max(0, stamped | 0);
            clearNotedWalk();
            pendingRecount = null;
            supersededRecounts = 0;
            if (seqMatched) dirty = false;
            else recountCooldown = RECOUNT_STORM_QUIET_RESOLVES;
            return count;
          }
          // Mutations landed mid-walk — re-mint on the fresh seq while the
          // slice has budget left; otherwise park for the next resolve beat.
          supersededRecounts += 1;
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
