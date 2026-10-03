// Chart marks for wrecks the player actually saw, and for a courier that went missing.

const DAY_S = 600;

export function wreckEcologyMarkers(state, sectorId) {
  const bag = state && state.worldNews;
  const rows = bag && Array.isArray(bag.markers) ? bag.markers : [];
  const now = state && Number(state.simTime) || 0;
  const out = [];
  for (const row of rows) {
    if (!row || row.sectorId !== sectorId) continue;
    if (row.kind === 'courier_lost' && Number.isFinite(row.until) && now >= row.until) continue;
    out.push({
      id: row.id,
      kind: row.kind,
      name: row.name,
      x: Number(row.x) || 0,
      z: Number(row.z) || 0,
      sectorId: row.sectorId,
      sourceRef: row.sourceRef,
    });
  }
  return out;
}

export function rememberWreckMarker(state, payload) {
  if (!state || !payload || !payload.fieldId && !payload.wreckId) return null;
  const id = payload.wreckId || payload.fieldId;
  if (!payload.seen && payload.playerSeen !== true && payload.witnessed !== true) return null;
  const bag = state.worldNews || (state.worldNews = {});
  if (!Array.isArray(bag.markers)) bag.markers = [];
  const marker = {
    id: `wreck:${id}`,
    kind: 'wreck_ecology',
    name: payload.name || 'Wreck field',
    sectorId: payload.sectorId || null,
    x: Number(payload.x) || 0,
    z: Number(payload.z) || 0,
    sourceRef: `wreckEcology:${id}`,
  };
  const prior = bag.markers.findIndex((row) => row && row.id === marker.id);
  if (prior >= 0) bag.markers[prior] = marker;
  else bag.markers.push(marker);
  return marker;
}

export function forgetWreckMarker(state, payload) {
  const bag = state && state.worldNews;
  if (!bag || !Array.isArray(bag.markers)) return false;
  const id = payload && (payload.wreckId || payload.fieldId);
  if (!id) return false;
  const before = bag.markers.length;
  bag.markers = bag.markers.filter((row) => !row || row.id !== `wreck:${id}`);
  return bag.markers.length !== before;
}

export function rememberCourierLoss(state, payload) {
  if (!state || !payload) return null;
  const bag = state.worldNews || (state.worldNews = {});
  if (!Array.isArray(bag.markers)) bag.markers = [];
  const id = payload.courierId || payload.siteId || payload.id || 'courier';
  const marker = {
    id: `courier:${id}`,
    kind: 'courier_lost',
    name: 'Courier lost',
    sectorId: payload.sectorId || null,
    x: Number(payload.x) || 0,
    z: Number(payload.z) || 0,
    until: (Number(state.simTime) || 0) + DAY_S,
    sourceRef: `site:courierLost:${id}`,
  };
  bag.markers = bag.markers.filter((row) => !row || row.id !== marker.id);
  bag.markers.push(marker);
  return marker;
}

export function clearCourierLoss(state, payload) {
  const bag = state && state.worldNews;
  if (!bag || !Array.isArray(bag.markers)) return false;
  const id = payload && (payload.courierId || payload.siteId || payload.id);
  const before = bag.markers.length;
  bag.markers = bag.markers.filter((row) => {
    if (!row || row.kind !== 'courier_lost') return true;
    if (!id) return false;
    return row.id !== `courier:${id}`;
  });
  return bag.markers.length !== before;
}
