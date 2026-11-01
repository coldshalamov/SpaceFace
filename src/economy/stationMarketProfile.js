import { SECTORS } from '../data/sectors.js';

// Runtime content overrides the static catalog; retain the same station profile for every reader.
const STATION_INFO = new Map();
for (const sec of SECTORS) {
  for (const st of sec.stations || []) {
    STATION_INFO.set(st.id, {
      type: st.type, size: st.size || 'M', factionId: st.factionId,
      sectorId: sec.id, tier: sec.tier || 0, neighbors: sec.neighbors || [], security: sec.security,
      services: Array.isArray(st.services) ? st.services.slice() : [],
      marketEquilibriumFactors: st.marketEquilibriumFactors || null,
    });
  }
}

export function stationInfo(state, stationId) {
  const reg = state && state.content && state.content.sectors;
  if (reg) {
    const list = Array.isArray(reg) ? reg : Object.values(reg);
    for (const sec of list) {
      for (const st of sec.stations || []) {
        if (st.id === stationId) {
          return { type: st.type, size: st.size || 'M', factionId: st.factionId,
                   sectorId: sec.id, tier: sec.tier || 0, neighbors: sec.neighbors || [], security: sec.security,
                   services: Array.isArray(st.services) ? st.services.slice() : [],
                   marketEquilibriumFactors: st.marketEquilibriumFactors || null };
        }
      }
    }
  }
  return STATION_INFO.get(stationId) || null;
}

export function toleratesContraband(info) {
  return !!(info && info.type === 'blackmarket');
}

export function salvageBaySaleAllowsIllicit(state, stationId = state.ui?.dockedStationId) {
  return toleratesContraband(stationInfo(state, stationId));
}
