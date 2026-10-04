// Incremental shadow-receiver count.
//
// The default path used to scene.traverse() on every mesh build/evict/swap just to decide
// whether the directional map should stay on. Streaming-heavy flight paid that O(scene) walk
// on the same frames that already built meshes. The tally is exact when callers report
// add/remove; recount() is the dirty fallback.

export function countShadowReceivers(root) {
  if (!root) return 0;
  let receivers = 0;
  if (root.receiveShadow === true) receivers += 1;
  const children = root.children;
  if (!children || children.length === 0) return receivers;
  if (typeof root.traverse === 'function' && children.length) {
    root.traverse((object) => {
      if (object && object !== root && object.receiveShadow === true) receivers += 1;
    });
    return receivers;
  }
  return receivers;
}

export function createShadowReceiverTally() {
  let count = 0;
  let dirty = true;

  return {
    get count() { return count; },
    get dirty() { return dirty; },
    markDirty() {
      dirty = true;
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
      count = 0;
      if (scene && typeof scene.traverse === 'function') {
        scene.traverse((object) => {
          if (object && object.receiveShadow === true) count += 1;
        });
      }
      dirty = false;
      return count;
    },
    resolve(scene, options = {}) {
      if (dirty || options.force === true) return this.recount(scene);
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
