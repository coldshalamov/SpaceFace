// Retained scene-graph world-matrix walk (#164 scene-matrix-retain).
//
// three's Object3D.updateMatrixWorld() recomposes EVERY matrixAutoUpdate node's local matrix
// and therefore re-multiplies every world matrix under it, every frame, whether or not anything
// moved. On the quiet Ceres frame that is ~594 composes + ~594 multiplies for ~12 nodes whose
// local pose actually changed (~162 world matrices that actually changed). This walk produces the
// same matrices but only recomposes a node whose position/quaternion/scale (or, for manual
// nodes, whose local matrix) changed since the last walk, and only re-multiplies a world matrix
// when its own local matrix or any ancestor's world matrix changed (or three's own
// matrixWorldNeedsUpdate flag is set, or the node was reparented). Nodes that override
// updateMatrixWorld (cameras, skinned meshes, …) keep three's stock path for their subtree.
//
// Picture contract: identical matrices (same compose/multiply inputs ⇒ same outputs). Opt-out:
// setSceneMatrixRetainForBench(false) restores the stock walk.

import * as THREE from 'three';

const BASE_UPDATE_MATRIX_WORLD = THREE.Object3D.prototype.updateMatrixWorld;

let SCENE_MATRIX_RETAIN = true;
export function setSceneMatrixRetainForBench(enabled) {
  SCENE_MATRIX_RETAIN = enabled !== false;
}
export function getSceneMatrixRetainForBench() {
  return SCENE_MATRIX_RETAIN !== false;
}

// Per-node retained inputs, keyed by Object3D.id (a monotonically increasing integer), so no
// property is added to three's objects (that would fork their hidden classes in the render loop).
const retained = new Map();
let walkEpoch = 0;
let prevEpoch = -1;
let DEBUG_COMPOSED = null;
export function sceneMatrixRetainDebugComposed(on) { const out = DEBUG_COMPOSED; DEBUG_COMPOSED = on ? [] : null; return out; }
let sweepCountdown = 0;
const SWEEP_EVERY_WALKS = 600;

function makeRecord(parent) {
  return {
    px: NaN, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 0, sx: 0, sy: 0, sz: 0,
    parent, epoch: 0, m: null, w: null, kidObj: [], kidRec: [],
  };
}

const stats = { walks: 0, visited: 0, composed: 0, multiplied: 0, stockSubtrees: 0, byFlag: 0, byNew: 0, byParent: 0, byInherit: 0, byExternal: 0 };
export function sceneMatrixRetainStats() {
  return { ...stats, retained: retained.size };
}
export function resetSceneMatrixRetainForBench() {
  retained.clear();
  for (const k of Object.keys(stats)) stats[k] = 0;
  walkEpoch = 0;
  sweepCountdown = 0;
}

function lookupRecord(o) {
  let rec = retained.get(o.id);
  if (rec === undefined) {
    rec = makeRecord(o.parent);
    retained.set(o.id, rec);
    stats.byNew++;
    return rec;
  }
  if (rec.parent !== o.parent) {
    rec.parent = o.parent;
    rec.px = NaN; // reparented: recompose and re-multiply
    if (rec.m !== null) rec.m[0] = NaN;
    stats.byParent++;
  }
  return rec;
}

function visit(o, rec, parentWorldChanged) {
  stats.visited++;
  let worldDirty = parentWorldChanged === true || o.matrixWorldNeedsUpdate === true;
  // First sighting, or absent from the previous walk (detached / re-added): its world matrix
  // cannot be trusted to reflect ancestor moves it missed.
  if (rec.epoch !== prevEpoch) worldDirty = true;
  rec.epoch = walkEpoch;
  if (o.matrixAutoUpdate) {
    const p = o.position, q = o.quaternion, s = o.scale;
    const px = p.x, py = p.y, pz = p.z, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const sx = s.x, sy = s.y, sz = s.z;
    if (rec.px !== px || rec.py !== py || rec.pz !== pz
      || rec.qx !== qx || rec.qy !== qy || rec.qz !== qz || rec.qw !== qw
      || rec.sx !== sx || rec.sy !== sy || rec.sz !== sz || rec.m !== null) {
      o.matrix.compose(p, q, s);
      stats.composed++;
      if (DEBUG_COMPOSED) DEBUG_COMPOSED.push([o.name || o.type, o.parent ? (o.parent.name || o.parent.type) : null, rec.px, px, rec.qw, qw, rec.sx, sx]);
      rec.px = px; rec.py = py; rec.pz = pz;
      rec.qx = qx; rec.qy = qy; rec.qz = qz; rec.qw = qw;
      rec.sx = sx; rec.sy = sy; rec.sz = sz;
      rec.m = null;
      worldDirty = true;
    }
  } else {
    // Manual local matrix: detect direct writes (the stock walk re-multiplies every frame).
    const e = o.matrix.elements;
    let m = rec.m;
    let changed = false;
    if (m === null) {
      m = rec.m = new Float64Array(16);
      rec.px = NaN; // a later switch back to matrixAutoUpdate must recompose
      changed = true;
    } else {
      for (let i = 0; i < 16; i++) {
        if (m[i] !== e[i]) { changed = true; break; }
      }
    }
    if (changed) {
      for (let i = 0; i < 16; i++) m[i] = e[i];
      worldDirty = true;
    }
  }
  if (o.matrixWorldAutoUpdate === true) {
    const we = o.matrixWorld.elements;
    let w = rec.w;
    if (false && !worldDirty) {
      // Someone else (updateWorldMatrix on a detached node, a manual write) may have rewritten
      // this world matrix since we produced it; the stock walk would have overwritten that.
      for (let i = 0; i < 16; i++) {
        if (w[i] !== we[i]) { worldDirty = true; stats.byExternal++; break; }
      }
    }
    if (worldDirty) {
      if (o.parent === null) o.matrixWorld.copy(o.matrix);
      else o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
      stats.multiplied++;
      if (w === null) w = rec.w = new Float64Array(16);
      for (let i = 0; i < 16; i++) w[i] = we[i];
      o.matrixWorldNeedsUpdate = false;
    }
  } else {
    // Externally managed world matrix (e.g. the presented Scene root, whose renderer auto-walk is
    // disabled): three never writes it, so descendants re-multiply only if its value moved.
    if (worldDirty) o.matrixWorldNeedsUpdate = false;
    const we = o.matrixWorld.elements;
    let w = rec.w;
    let moved = false;
    if (w === null) {
      w = rec.w = new Float64Array(16);
      moved = true;
    } else {
      for (let i = 0; i < 16; i++) {
        if (w[i] !== we[i]) { moved = true; break; }
      }
    }
    if (moved) {
      for (let i = 0; i < 16; i++) w[i] = we[i];
    }
    worldDirty = moved;
  }
  const children = o.children;
  const l = children.length;
  if (l === 0) return;
  const kidObj = rec.kidObj;
  const kidRec = rec.kidRec;
  if (kidObj.length !== l) { kidObj.length = l; kidRec.length = l; }
  for (let i = 0; i < l; i++) {
    const child = children[i];
    if (child.updateMatrixWorld !== BASE_UPDATE_MATRIX_WORLD) {
      // Subclass behavior (Camera inverse, SkinnedMesh bind inverse, …): stock semantics for
      // the whole subtree.
      stats.stockSubtrees++;
      kidObj[i] = null;
      child.updateMatrixWorld(worldDirty);
      continue;
    }
    let crec;
    if (kidObj[i] === child) {
      crec = kidRec[i];
    } else {
      crec = lookupRecord(child);
      kidObj[i] = child;
      kidRec[i] = crec;
    }
    visit(child, crec, worldDirty);
  }
}

function sweep() {
  for (const [id, rec] of retained) {
    if (rec.epoch !== walkEpoch) retained.delete(id);
  }
}

/** Drop-in for scene.updateMatrixWorld() on the presented scene root. */
export function updateSceneMatrixWorld(scene) {
  if (!scene || typeof scene.updateMatrixWorld !== 'function') return;
  if (SCENE_MATRIX_RETAIN === false || scene.updateMatrixWorld !== BASE_UPDATE_MATRIX_WORLD) {
    scene.updateMatrixWorld();
    return;
  }
  stats.walks++;
  prevEpoch = walkEpoch;
  walkEpoch = (walkEpoch + 1) | 0;
  if (walkEpoch === 0) walkEpoch = 1;
  visit(scene, lookupRecord(scene), false);
  if (++sweepCountdown >= SWEEP_EVERY_WALKS) {
    sweepCountdown = 0;
    sweep();
  }
}
