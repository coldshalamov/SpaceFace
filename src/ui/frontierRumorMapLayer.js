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
    if (!center || !Number.isFinite(radius) || !(radius > 0)) continue;
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
 * Corroboration groups: two or more live cards whose leadsTo link (their targetId) names the
 * same reach. The chart draws the reasoning — inflow arrows from each member ring converging
 * on a shared patch. A row exposes only what the cards already show: member rumor ids, ring
 * centers and radii, and the precision-weighted convergence point. The target id and any
 * position behind the rings never appear.
 */
export function frontierRumorCorroborations(state, sectorId = null) {
  const groups = new Map();
  for (const record of frontierRumorRecords(state, sectorId)) {
    if (!record || record.phase !== 'rumored') continue;
    const center = finitePoint(record.bearingCenter);
    const radius = Number(record.radius);
    const targetId = String(record.targetId || '').trim();
    const id = String(record.id || '').trim();
    if (!center || !Number.isFinite(radius) || !(radius > 0) || !targetId || !id) continue;
    const key = `${String(record.sectorId || '')}:${targetId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ rumorId: id, center, radius, sectorId: record.sectorId });
  }
  const out = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.sort((a, b) => a.rumorId.localeCompare(b.rumorId));
    let wx = 0; let wz = 0; let wsum = 0;
    for (const member of members) {
      const w = 1 / member.radius;
      if (!Number.isFinite(w)) continue;
      wx += member.center.x * w;
      wz += member.center.z * w;
      wsum += w;
    }
    if (!(wsum > 0) || !Number.isFinite(wsum)) continue;
    out.push({
      // The group id is built from the member card ids — never the shared target id.
      id: `corr:${members.map((member) => member.rumorId).join('+')}`,
      sectorId: members[0].sectorId != null ? String(members[0].sectorId) : null,
      memberRumorIds: members.map((member) => member.rumorId),
      memberCount: members.length,
      converge: { x: wx / wsum, z: wz / wsum },
      members,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
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
    radius: Number.isFinite(Number(readout.radius)) ? Math.max(0, Number(readout.radius)) : 0,
    statusLabel: readout.statusLabel || 'RUMOR SEARCH',
    detail: readout.detail || '',
    objective: readout.objective || '',
    manualSearch: true,
    courseDisabled: true,
  };
}

export default frontierRumorMapReadouts;
