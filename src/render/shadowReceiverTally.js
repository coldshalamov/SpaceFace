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
 * across presented beats instead of paying one atomic O(scene) pass.
 *
 * Frame stack: each frame is pushed when its node is first touched and popped
 * when the node's subtree is exhausted, so the stack is exactly the open
 * ancestor chain of the walk cursor. That shape is what makes the noted
 * walk's probes cheap: detached membership propagates through frame.dead
 * (marked once per resume over the chain instead of an O(depth) parent walk
 * per pop), and "root's subtree finished" is an openSet membership test.
 * Graph mutations can only land while the generator is suspended at a yield,
 * so all staleness checks run in a single O(depth) resume pass:
 *  - a frame whose node sits in the detached set (a noteRemoved root) kills
 *    its whole suffix — every deeper member is under it;
 *  - a broken parent link (f.node.parent !== parentFrame.node) is resolved
 *    once with the legacy ancestry probe — live means the node reparented
 *    inside the scene and still counts, dead means un-noted detach;
 *  - a sibling splice (children[idx] drifted off the frame's node) re-indexes
 *    the parent's cursor via indexOf so an already-visited sibling's removal
 *    can't skip an unvisited subtree.
 */
function* recountShadowReceiversSteps(scene, nodesPerSlice = RECOUNT_NODES_PER_SLICE, notedWalk = null) {
  let receivers = 0;
  if (!scene) return receivers;
  const every = Math.max(1, Math.floor(Number(nodesPerSlice) || 1));
  const detached = notedWalk ? notedWalk.detached : null;
  const openSet = notedWalk ? notedWalk.openSet : null;
  const stack = [{
    node: scene,
    idx: -1,
    // kidCount stamps the children-array length the frame last saw so a
    // resume can detect below-cursor inserts (growth the indexOf shift alone
    // cannot locate) — see the shifted compare below.
    kidCount: scene.children ? scene.children.length : 0,
    dead: detached && detached.size > 0 && detached.has(scene) ? 1 : 0,
    visited: false,
  }];
  if (openSet) openSet.add(scene);
  let sinceYield = 0;
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.dead !== 0) {
      stack.pop();
      if (openSet) openSet.delete(frame.node);
      continue;
    }
    const object = frame.node;
    if (!frame.visited) {
      frame.visited = true;
      sinceYield += 1;
      if (sinceYield >= every) {
        sinceYield = 0;
        yield;
        if (detached) {
          // Mutations landed inside the suspend: re-verify the open chain once
          // per resume rather than probing ancestry per visited node.
          let deadAt = -1;
          let gapSeed = null;
          for (let i = 1; i < stack.length; i += 1) {
            const f = stack[i];
            if (f.dead !== 0 || (detached.size > 0 && detached.has(f.node))) {
              deadAt = i;
              break;
            }
            const parentFrame = stack[i - 1];
            if (f.node.parent !== parentFrame.node) {
              // Un-noted detach or reparent — decide once per break with the
              // probe the flat stack paid per pop.
              let live = false;
              for (let p = f.node; p; p = p.parent) {
                if (detached.has(p)) break;
                if (p === scene) { live = true; break; }
              }
              if (!live) { deadAt = i; break; }
            } else if (parentFrame.node.children
                && parentFrame.node.children[parentFrame.idx] !== f.node) {
              const shifted = parentFrame.node.children.indexOf(f.node);
              // The resume pass charges its own work: each indexOf is
              // O(siblings) — count it against the slice budget like a visit.
              sinceYield += 1;
              if (shifted < 0) deadAt = i;
              else {
                // Insert-before-cursor: children between the recorded cursor
                // and the row's new index would never be pushed — a silent
                // splice could then stamp an under-counted total. Seed them
                // for a walk instead: rows already visited re-walk once
                // (bounded over-count, the legal direction).
                if (shifted > parentFrame.idx) {
                  if (!gapSeed) gapSeed = [];
                  gapSeed.push({ node: parentFrame.node, from: parentFrame.idx, to: shifted });
                }
                // Below-cursor inserts (unshift / splice(0,..) / a reorder
                // dragging an unvisited row ahead of the cursor) leave the
                // chain child where the indexOf still finds it but put fresh
                // rows in the consumed prefix — invisible to the gap seed.
                // Array growth is the tell: when the children list got longer
                // than the frame last saw, rescan the consumed prefix for
                // unvisited members.
                const kidCount = parentFrame.kidCount | 0;
                if (parentFrame.node.children.length > kidCount) {
                  const prefixTo = Math.min(shifted, parentFrame.idx);
                  if (prefixTo > 0) {
                    if (!gapSeed) gapSeed = [];
                    gapSeed.push({
                      node: parentFrame.node,
                      from: 0,
                      to: prefixTo,
                      prefix: true,
                    });
                  }
                }
                parentFrame.idx = shifted;
                parentFrame.kidCount = parentFrame.node.children.length;
              }
              if (deadAt >= 0) break;
            }
          }
          if (deadAt >= 0) {
            for (let k = deadAt; k < stack.length; k += 1) stack[k].dead = 1;
          } else if (gapSeed) {
            // Reverse-push so the lowest-indexed unvisited sibling pops first.
            // Rows already on the stack (an earlier seed or the open chain
            // itself — prefix scans re-see live rows) are skipped rather than
            // pushed twice; the seeded span still bounds the slice the same
            // way visited nodes do.
            for (const gap of gapSeed) {
              for (let j = gap.to - 1; j >= gap.from; j -= 1) {
                const node = gap.node.children[j];
                if (openSet && openSet.has(node)) continue;
                stack.push({
                  node,
                  idx: -1,
                  kidCount: node.children ? node.children.length : 0,
                  dead: detached.size > 0 && detached.has(node) ? 1 : 0,
                  visited: false,
                });
                if (openSet) openSet.add(node);
                sinceYield += 1;
                // A seeded span is real work — yield mid-seed instead of
                // letting a wide splice turn one resume into its own burst.
                if (sinceYield >= every) {
                  sinceYield = 0;
                  yield;
                }
              }
            }
          }
          if (frame.dead !== 0) {
            stack.pop();
            if (openSet) openSet.delete(object);
            continue;
          }
        }
      }
      if (object.receiveShadow === true) receivers += 1;
      // Every visited object gets a visit stamp, not just noted roots: a note
      // landing later can only decide "did the walk already measure this
      // root?" if the walk recorded its own measurement unconditionally.
      if (notedWalk) {
        notedWalk.seq += 1;
        // visits has subscribers only while a note or detached root can name a
        // visited node — gate the per-visit Map write so a clean walk pays
        // zero churn. A lazy miss errs over-count: unvisited roots skip the
        // -delta write entirely and add-notes re-stamp, both conservative-on.
        if (notedWalk.notes.size > 0 || detached.size > 0) {
          notedWalk.visits.set(object, notedWalk.seq);
          // FIFO-evict past the cap — a missing stamp only ever converts to
          // the conservative side (pending notes stamp their delta; bare
          // removals skip the retraction), so the cap bounds storm-frame map
          // churn without an unsafe drop direction.
          while (notedWalk.visits.size > NOTED_WALK_VISITS_CAP) {
            notedWalk.visits.delete(notedWalk.visits.keys().next().value);
          }
        }
      }
    }
    const children = object.children;
    if (children && frame.idx + 1 < children.length) {
      frame.idx += 1;
      const child = children[frame.idx];
      stack.push({
        node: child,
        idx: -1,
        kidCount: child.children ? child.children.length : 0,
        dead: detached && detached.size > 0 && detached.has(child) ? 1 : 0,
        visited: false,
      });
      if (openSet) openSet.add(child);
    } else {
      stack.pop();
      if (openSet) openSet.delete(object);
    }
  }
  return receivers;
}

// Upper bound on the noted walk's per-pop visit stamps — one entry per
// live-popped node would otherwise grow the map O(scene) during a noted
// recount storm. See the pop-site comment for why eviction is conservative.
const NOTED_WALK_VISITS_CAP = 4096;

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
  const notedWalk = { notes: new Map(), visits: new Map(), loose: 0, seq: 0, detached: new Set(), openSet: new Set() };
  const resetNotedWalk = () => {
    notedWalk.seq = 0;
    notedWalk.visits.clear();
    // The open chain belongs to a single minted walk — a superseded or
    // abandoned walk's chain can never stand in for the next mint's.
    notedWalk.openSet.clear();
    // A re-minted walk re-measures every node post-mutation: notes pending from
    // an earlier walk are now absorbed iff the fresh walk visits the root at
    // all (visit seqs start at 1, so a demoted seq-0 note is unabsorbed only
    // when the root stays unreachable). Loose deltas are dropped for the same
    // reason — a whole fresh walk subsumes them. Detached stamps reset too: a
    // re-minted walk re-stacks from scene, so a ghost can never be pushed.
    for (const note of notedWalk.notes.values()) note.seq = 0;
    notedWalk.loose = 0;
    notedWalk.detached.clear();
  };
  const clearNotedWalk = () => {
    notedWalk.seq = 0;
    notedWalk.visits.clear();
    notedWalk.openSet.clear();
    notedWalk.notes.clear();
    notedWalk.loose = 0;
    notedWalk.detached.clear();
  };
  // DFS visits a subtree contiguously, so a -delta retraction is exact only
  // once the walk has left the root's subtree entirely: a root still on the
  // open frame chain has only a measured prefix and retracting the full delta
  // would under-count below truth. Skipping the note leaves the measured
  // prefix in the served count — over-count errs conservative-on, the legal
  // direction. (Sites only consult this for roots with a visit stamp, so a
  // pushed-but-unvisited node in openSet can never masquerade as measured.)
  const notedWalkRootFinished = (root) => !notedWalk.openSet.has(root);

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
        // A re-add after noteRemoved must leave the ghost set: the pop-time
        // check walks live parentage, so re-attaching under a dead ancestor
        // still skips correctly while a re-add under live content counts again.
        notedWalk.detached.delete(root);
      }
      count += delta;
      if (count < 0) count = 0;
    },
    noteRemoved(root, measured) {
      const delta = Number.isFinite(measured) ? measured : countShadowReceivers(root);
      // A root removed mid-walk can still sit on the explicit stack: the walk
      // would fold it in whole and the unabsorbed +add note would then double
      // on top of the served count. Record the removal as a negative-delta note
      // and mark the root detached so the pop-time check skips the ghost — the
      // stamp nets the add+remove pair to zero.
      if (pendingRecount && root) {
        notedWalk.detached.add(root);
        const note = notedWalk.notes.get(root);
        if (note && notedWalk.visits.get(root) === undefined) {
          // The add note was never visited: it survives only for the stamp.
          // Removing it now drops both sides of the pair.
          notedWalk.notes.delete(root);
        } else if (note) {
          // The prior note was already folded into the walk's measurement
          // (visits stamped it): the removal retracts exactly the receivers
          // the walk measured — but only once the subtree is fully counted.
          // A mid-descent removal keeps the absorbed add so the walked prefix
          // serves conservative-on instead of under-counting by the suffix.
          if (notedWalkRootFinished(root)) {
            note.delta = -delta;
            note.seq = notedWalk.seq;
          }
        } else if (notedWalk.visits.get(root) !== undefined
            && notedWalkRootFinished(root)) {
          // Only retract a root the walk already measured — an unvisited root
          // is excluded from `walked` by the detached-skip alone, and a root
          // mid-descent holds just a prefix: stamping -delta either way would
          // under-count below the true total.
          notedWalk.notes.set(root, { delta: -delta, seq: notedWalk.seq });
        }
      }
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
