// Depth Program C2 — one bounded gameplay contract shared by scanner presentation and the
// encounter director. This is pure data/math: scanner owns scan history, the director owns patrols.

export const RESONANCE_OBELISK = Object.freeze({
  sectorId: 'sector_veil_nebula',
  zoneId: 'zone_veil_anomaly',
  poiId: 'poi_anomaly',
  signalId: 'signal:poi:poi_anomaly',
  patrolShapeId: 'resonance_obelisk_patrol',
});

export function resonanceObeliskResponse(scanCount) {
  const scans = Math.max(1, Math.floor(Number(scanCount) || 1));
  const responseTier = Math.min(7, scans);
  return Object.freeze({
    scanCount: scans,
    responseTier,
    pulseIntervalS: Number(Math.max(2.7, 9 - responseTier * 0.9).toFixed(1)),
    patrolIntervalS: Math.max(45, 150 - responseTier * 18),
  });
}

export function isResonanceObeliskSignal(sectorId, sourceId) {
  return sectorId === RESONANCE_OBELISK.sectorId && sourceId === RESONANCE_OBELISK.poiId;
}
