// Drawn-envelope cull radius — hoisted out of renderer.js so the partsLibrary readable-glass
// mirror shares the same measurement as the renderer's own glass/cull decisions (the
// renderer→partsLibrary import direction forbids reaching back for it). Presence, not
// collision: a station's drawn envelope reaches data.dockRadius while entity.radius is only
// the small collision proxy, so a hull centred just off-screen still culls as the size it
// actually draws at.
import * as THREE from 'three';
import { entityPresenceRadius } from '../world/activityClassification.js';

const _drawnCullBox = new THREE.Box3();
const _motionPadBox = new THREE.Box3();
const _motionPadOrigin = new THREE.Vector3();
const _motionPadCorner = new THREE.Vector3();

/**
 * Farthest authored-motion excursion beyond the rest-pose envelope. The pad spec rides on
 * the entity root (attachAuthoredMotionDriver); each entry's subtree radius is measured in
 * world space at first query — after fit/scale mounts — so a pivot swinging an arm can't
 * draw past the committed envelope. Same-named LOD twin pivots max within a binding
 * (only one level draws); distinct bindings sum (nested pivots compose).
 */
function motionTravelPadFor(mesh) {
  const data = mesh && mesh.userData;
  const spec = data && data.authoredMotionPadSpec;
  if (!spec || !spec.length) return 0;
  const cached = data.__authoredMotionPad;
  if (typeof cached === 'number') return cached;
  let pad = 0;
  for (const entry of spec) {
    let reach = 0;
    for (const node of entry.nodes || []) {
      if (!node || node.isObject3D !== true) continue;
      _motionPadBox.setFromObject(node);
      if (_motionPadBox.isEmpty()) continue;
      node.getWorldPosition(_motionPadOrigin);
      for (let cx = 0; cx < 2; cx++) for (let cy = 0; cy < 2; cy++) for (let cz = 0; cz < 2; cz++) {
        _motionPadCorner.set(
          cx ? _motionPadBox.max.x : _motionPadBox.min.x,
          cy ? _motionPadBox.max.y : _motionPadBox.min.y,
          cz ? _motionPadBox.max.z : _motionPadBox.min.z,
        );
        const r = _motionPadCorner.distanceTo(_motionPadOrigin);
        if (r > reach) reach = r;
      }
    }
    pad += reach * (Number(entry.chordFactor) || 0) + (Number(entry.tMax) || 0);
  }
  data.__authoredMotionPad = pad;
  return pad;
}

/**
 * True drawn reach for an authored root that carries no authored visualBounds: measure the
 * real envelope once and cache it on userData. station_helios draws 549x420 WU half-extents
 * against a 90 WU dock radius, so collision-proxied radii hide limbs that are still on the
 * glass. The stamp mirrors cameraClearanceBoxForMesh — field equality, never a per-call
 * string. A pending substrate (authoredAssetState not yet 'authored*') must not define the
 * size, so callers only reach this once the authored body has landed.
 */
// Interior subtree grafts (a grandchild splice under unchanged assetState /
// composition / lodLevel / direct-child-count) move none of the cache keys, so
// a continuously-visible row could keep a stale-large envelope forever. A
// cheap cadence bound re-measures periodically, jittered by mesh id so a scene
// of same-age roots doesn't expire on one frame.
const DRAWN_CULL_REMEASURE_CALLS = 600;
// Composition/lod oscillation (level A→B→A across camera churn) invalidates
// the single memo record every flip, and each miss pays Box3.setFromObject
// O(subtree) inside the per-slot cull test — landing exactly on transition
// frames. A tiny per-mesh LRU of recent key→radius pairs absorbs the flip
// pattern so only genuinely-new compositions measure. The composite-key domain
// (assetState x compositionId x lodLevel x childCount) runs ~3-6 keys on a
// demoting hull, so 8 covers a full LOD descent plus authored-state flips.
const DRAWN_CULL_LRU_SIZE = 8;
// Same-age fleets re-measure in near-lockstep once the jitter window compresses
// under per-frame call fan-out — cap the Box3 walks a single syncEntityViews
// pass may pay; a denied row serves its stale radius and retries inside a few
// calls (the cadence exists to bound drift, not to promise a deadline).
const DRAWN_CULL_REMEASURE_PER_PASS = 4;
let _passRemeasureCount = 0;
export function resetDrawnCullPassBudget() { _passRemeasureCount = 0; }

function drawnCullRadiusForMesh(mesh) {
  const data = mesh && mesh.userData;
  if (!data || mesh.isObject3D !== true || !_drawnCullBox) return 0;
  const assetState = data.authoredAssetState || '';
  const compositionId = data.authoredCompositionId || '';
  const lodLevel = data.wholeShipLodActiveLevel || '';
  const childCount = mesh.children ? mesh.children.length : 0;
  const cached = data.drawnCullRadius;
  if (cached && cached.assetState === assetState && cached.compositionId === compositionId
    && cached.lodLevel === lodLevel && cached.childCount === childCount
    && ++cached.calls < DRAWN_CULL_REMEASURE_CALLS + ((mesh.id | 0) & 63)) {
    return cached.radius;
  }
  // Key moved (or cadence expired): before paying the Box3 walk, serve a
  // radius this exact key already measured. Only meaningful when the memo
  // holds a different key — a cadence expiry must re-measure regardless.
  const keyMoved = !(cached && cached.assetState === assetState
    && cached.compositionId === compositionId && cached.lodLevel === lodLevel
    && cached.childCount === childCount);
  if (keyMoved) {
    const lru = data.drawnCullRadiusLru || (data.drawnCullRadiusLru = new Map());
    const lruKey = assetState + '|' + compositionId + '|' + lodLevel + '|' + childCount;
    // Stash the outgoing key BEFORE consulting: the hit path returns early, so
    // a stash placed after the consult leaves the flipped-away key uncached —
    // the dominant A->B->A oscillation then re-measures every B-leg. keyMoved
    // guarantees the outgoing key differs from the incoming one.
    if (cached && cached.radius != null) {
      const outKey = cached.assetState + '|' + cached.compositionId + '|' + cached.lodLevel + '|' + cached.childCount;
      lru.delete(outKey);
      lru.set(outKey, cached.radius);
      while (lru.size > DRAWN_CULL_LRU_SIZE) lru.delete(lru.keys().next().value);
    }
    const hit = lru.get(lruKey);
    if (hit != null) {
      const rec = cached || (data.drawnCullRadius = {});
      rec.assetState = assetState;
      rec.compositionId = compositionId;
      rec.lodLevel = lodLevel;
      rec.childCount = childCount;
      // A restored radius is already stale — halve the cadence window so the
      // next re-measure bounds its drift instead of granting a fresh cycle.
      rec.calls = DRAWN_CULL_REMEASURE_CALLS >> 1;
      rec.radius = hit;
      // Refresh recency — the Map iterates in insertion order.
      lru.delete(lruKey);
      lru.set(lruKey, hit);
      return hit;
    }
  }
  // Cadence-expiry re-measures defer past the pass budget (a key-moved row
  // still pays — its incoming key owns no stale radius to serve).
  if (!keyMoved && cached && _passRemeasureCount >= DRAWN_CULL_REMEASURE_PER_PASS) {
    cached.calls -= 8;
    return cached.radius;
  }
  _passRemeasureCount += 1;
  _drawnCullBox.setFromObject(mesh);
  let radius = 0;
  if (!_drawnCullBox.isEmpty()) {
    const b = _drawnCullBox;
    const px = mesh.position ? mesh.position.x : 0;
    const pz = mesh.position ? mesh.position.z : 0;
    // Farthest XZ corner from the root's own position — the body may sit off-centre.
    radius = Math.max(
      Math.hypot(b.min.x - px, b.min.z - pz),
      Math.hypot(b.min.x - px, b.max.z - pz),
      Math.hypot(b.max.x - px, b.min.z - pz),
      Math.hypot(b.max.x - px, b.max.z - pz),
    );
  }
  const rec = cached || (data.drawnCullRadius = {});
  rec.assetState = assetState;
  rec.compositionId = compositionId;
  rec.lodLevel = lodLevel;
  rec.childCount = childCount;
  rec.calls = 0;
  rec.radius = radius;
  return radius;
}

/** Use authored XZ bounds for view culling without changing gameplay/collision radius. */
export function entityVisualCullRadius(entity, mesh = null) {
  const presence = entityPresenceRadius(entity);
  const data = mesh && mesh.userData;
  const pad = motionTravelPadFor(mesh);
  const hull = data && data.hull;
  const bounds = hull && hull.userData && hull.userData.visualBounds
    || data && data.visualBounds;
  const size = bounds && bounds.size;
  if (Array.isArray(size)) {
    const x = Math.max(0, Number(size[0]) || 0);
    const z = Math.max(0, Number(size[2]) || 0);
    // Envelope stamps can sit off-origin (a composed body's far parts extend past the
    // authored center); the cull radius must reach the far edge, not just half the size.
    const center = bounds.center;
    const cx = Array.isArray(center) ? Number(center[0]) || 0 : 0;
    const cz = Array.isArray(center) ? Number(center[2]) || 0 : 0;
    return Math.max(presence, Math.hypot(cx, cz) + Math.hypot(x, z) * 0.5 + pad);
  }
  if (data && String(data.authoredAssetState || '').startsWith('authored')) {
    return Math.max(presence, drawnCullRadiusForMesh(mesh) + pad);
  }
  return Math.max(presence, pad);
}
