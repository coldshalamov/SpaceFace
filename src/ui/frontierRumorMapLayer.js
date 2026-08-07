// Pure map projection for purchased frontier rumor cards.
// Approximate records expose a search circle only. They never become a course/autopilot target.

import { frontierRumorRecords } from '../data/frontierRumors.js';

function finitePoint(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.z))) return null;
  return { x: Number(value.x), z: Number(value.z) };
}

export function frontierRumorMapReadouts(state, sectorId = null) {
  const rows = [];
  for (const record of frontierRumorRecords(state, sectorId)) {
    if (!record || record.phase !== 'rumored') continue;
    const center = finitePoint(record.bearingCenter);
    const radius = Number(record.radius);
    if (!center || !(radius > 0)) continue;
    const id = String(record.id || '').trim();
    const name = String(record.kindLabel || 'Frontier Rumor').trim();
    if (!id) continue;
    rows.push({
      // galaxyMap's existing bearing renderer is generic despite the historical field name.
      wreckId: id,
      rumorId: id,
      rumorKind: record.kind,
      name,
      sectorId: record.sectorId,
      phase: 'rumored',
      coordSpace: 'global_v1',
      center,
      radius,
      fixedPos: null,
      courseTarget: null,
      statusLabel: 'RUMOR SEARCH',
      objective: `Search the amber ring in ${record.sectorName || record.sectorId}. The card does not set a waypoint.`,
      detail: record.text || 'Approximate frontier intelligence. Find the source in person.',
    });
  }
  return rows.sort((a, b) => a.rumorId.localeCompare(b.rumorId));
}

export default frontierRumorMapReadouts;
