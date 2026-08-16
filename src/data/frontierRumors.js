// Deterministic frontier rumor cards.
//
// A card is knowledge, not navigation authority: it names a real regional target but exposes only
// an approximate global_v1 search circle. World owns purchased/resolved records; bar and map code
// consume the pure offer/read helpers here.

import { hash32 } from '../core/rng.js';
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';
import { SECTORS } from './sectors.js';

export const FRONTIER_RUMOR_DAY_SECONDS = 600;
export const FRONTIER_RUMOR_SCHEMA_VERSION = 1;
export const FRONTIER_RUMOR_RECEIPT_LIMIT = 48;

// PQ-048.11: this is a remembered physical discovery, not a new contact or mission authority.
// World owns its acquired -> contacted transition after scanner investigation of the existing buoy.
export const TETHYS_BLACK_MARKET_DISCOVERY = Object.freeze({
  rumorId: 'frontier-rumor:station_tethys:tethys-black-market',
  stationId: 'station_tethys',
  sectorId: 'sector_tethys_junction',
  poiId: 'poi_blackmkt',
  contactId: 'quiet:tethys-black-market',
  opportunityType: 'heist_intercept',
});

// PR95 Plan 19: Eunomia sells one stable lead to the already-physical Hush. The target remains an
// approximate search circle and the POI stays under ordinary world discovery authority.
export const EUNOMIA_QUIET_PATCH_RUMOR = Object.freeze({
  rumorId: 'frontier-rumor:station_eunomia:quiet-patch',
  stationId: 'station_eunomia',
  sectorId: 'sector_eunomia_gulf',
  poiId: 'poi_hush',
});

export const FRONTIER_RUMOR_KINDS = Object.freeze([
  Object.freeze({ id: 'hunter', label: 'Hunter Location', price: 260 }),
  Object.freeze({ id: 'vein', label: 'Vein Whisper', price: 220 }),
  Object.freeze({ id: 'anomaly', label: 'Anomaly Bearing', price: 320 }),
  Object.freeze({ id: 'cache', label: 'Cache Coordinate', price: 280 }),
]);

const KIND_BY_ID = new Map(FRONTIER_RUMOR_KINDS.map((row) => [row.id, row]));
const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));
const STATION_SOURCE = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) {
    STATION_SOURCE.set(station.id, { station, sector });
  }
}

const FIELD_LABELS = Object.freeze({
  ast_common_rock: 'common-rock',
  ast_metallic: 'metallic',
  ast_crystalline: 'crystalline',
  ast_icy: 'ice',
  ast_rare_exotic: 'exotic',
  ast_gas_cloud: 'gas-cloud',
});

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function finitePoint(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.z))) return null;
  return { x: Number(value.x), z: Number(value.z) };
}

function dayIndexFor(state) {
  return Math.max(0, Math.floor(finite(state && state.simTime, 0) / FRONTIER_RUMOR_DAY_SECONDS));
}

function regionalSectors(sourceSectorId, hops = 2) {
  const source = SECTOR_BY_ID.get(sourceSectorId);
  if (!source) return [];
  const seen = new Set([source.id]);
  let frontier = [source.id];
  for (let depth = 0; depth < hops; depth++) {
    const next = [];
    for (const sectorId of frontier) {
      const sector = SECTOR_BY_ID.get(sectorId);
      for (const neighborId of sector && sector.neighbors || []) {
        if (seen.has(neighborId) || !SECTOR_BY_ID.has(neighborId)) continue;
        seen.add(neighborId);
        next.push(neighborId);
      }
    }
    frontier = next;
  }
  return Array.from(seen, (id) => SECTOR_BY_ID.get(id)).filter(Boolean);
}

function pseudoHunterPos(seed, sectorId) {
  const angle = (hash32(seed, sectorId, 'hunter-angle') / 0x100000000) * Math.PI * 2;
  const radius = 720 + (hash32(seed, sectorId, 'hunter-radius') % 780);
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

function candidatesForKind(kind, sectors, seed) {
  const candidates = [];
  for (const sector of sectors) {
    if (kind === 'hunter') {
      if (finite(sector.security, 1) >= 0.7) continue;
      candidates.push({
        kind,
        sector,
        targetId: `hunter:${sector.id}`,
        targetName: 'hunter patrol',
        localPos: pseudoHunterPos(seed, sector.id),
        targetRadius: 260,
      });
      continue;
    }
    if (kind === 'vein') {
      for (const field of sector.fields || []) {
        const localPos = finitePoint(field.center);
        if (!field || !field.id || !localPos) continue;
        candidates.push({
          kind,
          sector,
          targetId: field.id,
          targetName: `${FIELD_LABELS[field.type] || 'ore'} vein`,
          localPos,
          targetRadius: Math.max(120, finite(field.clusterRadius, 260)),
          fieldType: field.type || null,
        });
      }
      continue;
    }
    const wantedType = kind === 'anomaly' ? 'anomaly' : 'cache';
    for (const poi of sector.pois || []) {
      const localPos = finitePoint(poi && poi.pos);
      if (!poi || poi.type !== wantedType || !poi.id || !localPos) continue;
      if (poi.id === EUNOMIA_QUIET_PATCH_RUMOR.poiId) continue;
      candidates.push({
        kind,
        sector,
        targetId: poi.id,
        targetName: poi.name || (kind === 'anomaly' ? 'anomaly return' : 'unregistered cache'),
        localPos,
        targetRadius: kind === 'anomaly' ? 300 : 220,
      });
    }
  }
  return candidates;
}

function candidateStillUnknown(state, candidate) {
  const discovery = state && state.world && state.world.discovery;
  const sector = discovery && discovery[candidate.sector.id];
  if (!sector) return true;
  if (candidate.kind === 'vein') {
    return !(sector.fieldsDepleted && finite(sector.fieldsDepleted[candidate.targetId], 0) > 0);
  }
  if (candidate.kind === 'anomaly' || candidate.kind === 'cache') {
    const poi = sector.pois && sector.pois[candidate.targetId];
    return !(poi && (poi.discovered || poi.identified || poi.investigated || poi.defeated));
  }
  return true;
}

function octantFor(point) {
  const angle = Math.atan2(-finite(point && point.z), finite(point && point.x));
  const names = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
  return names[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
}

function offerCopy(candidate, radius) {
  const sectorName = candidate.sector.name || candidate.sector.id;
  const bearing = octantFor(candidate.localPos);
  if (candidate.kind === 'hunter') {
    return `A contract hunter's drive was logged ${bearing} of ${sectorName}. The card marks a ${radius} WU patrol search, not a live transponder.`;
  }
  if (candidate.kind === 'vein') {
    return `Shift crews are whispering about a ${candidate.targetName} ${bearing} of ${sectorName}. The card marks the working patch, not a rock lock.`;
  }
  if (candidate.kind === 'anomaly') {
    return `An unstable return is bending traffic ${bearing} of ${sectorName}. The card carries only a coarse bearing; pulse from inside the ring.`;
  }
  return `A cargo tally points to an unclaimed cache ${bearing} of ${sectorName}. The coordinate is deliberately blurred until you search it in person.`;
}

function sourceForStation(stationId) {
  return STATION_SOURCE.get(String(stationId || '')) || null;
}

export function createFrontierRumorState() {
  return { schemaVersion: FRONTIER_RUMOR_SCHEMA_VERSION, byId: {}, receipts: [] };
}

export function normalizeFrontierRumorState(value) {
  const input = value && typeof value === 'object' ? value : {};
  const out = createFrontierRumorState();
  const rows = input.byId && typeof input.byId === 'object' ? input.byId : {};
  for (const [key, row] of Object.entries(rows)) {
    if (!row || typeof row !== 'object') continue;
    const id = String(row.id || key || '').trim();
    const kind = String(row.kind || '').trim();
    const sectorId = String(row.sectorId || '').trim();
    const center = finitePoint(row.bearingCenter);
    const radius = finite(row.radius, 0);
    if (!id || !KIND_BY_ID.has(kind) || !SECTOR_BY_ID.has(sectorId) || !center || radius <= 0) continue;
    out.byId[id] = {
      ...clonePlain(row),
      id,
      kind,
      sectorId,
      bearingCenter: center,
      radius,
      phase: row.phase === 'resolved' || row.phase === 'contacted' ? row.phase : 'rumored',
    };
  }
  if (Array.isArray(input.receipts)) {
    out.receipts = input.receipts.slice(-FRONTIER_RUMOR_RECEIPT_LIMIT).map(clonePlain);
  }
  return out;
}

export function frontierRumorRecords(state, sectorId = null) {
  const byId = state && state.world && state.world.frontierRumors && state.world.frontierRumors.byId;
  if (!byId || typeof byId !== 'object') return [];
  const wanted = sectorId == null ? null : String(sectorId);
  return Object.values(byId)
    .filter((row) => row && (!wanted || row.sectorId === wanted))
    .map(clonePlain)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function frontierRumorOwned(state, rumorId) {
  const byId = state && state.world && state.world.frontierRumors && state.world.frontierRumors.byId;
  return !!(byId && byId[String(rumorId || '')]);
}

function buildRumorOffer(state, source) {
  const dayIndex = dayIndexFor(state);
  const seed = finite(state && state.meta && state.meta.seed, 1) >>> 0;
  const regional = regionalSectors(source.sourceSectorId, source.hops);
  const firstKind = hash32(seed, source.sourceKey, dayIndex, 'frontier-rumor-kind') % FRONTIER_RUMOR_KINDS.length;
  let kindDef = null;
  let candidates = [];
  for (let step = 0; step < FRONTIER_RUMOR_KINDS.length; step++) {
    const proposed = FRONTIER_RUMOR_KINDS[(firstKind + step) % FRONTIER_RUMOR_KINDS.length];
    const regionalCandidates = candidatesForKind(proposed.id, regional, seed)
      .filter((candidate) => candidateStillUnknown(state, candidate));
    const fallback = regionalCandidates.length || !source.allowGlobalFallback
      ? regionalCandidates
      : candidatesForKind(proposed.id, SECTORS, seed)
        .filter((candidate) => candidateStillUnknown(state, candidate));
    if (!fallback.length) continue;
    kindDef = proposed;
    candidates = fallback;
    break;
  }
  if (!kindDef || !candidates.length) return null;

  const pick = hash32(seed, source.sourceKey, dayIndex, kindDef.id, 'frontier-rumor-target') % candidates.length;
  const candidate = candidates[pick];
  const targetGlobal = sectorLocalToGlobalForSector(candidate.localPos, candidate.sector.id);
  const offsetAngle = (hash32(seed, source.sourceKey, dayIndex, candidate.targetId, 'bearing-offset-angle') / 0x100000000) * Math.PI * 2;
  const offsetDistance = 120 + (hash32(seed, source.sourceKey, dayIndex, candidate.targetId, 'bearing-offset-distance') % 221);
  const bearingCenter = {
    x: targetGlobal.x + Math.cos(offsetAngle) * offsetDistance,
    z: targetGlobal.z + Math.sin(offsetAngle) * offsetDistance,
  };
  const radius = Math.ceil((Math.max(360, candidate.targetRadius + offsetDistance + 120)) / 20) * 20;
  const id = `${source.idPrefix}:${dayIndex}:${kindDef.id}:${candidate.targetId}`;
  if (frontierRumorOwned(state, id)) return null;

  const tier = Math.max(0, finite(candidate.sector.tier, 0));
  const price = source.free ? 0 : kindDef.price + tier * 35;
  return {
    id,
    schemaVersion: FRONTIER_RUMOR_SCHEMA_VERSION,
    source: source.source,
    sourceStationId: source.sourceStationId || null,
    sourceBodyId: source.sourceBodyId || null,
    sourceSectorId: source.sourceSectorId,
    dayIndex,
    kind: kindDef.id,
    kindLabel: kindDef.label,
    targetId: candidate.targetId,
    targetName: candidate.targetName,
    sectorId: candidate.sector.id,
    sectorName: candidate.sector.name || candidate.sector.id,
    fieldType: candidate.fieldType || null,
    coordSpace: 'global_v1',
    bearingCenter,
    radius,
    price,
    phase: 'rumored',
    text: offerCopy(candidate, radius),
  };
}

function tethysBlackMarketOffer(state, stationSource) {
  const discovery = TETHYS_BLACK_MARKET_DISCOVERY;
  if (!stationSource || stationSource.station.id !== discovery.stationId) return null;
  if (frontierRumorOwned(state, discovery.rumorId)) return null;
  const sector = SECTOR_BY_ID.get(discovery.sectorId);
  const poi = sector && (sector.pois || []).find((row) => row && row.id === discovery.poiId);
  const localPos = finitePoint(poi && poi.pos);
  if (!sector || !poi || !localPos || !candidateStillUnknown(state, {
    kind: 'cache', sector, targetId: poi.id,
  })) return null;

  const seed = finite(state && state.meta && state.meta.seed, 1) >>> 0;
  const targetGlobal = sectorLocalToGlobalForSector(localPos, sector.id);
  const offsetAngle = (hash32(seed, discovery.rumorId, 'bearing-offset-angle') / 0x100000000) * Math.PI * 2;
  const offsetDistance = 360 + (hash32(seed, discovery.rumorId, 'bearing-offset-distance') % 241);
  const radius = 880;
  return {
    id: discovery.rumorId,
    schemaVersion: FRONTIER_RUMOR_SCHEMA_VERSION,
    source: 'bar',
    sourceStationId: discovery.stationId,
    sourceBodyId: null,
    sourceSectorId: discovery.sectorId,
    dayIndex: dayIndexFor(state),
    kind: 'cache',
    kindLabel: 'Quiet Traffic Lead',
    targetId: discovery.poiId,
    targetName: 'unresolved drive echoes',
    sectorId: discovery.sectorId,
    sectorName: sector.name || sector.id,
    fieldType: null,
    coordSpace: 'global_v1',
    bearingCenter: {
      x: targetGlobal.x + Math.cos(offsetAngle) * offsetDistance,
      z: targetGlobal.z + Math.sin(offsetAngle) * offsetDistance,
    },
    radius,
    price: KIND_BY_ID.get('cache').price + Math.max(0, finite(sector.tier, 0)) * 35,
    phase: 'rumored',
    text: 'A sealed Tethys tally catches unresolved drive echoes inside a broad amber search. It is not a transponder or a waypoint; pulse from inside the ring and decide what the traffic return really is.',
  };
}

function eunomiaQuietPatchOffer(state, stationSource) {
  const authored = EUNOMIA_QUIET_PATCH_RUMOR;
  if (!stationSource || stationSource.station.id !== authored.stationId) return null;
  if (frontierRumorOwned(state, authored.rumorId)) return null;
  const sector = SECTOR_BY_ID.get(authored.sectorId);
  const poi = sector && (sector.pois || []).find((row) => row && row.id === authored.poiId);
  const localPos = finitePoint(poi && poi.pos);
  if (!sector || !poi || !localPos || !candidateStillUnknown(state, {
    kind: 'anomaly', sector, targetId: poi.id,
  })) return null;

  const seed = finite(state && state.meta && state.meta.seed, 1) >>> 0;
  const targetGlobal = sectorLocalToGlobalForSector(localPos, sector.id);
  const offsetAngle = (hash32(seed, authored.rumorId, 'bearing-offset-angle') / 0x100000000) * Math.PI * 2;
  const offsetDistance = 240 + (hash32(seed, authored.rumorId, 'bearing-offset-distance') % 181);
  const radius = 760;
  return {
    id: authored.rumorId,
    schemaVersion: FRONTIER_RUMOR_SCHEMA_VERSION,
    source: 'bar',
    sourceStationId: authored.stationId,
    sourceBodyId: null,
    sourceSectorId: authored.sectorId,
    dayIndex: dayIndexFor(state),
    kind: 'anomaly',
    kindLabel: 'Quiet Patch Bearing',
    targetId: authored.poiId,
    targetName: 'missing radio carriers',
    sectorId: authored.sectorId,
    sectorName: sector.name || sector.id,
    fieldType: null,
    coordSpace: 'global_v1',
    bearingCenter: {
      x: targetGlobal.x + Math.cos(offsetAngle) * offsetDistance,
      z: targetGlobal.z + Math.sin(offsetAngle) * offsetDistance,
    },
    radius,
    price: KIND_BY_ID.get('anomaly').price + Math.max(0, finite(sector.tier, 0)) * 35,
    phase: 'rumored',
    text: 'Eunomia traffic logs lose every radio carrier around one patch of the Gulf while engine and hull noise remain. The ring marks missing noise, not treasure or a waypoint.',
  };
}

/**
 * Build the one bar rumor available at a station for the current 10-minute sector-day.
 * The selection is stable and never mutates state. Purchased cards return null until the next day.
 */
export function frontierRumorOffer(state, stationId) {
  const stationSource = sourceForStation(stationId);
  if (!stationSource) return null;
  const quietPatch = eunomiaQuietPatchOffer(state, stationSource);
  if (quietPatch) return quietPatch;
  const blackMarket = tethysBlackMarketOffer(state, stationSource);
  if (blackMarket) return blackMarket;
  return buildRumorOffer(state, {
    source: 'bar',
    sourceKey: stationSource.station.id,
    sourceStationId: stationSource.station.id,
    sourceSectorId: stationSource.sector.id,
    hops: 2,
    allowGlobalFallback: true,
    free: false,
    idPrefix: `frontier-rumor:${stationSource.station.id}`,
  });
}

/** One free, strictly local card for an owned Sensor Post. */
export function sensorPostRumorOffer(state, body) {
  if (!body || body.owned === false || !body.id || !body.sectorId
    || !Array.isArray(body.modules) || !body.modules.includes('mod_sensor_post')) return null;
  return buildRumorOffer(state, {
    source: 'sensor_post',
    sourceKey: body.id,
    sourceBodyId: body.id,
    sourceSectorId: body.sectorId,
    hops: 0,
    allowGlobalFallback: false,
    free: true,
    idPrefix: `frontier-rumor:sensor-post:${body.id}`,
  });
}

export default frontierRumorOffer;
