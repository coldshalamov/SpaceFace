import * as THREE from 'three';
import {
  clearanceCellInRange,
  clearanceGridRawAt,
  clearanceLayoutFromBox,
  clearanceNeighborhoodRaw,
  clearanceSampleCell,
  rasterClearanceGrid,
} from './clearanceQuery.js';
import { isAuthoredPendingStatus } from './entityMeshVisibility.js';
import { TABLE_FRAME_SKIRT_WU } from './tabletopPolicy.js';

/**
 * Structural camera clearance. The chase camera has no general obstacle pass — a station,
 * giant rock, or capital wreck can swallow it whole, and every interior face then fights the
 * near plane while the focus damping breathes (the "camera inside the station jig + surface
 * strobing" defect). The renderer is the only layer that knows visual bounds, so it reports a
 * world-Y floor per camera XZ; camera.js owns the snap-up/ease-down hysteresis.
 *
 * Bounds come from the live mesh subtree: authored roots grow past their pending/fallback volume
 * when the GLB commits, so the cached box is invalidated on any authored state/composition stamp
 * change. Boxes are computed lazily for structural kinds only, and only structures large enough
 * to contain the camera participate — a nav buoy or skiff-sized wreck cannot push the camera.
 */
export const CAMERA_CLEARANCE_MARGIN_WU = 16;
// A solid smaller than this in every direction cannot swallow the camera; one that never rises
// above MIN_TOP cannot reach even the lowest chase framing (45 WU zoom is ~39 WU high). The old
// 120 WU span bar let every mid-size rock, wreck and hull pass through the camera unnoticed.
const CAMERA_CLEARANCE_MIN_SPAN_WU = 48;
const CAMERA_CLEARANCE_MIN_TOP_WU = 24;
const CAMERA_CLEARANCE_ANALYTIC_MAX_SPAN_WU = 120;
// The chase camera's far plane: a bound bigger than the camera can even see cannot be a real
// structure — it can only be a broken mesh bound (2026-09-25: one asteroid body scale
// compounded to ±2e8 and this box reported a ~1.4e8 roof, orbiting the camera). Rejected
// bounds return null so a corrupt subtree can never push the camera off the world.
const CAMERA_CLEARANCE_MAX_SPAN_WU = 14000;
const CAMERA_CLEARANCE_KINDS = new Set(['station', 'place', 'asteroid', 'wreck', 'ship']);

// Whole-boundary AABBs are the right floor for compact structures. Above this span — the
// authored mega-stations are ~1300 WU across — one box reports the city's tallest tower as
// the floor for every XZ inside the footprint, pinning the camera at ~380 WU for the entire
// dock approach (the approach leg then renders roofs, not the hull). Wide roots answer from
// a geometry BVH over the 3×3 window the camera already reads. The dense column grid remains
// only as the fallback when that query cannot be built.
export const CAMERA_CLEARANCE_GRID_MIN_SPAN_WU = 240;
const _clearanceBoxScratch = typeof THREE !== 'undefined' ? new THREE.Box3() : null;

// Field rocks are uniformly scaled by entity radius on `asteroidBody`. Unit-ish displaced
// geo spans ~2R; veins/gas hulls add <~25%. When that upper bound cannot clear the 120 WU
// span bar, skip setFromObject — drifting rocks re-invalidate the numeric cache every WU
// and otherwise re-enter updateWorldMatrix under camera.follow (quiet profile).
// (vm-drop camera-clearance-asteroid-span-reject)
let CAMERA_CLEARANCE_ASTEROID_SPAN_REJECT = true;
// After span-reject: undersized field rocks still re-entered the floor walk every WU
// (pos-keyed cache miss → re-reject). Sticky never-roof + structural exclude keeps them
// off the per-frame walk until scale/asset changes. Soft-GPU fps not claimed.
// (vm-drop camera-clearance-never-roof-exclude)
let CAMERA_CLEARANCE_ASTEROID_NEVER_ROOF_EXCLUDE = true;
export function setCameraClearanceAsteroidSpanRejectForBench(enabled) {
  CAMERA_CLEARANCE_ASTEROID_SPAN_REJECT = enabled !== false;
  return CAMERA_CLEARANCE_ASTEROID_SPAN_REJECT;
}
export function getCameraClearanceAsteroidSpanRejectForBench() {
  return CAMERA_CLEARANCE_ASTEROID_SPAN_REJECT !== false;
}
export function setCameraClearanceAsteroidNeverRoofExcludeForBench(enabled) {
  CAMERA_CLEARANCE_ASTEROID_NEVER_ROOF_EXCLUDE = enabled !== false;
  return CAMERA_CLEARANCE_ASTEROID_NEVER_ROOF_EXCLUDE;
}
export function getCameraClearanceAsteroidNeverRoofExcludeForBench() {
  return CAMERA_CLEARANCE_ASTEROID_NEVER_ROOF_EXCLUDE !== false;
}

// Settled / quiet-chase clearance: retain the last floor so follow() skips the structural
// walk + box-cache hits. Retain KEY quantizes cam X/Y/Z to 0.25 WU (same cell as #53/#77);
// exact floats still drive the AABB walk on cell change. Box rewrites bump a module epoch
// so a drifting capital rock / authored stamp change cannot return a stale roof.
// Soft-GPU fps not claimed. (vm-drop camera-clearance-floor-retain + -pos-quantize)
let CAMERA_CLEARANCE_FLOOR_RETAIN = true;
let _clearanceBoxEpoch = 0;
export function setCameraClearanceFloorRetainForBench(enabled) {
  CAMERA_CLEARANCE_FLOOR_RETAIN = enabled !== false;
  return CAMERA_CLEARANCE_FLOOR_RETAIN;
}
export function getCameraClearanceFloorRetainForBench() {
  return CAMERA_CLEARANCE_FLOOR_RETAIN !== false;
}

// Quiet chase drift used to miss floor retain every frame: cam floats creep by ≪ glass,
// so bit-identical keys never matched in flight (settled-only retain). Quantize the retain
// KEY (not the AABB walk) to the same 0.25 WU cell as authored-instance / presentation
// query retain. Exact floats still drive the structural walk on cell change. Margin is
// 16 WU, so a one-cell delay at an AABB edge is negligible. Soft-GPU fps not claimed.
const CAMERA_CLEARANCE_FLOOR_RETAIN_POS_QUANT_WU = 0.25;
let CAMERA_CLEARANCE_FLOOR_RETAIN_POS_QUANTIZE = true;
export function setCameraClearanceFloorRetainPosQuantizeForBench(enabled) {
  CAMERA_CLEARANCE_FLOOR_RETAIN_POS_QUANTIZE = enabled !== false;
  return CAMERA_CLEARANCE_FLOOR_RETAIN_POS_QUANTIZE;
}
export function getCameraClearanceFloorRetainPosQuantizeForBench() {
  return CAMERA_CLEARANCE_FLOOR_RETAIN_POS_QUANTIZE !== false;
}
function quantizeClearanceRetainPos(value) {
  if (CAMERA_CLEARANCE_FLOOR_RETAIN_POS_QUANTIZE === false) return value;
  const q = CAMERA_CLEARANCE_FLOOR_RETAIN_POS_QUANT_WU;
  return Math.round(value / q) * q;
}

function asteroidClearanceSpanHint(data) {
  const body = data && data.asteroidBody;
  if (!body || !body.scale) return 0;
  const scale = Math.abs(Number(body.scale.x) || 0);
  return scale > 0 ? scale * 2.5 : 0;
}

function clearanceBoundUnsettled(data) {
  if (!data) return true;
  if (data.geometryPending === true) return true;
  if (data.authoredAdmissionSubstrate === true) return true;
  const status = data.authoredAssetState || '';
  return status === 'loading'
    || status === 'awaiting-authored-admission'
    || status === 'compiling-pipelines'
    || status === 'orphaned-before-swap'
    || status === 'pending-admission'
    || isAuthoredPendingStatus(status);
}

// A committed structural body can briefly carry a residency/pipeline latch while its last
// authored geometry is still the picture on the glass. Do not erase the only known camera roof
// during that transient: the glide has no way to anticipate a one-frame `geometryPending` or
// `compiling-pipelines` state and would otherwise let the camera enter until the latch clears.
// First-admission substrates have no stable record and still return no roof; a changed
// composition, pose, matrix or descendant guard also fails closed.
function canRetainCommittedClearanceWhilePending(mesh, data, cached) {
  if (!mesh || !data || !cached || cached.stableAuthored !== true || !cached.box) return false;
  if (cached.stableCompositionId !== (data.authoredCompositionId || '')) return false;
  if (cached.stableRawX !== mesh.position.x
      || cached.stableRawY !== mesh.position.y
      || cached.stableRawZ !== mesh.position.z) return false;
  if (cached.translationGuard && !cameraClearanceTranslationGuardStable(mesh, cached.translationGuard)) {
    return false;
  }
  return true;
}

// A position-only clearance re-key is valid only while the root's linear pose and every
// descendant that can contribute authored geometry remain unchanged.  The old memo accepted
// that contract implicitly, which meant a turret rotation or an in-place BufferGeometry edit
// could carry stale BVH cells.  Keep a small, allocation-free-at-query-time guard on the record:
// snapshots are built when the box is measured, then scalar fields and object identities are
// compared before a translated record is allowed to retain its relative cell answers.
function cameraClearanceGuardEntry(object, isRoot) {
  const geometry = object && object.geometry;
  const attributes = geometry && geometry.attributes;
  const position = attributes && attributes.position;
  const index = geometry && geometry.index;
  const drawRange = geometry && geometry.drawRange;
  const material = object && object.material;
  const materialArray = Array.isArray(material);
  const materials = materialArray ? material.slice() : null;
  const materialRef = materialArray ? null : material;
  const materialTransparent = materialArray
    ? materials.map((item) => !!(item && item.transparent))
    : !!(material && material.transparent);
  const materialBlending = materialArray
    ? materials.map((item) => item && item.blending)
    : material && material.blending;
  const materialDepthWrite = materialArray
    ? materials.map((item) => item == null || item.depthWrite !== false)
    : !(material && material.depthWrite === false);
  const morphAttributes = geometry && geometry.morphAttributes;
  const hasMorphAttributes = !!(morphAttributes && Object.keys(morphAttributes).length);
  const userData = object && object.userData;
  const unsupported = !!(object && (
    object.isInstancedMesh === true
    || object.isSkinnedMesh === true
    || object.skeleton
    || object.morphTargetInfluences
    || hasMorphAttributes
    || (!isRoot && object.matrixAutoUpdate === false)
  ));
  const positionState = object && object.position;
  const quaternion = object && object.quaternion;
  const scale = object && object.scale;
  return {
    object,
    children: object && object.children ? object.children.slice() : [],
    visible: object ? object.visible !== false : false,
    clearanceExempt: !!(userData && userData.clearanceExempt),
    worldSitePresentationOwned: !!(userData && userData.worldSitePresentationOwned),
    geometry,
    position,
    positionVersion: position && position.version,
    positionCount: position && position.count,
    index,
    indexVersion: index && index.version,
    indexCount: index && index.count,
    groupsLength: geometry && geometry.groups ? geometry.groups.length : 0,
    drawStart: drawRange && drawRange.start,
    drawCount: drawRange && drawRange.count,
    materialArray,
    materials,
    materialRef,
    materialTransparent,
    materialBlending,
    materialDepthWrite,
    unsupported,
    isRoot,
    px: isRoot ? 0 : positionState && positionState.x,
    py: isRoot ? 0 : positionState && positionState.y,
    pz: isRoot ? 0 : positionState && positionState.z,
    qx: isRoot ? 0 : quaternion && quaternion.x,
    qy: isRoot ? 0 : quaternion && quaternion.y,
    qz: isRoot ? 0 : quaternion && quaternion.z,
    qw: isRoot ? 1 : quaternion && quaternion.w,
    sx: isRoot ? 1 : scale && scale.x,
    sy: isRoot ? 1 : scale && scale.y,
    sz: isRoot ? 1 : scale && scale.z,
  };
}

function cameraClearanceTranslationGuardFor(mesh) {
  const elements = mesh && mesh.matrixWorld && mesh.matrixWorld.elements;
  if (!elements || elements.length < 11) return null;
  const rootLinear = new Float64Array(9);
  rootLinear[0] = elements[0];
  rootLinear[1] = elements[1];
  rootLinear[2] = elements[2];
  rootLinear[3] = elements[4];
  rootLinear[4] = elements[5];
  rootLinear[5] = elements[6];
  rootLinear[6] = elements[8];
  rootLinear[7] = elements[9];
  rootLinear[8] = elements[10];
  const guard = {
    rootLinear,
    rootQuaternion: mesh.quaternion
      ? {
        x: mesh.quaternion.x,
        y: mesh.quaternion.y,
        z: mesh.quaternion.z,
        w: mesh.quaternion.w,
      }
      : null,
    rootScale: mesh.scale
      ? {
        x: mesh.scale.x,
        y: mesh.scale.y,
        z: mesh.scale.z,
      }
      : null,
    entries: [],
    reuseEligible: true,
  };
  if (!rootLinear.every(Number.isFinite)) {
    guard.reuseEligible = false;
  }
  if (!mesh || typeof mesh.traverse !== 'function') {
    guard.reuseEligible = false;
    return guard;
  }
  mesh.traverse((object) => {
    const entry = cameraClearanceGuardEntry(object, object === mesh);
    guard.entries.push(entry);
    if (entry.unsupported) guard.reuseEligible = false;
  });
  return guard;
}

function cameraClearanceGuardMaterialStable(entry, object) {
  const material = object && object.material;
  if (Array.isArray(material) !== entry.materialArray) return false;
  if (entry.materialArray) {
    if (material.length !== entry.materials.length) return false;
    for (let i = 0; i < material.length; i++) {
      const current = material[i];
      if (current !== entry.materials[i]
          || !!(current && current.transparent) !== entry.materialTransparent[i]
          || (current && current.blending) !== entry.materialBlending[i]
          || (current == null || current.depthWrite !== false) !== entry.materialDepthWrite[i]) {
        return false;
      }
    }
    return true;
  }
  return material === entry.materialRef
    && !!(material && material.transparent) === entry.materialTransparent
    && (material && material.blending) === entry.materialBlending
    && (material == null || material.depthWrite !== false) === entry.materialDepthWrite;
}

function cameraClearanceTranslationGuardStable(mesh, guard) {
  if (!guard || guard.reuseEligible !== true) return false;
  const elements = mesh && mesh.matrixWorld && mesh.matrixWorld.elements;
  if (!elements || elements.length < 11 || mesh.matrixWorldNeedsUpdate === true) return false;
  const rootQuaternion = mesh.quaternion;
  const rootScale = mesh.scale;
  if (!rootQuaternion || !rootScale || !guard.rootQuaternion || !guard.rootScale
      || rootQuaternion.x !== guard.rootQuaternion.x
      || rootQuaternion.y !== guard.rootQuaternion.y
      || rootQuaternion.z !== guard.rootQuaternion.z
      || rootQuaternion.w !== guard.rootQuaternion.w
      || rootScale.x !== guard.rootScale.x
      || rootScale.y !== guard.rootScale.y
      || rootScale.z !== guard.rootScale.z) {
    return false;
  }
  const rootLinear = guard.rootLinear;
  if (elements[0] !== rootLinear[0] || elements[1] !== rootLinear[1] || elements[2] !== rootLinear[2]
      || elements[4] !== rootLinear[3] || elements[5] !== rootLinear[4] || elements[6] !== rootLinear[5]
      || elements[8] !== rootLinear[6] || elements[9] !== rootLinear[7] || elements[10] !== rootLinear[8]) {
    return false;
  }
  const entries = guard.entries;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const object = entry.object;
    if (!object || object.matrixWorldNeedsUpdate === true
        || object.visible !== entry.visible
        || !!(object.userData && object.userData.clearanceExempt) !== entry.clearanceExempt
        || !!(object.userData && object.userData.worldSitePresentationOwned) !== entry.worldSitePresentationOwned) {
      return false;
    }
    const children = object.children || [];
    if (children.length !== entry.children.length) return false;
    for (let j = 0; j < children.length; j++) {
      if (children[j] !== entry.children[j]) return false;
    }
    if (!cameraClearanceGuardMaterialStable(entry, object)) return false;
    const geometry = object.geometry;
    const attributes = geometry && geometry.attributes;
    const position = attributes && attributes.position;
    const index = geometry && geometry.index;
    const drawRange = geometry && geometry.drawRange;
    if (geometry !== entry.geometry
        || position !== entry.position
        || (position && position.version) !== entry.positionVersion
        || (position && position.count) !== entry.positionCount
        || index !== entry.index
        || (index && index.version) !== entry.indexVersion
        || (index && index.count) !== entry.indexCount
        || (geometry && geometry.groups ? geometry.groups.length : 0) !== entry.groupsLength
        || (drawRange && drawRange.start) !== entry.drawStart
        || (drawRange && drawRange.count) !== entry.drawCount) {
      return false;
    }
    if (entry.isRoot) continue;
    const positionState = object.position;
    const quaternion = object.quaternion;
    const scale = object.scale;
    if (!positionState || !quaternion || !scale
        || positionState.x !== entry.px || positionState.y !== entry.py || positionState.z !== entry.pz
        || quaternion.x !== entry.qx || quaternion.y !== entry.qy
        || quaternion.z !== entry.qz || quaternion.w !== entry.qw
        || scale.x !== entry.sx || scale.y !== entry.sy || scale.z !== entry.sz) {
      return false;
    }
  }
  return true;
}

function cameraClearanceRefreshChangedGeometryBounds(mesh, guard) {
  if (!guard || !guard.entries || typeof mesh?.traverse !== 'function') return;
  const entries = guard.entries;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const object = entry.object;
    const geometry = object && object.geometry;
    const attributes = geometry && geometry.attributes;
    const position = attributes && attributes.position;
    const index = geometry && geometry.index;
    if (geometry !== entry.geometry
        || position !== entry.position
        || (position && position.version) !== entry.positionVersion
        || (position && position.count) !== entry.positionCount
        || index !== entry.index
        || (index && index.version) !== entry.indexVersion
        || (index && index.count) !== entry.indexCount) {
      if (geometry && typeof geometry.computeBoundingBox === 'function') {
        geometry.computeBoundingBox();
      }
    }
  }
}

function cameraClearanceBoxForMesh(mesh) {
  const data = mesh && mesh.userData;
  if (!data || !CAMERA_CLEARANCE_KINDS.has(data.kind)) return null;
  // Sticky never-roof: undersized asteroids cannot clear the span bar at any position.
  // Do not invalidate on drift — only on scale change (capital promotion / authoring).
  if (CAMERA_CLEARANCE_ASTEROID_SPAN_REJECT && data.kind === 'asteroid'
      && data.cameraClearanceNeverRoof === true) {
    const body = data.asteroidBody;
    const scaleX = body && body.scale ? Math.abs(Number(body.scale.x) || 0) : 0;
    if (data.cameraClearanceNeverRoofScale === scaleX) return null;
    data.cameraClearanceNeverRoof = false;
  }
  const cached = data.cameraClearanceBox;
  // A model that is still arriving does not have a roof. Measuring the stand-in, or the
  // half-built body, is what yanked the camera up and down while stations loaded. Once a
  // committed body has supplied a stable opaque box, however, retain that exact box through a
  // transient pipeline/residency latch so the camera does not lose a known roof mid-flight.
  if (clearanceBoundUnsettled(data)) {
    return canRetainCommittedClearanceWhilePending(mesh, data, cached) ? cached : null;
  }
  // Numeric cache stamp — a per-frame string key here meant an allocation per structural mesh
  // per camera query. Field equality covers the same invalidation inputs.
  const assetState = data.authoredAssetState || '';
  const compositionId = data.authoredCompositionId || '';
  const posX = Math.round(mesh.position.x);
  const posY = Math.round(mesh.position.y);
  const posZ = Math.round(mesh.position.z);
  if (cached && cached.assetState === assetState && cached.compositionId === compositionId
      && cached.posX === posX && cached.posY === posY && cached.posZ === posZ) {
    // An eligible guard changing at the same rounded root position means authored content
    // changed in place (child pose/visibility, geometry/index, or material admission). Rebuild
    // before returning; unsupported content keeps the historical memo behavior and never enters
    // the translation-retain path below.
    if (!cached.translationGuard || cached.translationGuard.reuseEligible !== true
        || cameraClearanceTranslationGuardStable(mesh, cached.translationGuard)) {
      return cached;
    }
  }
  // Position-only re-key (same authored content, crossed a 1-WU cell): a world box translates
  // exactly. Retain relative BVH cells only for a pure root translation with an unchanged guard;
  // a changed eligible guard falls through to a fresh measurement. Unsupported geometry keeps
  // the previous conservative box/grid invalidation behavior and never carries cell answers.
  if (cached && cached.assetState === assetState && cached.compositionId === compositionId
      && cached.box
      && (cached.posX !== posX || cached.posY !== posY || cached.posZ !== posZ)) {
    const guard = cached.translationGuard;
    const guardEligible = !!(guard && guard.reuseEligible === true);
    const guardStable = guardEligible && cameraClearanceTranslationGuardStable(mesh, guard);
    // If an eligible guard changed, do not translate stale geometry. The normal path below
    // updates matrices and takes a fresh bounds measurement, then replaces the guard snapshot.
    if (!guardEligible || guardStable) {
      const rawX = Number(cached.rawX);
      const rawY = Number(cached.rawY);
      const rawZ = Number(cached.rawZ);
      const dx = mesh.position.x - rawX;
      const dy = mesh.position.y - rawY;
      const dz = mesh.position.z - rawZ;
      if (Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(dz)) {
        cached.box.minX += dx; cached.box.maxX += dx;
        cached.box.minY += dy; cached.box.maxY += dy;
        cached.box.minZ += dz; cached.box.maxZ += dz;
        let canRetainCells = false;
        if (cached.bvhQuery && cached.layout) {
          // A pure translation preserves the cell dimensions exactly. Move only the layout
          // origin in place so the hot crossing allocates neither a replacement layout nor a
          // matrix; relative cell keys remain valid for the retained answers.
          cached.layout.minX += dx;
          cached.layout.minZ += dz;
          canRetainCells = guardStable;
        } else {
          cached.layout = cached.bvhQuery ? clearanceLayoutFromBox(cached.box) : null;
        }
        cached.grid = null;
        if (canRetainCells) {
          // cellRoofs/bvhCache are relative to the box. Keep those answers and lazily apply
          // the root's Y translation when reading them; newly measured cells store baseline raw Y.
          const previousOffset = Number.isFinite(cached.roofOffsetY) ? cached.roofOffsetY : 0;
          cached.roofOffsetY = previousOffset + dy;
        } else {
          cached.bvhCache = null;
          cached.cellRoofs = null;
          cached.roofOffsetY = 0;
        }
        _clearanceBoxEpoch = (_clearanceBoxEpoch + 1) | 0;
        cached.posX = posX;
        cached.posY = posY;
        cached.posZ = posZ;
        cached.rawX = mesh.position.x;
        cached.rawY = mesh.position.y;
        cached.rawZ = mesh.position.z;
        if (cached.stableAuthored === true) {
          cached.stableCompositionId = compositionId;
          cached.stableRawX = mesh.position.x;
          cached.stableRawY = mesh.position.y;
          cached.stableRawZ = mesh.position.z;
        }
        return cached;
      }
      // A malformed prior record is safer to rebuild than to let NaN poison the shared box.
      // The ordinary path below re-measures and replaces the record in one pass.
    }
  }
  if (CAMERA_CLEARANCE_ASTEROID_SPAN_REJECT && data.kind === 'asteroid') {
    const hint = asteroidClearanceSpanHint(data);
    if (hint > 0 && hint < CAMERA_CLEARANCE_MIN_SPAN_WU) {
      const body = data.asteroidBody;
      data.cameraClearanceNeverRoof = true;
      data.cameraClearanceNeverRoofScale = body && body.scale
        ? Math.abs(Number(body.scale.x) || 0) : 0;
      const rec = cached || (data.cameraClearanceBox = {});
      rec.assetState = assetState;
      rec.compositionId = compositionId;
      rec.posX = posX;
      rec.posY = posY;
      rec.posZ = posZ;
      rec.rawX = mesh.position.x;
      rec.rawY = mesh.position.y;
      rec.rawZ = mesh.position.z;
      rec.box = null;
      rec.grid = null;
      rec.bvhQuery = false;
      rec.layout = null;
      rec.bvhCache = null;
      rec.cellRoofs = null;
      rec.roofOffsetY = 0;
      rec.translationGuard = null;
      rec.stableAuthored = false;
      rec.stableCompositionId = '';
      _clearanceBoxEpoch = (_clearanceBoxEpoch + 1) | 0;
      return rec;
    }
    data.cameraClearanceNeverRoof = false;
    // Mid-size field rocks: a conservative analytic box from the authored scale. Re-measuring the
    // mesh every time a drifting rock crosses a half-WU cell is what made the span bar 120 in
    // the first place; a rock this size only needs "roughly here, roughly this tall".
    if (hint > 0 && hint < CAMERA_CLEARANCE_ANALYTIC_MAX_SPAN_WU) {
      const half = hint * 0.5;
      const rec = cached || (data.cameraClearanceBox = {});
      const box = rec.box || (rec.box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 });
      box.minX = mesh.position.x - half; box.maxX = mesh.position.x + half;
      box.minZ = mesh.position.z - half; box.maxZ = mesh.position.z + half;
      box.minY = mesh.position.y - half; box.maxY = mesh.position.y + half;
      rec.assetState = assetState;
      rec.compositionId = compositionId;
      rec.posX = posX;
      rec.posY = posY;
      rec.posZ = posZ;
      rec.rawX = mesh.position.x;
      rec.rawY = mesh.position.y;
      rec.rawZ = mesh.position.z;
      rec.grid = null;
      rec.bvhQuery = false;
      rec.layout = null;
      rec.bvhCache = null;
      rec.cellRoofs = null;
      rec.roofOffsetY = 0;
      rec.translationGuard = null;
      rec.stableAuthored = assetState.startsWith('authored');
      rec.stableCompositionId = rec.stableAuthored ? compositionId : '';
      rec.stableRawX = mesh.position.x;
      rec.stableRawY = mesh.position.y;
      rec.stableRawZ = mesh.position.z;
      _clearanceBoxEpoch = (_clearanceBoxEpoch + 1) | 0;
      return rec;
    }
  }
  if (cached && cached.translationGuard && cached.translationGuard.reuseEligible === true) {
    // Box3.setFromObject may reuse a geometry's cached bounds. Refresh only geometries whose
    // position/index revision changed before the guarded full rebuild; the steady-state path
    // never pays this traversal or mutates authored bounds.
    cameraClearanceRefreshChangedGeometryBounds(mesh, cached.translationGuard);
  }
  _clearanceBoxScratch.setFromObject(mesh);
  let box = null;
  let bvhQuery = false;
  if (!_clearanceBoxScratch.isEmpty()) {
    const b = _clearanceBoxScratch;
    const finite = Number.isFinite(b.min.x) && Number.isFinite(b.min.y) && Number.isFinite(b.min.z)
      && Number.isFinite(b.max.x) && Number.isFinite(b.max.y) && Number.isFinite(b.max.z);
    const span = finite
      ? Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z)
      : Infinity;
    if (finite && span >= CAMERA_CLEARANCE_MIN_SPAN_WU && span <= CAMERA_CLEARANCE_MAX_SPAN_WU
        && b.max.y >= CAMERA_CLEARANCE_MIN_TOP_WU) {
      box = (cached && cached.box) || {
        minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0,
      };
      box.minX = b.min.x; box.minY = b.min.y; box.minZ = b.min.z;
      box.maxX = b.max.x; box.maxY = b.max.y; box.maxZ = b.max.z;
      if (Math.max(b.max.x - b.min.x, b.max.z - b.min.z) >= CAMERA_CLEARANCE_GRID_MIN_SPAN_WU) {
        bvhQuery = true;
      }
    }
  }
  const rec = cached || (data.cameraClearanceBox = {});
  rec.assetState = assetState;
  rec.compositionId = compositionId;
  rec.posX = posX;
  rec.posY = posY;
  rec.posZ = posZ;
  rec.rawX = mesh.position.x;
  rec.rawY = mesh.position.y;
  rec.rawZ = mesh.position.z;
  rec.box = box;
  rec.grid = null;
  rec.bvhQuery = bvhQuery && box != null;
  rec.layout = rec.bvhQuery ? clearanceLayoutFromBox(box) : null;
  rec.bvhCache = null;
  rec.cellRoofs = null;
  rec.roofOffsetY = 0;
  rec.translationGuard = rec.bvhQuery ? cameraClearanceTranslationGuardFor(mesh) : null;
  rec.stableAuthored = !!(box && assetState.startsWith('authored'));
  rec.stableCompositionId = rec.stableAuthored ? compositionId : '';
  rec.stableRawX = mesh.position.x;
  rec.stableRawY = mesh.position.y;
  rec.stableRawZ = mesh.position.z;
  _clearanceBoxEpoch = (_clearanceBoxEpoch + 1) | 0;
  return rec;
}

function clearanceGridFloor(grid, camX, camZ) {
  const raw = clearanceGridRawAt(grid, camX, camZ);
  return raw === -Infinity ? -Infinity : raw + CAMERA_CLEARANCE_MARGIN_WU;
}

const _liveViewSphere = typeof THREE !== 'undefined' ? new THREE.Sphere() : null;

/**
 * Camera-view arm of the live-glass test: the real frustum decides whether any of a
 * root's envelope is still drawn, so a huge body cannot be hidden just because its
 * centre left the screen rectangle.
 */
export function isOnLiveCameraView(frustum, position, radius) {
  if (!frustum || !position || !_liveViewSphere) return false;
  _liveViewSphere.center.set(
    Number(position.x) || 0,
    Number(position.y) || 0,
    Number(position.z) || 0,
  );
  _liveViewSphere.radius = Math.max(0, Number(radius) || 0);
  return frustum.intersectsSphere(_liveViewSphere);
}

/**
 * The one on-live-glass verdict every urgency gauge must share: rectangle extents at the live
 * zoom plus the frame skirt, or the camera's real frustum for envelopes whose centre left the
 * rectangle. `radius` is the caller-resolved visual radius (skirt is added here, once).
 */
export function rootOnLiveGlass(bounds, frustum, position, radius) {
  const skirted = Math.max(0, Number(radius) || 0) + TABLE_FRAME_SKIRT_WU;
  return (bounds
      && Number.isFinite(bounds.glassHalfX) && Number.isFinite(bounds.glassHalfZ)
      && Math.abs(position.x - bounds.x) <= bounds.glassHalfX + skirted
      && Math.abs(position.z - bounds.z) <= bounds.glassHalfZ + skirted)
    || isOnLiveCameraView(frustum, position, skirted);
}

/**
 * Lowest camera Y at an arbitrary column — the anticipation query behind cameraGlide.js. Same
 * roofs and margin as cameraClearanceFloorAt but answered for any (x, z), not the camera's own,
 * and never short-circuited by the camera's current height. `pad` widens the coarse box test so a
 * sample spaced along a flight path cannot step over a narrow tower. Per-cell results are cached
 * on the mesh record, so sweeping a path costs one BVH window query per cell per structure.
 */
export function cameraRoofAt(owner, x, z, pad = 0) {
  const structural = clearanceStructuralMeshes(owner);
  if (!structural) return -Infinity;
  return cameraClearanceFloorWalk(structural, x, z, -Infinity, pad);
}

// Structural-only list rebuilt on the _meshes mutation version — the per-frame query walks a
// handful of stations/places/rocks instead of every live mesh root.
function clearanceStructuralMeshes(owner) {
  const meshes = owner && owner._meshes;
  if (!meshes) return null;
  let structural = owner._clearanceMeshes;
  if (!structural || owner._clearanceMeshesVersion !== owner._meshesVersion) {
    if (!structural) structural = owner._clearanceMeshes = [];
    structural.length = 0;
    for (const mesh of meshes.values()) {
      const data = mesh && mesh.userData;
      const kind = data && data.kind;
      if (!CAMERA_CLEARANCE_KINDS.has(kind)) continue;
      if (kind === 'ship') {
        const isPlayer = data.isPlayer === true || mesh === owner._playerMesh || data.id === (owner.state && owner.state.playerId);
        if (isPlayer) continue;
        const defId = data.defId || data.shipDefId || '';
        const silhouette = data.silhouette || '';
        const radius = Number(data.radius) || 0;
        const isCapital = defId === 'ship_atlas' || defId === 'ship_colossus' || defId === 'ship_leviathan'
          || defId === 'dreadnought_boss' || silhouette === 'dreadnought_enemy' || radius >= 28;
        if (!isCapital) continue;
      }
      // Quiet Ceres: dozens of field rocks can never roof. Keep them off the per-frame
      // structural walk (rebuild only on _meshesVersion). Scale growth clears the sticky bit.
      if (CAMERA_CLEARANCE_ASTEROID_NEVER_ROOF_EXCLUDE
          && CAMERA_CLEARANCE_ASTEROID_SPAN_REJECT
          && kind === 'asteroid') {
        const hint = asteroidClearanceSpanHint(data);
        if (hint > 0 && hint < CAMERA_CLEARANCE_MIN_SPAN_WU) {
          const body = data.asteroidBody;
          data.cameraClearanceNeverRoof = true;
          data.cameraClearanceNeverRoofScale = body && body.scale
            ? Math.abs(Number(body.scale.x) || 0) : 0;
          continue;
        }
        data.cameraClearanceNeverRoof = false;
      }
      structural.push(mesh);
    }
    owner._clearanceMeshesVersion = owner._meshesVersion;
  }
  return structural;
}

/** Pure renderer-side clearance policy used by the camera callback and focused tests. */
export function cameraClearanceFloorAt(owner, camX, camZ, camY) {
  const structural = clearanceStructuralMeshes(owner);
  if (!structural) return -Infinity;
  if (CAMERA_CLEARANCE_FLOOR_RETAIN) {
    // Moving structural kinds (asteroid / wreck) can drift or grow without a
    // _meshesVersion bump; never retain across them — full walk stays authoritative.
    // Stations/places are authored-static: cam identity + boxEpoch + a light
    // authored-stamp check is enough (pending→authored must not return a stale
    // -Infinity from the empty-substrate frame).
    let staticStructural = true;
    for (let i = 0; i < structural.length; i++) {
      const kind = structural[i] && structural[i].userData && structural[i].userData.kind;
      if (kind === 'asteroid' || kind === 'wreck' || kind === 'ship') { staticStructural = false; break; }
    }
    const cache = owner._clearanceFloorCache || (owner._clearanceFloorCache = {
      camX: NaN,
      camZ: NaN,
      camY: NaN,
      meshesVersion: -1,
      boxEpoch: -1,
      floor: -Infinity,
    });
    const qCamX = quantizeClearanceRetainPos(camX);
    const qCamZ = quantizeClearanceRetainPos(camZ);
    const qCamY = quantizeClearanceRetainPos(camY);
    if (staticStructural
        && cache.camX === qCamX && cache.camZ === qCamZ && cache.camY === qCamY
        && cache.meshesVersion === owner._clearanceMeshesVersion
        && cache.boxEpoch === _clearanceBoxEpoch) {
      // Quiet flight is almost always off-roof (floor === -Infinity). Trust the
      // quantized cam cell there — spawn/despawn bumps _meshesVersion. Under a
      // roof, also confirm authored stamps so pending→authored on a station
      // cannot keep a stale empty floor (PIC-07 style in-place stamp without
      // map churn). Exact floats still drive the AABB walk below on cell miss.
      if (cache.floor === -Infinity) return cache.floor;
      let stampsFresh = true;
      for (let i = 0; stampsFresh && i < structural.length; i++) {
        const data = structural[i].userData;
        const cached = data && data.cameraClearanceBox;
        if (!cached
            || cached.assetState !== (data.authoredAssetState || '')
            || cached.compositionId !== (data.authoredCompositionId || '')) {
          stampsFresh = false;
        }
      }
      if (stampsFresh) return cache.floor;
    }
    const floor = cameraClearanceFloorWalk(structural, camX, camZ, camY);
    cache.camX = qCamX;
    cache.camZ = qCamZ;
    cache.camY = qCamY;
    cache.meshesVersion = owner._clearanceMeshesVersion;
    cache.boxEpoch = _clearanceBoxEpoch;
    cache.floor = floor;
    return floor;
  }
  return cameraClearanceFloorWalk(structural, camX, camZ, camY);
}

// The structural walk itself — neighborhood query for wide roots, coarse box otherwise.
// Shared by the retain and always-walk paths so a bench-off frame matches a retained miss.
function cameraClearanceFloorWalk(structural, camX, camZ, camY, pad = 0) {
  let floor = -Infinity;
  for (let i = 0; i < structural.length; i++) {
    const rec = cameraClearanceBoxForMesh(structural[i]);
    if (!rec) continue;
    if (rec.bvhQuery && rec.layout && rec.box) {
      const sample = clearanceSampleCell(rec.layout, camX, camZ);
      const gx = sample.gx;
      const gz = sample.gz;
      let raw = -Infinity;
      let useBvh = true;
      const roofOffsetY = Number.isFinite(rec.roofOffsetY) ? rec.roofOffsetY : 0;
      // Cell answers persist on the record until the box is rebuilt (position/asset change), so
      // a path sweep that revisits cells never repeats a BVH window query.
      const cellKey = (gz + 2) * 1024 + (gx + 2);
      const cellRaw = rec.cellRoofs ? rec.cellRoofs.get(cellKey) : undefined;
      if (cellRaw !== undefined) {
        raw = cellRaw + roofOffsetY;
      } else if (rec.bvhCache && rec.bvhCache.gx === gx && rec.bvhCache.gz === gz) {
        raw = rec.bvhCache.raw + roofOffsetY;
      } else if (!clearanceCellInRange(rec.layout, gx, gz)) {
        raw = -Infinity;
        // Store the baseline value so a later pure translation can keep this out-of-range
        // answer without baking the current lazy offset into the record.
        rec.bvhCache = { gx, gz, raw: -Infinity };
      } else {
        try {
          const hit = clearanceNeighborhoodRaw(structural[i], rec.box, camX, camZ);
          if (hit.failed) {
            useBvh = false;
            rec.bvhQuery = false;
            rec.bvhCache = null;
            rec.cellRoofs = null;
            rec.roofOffsetY = 0;
            rec.translationGuard = null;
            rec.grid = rasterClearanceGrid(structural[i], rec.box);
          } else if (hit.empty) {
            useBvh = false;
            rec.bvhQuery = false;
            rec.bvhCache = null;
            rec.cellRoofs = null;
            rec.roofOffsetY = 0;
            rec.translationGuard = null;
            rec.grid = null;
          } else {
            raw = hit.raw;
            rec.bvhCache = { gx, gz, raw: raw - roofOffsetY };
            const cells = rec.cellRoofs || (rec.cellRoofs = new Map());
            if (cells.size >= 512) cells.clear();
            cells.set(cellKey, raw - roofOffsetY);
          }
        } catch {
          useBvh = false;
          rec.bvhQuery = false;
          rec.bvhCache = null;
          rec.cellRoofs = null;
          rec.roofOffsetY = 0;
          rec.translationGuard = null;
          rec.grid = rasterClearanceGrid(structural[i], rec.box);
        }
      }
      if (useBvh) {
        const roof = raw === -Infinity ? -Infinity : raw + CAMERA_CLEARANCE_MARGIN_WU;
        // A hole in this window is not the hull's tallest tower. Falling through
        // to the coarse box would pin the camera to that tower across the footprint.
        if (camY >= roof) continue;
        if (roof > floor) floor = roof;
        continue;
      }
    }
    if (rec.grid) {
      const roof = clearanceGridFloor(rec.grid, camX, camZ);
      if (camY >= roof) continue;
      if (roof > floor) floor = roof;
      continue;
    }
    const box = rec.box;
    if (!box) continue;
    const reach = CAMERA_CLEARANCE_MARGIN_WU + pad;
    if (camX < box.minX - reach || camX > box.maxX + reach) continue;
    if (camZ < box.minZ - reach || camZ > box.maxZ + reach) continue;
    const roof = box.maxY + CAMERA_CLEARANCE_MARGIN_WU;
    if (camY >= roof) continue;
    if (roof > floor) floor = roof;
  }
  return floor;
}
