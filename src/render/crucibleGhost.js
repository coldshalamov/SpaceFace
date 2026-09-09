// Presentation-only Crucible ghost hull (PQ-169.01).
// Trackmania pose playback: a translucent clone of the live hull follows ghostPoseAt.
// No Rapier body, no weapons, no AI, no campaign credits.

import {
  getGhostPlaybackTape,
  ghostPoseAt,
} from '../systems/survivalRecords.js';

export const CRUCIBLE_GHOST_OPACITY = 0.32;

function applyGhostMaterial(material) {
  if (!material || typeof material.clone !== 'function') return material;
  const next = material.clone();
  next.transparent = true;
  next.opacity = Math.min(CRUCIBLE_GHOST_OPACITY, Number.isFinite(next.opacity) ? next.opacity * CRUCIBLE_GHOST_OPACITY : CRUCIBLE_GHOST_OPACITY);
  next.depthWrite = false;
  next.needsUpdate = true;
  return next;
}

export function createCrucibleGhostPresentation() {
  let scene = null;
  let root = null;
  let clonedFrom = null;
  let clonedMaterials = [];

  function hide() {
    if (root) root.visible = false;
  }

  function disposeRoot() {
    if (root && root.parent) root.parent.remove(root);
    for (let i = 0; i < clonedMaterials.length; i += 1) {
      const mat = clonedMaterials[i];
      if (mat && typeof mat.dispose === 'function') {
        try { mat.dispose(); } catch { /* best effort */ }
      }
    }
    clonedMaterials = [];
    root = null;
    clonedFrom = null;
  }

  function ensureClone(playerMesh) {
    if (!playerMesh || typeof playerMesh.clone !== 'function') return;
    if (playerMesh.userData && playerMesh.userData.crucibleGhost) return;
    if (root && clonedFrom === playerMesh) return;
    disposeRoot();
    root = playerMesh.clone(true);
    clonedMaterials = [];
    root.traverse((obj) => {
      if (!obj) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      if (!obj.material) return;
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((mat) => {
          const next = applyGhostMaterial(mat);
          if (next && next !== mat) clonedMaterials.push(next);
          return next;
        });
      } else {
        const next = applyGhostMaterial(obj.material);
        if (next && next !== obj.material) clonedMaterials.push(next);
        obj.material = next;
      }
    });
    if (!root.userData) root.userData = {};
    root.userData.crucibleGhost = true;
    clonedFrom = playerMesh;
    if (scene && typeof scene.add === 'function') scene.add(root);
  }

  return {
    attach(nextScene) {
      scene = nextScene || null;
      if (root && scene && typeof scene.add === 'function' && root.parent !== scene) scene.add(root);
    },
    detach() {
      if (root && root.parent) root.parent.remove(root);
    },
    sync(state, playerMesh) {
      const tape = getGhostPlaybackTape();
      if (!tape || !tape.frames || !tape.frames.length || !state) {
        hide();
        return;
      }
      const tick = Number.isInteger(state.tick) ? state.tick : 0;
      const pose = ghostPoseAt(tape, tick);
      if (!pose) {
        hide();
        return;
      }
      ensureClone(playerMesh);
      if (!root) return;
      root.visible = true;
      const y = playerMesh && playerMesh.position && Number.isFinite(playerMesh.position.y)
        ? playerMesh.position.y
        : 0;
      root.position.set(pose.x, y, pose.z);
      // visualFactory / shipKit: mesh.rotation.y = -entity.rot so +X points forward.
      root.rotation.y = -pose.r;
    },
    dispose() {
      disposeRoot();
      scene = null;
    },
  };
}
