// Pure read model for exploration trophies and per-sector completion.
// World remains the sole writer of state.world.discovery; Codex and the map only project it.

import { SECTORS } from '../data/sectors.js';

const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));

function sectorOf(sectorOrId) {
  if (sectorOrId && typeof sectorOrId === 'object') return sectorOrId;
  return SECTOR_BY_ID.get(sectorOrId) || null;
}

function discoveryFor(state, sectorId) {
  return state && state.world && state.world.discovery
    && state.world.discovery[sectorId] || null;
}

function finiteTime(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

export function isExplorationPoiFound(record) {
  return !!(record && (record.investigated || record.identified || record.defeated));
}

export function sectorExplorationProgress(state, sectorOrId) {
  const sector = sectorOf(sectorOrId);
  if (!sector) {
    return { sectorId: null, found: 0, total: 0, remaining: 0, value: null, percent: null };
  }
  const pois = Array.isArray(sector.pois) ? sector.pois : [];
  const records = discoveryFor(state, sector.id);
  const byId = records && records.pois || {};
  let found = 0;
  for (const poi of pois) {
    if (poi && isExplorationPoiFound(byId[poi.id])) found++;
  }
  const total = pois.length;
  const value = total > 0 ? found / total : null;
  return {
    sectorId: sector.id,
    found,
    total,
    remaining: Math.max(0, total - found),
    value,
    percent: value == null ? null : Math.round(value * 100),
  };
}

function sensorDenialPhrase(sector) {
  const types = new Set((sector.hazards || []).map((hazard) => hazard && hazard.type).filter(Boolean));
  if (types.has('nebula') && types.has('radiation')) return ' through nebula and radiation interference';
  if (types.has('nebula')) return ' through nebula interference';
  if (types.has('radiation')) return ' through radiation interference';
  return '';
}

function plateBody(sector, poi, record) {
  if (poi.type === 'anomaly' && record.triangulated) {
    const bearings = Math.max(1, Math.floor(Number(record.triangulationSampleCount) || 3));
    return `Triangulated in ${sector.name} from ${bearings} distinct bearings, then flown down to the source${sensorDenialPhrase(sector)}.`;
  }
  const verb = record.investigated ? 'Investigated' : (record.defeated ? 'Resolved' : 'Identified');
  return `${verb} by close approach in ${sector.name}. Classification: ${poi.type || 'unknown'}.`;
}

export function explorationDiscoveryPlates(state) {
  const plates = [];
  for (const sector of SECTORS) {
    const disc = discoveryFor(state, sector.id);
    const byId = disc && disc.pois || {};
    const progress = sectorExplorationProgress(state, sector);
    for (const poi of (sector.pois || [])) {
      if (!poi) continue;
      const record = byId[poi.id];
      if (!isExplorationPoiFound(record)) continue;
      const completedAt = finiteTime(
        record.investigatedAt,
        record.identifiedAt,
        record.defeatedAt,
        record.triangulatedAt,
      );
      plates.push({
        id: `${sector.id}:${poi.id}`,
        sectorId: sector.id,
        poiId: poi.id,
        title: poi.name || record.name || poi.id,
        meta: `${sector.name} · ${record.investigated ? 'SOURCE INVESTIGATED' : (record.defeated ? 'SITE RESOLVED' : 'PHYSICALLY IDENTIFIED')}`,
        body: plateBody(sector, poi, record),
        note: progress.total > 0
          ? `${progress.found}/${progress.total} authored sites found · ${progress.percent}% sector exploration`
          : 'No additional authored sites are charted in this sector.',
        completedAt,
      });
    }
  }
  plates.sort((a, b) => (b.completedAt - a.completedAt) || a.id.localeCompare(b.id));
  return plates;
}
