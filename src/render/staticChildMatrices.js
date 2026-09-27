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

// Explicit dirty() for the rare move of a node inside a frozen subtree: recompose its local
// matrix and refresh it plus every descendant's world matrix immediately — the per-frame walk
// will skip the subtree again once all needsUpdate flags are consumed.
export function refreshStaticTransform(node) {
  if (!node) return;
  if (typeof node.updateMatrix === 'function') node.updateMatrix();
  if (typeof node.updateWorldMatrix === 'function') node.updateWorldMatrix(false, true);
}
