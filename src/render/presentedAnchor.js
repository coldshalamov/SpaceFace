// Present an entity's anchor at the moment the drawn hull shows, not at the live sim tick.
//
// The renderer draws every hull from the snapshot fence's PRESENTED bracket (E1 playout:
// newest − adaptive delay, 33–100 ms). Any presentation that anchors to the RAW entity.pos
// instead — tether cable endpoints, trail nozzles without an authored socket, mining beams,
// status VFX — sits ahead of the hull by that entire reserve, so the cable visibly detaches
// and the VFX hits a target the hull has not reached yet. The fence's presentedPose is the
// ONE pose service for both the mesh and its anchors.
//
// Fallback (no fence, or the entity is not in the presented pack): blend the entity's
// prevPos→pos span with the render alpha. That was the pre-playout contract and is still the
// correct answer when there is no presented sample to read.

import { getLatestSnapshotFence } from './snapshotFence.js';

// Same continuity cap as camera.js's resolvePlayerAnchorLocal fallback.
const MAX_CONTINUITY_SPAN_WU = 400;

// Reused scratch for the fence read (one anchor at a time; never retained).
const _fencePoseScratch = { x: 0, y: 0, z: 0, rot: 0, valid: false };

function fencePresentedPose(entity) {
  if (!entity || !Number.isSafeInteger(entity.id)) return null;
  const fence = getLatestSnapshotFence();
  if (!fence || typeof fence.presentedPose !== 'function') return null;
  const pose = fence.presentedPose(entity.id, _fencePoseScratch);
  return pose && pose.valid === true ? pose : null;
}

/**
 * The entity's anchor at the drawn moment. Reads the fence's presented pose (position + the
 * same heading the hull uses); falls back to the newest-tick prevPos→pos blend only when no
 * presented sample exists. out must be caller-owned ({x, z}); it is always written so a call
 * can never read a stale scratch.
 */
export function presentedAnchorXZ(entity, alpha, out) {
  const presented = fencePresentedPose(entity);
  if (presented) {
    out.x = presented.x;
    out.z = presented.z;
    return out;
  }
  const pos = entity && entity.pos;
  const x = Number.isFinite(pos && pos.x) ? pos.x : 0;
  const z = Number.isFinite(pos && pos.z) ? pos.z : 0;
  out.x = x;
  out.z = z;
  if (!Number.isFinite(alpha) || alpha >= 1) return out;
  const prev = entity && entity.prevPos;
  if (!prev || !Number.isFinite(prev.x) || !Number.isFinite(prev.z)) return out;
  const dx = x - prev.x;
  const dz = z - prev.z;
  if (dx * dx + dz * dz > MAX_CONTINUITY_SPAN_WU * MAX_CONTINUITY_SPAN_WU) return out;
  out.x = prev.x + dx * alpha;
  out.z = prev.z + dz * alpha;
  return out;
}

/**
 * The entity's heading at the drawn moment. The fence's presented heading is the one the
 * hull actually drew; the prevRot→rot shortest-path blend is the no-fence fallback.
 */
export function presentedAnchorRot(entity, alpha) {
  const presented = fencePresentedPose(entity);
  if (presented) return presented.rot;
  const rot = entity && Number.isFinite(entity.rot) ? entity.rot : 0;
  if (!Number.isFinite(alpha) || alpha >= 1) return rot;
  const prevRot = entity && Number.isFinite(entity.prevRot) ? entity.prevRot : rot;
  const rawDelta = rot - prevRot;
  // A spawn-frame sentinel or a respawned identity is a discontinuity, not a spin: no physical
  // per-tick rotation approaches this magnitude, and wrapping it would blend through garbage.
  if (!Number.isFinite(rawDelta) || Math.abs(rawDelta) > 100) return rot;
  let delta = rawDelta;
  if (delta > Math.PI) delta -= Math.PI * 2;
  else if (delta < -Math.PI) delta += Math.PI * 2;
  return prevRot + delta * alpha;
}
