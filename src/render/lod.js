// Projected-screen-size LOD selector with hysteresis (spec §12.4).
//
// "LOD should follow projected screen size, not only world distance." Starting thresholds:
//   LOD0 above ~300px projected width; LOD1 ~100–300px; LOD2/impostor below ~100px when population
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
  LOD0_ABOVE: 300,   // full detail
  LOD1_BELOW: 300,   // ~100–300px
  LOD2_BELOW: 100,   // <100px (impostor/very-low, when population warrants)
});

// Hysteresis band (pixels). Once a level is chosen, the projected width must move this far past a
// threshold before re-evaluating, so a ship holding station on a boundary doesn't flicker between
// levels every frame. Spec §12.4: "Use hysteresis ... where practical."
const HYSTERESIS_PX = 25;

const _v = new THREE.Vector3();
const _camPos = new THREE.Vector3();

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
  if (!camera || !viewport || !radius) return 0;
  _camPos.copy(camera.position);
  _v.set(pos.x, 0, pos.z);
  const dist = _camPos.distanceTo(_v);
  if (dist <= 0.0001) return viewport.height; // inside the object — treat as filling the screen
  // vertical fov from the projection matrix; fall back to a sensible default if unavailable.
  const fovY = camera.fov != null ? THREE.MathUtils.degToRad(camera.fov) : Math.PI / 3;
  const screenHalfH = Math.tan(fovY * 0.5) * dist; // half viewport height at the entity's depth (world units)
  if (screenHalfH <= 0) return 0;
  return Math.max(0, (radius / screenHalfH) * (viewport.height * 0.5));
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
  return {
    get level() { return level; },
    get lastPx() { return lastPx; },
    resolve(px) {
      // Hysteresis: only change level when px moves HYSTERESIS_PX past the current level's boundary.
      if (level === 'lod0') {
        if (px < LOD_THRESHOLDS.LOD0_ABOVE - HYSTERESIS_PX) level = 'lod1';
      } else if (level === 'lod1') {
        if (px > LOD_THRESHOLDS.LOD1_BELOW + HYSTERESIS_PX) level = 'lod0';
        else if (px < LOD_THRESHOLDS.LOD2_BELOW - HYSTERESIS_PX) level = 'lod2';
      } else { // lod2
        if (px > LOD_THRESHOLDS.LOD2_BELOW + HYSTERESIS_PX) level = 'lod1';
      }
      lastPx = px;
      return level;
    },
  };
}

// Attach a per-entity LOD state to a mesh, keyed so the renderer can find it. Idempotent.
export function attachLodState(mesh) {
  if (!mesh.userData.lod) mesh.userData.lod = createLodState();
  return mesh;
}
