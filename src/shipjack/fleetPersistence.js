// Pure recovery-route and save boundary; no system imports.
import { SECTORS } from '../data/sectors.js';
export const FLEET_OPERATION_LIMITS = Object.freeze({ active: 8, receipts: 96, dispatchDelay: 8, quoteLife: 45 });
const SECTOR_BY_ID = new Map(SECTORS.map(s => [s.id, s]));
const STATIONS = new Map(SECTORS.flatMap(s => (s.stations || []).map(st => [st.id, { ...st, sectorId: s.id }])));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_:.-]{3,120}$/.test(value);

/** Ordered breadth-first route over the actual canonical jump graph. */
export function recoveryRoute(sourceId, destinationId) {
  if (!SECTOR_BY_ID.has(sourceId) || !SECTOR_BY_ID.has(destinationId)) return null;
  const seen = new Set([sourceId]), queue = [[sourceId]];
  for (let i = 0; i < queue.length && i < SECTORS.length; i++) {
    const path = queue[i], id = path[path.length - 1];
    if (id === destinationId) return path;
    for (const next of [...(SECTOR_BY_ID.get(id)?.neighbors || [])].sort()) {
      if (!SECTOR_BY_ID.has(next) || seen.has(next)) continue;
      seen.add(next); queue.push([...path, next]);
    }
  }
  return null;
}

/** Bounded save facts. No callbacks, world objects, or inferred free hulls are imported. */
export function normalizeFleetPersistence(input, vesselsById = {}) {
  const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const out = { fleetOperations: {}, fleetReceipts: [] };
  for (const [id, raw] of Object.entries(plain(input?.fleetOperations) ? input.fleetOperations : {}).slice(0, FLEET_OPERATION_LIMITS.active)) {
    if (!vesselsById[id] || !plain(raw) || raw.vesselId !== id || !safeId(raw.operationId)
      || !['queued', 'outbound', 'towing'].includes(raw.status) || !['recover', 'secure_berth'].includes(raw.action)
      || !STATIONS.has(raw.stationId) || !SECTOR_BY_ID.has(raw.sourceSectorId)
      || ![raw.departureAt, raw.pickupAt, raw.arrivalAt].every(Number.isFinite)
      || raw.departureAt < 0 || raw.pickupAt < raw.departureAt || raw.arrivalAt < raw.pickupAt
      || raw.arrivalAt - raw.departureAt > 86400 || !Number.isSafeInteger(raw.feeCr) || raw.feeCr < 0 || raw.feeCr > 1000000) continue;
    const route = recoveryRoute(raw.sourceSectorId, STATIONS.get(raw.stationId).sectorId);
    if (!route) continue;
    out.fleetOperations[id] = { version: 1, vesselId: id, action: raw.action, operationId: raw.operationId,
      status: raw.status, stationId: raw.stationId, stationName: STATIONS.get(raw.stationId).name,
      sourceSectorId: raw.sourceSectorId, sourceGeneration: typeof raw.sourceGeneration === 'string' ? raw.sourceGeneration.slice(0, 100) : '',
      route, feeCr: raw.feeCr, departureAt: raw.departureAt, pickupAt: raw.pickupAt, arrivalAt: raw.arrivalAt };
  }
  for (const raw of (Array.isArray(input?.fleetReceipts) ? input.fleetReceipts : []).slice(-FLEET_OPERATION_LIMITS.receipts)) {
    if (!plain(raw) || !safeId(raw.operationId) || typeof raw.vesselId !== 'string') continue;
    out.fleetReceipts.push({ ok: raw.ok === true, operationId: raw.operationId, vesselId: raw.vesselId.slice(0, 100),
      action: String(raw.action || '').slice(0, 30), status: String(raw.status || '').slice(0, 30),
      stationId: typeof raw.stationId === 'string' ? raw.stationId.slice(0, 100) : '',
      stationName: typeof raw.stationName === 'string' ? raw.stationName.slice(0, 100) : '',
      feeCr: Math.max(0, Math.min(1000000, finite(raw.feeCr))), refundCr: Math.max(0, Math.min(1000000, finite(raw.refundCr))),
      reason: String(raw.reason || '').slice(0, 180), at: Math.max(0, finite(raw.at)) });
  }
  // A damaged optional dispatch envelope must not permanently strand owned property.
  for (const [id, vessel] of Object.entries(vesselsById)) {
    const job = out.fleetOperations[id];
    if (vessel.location?.kind === 'in_transit' && !job) {
      vessel.location.kind = 'remote';
      vessel.location.entityId = null;
      vessel.location.stationId = null;
    } else if (job?.status === 'towing') {
      vessel.location.kind = 'in_transit';
      vessel.location.entityId = null;
    }
  }
  return out;
}
