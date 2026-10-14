import { updatePresentedObjectMatrices } from './staticChildMatrices.js';

// The renderer owns an identity, non-composing scene root. An invisible branch
// has no color or shadow submission, including staging/prewarm roots that never
// entered entity culling. Explicit world queries own their normal Three refresh.
// Keep hidden roots dirty so re-entry refreshes even a mount-frozen subtree.
export function updatePresentedSceneMatrices(scene) {
  if (!scene || typeof scene.updateMatrixWorld !== 'function') return;
  if (scene.isScene !== true || scene.parent !== null
      || scene.matrixAutoUpdate !== false || scene.matrixWorldAutoUpdate !== false) {
    scene.updateMatrixWorld();
    return;
  }

  // Same root policy as updateMatrixWorld: the renderer owns matrixWorld, and
  // a dirty root propagates force without recomputing that externally held matrix.
  const force = scene.matrixWorldNeedsUpdate === true;
  scene.matrixWorldNeedsUpdate = false;
  const children = scene.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    // Auxiliary camera/light/bone transforms may have consumers outside their
    // own visible subtree. Ordinary hidden branches are presentation-only here.
    if (child.visible === false && !child.isCamera && !child.isLight && !child.isBone) {
      child.matrixWorldNeedsUpdate = true;
      continue;
    }
    // Let the installed Three implementation own its static-subtree rules:
    // retail and dev have different add()/attach() invalidation hooks.
    updatePresentedObjectMatrices(child, force);
  }

  // Native lighting and shadows read target.matrixWorld directly, regardless of
  // target visibility. The game mounts directional/spot lights directly on this
  // scene. If one aims into a deferred branch, refresh just its ancestor path;
  // updateWorldMatrix(true, false) does not walk the hidden sibling geometry.
  for (let i = 0; i < children.length; i++) {
    const light = children[i];
    if (!light.isLight || light.visible === false || !light.target) continue;
    let root = light.target;
    while (root.parent && root.parent !== scene) root = root.parent;
    if (root.parent === scene && root.visible === false) {
      light.target.updateWorldMatrix(true, false);
    }
  }
}
