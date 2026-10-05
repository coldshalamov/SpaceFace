import * as THREE from 'three';

// Freeze local matrices on static children.
//
// The root still poses every frame (position/rotation writes + matrixAutoUpdate). Interior plates,
// merged hull groups, and landmark props do not move in local space, so recomputing their local
// matrix every updateMatrixWorld is dead work. Sockets, lights, cameras, and tagged animated
// nodes stay live.
//
// sfMatrixFrozen marks every node whose subtree is fully frozen (post-order: node and all of its
// children have matrixAutoUpdate === false). The vendored updateMatrixWorld override in
// vendor/three.module.js skips descending into a marked node on clean frames — under force === true
// (an ancestor rewrote) it still descends, so world matrices stay identical to the unpatched walk.
// Object3D.add()/attach() clear the mark up the ancestor chain, so content grafted under a frozen
// subtree is walked normally until the next freeze re-marks it.

export function shouldFreezeStaticChild(object, root) {
  if (!object || object === root) return false;
  if (object.isLight || object.isCamera) return false;
  const userData = object.userData || {};
  if (userData.spacefaceSocket || userData.animated || userData.hlod) return false;
  if (userData.updateRuntimeState || userData.updateDriveState || userData.updateLod) return false;
  return true;
}

// Post-order: a node is markable only when it cannot recompose (matrixAutoUpdate === false) and
// every child is itself a fully frozen subtree. Clearing on unmarkable nodes keeps re-freezes
// self-healing after a graft changed the shape.
function markStaticMatrixSubtrees(node) {
  const children = node.children || [];
  let frozen = node.matrixAutoUpdate === false;
  for (let i = 0; i < children.length; i++) {
    if (!markStaticMatrixSubtrees(children[i])) frozen = false;
  }
  if (node.userData) {
    if (frozen) node.userData.sfMatrixFrozen = true;
    else if (node.userData.sfMatrixFrozen) node.userData.sfMatrixFrozen = false;
  }
  return frozen;
}

// Ancestors of the frozen root qualify for the mark too once every branch below them is static —
// this is how a boundary root frozen before its authored graft arrives re-marks after the graft's
// own freeze pass.
function remarkStaticMatrixAncestors(root) {
  for (let node = root && root.parent; node; node = node.parent) {
    if (node.matrixAutoUpdate !== false) break;
    const children = node.children || [];
    let frozen = children.length > 0;
    for (let i = 0; i < children.length; i++) {
      const ud = children[i].userData;
      if (!(ud && ud.sfMatrixFrozen === true)) { frozen = false; break; }
    }
    if (!frozen) break;
    node.userData.sfMatrixFrozen = true;
  }
}

export function freezeStaticChildMatrices(root) {
  if (!root || typeof root.traverse !== 'function') return 0;
  let frozen = 0;
  root.traverse((object) => {
    if (!shouldFreezeStaticChild(object, root)) return;
    object.matrixAutoUpdate = false;
    if (typeof object.updateMatrix === 'function') object.updateMatrix();
    frozen += 1;
  });
  markStaticMatrixSubtrees(root);
  remarkStaticMatrixAncestors(root);
  return frozen;
}

// Stepped twin: same pre-order freeze pass + post-order mark, driven iteratively
// so a packaged-size subtree yields at stride boundaries inside a paced commit
// leg instead of landing both walks atomically. Sync callers keep the frozen
// traverse above (identical output).
export function* freezeStaticChildMatricesSteps(root) {
  if (!root || typeof root.traverse !== 'function') return 0;
  let frozen = 0;
  const order = [];
  const stack = [root];
  while (stack.length > 0) {
    const object = stack.pop();
    order.push(object);
    if (shouldFreezeStaticChild(object, root)) {
      object.matrixAutoUpdate = false;
      if (typeof object.updateMatrix === 'function') object.updateMatrix();
      frozen += 1;
    }
    const children = object.children || [];
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    if ((order.length % 1024) === 0) yield;
  }
  // Reverse of the pre-order list is a valid post-order for the mark pass: every
  // descendant is evaluated before its ancestors, same as the recursive version.
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const node = order[i];
    let frozenSubtree = node.matrixAutoUpdate === false;
    const children = node.children || [];
    for (let j = 0; j < children.length; j++) {
      const ud = children[j].userData;
      if (!(ud && ud.sfMatrixFrozen === true)) { frozenSubtree = false; break; }
    }
    if (node.userData) {
      if (frozenSubtree) node.userData.sfMatrixFrozen = true;
      else if (node.userData.sfMatrixFrozen) node.userData.sfMatrixFrozen = false;
    }
    if ((i % 1024) === 0) yield;
  }
  remarkStaticMatrixAncestors(root);
  return frozen;
}

// For entity roots whose local transform is written only at mount/seat/repose (stations, wrecks,
// asteroids, planet sites, place boundaries): stop the per-frame compose as well so the subtree
// below can actually prune out of the walk. Every transform writer on such a root must call
// updateMatrix() after writing (the pose paths gate this on matrixAutoUpdate === false).
export function freezeStaticTransformRoot(root) {
  if (!root) return;
  root.matrixAutoUpdate = false;
  if (typeof root.updateMatrix === 'function') root.updateMatrix();
  markStaticMatrixSubtrees(root);
  remarkStaticMatrixAncestors(root);
}

// Same output as freezeStaticTransformRoot for callers that just ran a
// freezeStaticChildMatrices pass on this root: every descendant's sfMatrixFrozen
// stamp is already current, so the root's own mark resolves from its children's
// flags — O(degree) instead of a second whole-subtree post-order walk.
export function freezeStaticTransformRootMarked(root) {
  if (!root) return;
  root.matrixAutoUpdate = false;
  if (typeof root.updateMatrix === 'function') root.updateMatrix();
  const children = root.children || [];
  let frozen = root.matrixAutoUpdate === false;
  for (let i = 0; i < children.length; i++) {
    const ud = children[i].userData;
    if (!(ud && ud.sfMatrixFrozen === true)) { frozen = false; break; }
  }
  if (root.userData) {
    if (frozen) root.userData.sfMatrixFrozen = true;
    else if (root.userData.sfMatrixFrozen) root.userData.sfMatrixFrozen = false;
  }
  remarkStaticMatrixAncestors(root);
}

// Explicit dirty() for the rare move of a node inside a frozen subtree: recompose its local
// matrix and refresh it plus every descendant's world matrix immediately — the per-frame walk
// will skip the subtree again once all needsUpdate flags are consumed.
export function refreshStaticTransform(node) {
  if (!node) return;
  if (typeof node.updateMatrix === 'function') node.updateMatrix();
  if (typeof node.updateWorldMatrix === 'function') node.updateWorldMatrix(false, true);
}

// Stepped twin of Object3D#updateMatrixWorld: identical per-node semantics — auto
// matrix compose, needsUpdate-or-force world recompute with flag clear, force
// propagation — walked iteratively so a forced whole-scene refresh yields at
// stride boundaries instead of landing atomically inside the boot census.
// Subclass overrides (SkinnedMesh bind, Camera inverse) own their subtree
// atomically; sibling world updates are order-independent, so delegating them at
// push time preserves the result.
export function* updateMatrixWorldSteps(root, force) {
  if (!root) return;
  const base = THREE && THREE.Object3D && THREE.Object3D.prototype
    ? THREE.Object3D.prototype.updateMatrixWorld
    : null;
  if (typeof root.updateMatrixWorld !== 'function' || !base || root.updateMatrixWorld !== base) {
    root.updateMatrixWorld(force);
    return;
  }
  const stack = [[root, force === true]];
  let visited = 0;
  while (stack.length > 0) {
    const [object, entryForce] = stack.pop();
    if ((++visited % 2048) === 0) yield;
    if (object.matrixAutoUpdate) object.updateMatrix();
    let childForce = entryForce;
    if (object.matrixWorldNeedsUpdate || entryForce) {
      if (object.matrixWorldAutoUpdate === true) {
        if (!object.parent) object.matrixWorld.copy(object.matrix);
        else object.matrixWorld.multiplyMatrices(object.parent.matrixWorld, object.matrix);
      }
      object.matrixWorldNeedsUpdate = false;
      childForce = true;
    }
    const children = object.children;
    if (!Array.isArray(children)) continue;
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (!child || typeof child.updateMatrixWorld !== 'function') continue;
      // Vendored frozen-subtree elision: under !childForce a clean sfMatrixFrozen
      // subtree's world matrices are already final, so the descent is skippable
      // (the vendored override documents identical output either way).
      if (!childForce && child.matrixWorldNeedsUpdate === false
          && child.userData && child.userData.sfMatrixFrozen === true) continue;
      if (child.updateMatrixWorld !== base) child.updateMatrixWorld(childForce);
      else stack.push([child, childForce]);
    }
  }
}
