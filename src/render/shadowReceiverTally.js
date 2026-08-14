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
    resolve(scene) {
      if (dirty) return this.recount(scene);
      return count;
    },
  };
}
