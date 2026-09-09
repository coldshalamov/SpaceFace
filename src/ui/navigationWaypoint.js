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
