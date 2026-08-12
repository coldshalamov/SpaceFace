// Pure map projection for purchased frontier rumor cards.
// Approximate records expose a search circle only. They never become a course/autopilot target.

import { frontierRumorRecords, TETHYS_BLACK_MARKET_DISCOVERY } from '../data/frontierRumors.js';

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
    const manualSearch = id === TETHYS_BLACK_MARKET_DISCOVERY.rumorId;
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
      selectable: manualSearch,
      manualSearch,
      courseDisabled: manualSearch,
      statusLabel: 'RUMOR SEARCH',
      objective: manualSearch
        ? `Select the amber ring in ${record.sectorName || record.sectorId}, fly the area manually, and pulse the scanner. No waypoint is set.`
        : `Search the amber ring in ${record.sectorName || record.sectorId}. The card does not set a waypoint.`,
      detail: record.text || 'Approximate frontier intelligence. Find the source in person.',
    });
  }
  return rows.sort((a, b) => a.rumorId.localeCompare(b.rumorId));
}

/**
 * Turn a purchased uncertain readout into a selectable map target without granting a course.
 * The exact source stays hidden until physical scanner investigation resolves it.
 */
export function frontierRumorMapTarget(readout) {
  if (!readout || readout.selectable !== true || readout.courseDisabled !== true) return null;
  const center = finitePoint(readout.center);
  const rumorId = String(readout.rumorId || '').trim();
  if (!center || !rumorId) return null;
  return {
    id: rumorId,
    kind: 'rumor',
    rumorId,
    name: String(readout.name || 'Frontier Rumor'),
    sectorId: readout.sectorId || null,
    x: center.x,
    z: center.z,
    center,
    radius: Math.max(0, Number(readout.radius) || 0),
    statusLabel: readout.statusLabel || 'RUMOR SEARCH',
    detail: readout.detail || '',
    objective: readout.objective || '',
    manualSearch: true,
    courseDisabled: true,
  };
}

export default frontierRumorMapReadouts;
