// PR95 Plan 19 — authored anomaly sites.
//
// This first slice is intentionally one record, not a generic anomaly framework. The Orcus
// Gravity Eddy borrows its position from the canonical Atlas zone at runtime; only its stable
// identity and field tuning live here. If that zone is removed or renamed, anomalyRuntime refuses
// to register the physics field rather than silently falling back to an invented coordinate.

export const ORCUS_GRAVITY_EDDY = Object.freeze({
  id: 'anomaly_orcus_gravity_eddy',
  name: 'Orcus Gravity Eddy',
  sectorId: 'sector_orcus_shadow',
  zoneId: 'zone_orcus_shadow',
  poiId: 'poi_orcus_anomaly',
  field: Object.freeze({
    id: 'environment_orcus_gravity_eddy',
    kind: 'well',
    radius: 420,
    strength: 68,
    damping: 0,
    falloff: 1.3,
    maxAffected: 20,
  }),
});

/** The exact authored anomaly for a sector, or null when that sector has none. */
export function anomalySiteForSector(sectorId) {
  return sectorId === ORCUS_GRAVITY_EDDY.sectorId ? ORCUS_GRAVITY_EDDY : null;
}
