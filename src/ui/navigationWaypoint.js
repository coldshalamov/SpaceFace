// Read-only presentation resolution for navigation waypoints.
//
// `targetEntityId` is gameplay-facing: autopilot, Massline targeting, save normalization, and other
// control owners may consume it. `presentationEntityId` is deliberately narrower. It lets HUD/map
// surfaces follow a moving physical objective without quietly turning that objective into a flight
// or tether assist. The authored waypoint position remains the fail-closed fallback if the entity is
// absent during admission, destruction, or a save/load boundary.

export function resolveWaypointPresentationPosition(state, waypoint) {
  if (!waypoint) return null;
  const presentationId = waypoint.presentationEntityId;
  if (presentationId != null) {
    const entity = state?.entities?.get?.(presentationId);
    const pos = entity && entity.alive !== false ? entity.pos : null;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) return pos;
  }
  const fallback = waypoint.pos;
  return fallback && Number.isFinite(fallback.x) && Number.isFinite(fallback.z) ? fallback : null;
}

/**
 * The live entity a freshly authored course aimed at, or null. The course owner (`world._onSetCourse`)
 * binds this as the waypoint's `presentationEntityId` so every surface that resolves through
 * `resolveWaypointPresentationPosition` — HUD arrow, radar, both maps, threat halo — points at the
 * SAME live position the autopilot chases via `targetEntityId` (flight re-resolves the entity every
 * tick). Without the bind, a course set on a moving contact flies flight to the hull while every
 * instrument stays parked at the click-time fix. Fail-closed: a dead, despawned, or position-less
 * target binds nothing and the authored pos remains the waypoint's place.
 */
export function presentationEntityIdForCourseTarget(entities, targetEntityId) {
  if (targetEntityId == null || !entities || typeof entities.get !== 'function') return null;
  let entity = entities.get(targetEntityId);
  if (!entity && typeof targetEntityId === 'string') {
    const numeric = Number(targetEntityId);
    if (Number.isFinite(numeric)) entity = entities.get(numeric);
  }
  if (!entity || entity.alive === false || !entity.pos) return null;
  return Number.isFinite(entity.pos.x) && Number.isFinite(entity.pos.z) ? entity.id : null;
}
