// Authored power responsiveness is separate from collision mass.
export const PHYSICAL_REFERENCE_MASS = 16;
// The pilot feels a small, visible nudge without losing control. Overlapping sources share
// a rolling half-second budget so a swarm cannot chain the controls into knockback.
export const PLAYER_EXTERNAL_RESPONSE = Object.freeze({ scale: 0.1, impulseBudget: 5, windowTicks: 30, maxAcceleration: 8 });

export function isPhysicalMissionBody(body) {
  return body?.type === 'fx' && body.physicsBody !== false && body.collides !== false
    && !!(body.data?.mercyService || body.data?.wreckCourt);
}

export function isEnvironmentalBody(body) {
  return isPhysicalMissionBody(body) || !!body && !['ship', 'drone', 'projectile', 'station', 'gate', 'planet', 'structure', 'fx'].includes(body.type);
}

export function environmentResponse(body) {
  const radius = Number(body && body.radius);
  return Math.max(0.55, Math.min(1.25, 16 / (Number.isFinite(radius) && radius > 0 ? radius : 16)));
}

export function isAnchoredPhysicalBody(body) {
  if (!body || body.type === 'planet' || body.physicsBody === false) return false;
  const data = body.data || {};
  return body.type === 'station' || body.type === 'gate' || data.isGate || data.isLandmark
    || data.isLandmarkRock || data.landmark || data.archetype === 'landmark';
}

// Stable save identity for the anchored recoil ledger — entity ids are per-session, so
// stations key on the catalog id, gates on the link they serve, landmarks on their record.
export function anchoredRecoilKey(body) {
  if (!isAnchoredPhysicalBody(body)) return null;
  const data = body.data || {};
  const home = body.homeSectorId ?? data.homeSectorId ?? data.sectorId ?? null;
  if (data.isGate || body.type === 'gate') {
    return data.gateTo != null && home != null ? `gate:${home}:${data.gateTo}` : null;
  }
  if (data.stationId != null) return `station:${data.stationId}`;
  const mark = data.landmarkId ?? data.poiId ?? data.stationId ?? body.id;
  return home != null && mark != null ? `landmark:${home}:${mark}` : null;
}
