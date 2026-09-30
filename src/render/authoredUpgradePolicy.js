// Authored-upgrade admission concurrency.
//
// Steady-state flight stays serial (1) so a combat stall cannot overlap two full GLB compose
// jobs. The opening/loading window and a short post-first-playable settle may overlap two
// CPU admissions so Helios/hub decode finishes before the player is looking at a live frame.

import { CAMERA_DIRECTOR_COMBAT_MAX_ZOOM } from './cameraDirector.js';
import {
  TABLE_BAND,
  TABLE_FRAME_SKIRT_WU,
  classifyTableBand,
  glassHalfExtents,
  tableLookAtDelta,
  tablePrefetchZoomFromState,
} from './tabletopPolicy.js';
import { entityPresenceRadius } from '../world/activityClassification.js';
import { ledgerAwarePos } from '../world/presentationSources.js';

export const AUTHORED_UPGRADE_STEADY_LIMIT = 1;
export const AUTHORED_UPGRADE_OPENING_LIMIT = 2;
export const AUTHORED_UPGRADE_SETTLE_MS = 0;

export function authoredUpgradeConcurrencyLimit(runtime = {}) {
  if (runtime.mode === 'loading') return AUTHORED_UPGRADE_OPENING_LIMIT;
  if (runtime.opening === true || runtime.deferNoncriticalMeshStreaming === true) {
    return AUTHORED_UPGRADE_OPENING_LIMIT;
  }
  return AUTHORED_UPGRADE_STEADY_LIMIT;
}

// Arrival is a distance problem, not a population problem.
//
// An arriving sector used to publish as one certified set: every staged body composed serially at
// roughly a second and a half each on a weak integrated GPU, and nothing appeared until the last
// rock in the sector was done — a minute and a half of empty space with the jump ring already two
// hundred units off the bow. Two rules fix the near picture without weakening the set contract:
// staged arrival bodies admit nearest-first, and a body inside the arrival band is revealed the
// moment its own preparation is ready. Everything past the band keeps the certified-set
// publication exactly as it was.
//
// Both rules read the player's position at the moment they are applied, never at the moment the
// body was staged: the destination is prewarmed while the player is still in the sector they are
// leaving, so a distance captured at staging time is the width of the jump.

/** Camera reach at the shipping chase camera plus the arrival runway. */
export const SECTOR_ARRIVAL_NEAR_PUBLISH_WU = 340;
const SECTOR_ARRIVAL_PRIORITY_FLOOR = 2;
const SECTOR_ARRIVAL_PRIORITY_SPAN = 8;
const SECTOR_ARRIVAL_PRIORITY_FAR_WU = 4096;

/** Planar range between two bodies, or null when either pose is unreadable. */
export function planarRangeWU(a, b) {
  const from = a && a.pos;
  const to = b && b.pos;
  if (!from || !to) return null;
  const dx = Number(from.x) - Number(to.x);
  const dz = Number(from.z) - Number(to.z);
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return null;
  return Math.hypot(dx, dz);
}

/**
 * Distance-graded admission priority for one staged arrival body, or null when the distance is
 * unknown. Lower admits earlier.
 *
 * The floor sits just under the locked-target rung, so the body on the player's bow outranks the
 * ordinary faction-ship and on-screen rungs while the player's own hull, the starting hub and a
 * held target lock still come first. Measured: with the floor at the on-screen rung instead, a
 * handful of faction ships elsewhere in the arriving sector kept taking the serial lane and the
 * jump ring two hundred units off the bow still waited a minute and a half.
 */
export function sectorArrivalPriorityHint(distanceWU) {
  if (typeof distanceWU !== 'number' || !Number.isFinite(distanceWU) || distanceWU < 0) return null;
  const graded = Math.min(1, distanceWU / SECTOR_ARRIVAL_PRIORITY_FAR_WU);
  return SECTOR_ARRIVAL_PRIORITY_FLOOR + graded * SECTOR_ARRIVAL_PRIORITY_SPAN;
}

/** True when this body is close enough to the player right now to be worth revealing on its own. */
export function isInsideSectorArrivalBand(distanceWU) {
  return typeof distanceWU === 'number'
    && Number.isFinite(distanceWU)
    && distanceWU >= 0
    && distanceWU <= SECTOR_ARRIVAL_NEAR_PUBLISH_WU;
}

// The opening frame outranks the queue (ZERO_TO_HERO 7.3 - the belt tail).
//
// After the results-to-belt bridge the ~8 bodies the opening frame showed still compiled at
// 10-20 s on a busy host: the flight-only rungs never applied while the sector was loading, so
// the arrival distance grade was the only ordering left and ~50 jobs of staged station furniture
// graded nearer than the visible set. Admission follows the law of the glass (ZERO_TO_HERO 5.12):
// a body the composed frame shows admits before any body it does not - in the load window too.
// Re-graded on every pick, exactly like the combatant rung: a body the camera settles on
// promotes itself while it waits.
export const OPENING_FRAME_ADMISSION_PRIORITY = 1.75;

const _openingFrameDelta = { x: 0, z: 0 };

/**
 * Opening-frame rung for one body, or null when the composed frame cannot be proven to show it.
 * Fails closed: with no composed camera (no live/composed zoom, no look-at anchor) the ordinary
 * rungs and the arrival distance grades apply exactly as before. The band is the strict glass
 * rectangle of the frame being opened — live picture or the zoom it is opening toward, never the
 * player's requested wheel — and the body's own radius counts, so an edge-crossing hull promotes
 * while provably-off-glass dressing keeps waiting its turn. The returned rung is the signature
 * in the upgrade queue's diagnostics: a busy-host pass confirms the law fired in the wild by
 * reading `priority === 1.75` off the admission dump.
 */
export function openingFrameAdmissionPriority(entity, liveState) {
  if (!entity || entity.alive === false || !liveState) return null;
  // Dormant ledger rows freeze pos at shelf — the verdict must read the ballistic/itinerary
  // projection the renderer's own glass test uses, or an inbound row misclassifies.
  const pos = ledgerAwarePos(entity, liveState) || entity.pos;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  const camera = liveState.camera || {};
  const live = Number(camera.liveZoom);
  const composed = Number(camera.composedZoom);
  const zoom = Number.isFinite(live) || Number.isFinite(composed)
    ? Math.max(Number.isFinite(live) ? live : 0, Number.isFinite(composed) ? composed : 0)
    : null;
  if (zoom === null || !(zoom > 0)) return null;
  const player = livePlayerEntity(liveState);
  const playerPos = player && player.pos;
  const hasPlayer = !!(playerPos && Number.isFinite(playerPos.x) && Number.isFinite(playerPos.z));
  const focus = camera.focus || {};
  // tableLookAtOrigin reads the focus only when BOTH axes are finite; a half-written
  // focus must not count as an anchor or the glass silently re-centers on the world
  // origin and fails open exactly where this function promises fail-closed.
  const hasFocus = Number.isFinite(focus.x) && Number.isFinite(focus.z);
  if (!hasFocus && !hasPlayer) return null;
  const video = liveState.settings && liveState.settings.video || {};
  const fov = Number.isFinite(camera.fov) ? camera.fov
    : Number.isFinite(video.fov) ? video.fov : 50;
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  const glass = glassHalfExtents(zoom, fov, aspect, tilt);
  const delta = tableLookAtDelta(
    liveState,
    hasPlayer ? playerPos : null,
    pos,
    _openingFrameDelta,
  );
  const band = classifyTableBand({
    dx: delta.x,
    dz: delta.z,
    radius: entityPresenceRadius(entity),
    glassHalfX: glass.halfX,
    glassHalfZ: glass.halfZ,
    runwayWu: 0,
  });
  return band === TABLE_BAND.GLASS ? OPENING_FRAME_ADMISSION_PRIORITY : null;
}

// The fight outranks the furniture.
//
// A hostile ship inside the camera's active-attacker fit range is part of the picture the player
// is acting on right now: its authored body must reach the serial admission lane before station
// props, rocks, place dressing and fx — and before a critical-hub job that is merely queued.
// The rung sits between the player's own hull (0) and the critical starting hub (1): the hub
// stays the gate of last resort for a fresh sector but cannot starve a ship that is already
// shooting at the player. Ordering only — a job already in flight is never pre-empted.
//
// The range is the camera director's combat-fit envelope, not a new gameplay constant: it is the
// same reach the composition uses to keep every active attacker on the glass.
export const COMBATANT_ADMISSION_PRIORITY = 0.5;

function livePlayerEntity(liveState) {
  const entities = liveState && liveState.entities;
  if (!entities || typeof entities.get !== 'function') return null;
  return entities.get(liveState.playerId) || null;
}

/**
 * Combatant rung for one admission job, or null when the job is ordinary dressing.
 * Reads the live player at the moment it is applied, never at enqueue time.
 */
export function combatantAdmissionPriority(entity, liveState) {
  if (!entity || entity.type !== 'ship' || entity.alive === false || entity.isPlayer === true) {
    return null;
  }
  const player = livePlayerEntity(liveState);
  if (!player) return null;
  // isHostileToPlayer's coarse shape, cheap enough for a per-sort call: allied (0), same-team and
  // law (2) never take the combatant rung; every other faction inside the envelope does.
  if (entity.team == null || entity.team === player.team || entity.team === 0 || entity.team === 2) {
    return null;
  }
  const distance = planarRangeWU(entity, player);
  if (distance === null || distance > CAMERA_DIRECTOR_COMBAT_MAX_ZOOM) return null;
  return COMBATANT_ADMISSION_PRIORITY;
}

// A live survival run is one small room with a known fight roster, but the renderer still mounts
// the staging sector the arena was carved from. Stations, rocks, place dressing and fx that the
// composed frame cannot show still queue through the same serial lane and starve the combatants
// that gate the fight (and the dead hulk exemplars that gate the wrecks). The defer criterion is
// the renderer's own on-glass classifier: the live look-at table plus the frame skirt and the
// body's radius. A body in the glass or runway band can be on the picture — it queues; only a
// body provably beyond the band is refused at enqueue. The ordinary approach trigger re-requests
// anything the frame ever reaches, and anything still pending re-requests once the run ends.
const SURVIVAL_DEFERRED_DRESSING_TYPES = new Set(['station', 'asteroid', 'fx', 'place']);
const _arenaDressingDelta = { x: 0, z: 0 };

export function survivalDefersArenaDressingJob(entity, liveState) {
  const run = liveState && liveState.run;
  if (!run || run.kind !== 'survival' || !run.phase || run.phase === 'inactive') return false;
  if (!entity || entity.alive === false || entity.isPlayer === true) return false;
  if (!SURVIVAL_DEFERRED_DRESSING_TYPES.has(entity.type)) return false;
  const pos = ledgerAwarePos(entity, liveState) || entity.pos;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
  // Until the camera has composed a single frame nothing is provably off the glass — early cook
  // sweeps admit normally and the combatant rung keeps that work behind the fight.
  const camera = liveState.camera || {};
  if (!Number.isFinite(camera.liveZoom) && !Number.isFinite(camera.composedZoom)) return false;
  const player = livePlayerEntity(liveState);
  const focus = camera.focus || {};
  if ((!Number.isFinite(focus.x) || !Number.isFinite(focus.z))
      && !(player && player.pos && Number.isFinite(player.pos.x) && Number.isFinite(player.pos.z))) {
    return false;
  }
  const zoom = tablePrefetchZoomFromState(liveState);
  const video = liveState.settings && liveState.settings.video || {};
  const fov = Number.isFinite(camera.fov) ? camera.fov : (Number.isFinite(video.fov) ? video.fov : 50);
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  const glass = glassHalfExtents(zoom, fov, aspect, tilt);
  const delta = tableLookAtDelta(liveState, player && player.pos, pos, _arenaDressingDelta);
  const band = classifyTableBand({
    dx: delta.x,
    dz: delta.z,
    radius: entityPresenceRadius(entity),
    glassHalfX: glass.halfX,
    glassHalfZ: glass.halfZ,
    runwayWu: TABLE_FRAME_SKIRT_WU,
  });
  return band === TABLE_BAND.BEYOND;
}
