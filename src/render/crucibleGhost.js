// Presentation-only Crucible ghost hull (PQ-169.01).
// Trackmania pose playback: a translucent clone of the live hull follows ghostPoseAt.
// No Rapier body, no weapons, no AI, no campaign credits.

import {
  getGhostPlaybackTape,
  ghostPoseAt,
} from '../systems/survivalRecords.js';
import { cloneMaterialPreservingShaderHooks } from './materialClone.js';

export const CRUCIBLE_GHOST_OPACITY = 0.32;

// Object3D.clone JSON round-trips every node's userData — on a depth-staged,
// packaged, LOD-bound hull that serializes sfDepthMark geometry+material refs,
// the quadratic renderPackageInstance subtree, entity-identity stamps (which
// would resolve the ghost to the live entity), and every function disposer
// into dead {} records, all inside a presented frame. Clone under a plain-data
// projection of each node's userData instead, then restore the source's.
const GHOST_CLONE_USERDATA_DROP = new Set([
  '__spacefaceShadowCasterPolicyV1',
  '__spacefaceDepthStageSelfDirty',
  'sfDepthUndrawableCycles',
  'sfDepthMark',
  'shadowMeshNotes',
  'renderPackageInstance',
  'presentationEntityId',
  'sfBoundEntityId',
  'sfStableEntityKey',
  'sfHiddenFrozen',
  'lod',
]);

function plainUserDataValue(value, depth) {
  if (value == null) return value;
  const type = typeof value;
  if (type !== 'object') {
    return type === 'function' || type === 'symbol' ? undefined : value;
  }
  if (depth > 4) return undefined;
  if (!Array.isArray(value)) {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return undefined;
    const out = {};
    for (const key of Object.keys(value)) {
      const entry = plainUserDataValue(value[key], depth + 1);
      if (entry !== undefined) out[key] = entry;
    }
    return out;
  }
  const out = [];
  for (const item of value) {
    const entry = plainUserDataValue(item, depth + 1);
    if (entry !== undefined) out.push(entry);
  }
  return out;
}

function ghostUserDataProjection(data) {
  const out = {};
  for (const key of Object.keys(data)) {
    if (GHOST_CLONE_USERDATA_DROP.has(key)) continue;
    const entry = plainUserDataValue(data[key], 0);
    if (entry !== undefined) out[key] = entry;
  }
  return out;
}

function applyGhostMaterial(material) {
  if (!material || typeof material.clone !== 'function') return material;
  const next = cloneMaterialPreservingShaderHooks(material);
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
  let warmPending = false;

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
    warmPending = false;
  }

  function ensureClone(playerMesh) {
    if (!playerMesh || typeof playerMesh.clone !== 'function') return;
    if (playerMesh.userData && playerMesh.userData.crucibleGhost) return;
    if (root && clonedFrom === playerMesh) return;
    disposeRoot();
    const originals = [];
    playerMesh.traverse((obj) => {
      if (!obj || !obj.userData) return;
      originals.push([obj, obj.userData]);
      obj.userData = ghostUserDataProjection(obj.userData);
    });
    try {
      root = playerMesh.clone(true);
    } finally {
      for (const [obj, data] of originals) obj.userData = data;
    }
    // A source frozen while hidden mints an unposeable ghost — the tape drives
    // this transform from sync(), never the live writers.
    root.matrixAutoUpdate = true;
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
    warmPending = true;
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
      // Link the ghost's transparent-variant programs on the exact target before the first
      // presented frame — the clone is lazy, so without the warm the variant links inside
      // the bloom pass the moment the pose tape starts replaying.
      if (warmPending) {
        warmPending = false;
        const touch = state && state.render && typeof state.render.touchSubjectExactTarget === 'function'
          ? state.render.touchSubjectExactTarget
          : null;
        if (touch) {
          try { touch(root); } catch { /* warm is best-effort */ }
        }
      }
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
