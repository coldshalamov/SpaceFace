// The one answer to "which station does E fly me to?" (2026-11-20, fly-to-berth from any distance).
// input.js acts on it and the flight helm (flightHelm.js) prints the same station on its prompt, so
// the words on screen can never name a different berth than the key flies to. Pure reads only.

import { resolveCollisionProxyManifest, resolveDockAnchor } from '../data/collisionProxyManifests.js';

function isCustomsGateStation(e) {
  if (!e) return false;
  const d = e.data || {};
  if (d.stationId === 'station_customs' || d.militaryOnly === true || d.customsGate === true) return true;
  const name = String(e.name || d.displayName || d.name || d.stationName || '');
  if (/\bcustoms\s+gate\b/i.test(name)) return true;
  if (Array.isArray(d.services) && d.services.length > 0) {
    const hasBerthDoor = d.services.some((s) => s !== 'toll' && s !== 'scan');
    if (!hasBerthDoor) return true;
  }
  return false;
}

/** A station the ship may be flown to: alive, placed, not hostile, not a gate or Customs Gate. */
export function isDockableStation(e) {
  return !!(e && e.alive !== false && e.type === 'station' && e.pos
    && !(e.data && (e.data.hostile === true || e.data.dockable === false || e.data.isGate === true || e.data.dockless === true))
    && !isCustomsGateStation(e));
}

function entityById(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(id) || null;
}

/** True when the station stands in the sector the ship is in. A waypoint that names a station
 *  three sectors away is a jump order, not a berth: the chip must not promise a fly-to-berth
 *  run the autopilot cannot make. A station with no sector stamp counts as local (fixtures and
 *  hand-built states predate the stamp). */
function stationInCurrentSector(state, station) {
  if (!station) return false;
  const currentSectorId = state && state.world && state.world.currentSectorId;
  if (!currentSectorId) return true;
  const home = station.homeSectorId
    || (station.data && (station.data.homeSectorId || station.data.sectorId))
    || null;
  return !home || home === currentSectorId;
}

function dockableStationsList(state) {
  if (!state) return [];
  const raw = (state.entityIndex && (state.entityIndex.dockStations || state.entityIndex.stations)) || state.entityList || [];
  const out = [];
  for (const e of raw) {
    if (isDockableStation(e)) out.push(e);
  }
  return out;
}

function stationByStationId(state, stationId) {
  if (!stationId || !state) return null;
  const byId = state.entityIndex && state.entityIndex.byStationId;
  const indexed = byId && typeof byId.get === 'function' ? byId.get(stationId) : null;
  if (isDockableStation(indexed) && stationInCurrentSector(state, indexed)) return indexed;
  for (const e of dockableStationsList(state)) {
    if (e.data && e.data.stationId === stationId && stationInCurrentSector(state, e)) return e;
  }
  return null;
}

/** Dockable stations of the sector the ship is in; a name/position fallback must never match
 *  a berth across a sector line. */
function localDockableStations(state) {
  return dockableStationsList(state).filter((e) => stationInCurrentSector(state, e));
}

function stationMatchingWaypoint(state, wp) {
  if (!wp || !state) return null;
  const byEntity = entityById(state, wp.targetEntityId ?? wp.presentationEntityId);
  if (isDockableStation(byEntity) && stationInCurrentSector(state, byEntity)) return byEntity;
  const bySid = stationByStationId(state, wp.stationId || wp.destStationId || wp.targetStationId);
  if (bySid) return bySid;
  const stations = localDockableStations(state);
  const text = `${wp.label || ''} ${wp.reason || ''}`.toLowerCase();
  if (text.trim()) {
    for (const s of stations) {
      const sName = stationDisplayName(s).toLowerCase();
      if (sName && sName !== 'station' && text.includes(sName)) return s;
    }
  }
  if (wp.pos && Number.isFinite(wp.pos.x) && Number.isFinite(wp.pos.z)) {
    let best = null;
    let bestD = 320;
    for (const s of stations) {
      const d = Math.hypot(s.pos.x - wp.pos.x, s.pos.z - wp.pos.z);
      if (d <= bestD) { bestD = d; best = s; }
    }
    if (best) return best;
  }
  return null;
}

function trackedMissionDockableStation(state) {
  if (!state) return null;
  const active = Array.isArray(state.missions && state.missions.active) ? state.missions.active : [];
  if (!active.length) return null;
  const trackedId = (state.ui && state.ui.trackedMissionId) ?? (state.missions && state.missions.trackedId);
  const ordered = [];
  if (trackedId != null) {
    const t = active.find((m) => m && m.id === trackedId && m.status !== 'failed' && m.status !== 'completed');
    if (t) ordered.push(t);
  }
  for (const m of active) {
    if (m && m.status !== 'failed' && m.status !== 'completed' && !ordered.includes(m)) ordered.push(m);
  }
  const currentSectorId = state.world && state.world.currentSectorId;
  for (const m of ordered) {
    const sid = m.destStationId || m.targetStationId || (m.params && (m.params.destStationId || m.params.stationId)) || m.stationId || m.boardStationId;
    const st = stationByStationId(state, sid);
    if (st && (!currentSectorId || !st.homeSectorId || st.homeSectorId === currentSectorId)) return st;
  }
  return null;
}

/** The station the pilot or active objective picked: tracked objective station first, else selected target. */
export function chosenDockableStation(state) {
  const fromWaypoint = stationMatchingWaypoint(state, state && state.nav && state.nav.waypoint);
  if (fromWaypoint) return fromWaypoint;
  const fromMission = trackedMissionDockableStation(state);
  if (fromMission) return fromMission;
  const picked = entityById(state, state && state.player && state.player.targetId);
  if (isDockableStation(picked)) return picked;
  return null;
}

/** The nearest dockable station in the sector (prefers current sector over adjacent resident sectors). */
export function nearestDockableStation(state) {
  const me = entityById(state, state && state.playerId);
  if (!me || !me.pos) return null;
  const stations = dockableStationsList(state);
  const currentSectorId = state && state.world && state.world.currentSectorId;
  let bestLocal = null;
  let bestLocalD = Infinity;
  let bestAny = null;
  let bestAnyD = Infinity;
  for (const e of stations) {
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    const eSector = e.homeSectorId || (e.data && e.data.sectorId) || null;
    if (!currentSectorId || !eSector || eSector === currentSectorId) {
      if (d < bestLocalD) { bestLocalD = d; bestLocal = e; }
    }
    if (d < bestAnyD) { bestAnyD = d; bestAny = e; }
  }
  return bestLocal || bestAny;
}

/**
 * The berth E flies to and why: `{ station, chosen }` (chosen = the pilot selected or tracks it),
 * or null when there is no dockable station in the sector.
 */
export function berthOfferStation(state) {
  const chosen = chosenDockableStation(state);
  if (chosen) return { station: chosen, chosen: true };
  const nearest = nearestDockableStation(state);
  return nearest ? { station: nearest, chosen: false } : null;
}

/** True while the nav autopilot is flying the berth run E started (a stale flag never counts). */
export function berthAutopilotStation(state) {
  const ap = state && state.nav && state.nav.autopilot;
  const id = state && state.ui && state.ui.berthAutopilotStationId;
  if (!ap || ap.active !== true || id == null || ap.targetEntityId !== id) return null;
  const station = entityById(state, id);
  return isDockableStation(station) ? station : null;
}

/** Display name of a station for prompts ("Helios Station"), never an id. */
export function stationDisplayName(station) {
  const raw = station && (station.name || (station.data && (station.data.displayName || station.data.name)));
  return typeof raw === 'string' && raw.trim() ? raw.trim() : 'Station';
}

/**
 * The world point a berth distance is measured to: the deck berth a hull can physically take,
 * else the mooring standoff, else the station centre. This is the same fix the onboarding
 * objective measures to ('Dock at Helios Station ↗ 456 m'), so the [E] chip cannot quote a
 * shorter distance to the same destination (it used to measure to the station centre: 396 m).
 */
export function berthAnchorFor(station, hull) {
  if (!station || !station.pos) return null;
  const manifest = resolveCollisionProxyManifest(station);
  const anchor = (manifest && resolveDockAnchor(station, manifest, hull)) || null;
  if (anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.z)) return { x: anchor.x, z: anchor.z };
  return { x: station.pos.x, z: station.pos.z };
}
