// The shared pure refusal selector used by UI docking commands, the denial banner and
// harbor service readouts. This extraction keeps the shipped station/faction rules unchanged.
import { dockDenyReason } from '../data/dockDeny.js';
import { FACTION_META } from '../data/factions.js';

/** Human label for a station (entity data name, else de-prefixed id). */
function stationLabel(station, stationId) {
  const name = (station && (station.name || (station.data && station.data.name))) || null;
  if (name) return name;
  return String(stationId || 'station').replace(/^station_/, '').replace(/_/g, ' ');
}

/** Find the live station entity's data by stationId (defensive; null if absent). */
function findStationData(state, stationId) {
  if (!state || !stationId) return null;
  const byStationId = state.entityIndex && state.entityIndex.byStationId;
  const indexed = byStationId && typeof byStationId.get === 'function' && byStationId.get(stationId);
  if (indexed && indexed.alive !== false && indexed.type === 'station') {
    const data = indexed.data || {};
    return { ...data, factionId: data.factionId || indexed.factionId || null };
  }
  const list = (state.entityIndex && state.entityIndex.stations) || state.entityList || [];
  for (const e of list) {
    if (!e || e.alive === false || e.type !== 'station') continue;
    const data = e.data || {};
    if (data.stationId === stationId) return { ...data, factionId: data.factionId || e.factionId || null };
  }
  return null;
}

/**
 * resolveDockDeny(state, stationRef) -> { stationId, label, reason, text, factionId } | null
 *
 * stationRef: a stationId string (resolved against live entities) or a station-like object.
 * PURE over its inputs: calls the SHIPPED dockDenyReason with a full factionMeta (meta + live
 * rep from state.factions) so the flavored line always wins for a factioned station.
 * null = dockable (surface nothing).
 */
export function resolveDockDeny(state, stationRef) {
  const stationId = typeof stationRef === 'string'
    ? stationRef
    : (stationRef && (stationRef.stationId || stationRef.id || (stationRef.data && stationRef.data.stationId))) || null;
  const station = typeof stationRef === 'object' && stationRef !== null
    ? (stationRef.data ? { ...stationRef.data, factionId: stationRef.data.factionId || stationRef.factionId || null } : stationRef)
    : findStationData(state, stationId);
  if (!station) return null;

  const factionId = station.factionId || null;
  const meta = FACTION_META.find((f) => f && f.id === factionId) || null;
  const rep = state && state.factions && factionId && state.factions[factionId]
    ? state.factions[factionId].rep : undefined;
  // ALWAYS pass factionMeta (flavored voice wins); carry live rep for the minRep gate.
  const factionMeta = meta
    ? (Number.isFinite(rep) ? { ...meta, rep } : meta)
    : (factionId || undefined);

  const deny = dockDenyReason(station, factionMeta);
  if (!deny) return null;
  return {
    stationId: stationId || null,
    label: stationLabel(station, stationId),
    reason: deny.reason,
    text: deny.text,
    factionId,
  };
}
