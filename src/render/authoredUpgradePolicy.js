// Authored-upgrade admission concurrency.
//
// Steady-state flight stays serial (1) so a combat stall cannot overlap two full GLB compose
// jobs. The opening/loading window and a short post-first-playable settle may overlap two
// CPU admissions so Helios/hub decode finishes before the player is looking at a live frame.

import { CAMERA_DIRECTOR_COMBAT_MAX_ZOOM } from './cameraDirector.js';

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
// the staging sector the arena was carved from. Stations, rocks, place dressing and fx that sit
// beyond the fight-fit envelope cannot appear on the arena's glass, so admitting them through the
// same serial lane starves the combatants that gate the fight (and the dead hulk exemplars that
// gate the wrecks). Those jobs are refused at enqueue — the ordinary approach trigger re-requests
// any body the player actually closes on, and anything still pending re-requests once the run ends.
const SURVIVAL_DEFERRED_DRESSING_TYPES = new Set(['station', 'asteroid', 'fx', 'place']);

export function survivalDefersArenaDressingJob(entity, liveState) {
  const run = liveState && liveState.run;
  if (!run || run.kind !== 'survival' || !run.phase || run.phase === 'inactive') return false;
  if (!entity || entity.alive === false || entity.isPlayer === true) return false;
  if (!SURVIVAL_DEFERRED_DRESSING_TYPES.has(entity.type)) return false;
  const distance = planarRangeWU(entity, livePlayerEntity(liveState));
  return distance !== null && distance > CAMERA_DIRECTOR_COMBAT_MAX_ZOOM;
}
