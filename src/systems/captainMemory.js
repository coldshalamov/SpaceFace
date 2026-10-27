// Imported by traffic: identities live on hulls; only consequential meetings occupy the
// bounded save roster. Numeric entity ids are never a remembered captain's identity.
import { hash32 } from '../core/rng.js';
import { SECTORS } from '../data/sectors.js';

export const CAPTAIN_ROSTER_CAP = 24;
const NAMES = ['Dessa Venn', 'Ivo Pell', 'Sana Rook', 'Mika Vale', 'Oren Doss', 'Tavi Sen',
  'Lenn Arca', 'Jessa Mott', 'Niko Hale', 'Rian Kesh', 'Mara Tern', 'Pavel Nix'];
const ROLES = new Set(['hauler', 'courier', 'ore_carrier', 'tanker', 'arclight']);
const copy = value => JSON.parse(JSON.stringify(value));

export function normalizeCaptainRoster(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.filter(row => row && typeof row.id === 'string' && row.id && !seen.has(row.id) && seen.add(row.id))
    .slice(-CAPTAIN_ROSTER_CAP).map(row => ({ ...copy(row), name: String(row.name || 'Unknown captain').slice(0, 80),
      outcomes: { rescued: 0, robbed: 0, killed: 0, ...row.outcomes },
      receiptIds: Array.isArray(row.receiptIds) ? row.receiptIds.map(String).slice(-8) : [] }));
}

export function stampCaptainIdentity(state, entity) {
  const data = entity?.data;
  if (!data?.worldRecordId || !ROLES.has(data.trafficRole) || data.activityActorSlotId || data.namedLaneContactId) return null;
  if (!data.captainId) data.captainId = `captain:${data.worldRecordId}`;
  if (!data.captainName) data.captainName = NAMES[hash32(state?.meta?.seed || 1, data.captainId) % NAMES.length];
  if (!data.name) data.name = data.captainName;
  data.scanLabel = `${data.captainName} · ${data.trafficLabel || data.trafficRole}`;
  return { id: data.captainId, name: data.captainName, worldRecordId: data.worldRecordId,
    sectorId: data.homeSectorId || data.sectorId || state.world?.currentSectorId,
    factionId: entity.factionId || data.factionId || 'faction_mts' };
}

export function captainDetourRoute(captainId, route) {
  if (!Array.isArray(route) || route.length < 2 || route.some(mark => mark.id === `avoid:${captainId}`)) return route;
  const first = route[0].pos, last = route.at(-1).pos;
  const sign = hash32(captainId, 'robbery-detour') & 1 ? 1 : -1;
  const dx = last.x - first.x, dz = last.z - first.z, length = Math.hypot(dx, dz) || 1;
  return [route[0], { id: `avoid:${captainId}`, label: 'Avoid the robbery lane',
    pos: { x: (first.x + last.x) / 2 - dz / length * 650 * sign,
      z: (first.z + last.z) / 2 + dx / length * 650 * sign } }, ...route.slice(1)];
}

export function applyCaptainRouteMemory(state, entity, spec) {
  const row = state.traffic?.captainRoster?.find(item => item.id === entity?.data?.captainId);
  if (row?.outcomes?.robbed > 0 && spec?.kind === 'hauler') spec.route = captainDetourRoute(row.id, spec.route);
  return spec;
}

export function installCaptainMemory(host) {
  const { state, bus } = host;
  const rows = (create = false) => state.traffic.captainRoster
    || (create ? (state.traffic.captainRoster = []) : []);
  const entityFor = payload => {
    const ids = [payload.victimId, payload.carrierId, payload.entityId, payload.id];
    return ids.map(id => state.entities?.get?.(id)).find(entity => entity?.data?.captainId)
      || (payload.causality?.carrierWorldRecordId
        ? state.entityList?.find(entity => entity?.data?.worldRecordId === payload.causality.carrierWorldRecordId) : null);
  };
  const rowForIdentity = (identity, payload) => {
    if (!identity) return null;
    let row = rows().find(item => item.id === identity.id);
    if (!row) {
      const home = SECTORS.find(sector => sector.id === identity.sectorId)?.stations?.[0];
      row = { ...identity, homeStationId: payload.stationId || home?.id || 'station_helios',
        outcomes: { rescued: 0, robbed: 0, killed: 0 }, receiptIds: [], orderCycle: 0 };
      rows(true).push(row);
      if (rows().length > CAPTAIN_ROSTER_CAP) rows().splice(0, rows().length - CAPTAIN_ROSTER_CAP);
    }
    return row;
  };
  const remember = (outcome, payload, podRow = null) => {
    const entity = podRow ? null : entityFor(payload);
    const identity = entity && stampCaptainIdentity(state, entity);
    let row = podRow || (identity && rows().find(item => item.id === identity.id));
    if (!row && payload.entityId != null) row = rows().find(item => item.podKey
      && item.podKey === state.entities?.get?.(payload.entityId)?.data?.captainPodKey);
    if (!row) row = rowForIdentity(identity, payload);
    if (!row) return null;
    const receiptId = String(payload.receiptId || (typeof payload.id === 'string' ? payload.id : null) || payload.encounterId
      || `${outcome}:${entity?.id}:${state.tick || 0}:${state.simTime || 0}`);
    const key = `${outcome}:${receiptId}`;
    if (row.receiptIds.includes(key)) return row;
    row.receiptIds.push(key); row.receiptIds = row.receiptIds.slice(-8);
    row.outcomes[outcome] = Math.min(9999, (Number(row.outcomes[outcome]) || 0) + 1);
    row.lastOutcome = outcome; row.lastAtS = Number(state.simTime) || 0;
    if (outcome === 'rescued') { row.alive = true; row.orderDueAtS = row.lastAtS + 1800; }
    if (outcome === 'killed') row.alive = false;
    if (outcome === 'robbed' && entity) {
      row.avoidsPlayerLane = true;
      host.helpers?.npcJobs?.rerouteCaptain?.(entity, row.id);
    }
    bus.emit('captain:remembered', { captainId: row.id, captainName: row.name, outcome,
      stationId: row.homeStationId, sectorId: row.sectorId, t: row.lastAtS });
    return row;
  };
  const off = [];
  const on = (name, fn) => { const unsubscribe = bus.on(name, fn); if (typeof unsubscribe === 'function') off.push(unsubscribe); };
  on('freight:recovery', payload => remember('rescued', payload || {}));
  on('freight:cargoSpilled', payload => {
    if (payload?.attackerId === state.playerId) remember('robbed', payload);
  });
  on('entity:killed', payload => remember('killed', payload || {}));
  on('encounter:resolved', payload => {
    if (payload?.outcome === 'defended') remember('rescued', payload);
    if (payload?.outcome === 'robbed') remember('robbed', payload);
  });
  on('survivorPod:ejected', payload => {
    const pod = state.entities?.get?.(payload?.entityId);
    // Ejection nests inside entity:killed before traffic hears the death. Establish
    // the bounded row now, without inventing an outcome; never retag an existing pod.
    if (!pod?.data || pod.data.captainPodKey) return;
    const identity = stampCaptainIdentity(state, state.entities?.get?.(payload?.victimId));
    const row = rowForIdentity(identity, payload);
    if (!row) return;
    row.podKey = `captain-pod:${identity.id}:${state.tick || 0}`;
    pod.data.captainPodKey = row.podKey;
  });
  on('survivorPod:rescued', payload => {
    if (payload?.playerAnswered !== true) return;
    // victimId is historical numeric provenance, not identity (especially after
    // Continue). A missing/evicted/ambiguous binding must not reward its new occupant.
    const key = state.entities?.get?.(payload.entityId)?.data?.captainPodKey;
    if (!key) return;
    const matches = rows().filter(row => row.podKey === key);
    if (matches.length === 1) remember('rescued', payload, matches[0]);
  });
  return { remember, destroy() { for (const unsubscribe of off) unsubscribe(); } };
}
