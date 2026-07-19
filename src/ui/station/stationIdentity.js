// src/ui/station/stationIdentity.js — shared docked-station identity for Orbital Command
// instrument screens. Pure lookups over authored sector/station/faction data; presentation
// only — reads no gameplay state, writes none.
import { SECTORS } from '../../data/sectors.js';
import { FACTION_META } from '../../data/factions.js';

const STATION_REC = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) STATION_REC.set(station.id, { station, sector });
}
const FACTION_REC = new Map(FACTION_META.map((f) => [f.id, f]));

function titleCaseWords(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function stationRecordFor(stationId) {
  return (stationId && STATION_REC.get(stationId)) || null;
}

/** Frozen display identity for a docked berth, or null when the id is not a real station. */
export function stationIdentityFor(stationId) {
  const rec = stationRecordFor(stationId);
  if (!rec) return null;
  const faction = FACTION_REC.get(rec.station.factionId) || null;
  return Object.freeze({
    stationId,
    sectorId: rec.sector.id,
    name: rec.station.name || String(stationId),
    typeLabel: titleCaseWords(rec.station.type || 'berth'),
    factionId: rec.station.factionId || null,
    factionName: faction ? faction.name : '',
  });
}

export default stationIdentityFor;
