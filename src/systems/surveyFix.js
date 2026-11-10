// Paid survey fix — one imperfect bearing to a sealed hidden cache.
// Pure planner: no Three.js, no Math.random, no wall clock. Economy remains the
// only credit writer. The mark is derived from hash32(seed, sectorId, poiId).

import { hash32 } from '../core/rng.js';
import { SECTORS } from '../data/sectors.js';
import { globalToSectorLocalForSector, sectorGlobalOrigin } from '../data/sectorCoordinates.js';
import { WEATHER_SECTOR_IDS, weatherScanScale } from '../data/environmentalMachinery.js';

export const SURVEY_FIX_PRICE = 240;
const BASE_SCAN_RANGE = 400;
const MARK_GAP = 120;
const MARK_SLACK = 241;

function sectorRecord(state, sectorId) {
  const live = state && state.world && state.world.sectors && state.world.sectors[sectorId];
  if (live && Array.isArray(live.pois)) return live;
  return SECTORS.find((row) => row && row.id === sectorId) || null;
}

function playerOf(state) {
  if (!state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(state.playerId);
}

function scannerTierOf(state) {
  const player = playerOf(state);
  const tier = player && player.data && player.data.derived && player.data.derived.scannerTier;
  const n = Number(tier);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function scanRangeOf(poi, state, sectorId) {
  const authored = Number(poi && poi.scanRange);
  const base = Number.isFinite(authored) && authored > 0 ? authored : BASE_SCAN_RANGE;
  const bonus = 1 + 0.25 * scannerTierOf(state);
  let weather = 1;
  if (WEATHER_SECTOR_IDS.has(sectorId)) {
    const player = playerOf(state);
    const point = player && player.pos ? player.pos : { x: 0, z: 0 };
    weather = weatherScanScale(sectorId, point, Number(state && state.simTime) || 0);
    if (!(weather >= 0)) weather = 1;
  }
  return base * bonus * weather;
}

function seedOf(state) {
  const meta = state && state.meta && state.meta.seed;
  if (meta != null && meta !== '') return meta;
  if (state && state.seed != null) return state.seed;
  return 0;
}

function finitePos(pos) {
  if (!pos) return null;
  const x = Number(pos.x);
  const z = Number(pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

function eligible(authored) {
  if (!authored || authored.hidden !== true) return false;
  if (authored.requiresActiveScan === true) return false;
  if (authored.triangulation) return false;
  const contents = authored.contents;
  return !!(contents && typeof contents.commodityId === 'string' && contents.amount > 0);
}

function alreadyIdentified(state, sectorId, poiId) {
  const disc = state && state.world && state.world.discovery && state.world.discovery[sectorId];
  const rec = disc && disc.pois && disc.pois[poiId];
  return !!(rec && rec.identified);
}

function burnCrosses(state, mark, radius) {
  const hazards = state && state.world && state.world.activeSector && state.world.activeSector.hazards;
  if (!Array.isArray(hazards)) return false;
  for (const zone of hazards) {
    if (!zone || zone.type !== 'radiation') continue;
    const center = finitePos(zone.center);
    const reach = Number(zone.radius);
    if (!center || !(reach > 0)) continue;
    if (Math.hypot(center.x - mark.x, center.z - mark.z) <= reach + radius) return true;
  }
  return false;
}

function placeMark(truth, dist, angle, sector) {
  const mark = {
    x: truth.x + Math.cos(angle) * dist,
    z: truth.z + Math.sin(angle) * dist,
  };
  const limit = Number(sector && sector.worldRadius);
  if (!(limit > 0) || !sector.id) return mark;
  const local = globalToSectorLocalForSector(mark, sector.id);
  if (Math.hypot(local.x, local.z) <= limit) return mark;
  const origin = sectorGlobalOrigin(sector.id);
  const dx = origin.x - truth.x;
  const dz = origin.z - truth.z;
  const len = Math.hypot(dx, dz);
  if (!(len > 0)) return null;
  const inward = {
    x: truth.x + (dx / len) * dist,
    z: truth.z + (dz / len) * dist,
  };
  const inwardLocal = globalToSectorLocalForSector(inward, sector.id);
  if (Math.hypot(inwardLocal.x, inwardLocal.z) <= limit + 1e-6) return inward;
  return null;
}

export function openSurveyFix(state, sectorId) {
  const bag = state && state.world && state.world.surveyFix;
  if (!bag || !sectorId) return null;
  const row = bag[sectorId];
  return row && row.poiId ? row : null;
}

// Continue drops the runtime-only fix record but keeps the sold bearing as the nav waypoint.
// The single-slot chart is the bearing's only player-visible copy: when the live waypoint
// holds this exact mark the bearing is charted — the lab cannot sell it twice — and when a
// held record's mark falls off the chart a dock click re-pins it instead of dead-ending.
export function bearingCharted(state, mark) {
  const nav = state && state.nav && state.nav.waypoint;
  if (!nav || nav.reason !== 'survey-fix' || !nav.pos || !mark) return null;
  const dx = Number(nav.pos.x) - Number(mark.x);
  const dz = Number(nav.pos.z) - Number(mark.z);
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return null;
  return (dx * dx + dz * dz) <= 1e-6 ? nav : null;
}

export function soldBearingOpen(state, plan) {
  return bearingCharted(state, plan && plan.mark);
}

export function commitSurveyFix(state, plan) {
  if (!state || !state.world || !plan || !plan.sectorId || !plan.poiId || !plan.mark) return false;
  if (!state.world.surveyFix || typeof state.world.surveyFix !== 'object' || Array.isArray(state.world.surveyFix)) {
    state.world.surveyFix = {};
  }
  if (state.world.surveyFix[plan.sectorId]) return false;
  state.world.surveyFix[plan.sectorId] = {
    sectorId: plan.sectorId,
    poiId: plan.poiId,
    mark: { x: plan.mark.x, z: plan.mark.z },
    searchRadius: plan.searchRadius,
    label: plan.label,
    spoken: plan.spoken,
  };
  return true;
}

export function clearSurveyFix(state, sectorId, poiId) {
  const bag = state && state.world && state.world.surveyFix;
  if (!bag || !bag[sectorId]) return null;
  if (poiId && bag[sectorId].poiId !== poiId) return null;
  const row = bag[sectorId];
  delete bag[sectorId];
  return row;
}

/** One bearing to the shortest-id sealed cache that is still unidentified. */
export function planSurveyFix(state) {
  const sectorId = state && state.world && state.world.currentSectorId;
  const sector = sectorRecord(state, sectorId);
  if (!sector) return null;
  const rows = state.world.activeSector && Array.isArray(state.world.activeSector.pois)
    ? state.world.activeSector.pois
    : [];
  const authored = (sector.pois || []).filter(eligible).slice().sort((a, b) => {
    const al = String(a.id).length;
    const bl = String(b.id).length;
    if (al !== bl) return al - bl;
    return String(a.id) < String(b.id) ? -1 : 1;
  });
  const seed = seedOf(state);
  for (const poi of authored) {
    if (alreadyIdentified(state, sectorId, poi.id)) continue;
    const row = rows.find((entry) => entry && entry.poiId === poi.id);
    const truth = finitePos(row && row.pos);
    if (!truth) continue;
    const scanRange = scanRangeOf(poi, state, sectorId);
    const hash = hash32(seed, sectorId, poi.id) >>> 0;
    const dist = scanRange + MARK_GAP + (hash % MARK_SLACK);
    const angle = ((hash >>> 8) % 100000) / 100000 * Math.PI * 2;
    const mark = placeMark(truth, dist, angle, sector);
    if (!mark) continue;
    const actual = Math.hypot(mark.x - truth.x, mark.z - truth.z);
    if (actual + 1e-6 < scanRange + MARK_GAP) continue;
    const rounded = Math.round(actual);
    let spoken = `Search ${rounded} out from the fix. The seal sits on the rim of that disc, not on the mark.`;
    if (burnCrosses(state, mark, actual)) spoken += ' The burn crosses that search.';
    return {
      sectorId,
      poiId: poi.id,
      name: poi.name || poi.id,
      mark,
      searchRadius: actual,
      scanRange,
      label: `${poi.name || 'Sealed cache'} search`,
      spoken,
    };
  }
  return null;
}
