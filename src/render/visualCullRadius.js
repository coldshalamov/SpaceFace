// Drawn-envelope cull radius — hoisted out of renderer.js so the partsLibrary readable-glass
// mirror shares the same measurement as the renderer's own glass/cull decisions (the
// renderer→partsLibrary import direction forbids reaching back for it). Presence, not
// collision: a station's drawn envelope reaches data.dockRadius while entity.radius is only
// the small collision proxy, so a hull centred just off-screen still culls as the size it
// actually draws at.
import * as THREE from 'three';
import { entityPresenceRadius } from '../world/activityClassification.js';
import {
  forcedFrameSpend,
  FORCED_FRAME_BUDGET_MS,
  noteForcedFrameSpend,
  pacedFrameSpend,
  PACED_FRAME_BUDGET_MS,
} from './decodeTaskBudget.js';

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
function _measureMotionPad(data, spec) {
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

function motionTravelPadFor(mesh) {
  const data = mesh && mesh.userData;
  const spec = data && data.authoredMotionPadSpec;
  if (!spec || !spec.length) return 0;
  const cached = data.__authoredMotionPad;
  if (typeof cached === 'number') return cached;
  // The first-consult subtree walk is unmetered — identical to the drawn-cull
  // miss it sits above. Once the pass remeasure budget is spent, queue the
  // pad measure on the same FIFO and serve the conservative estimate
  // (ΣtMax + chordFactor over the drawn-radius memo when one exists — the
  // over-serve direction) until the drain commits the real pad.
  if (_passRemeasureCount >= DRAWN_CULL_REMEASURE_PER_PASS) {
    if (data.motionPadForceQueued !== true) {
      data.motionPadForceQueued = true;
      _drawnCullForceRemeasure.push(mesh);
    }
    const knownRadius = (data.drawnCullRadius && data.drawnCullRadius.radius) || 0;
    let pad = 0;
    for (const entry of spec) {
      pad += (Number(entry.tMax) || 0) + (Number(entry.chordFactor) || 0) * knownRadius;
    }
    return pad;
  }
  _passRemeasureCount += 1;
  return _measureMotionPad(data, spec);
}

/**
 * Runtime motion graft onto an already-live row: measure the pad now, inside the
 * graft, instead of letting the row's next cull consult pay the first-mint walk
 * mid-pass. Only safe once the row's drawn-cull memo exists — the lazy measure
 * is load-bearing on rows still mid-mount (pre-fit world boxes are wrong), so a
 * mount-time attach stays lazy exactly as before.
 */
export function primeMotionTravelPad(mesh) {
  const data = mesh && mesh.userData;
  if (!data || data.drawnCullRadius == null) return;
  motionTravelPadFor(mesh);
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
// An over-budget stale serve multiplies by this bias: a stale-small envelope
// short-culls a hull that grew, while stale-large only over-draws — the bias
// keeps the deferred serve strictly on the legal (over-draw) side.
const DRAWN_CULL_STALE_SERVE_BIAS = 1.15;
let _passRemeasureCount = 0;
// Post-cap forced walks ride a FIFO instead of falling straight to
// setFromObject: the jittered streak cap staggers which pass each cohort falls
// through, but every fall-through still paid an unbudgeted O(subtree) walk.
// Queued rows keep serving their stale-biased envelope (the legal over-draw
// direction) and drain ≤DRAWN_CULL_REMEASURE_PER_PASS per pass — the staleness
// bound becomes cap + ceil(queue/K) passes, still a hard bound.
const _drawnCullForceRemeasure = [];
const _drainNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
  ? performance.now() : Date.now());
// Each drained row pays one Box3.setFromObject subtree walk — a populated FIFO
// used to stack up to PER_PASS unbudgeted walks atomically at every pass head.
// Bound the burst inside ~1 ms (always ≥1 row so the queue can't starve) and
// hand the caller's paced ledger the measured spend.
export function resetDrawnCullPassBudget(debitSpend) {
  let spent = 0;
  let rows = 0;
  // The unconditional one-row floor shares the storm-frame pathology the
  // forced ledger exists for: skip the whole drain while BOTH wallets are
  // spent — queued rows keep serving the stale-biased envelope (the legal
  // over-draw direction) and the drain resumes next pass, so the starvation
  // bound stretches by a pass rather than stacking a walk on a spent frame.
  const forcedRun = pacedFrameSpend() >= PACED_FRAME_BUDGET_MS;
  if (forcedRun && forcedFrameSpend() >= FORCED_FRAME_BUDGET_MS) {
    _passRemeasureCount = 0;
    return;
  }
  const drainStart = _drainNow();
  const deadline = drainStart + 1;
  while (_drawnCullForceRemeasure.length && spent < DRAWN_CULL_REMEASURE_PER_PASS
      && (rows === 0 || _drainNow() < deadline)) {
    rows += 1;
    const mesh = _drawnCullForceRemeasure.shift();
    const data = mesh && mesh.userData;
    // Rows whose mesh parked (unparented) or had the queue stamp cleared drop —
    // they are not being culled this pass and re-queue on their next consult.
    const wantsRadius = !!(data && data.drawnCullForceQueued === true);
    const wantsPad = !!(data && data.motionPadForceQueued === true
      && data.__authoredMotionPad == null);
    if (!mesh || mesh.isObject3D !== true || !mesh.parent || !data
        || (!wantsRadius && !wantsPad)) {
      if (data) { data.drawnCullForceQueued = false; data.motionPadForceQueued = false; }
      continue;
    }
    data.drawnCullForceQueued = false;
    data.motionPadForceQueued = false;
    if (wantsPad) {
      // Queued motion-pad first-consult: same unmetered subtree walk, drained
      // under the same budget — commits the real pad, no radius memo update.
      const padSpec = data.authoredMotionPadSpec;
      _measureMotionPad(data, Array.isArray(padSpec) ? padSpec : []);
      spent += 1;
      continue;
    }
    _drawnCullBox.setFromObject(mesh);
    let radius = 0;
    if (!_drawnCullBox.isEmpty()) {
      const b = _drawnCullBox;
      const px = mesh.position ? mesh.position.x : 0;
      const pz = mesh.position ? mesh.position.z : 0;
      radius = Math.max(
        Math.hypot(b.min.x - px, b.min.z - pz),
        Math.hypot(b.min.x - px, b.max.z - pz),
        Math.hypot(b.max.x - px, b.min.z - pz),
        Math.hypot(b.max.x - px, b.max.z - pz),
      );
    }
    const rec = data.drawnCullRadius || (data.drawnCullRadius = {});
    // A key move while the row sat queued (composition flip mid-storm): the
    // consult path stashes the outgoing key to the LRU before rewriting, but
    // only on a consult — a drain firing first would overwrite the stored key
    // and lose the remembered envelope. Same stash grammar as the consult.
    const nextAssetState = data.authoredAssetState || '';
    const nextCompositionId = data.authoredCompositionId || '';
    const nextLodLevel = data.wholeShipLodActiveLevel || '';
    const nextChildCount = mesh.children ? mesh.children.length : 0;
    if (rec.radius != null
        && (rec.assetState !== nextAssetState || rec.compositionId !== nextCompositionId
          || rec.lodLevel !== nextLodLevel || rec.childCount !== nextChildCount)) {
      const lru = data.drawnCullRadiusLru || (data.drawnCullRadiusLru = new Map());
      const outKey = rec.assetState + '|' + rec.compositionId + '|'
        + rec.lodLevel + '|' + rec.childCount;
      lru.delete(outKey);
      lru.set(outKey, rec.radius);
      while (lru.size > DRAWN_CULL_LRU_SIZE) lru.delete(lru.keys().next().value);
    }
    rec.assetState = nextAssetState;
    rec.compositionId = data.authoredCompositionId || '';
    rec.lodLevel = data.wholeShipLodActiveLevel || '';
    rec.childCount = mesh.children ? mesh.children.length : 0;
    rec.calls = 0;
    rec.radius = radius;
    data.drawnCullDefers = 0;
    spent += 1;
  }
  _passRemeasureCount = spent;
  const drainedMs = _drainNow() - drainStart;
  if (drainedMs > 0 && typeof debitSpend === 'function') debitSpend(drainedMs);
  if (drainedMs > 0 && forcedRun) noteForcedFrameSpend(drainedMs);
}

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
      data.drawnCullDefers = 0;
      data.drawnCullForceQueued = false;
      // Refresh recency — the Map iterates in insertion order.
      lru.delete(lruKey);
      lru.set(lruKey, hit);
      return hit;
    }
  }
  // A key-moved miss past the pass budget used to pay the Box3 walk anyway —
  // a one-way fleet LOD descent mints a fresh key per hull and stacks N fat
  // walks inside the busiest pass. Serve the largest radius this mesh has
  // ever measured instead (max-ever is the only legal direction: a demoted
  // hull over-draws transiently, a promoted hull can never under-cull) and
  // retry the real measure next pass — the memo keeps the outgoing key so the
  // miss re-enters the same path. A never-measured row has nothing honest to
  // serve: it still pays the walk.
  if (keyMoved && _passRemeasureCount >= DRAWN_CULL_REMEASURE_PER_PASS) {
    // Largest radius the LRU window still knows — max-over-LRU decays a
    // lod0-era envelope once a descent's keys age out, where the max-ever
    // field would hold it through a whole sustained key-move storm.
    let known = (cached && cached.radius) || 0;
    const lru = data.drawnCullRadiusLru;
    if (lru) for (const value of lru.values()) { if (value > known) known = value; }
    // Same over-serve bias as the cadence branch — a never-measured-larger
    // composition must not under-cull for the deferred pass.
    // Stale-serve is conservative only against measured history: a fresh key
    // whose true envelope is LARGER than every remembered one under-culls on
    // the stale envelope — a pop-out, the illegal direction. Bound the streak
    // so a sustained over-budget window can't serve a wrong envelope forever.
    // The cap jitters by mesh id so streaks minted in one burst exhaust across
    // different passes — a synchronized cliff would re-stack every forced walk
    // into a single presented pass.
    const defers = (data.drawnCullDefers = (data.drawnCullDefers || 0) + 1);
    if (known > 0 && defers <= (2 + (mesh.id & 3))) return known * DRAWN_CULL_STALE_SERVE_BIAS;
    // Past the cap: queue the forced walk on the per-pass FIFO and keep serving
    // the stale envelope while it waits — the jittered cap used to hand every
    // exhausted cohort straight to setFromObject, re-stacking ~N/4 unbudgeted
    // walks inside each jitter group's pass. A never-measured row has nothing
    // honest to serve: it still pays the walk inline.
    if (known > 0) {
      if (data.drawnCullForceQueued !== true) {
        data.drawnCullForceQueued = true;
        _drawnCullForceRemeasure.push(mesh);
      }
      return known * DRAWN_CULL_STALE_SERVE_BIAS;
    }
  }
  // Cadence-expiry re-measures defer past the pass budget (a key-moved row
  // still pays — its incoming key owns no stale radius to serve).
  if (!keyMoved && cached && _passRemeasureCount >= DRAWN_CULL_REMEASURE_PER_PASS) {
    const defers = (data.drawnCullDefers = (data.drawnCullDefers || 0) + 1);
    if (defers <= (2 + (mesh.id & 3))) {
      cached.calls -= 8;
      return cached.radius * DRAWN_CULL_STALE_SERVE_BIAS;
    }
    // Same jittered streak cap — past it the row still owns an honest stale
    // envelope, so queue the re-measure and keep serving (a zero/never-measured
    // radius can't over-serve: it walks).
    if (cached.radius > 0) {
      if (data.drawnCullForceQueued !== true) {
        data.drawnCullForceQueued = true;
        _drawnCullForceRemeasure.push(mesh);
      }
      return cached.radius * DRAWN_CULL_STALE_SERVE_BIAS;
    }
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
  data.drawnCullDefers = 0;
  data.drawnCullForceQueued = false;
  return radius;
}

/**
 * Commit-window stamp: measure the drawn envelope + authored-motion pad inside
 * the paced authored-commit tail (which already walks the subtree off the
 * presented pass) so the first in-frame cull consult hits the memo instead of
 * paying Box3.setFromObject inside syncEntityViews. Stamps under the
 * caller-visible key — a later wholeShipLodActiveLevel mint re-keys, and the
 * family install stamps again under the real level. The pad consult feeds both
 * radius paths, so it stamps unconditionally; bounds-carrying rows never reach
 * the drawn-radius memo, so their envelope walk is skipped.
 */
export function primeDrawnCullStamps(mesh) {
  const data = mesh && mesh.userData;
  if (!data || mesh.isObject3D !== true || !_drawnCullBox) return;
  motionTravelPadFor(mesh);
  const hull = data.hull;
  if ((hull && hull.userData && hull.userData.visualBounds) || data.visualBounds) return;
  _drawnCullBox.setFromObject(mesh);
  let radius = 0;
  if (!_drawnCullBox.isEmpty()) {
    const b = _drawnCullBox;
    const px = mesh.position ? mesh.position.x : 0;
    const pz = mesh.position ? mesh.position.z : 0;
    radius = Math.max(
      Math.hypot(b.min.x - px, b.min.z - pz),
      Math.hypot(b.min.x - px, b.max.z - pz),
      Math.hypot(b.max.x - px, b.min.z - pz),
      Math.hypot(b.max.x - px, b.max.z - pz),
    );
  }
  const rec = data.drawnCullRadius || (data.drawnCullRadius = {});
  rec.assetState = data.authoredAssetState || '';
  rec.compositionId = data.authoredCompositionId || '';
  rec.lodLevel = data.wholeShipLodActiveLevel || '';
  rec.childCount = mesh.children ? mesh.children.length : 0;
  rec.calls = 0;
  rec.radius = radius;
  data.drawnCullDefers = 0;
  data.drawnCullForceQueued = false;
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
