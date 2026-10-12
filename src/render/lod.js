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

// The band is also at least this fraction of the threshold, so a 45 px boundary gets a real band and
// screen-size noise (a camera breathing its zoom, a hull turning edge-on) cannot cross it.
const HYSTERESIS_RATIO = 0.2;

// Hard cap: an entity presents at most this many level changes per window; past it the level holds.
export const LOD_SWAP_CAP = 2;
export const LOD_SWAP_WINDOW_S = 10;

// The harness key is uuid + model id + presented LOD + authoredAssetState. Admission walks
// (awaiting → loading → compiling → authored) are not separate pictures: the stand-in is the
// same mesh. Those intermediate labels must not each count as a swap the player can see.
// One real publish (the authored commit, or a LOD the selector actually presents) spends one
// slot. Past the cap the last picture stays up for the rest of the window.
export const PRESENTED_KEY_CAP = 2;
export const PRESENTED_KEY_WINDOW_S = 10;
const PRESENTED_PENDING_STATES = new Set([
  'loading',
  'awaiting-authored-admission',
  'compiling-pipelines',
]);

/**
 * The admission machine's state. While a body is on screen, intermediate labels are parked
 * here and the published `authoredAssetState` stays on the picture the player is already seeing.
 * Readers that decide whether to kick or keep a job must use this, not the frozen label.
 */
export function machineAuthoredAssetState(userData) {
  if (!userData) return undefined;
  if (typeof userData._admissionAssetState === 'string') return userData._admissionAssetState;
  return userData.authoredAssetState;
}

/**
 * A pre-job refusal returned the boundary to the stand-in. The published picture
 * may already be frozen on an earlier pending label while the machine still says
 * `loading`. Put both back on `awaiting-authored-admission` so the kick can run
 * again, without opening a new harness-key slot.
 */
export function notePresentedAdmissionRefused(userData) {
  if (!userData) return;
  const machine = typeof userData._admissionAssetState === 'string'
    ? userData._admissionAssetState
    : userData.authoredAssetState;
  if (machine !== 'loading' && userData.authoredAssetState !== 'loading') return;
  const next = 'awaiting-authored-admission';
  if (userData.authoredAssetState === 'loading') userData.authoredAssetState = next;
  if (typeof userData._admissionAssetState === 'string') userData._admissionAssetState = next;
  const parked = userData._presentedKey;
  if (!parked) return;
  if (parked.state === 'loading') parked.state = next;
  if (parked.machineState === 'loading') parked.machineState = next;
}

function presentedModelId(userData) {
  if (!userData) return '';
  if (typeof userData.authoredCompositionId === 'string' && userData.authoredCompositionId) {
    return userData.authoredCompositionId;
  }
  if (typeof userData.assetId === 'string' && userData.assetId) return userData.assetId;
  return '';
}

function writePresentedModel(userData, model) {
  if (!userData) return;
  if (typeof userData.authoredCompositionId === 'string') {
    userData.authoredCompositionId = model || '';
    return;
  }
  if (typeof userData.assetId === 'string') userData.assetId = model || '';
}

/**
 * Cap on-screen harness-key changes at PRESENTED_KEY_CAP per PRESENTED_KEY_WINDOW_S.
 * The first call adopts the current picture and does not count. Pending admission labels
 * collapse onto that picture (the machine state is parked on `_admissionAssetState`).
 * A real change — authored commit, model id, or presented LOD — spends one slot.
 * Past the cap the previous picture is written back onto the boundary.
 *
 * `onGlass` false publishes the parked machine state and drops the window. The visible
 * sweep passes true; off-screen bodies are not graded, so they are left alone by the caller.
 *
 * @returns {string} the state string left on `userData.authoredAssetState`
 */
export function holdPresentedHarnessKey(userData, nowS, onGlass) {
  if (!userData) return '';
  const liveState = typeof userData.authoredAssetState === 'string' ? userData.authoredAssetState : '';
  const liveModel = presentedModelId(userData);
  const liveLod = userData._appliedLodLevel || (userData.lod && userData.lod.level) || '';
  if (onGlass !== true) {
    const parked = userData._presentedKey;
    if (parked && typeof parked.machineState === 'string' && userData.authoredAssetState === parked.state) {
      userData.authoredAssetState = parked.machineState;
    }
    userData._presentedKey = null;
    if (typeof userData._admissionAssetState === 'string') delete userData._admissionAssetState;
    return typeof userData.authoredAssetState === 'string' ? userData.authoredAssetState : '';
  }
  let hold = userData._presentedKey;
  if (!hold) {
    userData._presentedKey = {
      state: liveState,
      model: liveModel,
      lod: liveLod,
      machineState: liveState,
      machineModel: liveModel,
      machineLod: liveLod,
      swaps: [],
    };
    userData._admissionAssetState = liveState;
    return liveState;
  }
  const stateWritten = liveState !== hold.state;
  const modelWritten = liveModel !== hold.model;
  const lodWritten = liveLod !== hold.lod;
  hold.machineState = stateWritten ? liveState : hold.machineState;
  hold.machineModel = modelWritten ? liveModel : hold.machineModel;
  hold.machineLod = lodWritten ? liveLod : hold.machineLod;
  userData._admissionAssetState = hold.machineState;
  if (!stateWritten && !modelWritten && !lodWritten) return hold.state;

  const pendingCollapse = PRESENTED_PENDING_STATES.has(hold.machineState)
    && (hold.state === '' || PRESENTED_PENDING_STATES.has(hold.state))
    && !modelWritten
    && !lodWritten;
  if (pendingCollapse) {
    userData.authoredAssetState = hold.state;
    return hold.state;
  }

  const now = Number(nowS);
  const t = Number.isFinite(now) ? now : 0;
  const swaps = hold.swaps;
  while (swaps.length > 0 && t - swaps[0] >= PRESENTED_KEY_WINDOW_S) swaps.shift();
  if (swaps.length >= PRESENTED_KEY_CAP) {
    userData.authoredAssetState = hold.state;
    writePresentedModel(userData, hold.model);
    if (hold.lod) userData._appliedLodLevel = hold.lod;
    return hold.state;
  }
  swaps.push(t);
  const publishState = (PRESENTED_PENDING_STATES.has(hold.machineState) && PRESENTED_PENDING_STATES.has(hold.state))
    ? hold.state
    : hold.machineState;
  hold.state = publishState;
  hold.model = hold.machineModel;
  hold.lod = hold.machineLod;
  userData.authoredAssetState = publishState;
  writePresentedModel(userData, hold.model);
  if (hold.lod) userData._appliedLodLevel = hold.lod;
  return publishState;
}

const lodBand = (threshold) => Math.max(HYSTERESIS_PX, threshold * HYSTERESIS_RATIO);

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
