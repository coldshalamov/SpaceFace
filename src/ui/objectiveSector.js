// A waypoint's global coordinates are not a local flight fix in another sector.
export function objectiveIsOffSector(state, waypoint) {
  const current = state && state.world && state.world.currentSectorId;
  return !!(current && waypoint && waypoint.sectorId && waypoint.sectorId !== current);
}
