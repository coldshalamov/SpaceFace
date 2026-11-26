// Projected-screen-size LOD selector with hysteresis (spec §12.4).
//
// "LOD should follow projected screen size, not only world distance." Starting thresholds:
//   LOD0 above normal gameplay focus size; LOD1 for small contacts; LOD2/impostor for distant traffic
//   warrants it. "Use hysteresis or fade where practical." This module implements that selector as a
//   reusable per-entity resolver — it never owns geometry, it only picks a detail level and lets each
//   asset decide what that means (swap mesh, drop decals, hide greebles). Hysteresis prevents the
//   oscillation that plain thresholds cause when a ship hovers on a boundary.
//
// The Kestrel ships LOD0-only for now: the §20 roadmap defers LOD1/LOD2 geometry until camera evidence
// shows population pressure (§12.1: frame time matters more than universal triangle count; §12.4 says
// LOD2 "when population warrants it"). The framework + selector exist and are tested so adding LOD1/2
// later is a geometry task, not an architecture task.
import * as THREE from 'three';

// Spec §12.4 starting thresholds, in projected screen-space pixels of the entity's bounding sphere.
export const LOD_THRESHOLDS = Object.freeze({
  LOD0_ABOVE: 120,   // full detail at normal player/combat camera scale
  LOD1_BELOW: 120,   // small but readable contacts
  LOD2_BELOW: 45,    // distant traffic/impostor scale
});

// Hysteresis band (pixels). Once a level is chosen, the projected width must move this far past a
// threshold before re-evaluating, so a ship holding station on a boundary doesn't flicker between
// levels every frame. Spec §12.4: "Use hysteresis ... where practical."
const HYSTERESIS_PX = 25;

// Dwell (seconds). A level change must hold for this long before it is presented, so a combat
// camera breathing its zoom across a boundary cannot swap a rock's model several times a second.
// Applies only when the caller passes a clock; the first resolve commits at once.
export const LOD_DWELL_S = 1.5;

// Whole-ship separate-file bands, in projected bounding-sphere DIAMETER css px. These are not the
// prop bands above: whole-ship families swap a live GLB, so the numbers are sized against the
// measured top-down distribution — ordinary fighters project ~390-600 px at the default camera
// and ~180-220 px at the manual zoom-out limit (the legacy 96/32 bands sat below every hull and
// demotion could never engage). Demote boundaries sit just above the zoomed-out fighter band so
// a crowd surveyed from afar drops a tier while the default camera never crosses one. LOD1 keeps
// silhouette and materials, so under ~240 px (~27% of a 900 px-high viewport) the sibling swap is
// sub-perceptible; under ~110 px the bare hull is the same speck either way — a size ships only
// reach while riding speed zoom. Promote boundaries must clear the measured px jitter: a surveyed
// crowd swings ~173-345 px under zoom + speed + orbit, and a promote edge inside that envelope
// republishes lod0 on a single spike frame, which kills every in-flight demotion before its paced
// sibling can commit. 400 px keeps jitter in the dead band; a ship parked inside a dead band holds
// its presented tier instead of oscillating.
export const SHIP_LOD_THRESHOLDS = Object.freeze({
  LOD1_BELOW: 240,   // lod0 -> lod1 under this projected diameter
  LOD0_ABOVE: 400,   // lod1/lod2 -> lod0 above it
  LOD2_BELOW: 110,   // -> lod2 under it
  LOD2_ABOVE: 190,   // lod2 -> lod1 above it
});

// Ship-specific dwell: a demotion must hold its new band ~0.5 s before the swap is presented.
// Promotions to lod0 skip it deliberately — a ship coming close gets its detail back at once and
// the controller still only commits after the resident root is ready.
export const SHIP_LOD_DWELL_S = 0.5;

// The band is also at least this fraction of the threshold, so a 45 px boundary gets a real band and
// screen-size noise (a camera breathing its zoom, a hull turning edge-on) cannot cross it.
const HYSTERESIS_RATIO = 0.2;

// Hard cap: an entity presents at most this many level changes per window; past it the level holds.
export const LOD_SWAP_CAP = 2;
export const LOD_SWAP_WINDOW_S = 10;

const lodBand = (threshold) => Math.max(HYSTERESIS_PX, threshold * HYSTERESIS_RATIO);

const _v = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _shipViewPos = new THREE.Vector3();

// Conservative diameter of the drawn sphere in CSS pixels. The near side of the sphere is
// deliberately used for the bound, including off-axis perspective enlargement.
export function projectedShipDiameterPx(pos, radius, camera, viewport) {
  const height = Number(viewport?.height);
  const r = Number(radius);
  if (!pos || !camera?.matrixWorldInverse || !camera?.projectionMatrix || !(height > 0) || !(r > 0)) return Infinity;
  _shipViewPos.set(Number(pos.x), Number(pos.y) || 0, Number(pos.z)).applyMatrix4(camera.matrixWorldInverse);
  const { x, y, z } = _shipViewPos;
  const p = camera.projectionMatrix.elements;
  // Chained tests rather than an array + `.every`: this runs per ordinary LOD ship per frame, and
  // the array (plus the bound-method callback) was the only allocation in the function.
  if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
    && Number.isFinite(p[0]) && Number.isFinite(p[5]))) return Infinity;
  const depth = -z;
  if (depth - r <= Math.max(0, Number(camera.near) || 0)) return Infinity;
  if (camera.isOrthographicCamera) return r * height * Math.max(Math.abs(p[5]), Math.abs(p[0]) * (Number(viewport.width) || height) / height);
  if (!camera.isPerspectiveCamera) return Infinity;
  const aspect = (Number(viewport.width) || height) / height;
  const vertical = Math.abs(p[5]) * (depth + Math.abs(y));
  const horizontal = Math.abs(p[0]) * aspect * (depth + Math.abs(x));
  return r * height * Math.max(vertical, horizontal) / (depth * (depth - r));
}

// The sphere the ship tier selector projects. The bands above are written in on-screen pixels of
// the hull ("under ~240 px the sibling swap is sub-perceptible; under ~110 px the bare hull is the
// same speck"), but the selector used to be fed the ship's cull envelope, or twice its radius,
// whichever was larger. Measured in the Foundry at fight distance (2026-11-22, referee census, the
// drawn meshes' boxes projected through the live camera): a wasp 53 x 27 px on screen was reported
// as 159 px and held its 21-draw, 9,900-triangle body; bastions 208-241 px across were reported as
// 505-571 px. The reading was 2.4 to 3 times the hull, so no band engaged where its own reasoning
// said it should. The selector is now fed the hull: its radius times this overhang. With 1.6 the
// reading is still on the generous side (after: wasps about 50 px long read 106-127 px; the drawn
// box a bastion fills is about 1.6 times its collision diameter). ?rfx=-shipTier restores the old feed.
export const SHIP_LOD_HULL_OVERHANG = 1.6;
export function shipLodSphereRadius(entityRadius, fallbackRadius) {
  const r = Number(entityRadius);
  return r > 0 ? r * SHIP_LOD_HULL_OVERHANG : Number(fallbackRadius) || 0;
}

// Kept on the stable boundary rather than individual sibling roots.
export function createShipLodState(initialLevel = 'lod0') {
  let level = initialLevel === 'lod1' || initialLevel === 'lod2' ? initialLevel : 'lod0';
  let pending = null, since = 0;
  const swaps = [];
  return {
    get level() { return level; },
    resolve(px, nowS, protectedBody = false) {
      if (protectedBody || !Number.isFinite(px)) { level = 'lod0'; pending = null; return level; }
      let next = level;
      if (level === 'lod0') {
        if (px < SHIP_LOD_THRESHOLDS.LOD2_BELOW) next = 'lod2';
        else if (px < SHIP_LOD_THRESHOLDS.LOD1_BELOW) next = 'lod1';
      } else if (level === 'lod1') {
        if (px > SHIP_LOD_THRESHOLDS.LOD0_ABOVE) next = 'lod0';
        else if (px < SHIP_LOD_THRESHOLDS.LOD2_BELOW) next = 'lod2';
      } else { // lod2
        if (px > SHIP_LOD_THRESHOLDS.LOD0_ABOVE) next = 'lod0';
        else if (px > SHIP_LOD_THRESHOLDS.LOD2_ABOVE) next = 'lod1';
      }
      if (next === level) { pending = null; return level; }
      // Close promotions are urgent; distant changes dwell and are rate limited.
      if (next === 'lod0') { level = next; pending = null; return level; }
      if (pending !== next) { pending = next; since = nowS; return level; }
      if (!Number.isFinite(nowS) || nowS - since < SHIP_LOD_DWELL_S) return level;
      while (swaps.length && nowS - swaps[0] >= LOD_SWAP_WINDOW_S) swaps.shift();
      if (swaps.length >= LOD_SWAP_CAP) return level;
      swaps.push(nowS); level = next; pending = null; return level;
    },
  };
}

/**
 * Estimate an entity's projected screen-space width in pixels from its world radius and the camera.
 * Uses the solid-angle approximation: projected pixel width ≈ radius * (viewportHeight / distance) for
 * a top-down-ish chase cam (no per-frame projection of every vertex — cheap, called once per entity).
 *
 * @param {{x:number,z:number}} pos - entity world position (Y=0 plane)
 * @param {number} radius - entity world-space bounding radius
 * @param {THREE.Camera} camera - the active camera (reads position + fov via projection matrix)
 * @param {{width:number,height:number}} viewport
 * @returns {number} projected width in pixels (>=0)
 */
export function projectedWidthPx(pos, radius, camera, viewport) {
  if (!pos || !camera || !camera.position || !viewport || !radius) return 0;
  const px = Number(pos.x);
  const pz = Number(pos.z);
  if (!Number.isFinite(px) || !Number.isFinite(pz)) return 0;
  _camPos.copy(camera.position);
  if (!Number.isFinite(_camPos.x) || !Number.isFinite(_camPos.y) || !Number.isFinite(_camPos.z)) return 0;
  _v.set(px, 0, pz);
  const dist = _camPos.distanceTo(_v);
  if (!Number.isFinite(dist)) return 0;
  if (dist <= 0.0001) return Number(viewport.height) || 0; // inside the object — treat as filling the screen
  // vertical fov from the projection matrix; fall back to a sensible default if unavailable.
  const fovY = camera.fov != null ? THREE.MathUtils.degToRad(camera.fov) : Math.PI / 3;
  const screenHalfH = Math.tan(fovY * 0.5) * dist; // half viewport height at the entity's depth (world units)
  if (!Number.isFinite(screenHalfH) || screenHalfH <= 0) return 0;
  const height = Number(viewport.height);
  if (!Number.isFinite(height) || height <= 0) return 0;
  return Math.max(0, (radius / screenHalfH) * (height * 0.5));
}

/**
 * Create a per-entity LOD state holder. Call resolve() once per frame per entity; it returns the
 * current level ('lod0'|'lod1'|'lod2') with hysteresis applied. Each asset's per-frame hook reads the
 * level and decides what to show/hide — this module owns only the selection, never the geometry.
 *
 * @returns {{ resolve(px:number):'lod0'|'lod1'|'lod2', level:string, lastPx:number }}
 */
export function createLodState() {
  let level = 'lod0';
  let lastPx = Infinity;
  let pendingLevel = null;
  let pendingSince = 0;
  const swaps = [];
  return {
    get level() { return level; },
    get lastPx() { return lastPx; },
    get swapTimes() { return swaps.slice(); },
    resolve(px, nowS) {
      const width = Number(px);
      if (!Number.isFinite(width)) return level;
      const timed = Number.isFinite(nowS) && lastPx !== Infinity;
      const presented = level;
      // Hysteresis: only change level when px moves HYSTERESIS_PX past the current level's boundary.
      if (level === 'lod0') {
        if (width < LOD_THRESHOLDS.LOD0_ABOVE - lodBand(LOD_THRESHOLDS.LOD0_ABOVE)) level = 'lod1';
      } else if (level === 'lod1') {
        if (width > LOD_THRESHOLDS.LOD1_BELOW + lodBand(LOD_THRESHOLDS.LOD1_BELOW)) level = 'lod0';
        else if (width < LOD_THRESHOLDS.LOD2_BELOW - lodBand(LOD_THRESHOLDS.LOD2_BELOW)) level = 'lod2';
      } else { // lod2
        if (width > LOD_THRESHOLDS.LOD2_BELOW + lodBand(LOD_THRESHOLDS.LOD2_BELOW)) level = 'lod1';
      }
      lastPx = width;
      if (!timed || level === presented) {
        pendingLevel = null;
        return level;
      }
      if (pendingLevel !== level) {
        pendingLevel = level;
        pendingSince = nowS;
      }
      if (nowS - pendingSince < LOD_DWELL_S) {
        level = presented;
        return level;
      }
      while (swaps.length > 0 && nowS - swaps[0] >= LOD_SWAP_WINDOW_S) swaps.shift();
      if (swaps.length >= LOD_SWAP_CAP) {
        level = presented;
        return level;
      }
      swaps.push(nowS);
      pendingLevel = null;
      return level;
    },
    // Seed continuity when a swap rebinding hands the boundary a different root's resolver:
    // the incoming level is already presented, so the new resolver must remember it (and the
    // latest px) instead of waking at lod0. Without this a ship parked inside the hysteresis
    // band reads a different level off each root's resolver and swaps the family every frame.
    // The swap history moves with it: each family root owns its own resolver, so a cap kept per
    // resolver restarted empty on every swap and an entity flipped lod1<->lod2 4x in 10 s.
    adopt(nextLevel, px, prior = null) {
      if (nextLevel === 'lod0' || nextLevel === 'lod1' || nextLevel === 'lod2') level = nextLevel;
      if (Number.isFinite(px)) lastPx = px;
      pendingLevel = null;
      if (prior && Array.isArray(prior.swapTimes)) swaps.splice(0, swaps.length, ...prior.swapTimes);
    },
  };
}

// Attach a per-entity LOD state to a mesh, keyed so the renderer can find it. Idempotent.
export function attachLodState(mesh) {
  if (!mesh) return mesh;
  if (!mesh.userData) mesh.userData = {};
  if (!mesh.userData.lod) mesh.userData.lod = createLodState();
  return mesh;
}

// The chase camera looks at a table: a ship on the glass keeps its authored
// body. Projected-size demotion changes that body during camera breathing and
// steering, paying visibility/surface/shadow work for a worse picture. Keep the
// generic selector for props whose detail actually supports a smaller footprint.
const PRESENTED_BODY_TYPES = new Set(['ship', 'drone', 'freighter', 'reaver', 'fauna']);
export function resolvePresentedLodLevel(lod, px, nowS, isPlayer = false, type = '') {
  return isPlayer || PRESENTED_BODY_TYPES.has(type) ? 'lod0' : lod.resolve(px, nowS);
}

/** Size is useful only to a mounted, size-selectable LOD owner. Pinned bodies
 *  retain full detail without doing a camera projection for every visible row. */
export function presentedLodWidthPx(userData, pos, radius, camera, viewport, isPlayer = false, type = '') {
  if (!userData?.lod || !userData.updateLod || isPlayer || PRESENTED_BODY_TYPES.has(type)) return 0;
  return projectedWidthPx(pos, radius, camera, viewport);
}
