// Present an entity's anchor at the moment the drawn hull shows, not at the live sim tick.
//
// The renderer draws every hull from the snapshot fence at rendered time = latest.simTime +
// accumulator − fixedDt: exactly one tick behind the newest completed simulation state, swept
// across the prev→curr span by the render alpha (accumulator/fixedDt). Any presentation that
// anchors to the RAW entity.pos instead — tether cable endpoints, trail nozzles without an
// authored socket — sits up to one full tick of travel ahead of the hull it belongs to, and
// because alpha sweeps 0→1 every tick that offset is a sawtooth: the anchor visibly detaches,
// stabs through the hull, and snaps back, 60 times a second at speed. Blending prevPos→pos with
// the same render alpha lands on the same rendered moment as the fence (the two formulas are
// identical when the pack span is one tick), so the anchor stays welded to the hull it draws.
//
// Entities without a continuous prev→curr span — freshly spawned, teleported, or static rocks
// whose prevPos is never snapshotted — present at the live sim pose via the guards below. That is
// the same continuity contract the chase-camera fallback uses (400 WU cap, alpha < 1).

// Same continuity cap as camera.js's resolvePlayerAnchorLocal fallback.
const MAX_CONTINUITY_SPAN_WU = 400;

/**
 * Blend the entity's prevPos→pos span with the render alpha so the anchor lands on the moment the
 * hull was drawn. out must be caller-owned ({x, z}); it is always written (falling back to the
 * live pos) so a call can never read a stale scratch.
 */
export function presentedAnchorXZ(entity, alpha, out) {
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
 * The entity's heading at the drawn moment, shortest-path blended across the prevRot→rot tick
 * span. Falls back to the live rot without a continuous span (sentinel prevRot, sub-frame spawn).
 */
export function presentedAnchorRot(entity, alpha) {
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
